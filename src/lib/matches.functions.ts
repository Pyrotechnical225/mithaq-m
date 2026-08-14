import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertActiveMembership } from "./membership-guard";
import { getExcludedUserIds } from "./match-exclusions.server";
import { getOpenAIModelName } from "./openai-compatibility.server";
import {
  fixedCompatibilityScore,
  normalized,
  reviewCandidates,
  weightedFinalScore,
  type Answers,
} from "./compatibility.server";

// The rubric, prompt building and anonymisation now live in
// compatibility.server.ts so the admin compatibility matrix shares them
// verbatim instead of copy-pasting.
export { fixedCompatibilityScore } from "./compatibility.server";

const GenerateMatchesInput = z.object({ openaiConsent: z.literal(true) });

export const generateMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateMatchesInput.parse(input))
  .handler(async ({ context }) => {
    await assertActiveMembership(context);

    const { data: mine } = await context.supabase
      .from("survey_answers")
      .select("answers, completed")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mine?.completed) throw new Error("Complete your survey first");

    const myAnswers = mine.answers as Answers;
    const myGender = normalized(myAnswers["2"]);
    // Fail closed: without a gender on either side we cannot guarantee an
    // opposite-gender match, so we refuse rather than match against everyone.
    if (!myGender) {
      throw new Error("Answer the gender question in your profile to generate matches");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidates, error: candidateError } = await supabaseAdmin
      .from("survey_answers")
      .select("user_id, answers, completed")
      .eq("completed", true)
      .neq("user_id", context.userId);
    if (candidateError) throw new Error(candidateError.message);

    const { data: privacyRows } = await supabaseAdmin
      .from("privacy_settings")
      .select("user_id, visibility");
    const privacyByUser = new Map((privacyRows ?? []).map((row) => [row.user_id, row]));
    const excludedUserIds = await getExcludedUserIds();
    const pool = (candidates ?? []).filter((candidate) => {
      if (excludedUserIds.has(candidate.user_id)) return false;
      if (privacyByUser.get(candidate.user_id)?.visibility !== "discoverable") return false;
      const candidateGender = normalized((candidate.answers as Answers)["2"]);
      if (!candidateGender) return false;
      return candidateGender !== myGender;
    });

    const scoredPool = pool.map((candidate, index) => ({
      candidate_id: `candidate_${index + 1}`,
      real_id: candidate.user_id,
      answers: candidate.answers as Answers,
      fixed_score: fixedCompatibilityScore(myAnswers, candidate.answers as Answers),
    }));
    const { reviews: openAIReviews, configured: openAIConfigured } = await reviewCandidates(
      myAnswers,
      scoredPool,
    );

    const enriched = scoredPool
      .map((candidate) => {
        const review = openAIReviews.get(candidate.candidate_id);
        const finalScore = weightedFinalScore(candidate.fixed_score, review?.score);

        return {
          match_user_id: candidate.real_id,
          score: finalScore,
          fixed_score: candidate.fixed_score,
          openai_score: review?.score ?? null,
          scoring_method: review ? "fixed-rubric-v1-with-openai-review" : "fixed-rubric-v1",
          strengths:
            review?.strengths ?? "Strong alignment across the fixed MeetHaq compatibility rubric.",
          considerations:
            review?.considerations ??
            (openAIConfigured
              ? "OpenAI was temporarily unavailable, so this result uses the fixed rubric only."
              : "This result uses the fixed rubric; OpenAI review is not configured."),
          age: candidate.answers["1"] ?? null,
          location: candidate.answers["3"] ?? null,
          practice_level: candidate.answers["11"] ?? null,
          madhab: candidate.answers["10"] ?? null,
          timeline: candidate.answers["19"] ?? null,
        };
      })
      .filter((candidate) => candidate.score >= 70)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    const { data: saved, error: saveError } = await context.supabase
      .from("matches")
      .insert({
        user_id: context.userId,
        results: {
          matches: enriched,
          scoring_method: openAIReviews.size
            ? "fixed-rubric-v1-with-openai-review"
            : "fixed-rubric-v1",
          openai_model: openAIReviews.size ? getOpenAIModelName() : null,
        },
      })
      .select()
      .single();
    if (saveError) throw new Error(saveError.message);
    return saved;
  });

export const getLatestMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveMembership(context);
    const { data, error } = await context.supabase
      .from("matches")
      .select("id, results, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const InterestInput = z.object({ to_user: z.string().uuid() });

export const expressInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InterestInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertActiveMembership(context);
    const { error } = await context.supabase
      .from("interests")
      .upsert(
        { from_user: context.userId, to_user: data.to_user, status: "pending" },
        { onConflict: "from_user,to_user" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RespondInput = z.object({
  interest_id: z.string().uuid(),
  accept: z.boolean(),
});

export const respondInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RespondInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertActiveMembership(context);
    const { error } = await context.supabase
      .from("interests")
      .update({ status: data.accept ? "accepted" : "declined" })
      .eq("id", data.interest_id)
      .eq("to_user", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInterests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertActiveMembership(context);
    const uid = context.userId;
    const { data: sent } = await context.supabase
      .from("interests")
      .select("id, to_user, status, created_at")
      .eq("from_user", uid)
      .order("created_at", { ascending: false });
    const { data: received } = await context.supabase
      .from("interests")
      .select("id, from_user, status, created_at")
      .eq("to_user", uid)
      .order("created_at", { ascending: false });

    const acceptedIds = new Set<string>();
    for (const row of sent ?? []) if (row.status === "accepted") acceptedIds.add(row.to_user);
    for (const row of received ?? []) if (row.status === "accepted") acceptedIds.add(row.from_user);

    let contacts: Record<string, { display_name: string | null; contact_email: string | null }> =
      {};
    if (acceptedIds.size > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, contact_email")
        .in("id", Array.from(acceptedIds));
      contacts = Object.fromEntries(
        (profiles ?? []).map((profile) => [
          profile.id,
          { display_name: profile.display_name, contact_email: profile.contact_email },
        ]),
      );
    }

    return { sent: sent ?? [], received: received ?? [], contacts };
  });
