import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { questions } from "./survey-questions";

// Only these question ids inform matching; free-text stays server-side only
// unless the other person has opted in to sharing it.
const CORE_IDS = questions.filter((q) => q.required).map((q) => q.id);

function summarizeAnswers(answers: Record<string, string>) {
  return questions
    .filter((q) => answers[q.id] && answers[q.id].trim() !== "")
    .map((q) => `${q.section} — ${q.question}: ${answers[q.id]}`)
    .join("\n");
}

const MatchSchema = z.object({
  matches: z.array(
    z.object({
      candidate_id: z.string(),
      score: z.number(),
      strengths: z.string(),
      considerations: z.string(),
    }),
  ),
});

export const generateMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI Gateway not configured");

    // Load own answers
    const { data: mine } = await context.supabase
      .from("survey_answers")
      .select("answers, completed")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mine?.completed) throw new Error("Complete your survey first");

    // Own gender for opposite-gender matching
    const myGender = String((mine.answers as Record<string, string>)["2"] ?? "").toLowerCase();

    // Load candidate pool: everyone discoverable except me
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("survey_answers")
      .select("user_id, answers, completed")
      .eq("completed", true)
      .neq("user_id", context.userId);
    if (candErr) throw new Error(candErr.message);

    const { data: privacyRows } = await supabaseAdmin
      .from("privacy_settings")
      .select("user_id, visibility, show_free_text");
    const privacyByUser = new Map((privacyRows ?? []).map((p) => [p.user_id, p]));

    const pool = (candidates ?? []).filter((c) => {
      const p = privacyByUser.get(c.user_id);
      if (!p || p.visibility !== "discoverable") return false;
      const g = String((c.answers as Record<string, string>)["2"] ?? "").toLowerCase();
      if (myGender && g && myGender === g) return false; // opposite gender only
      return true;
    });

    if (pool.length === 0) {
      const { data: saved } = await context.supabase
        .from("matches")
        .insert({ user_id: context.userId, results: { matches: [] } })
        .select()
        .single();
      return saved;
    }

    // Anonymize candidate payloads
    const anonPool = pool.map((c, idx) => {
      const answers = c.answers as Record<string, string>;
      const showFreeText = privacyByUser.get(c.user_id)?.show_free_text ?? false;
      const filtered: Record<string, string> = {};
      for (const q of questions) {
        const val = answers[q.id];
        if (!val) continue;
        if (q.type === "text" && !showFreeText && !CORE_IDS.includes(q.id)) continue;
        filtered[q.id] = val;
      }
      return {
        candidate_id: `cand_${idx}`,
        real_id: c.user_id,
        summary: summarizeAnswers(filtered),
      };
    });

    const idMap = new Map(anonPool.map((c) => [c.candidate_id, c.real_id]));

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const prompt = `You help match practicing Muslims for halal marriage on the Mithaq platform.

USER PROFILE:
${summarizeAnswers(mine.answers as Record<string, string>)}

CANDIDATES:
${anonPool.map((c) => `--- ${c.candidate_id} ---\n${c.summary}`).join("\n\n")}

Score each candidate 0-100 for compatibility with the USER, weighting:
1) Deen (madhab, level of practice, prayer, hijab/beard, halal diet)
2) Marriage intentions & timeline
3) Family plans (children, in-laws, gender roles)
4) Values, lifestyle, and location feasibility

For each candidate return:
- candidate_id (exactly as given)
- score (0-100)
- strengths: 1-2 sentences on why this is a good match
- considerations: 1-2 sentences on genuine differences or things to discuss

Return the top ${Math.min(5, anonPool.length)} matches, highest score first.`;

    let output;
    try {
      const res = await generateText({
        model,
        prompt,
        output: Output.object({ schema: MatchSchema }),
      });
      output = res.output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        output = { matches: [] };
      } else {
        throw err;
      }
    }

    // Enrich with public candidate info (id + score/reasoning). Real ids stay
    // server-side; we surface only what the recipient needs to decide.
    const enriched = output.matches
      .map((m) => {
        const realId = idMap.get(m.candidate_id);
        if (!realId) return null;
        const cand = pool.find((p) => p.user_id === realId);
        const answers = (cand?.answers ?? {}) as Record<string, string>;
        return {
          match_user_id: realId,
          score: m.score,
          strengths: m.strengths,
          considerations: m.considerations,
          age: answers["1"] ?? null,
          location: answers["3"] ?? null,
          practice_level: answers["11"] ?? null,
          madhab: answers["10"] ?? null,
          timeline: answers["19"] ?? null,
        };
      })
      .filter((match): match is NonNullable<typeof match> => !!match && match.score >= 70);

    const { data: saved, error: saveErr } = await context.supabase
      .from("matches")
      .insert({ user_id: context.userId, results: { matches: enriched } })
      .select()
      .single();
    if (saveErr) throw new Error(saveErr.message);

    // Scores are private working information for the imam. Members never receive
    // this payload; they only see an anonymous profile after imam approval.
    const [{ data: imamAccounts }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("imam_accounts").select("user_id, imam_id").eq("active", true),
      supabaseAdmin.from("profiles").select("id, uk_city"),
    ]);
    const myCity = profiles?.find((p) => p.id === context.userId)?.uk_city;
    for (const match of enriched) {
      const [userA, userB] = [context.userId, match.match_user_id].sort();
      const existing = await supabaseAdmin
        .from("pairings")
        .select("id")
        .eq("user_a", userA)
        .eq("user_b", userB)
        .maybeSingle();
      if (existing.data) continue;
      const candidateCity = profiles?.find((p) => p.id === match.match_user_id)?.uk_city;
      const imamAccount = imamAccounts?.[0] ?? null;
      const { data: pairing } = await supabaseAdmin
        .from("pairings")
        .insert({
          user_a: userA,
          user_b: userB,
          imam_id: imamAccount?.imam_id ?? null,
          status: "imam_review",
          compatibility_score: Math.round(match.score),
          compatibility_summary: {
            strengths: match.strengths,
            considerations: match.considerations,
            location_context: [myCity, candidateCity].filter(
              (city): city is string => typeof city === "string" && city.length > 0,
            ),
          },
        })
        .select("id")
        .single();
      if (pairing && imamAccount?.user_id) {
        await supabaseAdmin.from("notifications").insert({
          user_id: imamAccount.user_id,
          pairing_id: pairing.id,
          kind: "imam_match_review",
          title: "New compatibility review",
          body: `A ${Math.round(match.score)}% compatibility match is ready for your review.`,
        });
      }
    }
    return saved;
  });

export const getLatestMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("pairings")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { submitted: true, active_introductions: count ?? 0 };
  });

const InterestInput = z.object({ to_user: z.string().uuid() });

export const expressInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InterestInput.parse(input))
  .handler(async ({ data, context }) => {
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

    // For accepted mutual matches, fetch contact_email of the other side
    const acceptedIds = new Set<string>();
    for (const s of sent ?? []) if (s.status === "accepted") acceptedIds.add(s.to_user);
    for (const r of received ?? []) if (r.status === "accepted") acceptedIds.add(r.from_user);

    let contacts: Record<string, { display_name: string | null; contact_email: string | null }> =
      {};
    if (acceptedIds.size > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, contact_email")
        .in("id", Array.from(acceptedIds));
      contacts = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.id,
          { display_name: p.display_name, contact_email: p.contact_email },
        ]),
      );
    }

    return { sent: sent ?? [], received: received ?? [], contacts };
  });
