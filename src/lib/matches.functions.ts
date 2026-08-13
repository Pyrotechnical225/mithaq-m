import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { assertActiveMembership } from "./membership-guard";
import { getExcludedUserIds } from "./match-exclusions.server";
import { questions } from "./survey-questions";
import {
  createOpenAICompatibilityProvider,
  getOpenAIModelName,
} from "./openai-compatibility.server";

const REQUIRED_IDS = new Set(questions.filter((question) => question.required).map((q) => q.id));
const AI_SAFE_IDS = new Set(
  questions
    .filter((question) => question.type !== "text" && question.id !== 2)
    .map((question) => question.id),
);

const SECTION_WEIGHTS: Record<string, number> = {
  "Religious Practice": 4,
  "Marriage Intentions": 3,
  "Family & Practical Matters": 2,
  "Family & Children": 2,
  "Values & Expectations": 2,
  "Islamic & Community Life": 2,
  "Basic Information": 1,
  "Personality & Lifestyle": 1,
  "Compatibility Extras": 1,
};

type Answers = Record<string, string>;

function normalized(value: string | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function isFlexible(value: string) {
  return /open|depends|not sure|other|no preference|flexible|undecided/.test(value);
}

function answerSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (isFlexible(left) || isFlexible(right)) return 0.65;
  return 0;
}

export function fixedCompatibilityScore(mine: Answers, theirs: Answers) {
  let earned = 0;
  let available = 0;

  for (const question of questions) {
    if (question.id === 1 || question.id === 2 || question.type === "text") continue;
    const mineValue = normalized(mine[question.id]);
    const theirValue = normalized(theirs[question.id]);
    if (!mineValue || !theirValue) continue;

    const requiredMultiplier = REQUIRED_IDS.has(question.id) ? 1.25 : 1;
    const weight = (SECTION_WEIGHTS[question.section] ?? 1) * requiredMultiplier;
    available += weight;
    earned += weight * answerSimilarity(mineValue, theirValue);
  }

  if (available === 0) return 50;
  return Math.round(50 + (earned / available) * 50);
}

function summarizeSafeAnswers(answers: Answers) {
  return questions
    .filter((question) => AI_SAFE_IDS.has(question.id))
    .filter((question) => normalized(answers[question.id]) !== "")
    .map((question) => `${question.section} — ${question.question}: ${answers[question.id]}`)
    .join("\n");
}

const OpenAIReviewSchema = z.object({
  matches: z.array(
    z.object({
      candidate_id: z.string(),
      score: z.number().min(0).max(100),
      strengths: z.string().max(500),
      considerations: z.string().max(500),
    }),
  ),
});

type OpenAIReview = z.infer<typeof OpenAIReviewSchema>["matches"][number];

const GenerateMatchesInput = z.object({ openaiConsent: z.literal(true) });

async function getOpenAIReviews(
  mine: Answers,
  candidates: Array<{ candidate_id: string; answers: Answers }>,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || candidates.length === 0) return new Map<string, OpenAIReview>();

  const provider = createOpenAICompatibilityProvider(apiKey);
  const prompt = `You provide a bounded compatibility review for MeetHaq, a halal marriage platform.

Analyse only the anonymised multiple-choice survey answers below. Do not infer identity, protected traits, health, wealth, or facts that are not explicitly present. The fixed rubric remains the primary score; your score is a limited secondary review.

MEMBER:
${summarizeSafeAnswers(mine)}

CANDIDATES:
${candidates
  .map(
    (candidate) => `--- ${candidate.candidate_id} ---\n${summarizeSafeAnswers(candidate.answers)}`,
  )
  .join("\n\n")}

For every candidate, return a 0-100 compatibility score plus concise strengths and points to discuss. Focus on religious practice, marriage intentions, family expectations, lifestyle, and flexibility. Return each candidate_id exactly as supplied.`;

  try {
    const result = await generateText({
      model: provider(getOpenAIModelName()),
      output: Output.object({
        name: "MeetHaqCompatibilityReview",
        description: "An anonymised, bounded compatibility review for each candidate",
        schema: OpenAIReviewSchema,
      }),
      prompt,
      maxOutputTokens: 1_500,
      timeout: 15_000,
      maxRetries: 1,
      providerOptions: { openai: { store: false } },
    });

    return new Map(result.output.matches.map((review) => [review.candidate_id, review]));
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      console.error("OpenAI compatibility review failed; using fixed-rubric fallback", error);
    }
    return new Map<string, OpenAIReview>();
  }
}

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
    const openAIReviews = await getOpenAIReviews(myAnswers, scoredPool);
    const openAIConfigured = !!process.env.OPENAI_API_KEY?.trim();

    const enriched = scoredPool
      .map((candidate) => {
        const review = openAIReviews.get(candidate.candidate_id);
        const finalScore = review
          ? Math.round(candidate.fixed_score * 0.8 + review.score * 0.2)
          : candidate.fixed_score;

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
