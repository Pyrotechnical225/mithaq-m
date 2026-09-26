import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { questions } from "./survey-questions";
import {
  createOpenAICompatibilityProvider,
  getOpenAIModelName,
} from "./openai-compatibility.server";
import { requiredSurveyAnswersAreValid } from "./survey-validation";
import { PRIVACY_NOTICE_VERSION } from "./privacy-notice";

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

const GenerateMatchesInput = z.object({
  openaiConsent: z.literal(true),
  adultConfirmed: z.literal(true),
  privacyNoticeAccepted: z.literal(true),
});

async function getOpenAIReviews(
  mine: Answers,
  candidates: Array<{ candidate_id: string; answers: Answers }>,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || candidates.length === 0) return new Map<string, OpenAIReview>();

  const provider = createOpenAICompatibilityProvider(apiKey);
  const prompt = `You provide a bounded compatibility review for Mithaq, a halal marriage platform.

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
        name: "MithaqCompatibilityReview",
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

const MIN_MINUTES_BETWEEN_RUNS = 10;

export const generateMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => GenerateMatchesInput.parse(input))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Each run calls the paid AI review and can create imam work, so one
    // member cannot trigger it back-to-back.
    const { data: lastRun, error: lastRunError } = await supabaseAdmin
      .from("matches")
      .select("created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRunError) throw new Error("Compatibility scoring could not start. Please try again.");
    if (
      lastRun &&
      Date.now() - new Date(lastRun.created_at).getTime() < MIN_MINUTES_BETWEEN_RUNS * 60_000
    ) {
      throw new Error(
        `Your profile was scored recently. Please wait ${MIN_MINUTES_BETWEEN_RUNS} minutes before submitting again.`,
      );
    }

    const now = new Date().toISOString();
    const { error: consentError } = await supabaseAdmin.from("member_consents").upsert(
      {
        user_id: context.userId,
        adult_confirmed_at: now,
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        privacy_notice_accepted_at: now,
        compatibility_processing_consent_at: now,
        compatibility_processing_withdrawn_at: null,
      },
      { onConflict: "user_id" },
    );
    if (consentError) throw new Error(consentError.message);

    const { data: mine } = await context.supabase
      .from("survey_answers")
      .select("answers, completed")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mine?.completed) throw new Error("Complete your survey first");

    const myAnswers = mine.answers as Answers;
    const myGender = normalized(myAnswers["2"]);
    if (!requiredSurveyAnswersAreValid(myAnswers) || !["male", "female"].includes(myGender)) {
      throw new Error("Review your required survey answers before generating matches");
    }
    const { data: candidates, error: candidateError } = await supabaseAdmin
      .from("survey_answers")
      .select("user_id, answers, completed")
      .eq("completed", true)
      .neq("user_id", context.userId);
    if (candidateError) throw new Error(candidateError.message);

    const [privacyResult, consentResult, blockResult] = await Promise.all([
      supabaseAdmin
        .from("privacy_settings")
        .select("user_id, visibility, show_location, show_occupation"),
      supabaseAdmin
        .from("member_consents")
        .select("user_id,compatibility_processing_consent_at,compatibility_processing_withdrawn_at")
        .not("compatibility_processing_consent_at", "is", null)
        .is("compatibility_processing_withdrawn_at", null),
      supabaseAdmin
        .from("member_blocks")
        .select("blocker_user_id,blocked_user_id")
        .or(`blocker_user_id.eq.${context.userId},blocked_user_id.eq.${context.userId}`),
    ]);
    for (const result of [privacyResult, consentResult, blockResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    const privacyRows = privacyResult.data;
    const consentRows = consentResult.data;
    const blockRows = blockResult.data;
    const privacyByUser = new Map((privacyRows ?? []).map((row) => [row.user_id, row]));
    const consentedUsers = new Set((consentRows ?? []).map((row) => row.user_id));
    const blockedUsers = new Set(
      (blockRows ?? []).map((row) =>
        row.blocker_user_id === context.userId ? row.blocked_user_id : row.blocker_user_id,
      ),
    );
    const pool = (candidates ?? []).filter((candidate) => {
      if (privacyByUser.get(candidate.user_id)?.visibility !== "discoverable") return false;
      if (!consentedUsers.has(candidate.user_id) || blockedUsers.has(candidate.user_id))
        return false;
      const answers = candidate.answers as Answers;
      const candidateGender = normalized(answers["2"]);
      return (
        requiredSurveyAnswersAreValid(answers) &&
        ["male", "female"].includes(candidateGender) &&
        myGender !== candidateGender
      );
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
            review?.strengths ?? "Strong alignment across the fixed Mithaq compatibility rubric.",
          considerations:
            review?.considerations ??
            (openAIConfigured
              ? "The AI review was temporarily unavailable, so this result uses the fixed rubric only."
              : "This result uses the fixed rubric; the AI review is not configured."),
          age: candidate.answers["1"] ?? null,
          location:
            privacyByUser.get(candidate.real_id)?.show_location === false
              ? null
              : (candidate.answers["3"] ?? null),
          occupation:
            privacyByUser.get(candidate.real_id)?.show_occupation === false
              ? null
              : (candidate.answers["9"] ?? null),
          practice_level: candidate.answers["11"] ?? null,
          madhab: candidate.answers["10"] ?? null,
          timeline: candidate.answers["19"] ?? null,
        };
      })
      .filter((candidate) => candidate.score >= 70)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    const { data: saved, error: saveError } = await supabaseAdmin
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

    // Suitable results become private imam-review work. No candidate id or
    // raw compatibility payload is returned to the member's browser.
    const matchUserIds = enriched.map((match) => match.match_user_id);
    const [{ data: profiles }, { data: imamAccounts }, { data: verifiedImams }] = await Promise.all(
      [
        supabaseAdmin
          .from("profiles")
          .select("id,uk_city,location_lat,location_lng")
          .in("id", [context.userId, ...matchUserIds]),
        supabaseAdmin.from("imam_accounts").select("user_id,imam_id,radius_km").eq("active", true),
        supabaseAdmin.from("imams").select("id,city,lat,lng").eq("verification_status", "verified"),
      ],
    );

    const verifiedById = new Map((verifiedImams ?? []).map((imam) => [imam.id, imam]));
    const availableImams = (imamAccounts ?? []).filter((account) =>
      verifiedById.has(account.imam_id),
    );
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const { data: currentReviews } = availableImams.length
      ? await supabaseAdmin
          .from("pairings")
          .select("imam_id")
          .eq("status", "imam_review")
          .in(
            "imam_id",
            availableImams.map((account) => account.imam_id),
          )
      : { data: [] };
    const reviewCount = new Map<string, number>();
    for (const review of currentReviews ?? []) {
      if (review.imam_id)
        reviewCount.set(review.imam_id, (reviewCount.get(review.imam_id) ?? 0) + 1);
    }

    const { haversineKm } = await import("./geo");
    const chooseImam = (candidateId: string) => {
      if (availableImams.length === 0) return null;
      const member = profileById.get(context.userId);
      const candidate = profileById.get(candidateId);
      const points = [member, candidate].filter(
        (profile): profile is NonNullable<typeof profile> =>
          !!profile && profile.location_lat != null && profile.location_lng != null,
      );
      const midpoint =
        points.length > 0
          ? {
              lat:
                points.reduce((sum, profile) => sum + (profile.location_lat as number), 0) /
                points.length,
              lng:
                points.reduce((sum, profile) => sum + (profile.location_lng as number), 0) /
                points.length,
            }
          : null;

      return (
        [...availableImams]
          .map((account) => {
            const imam = verifiedById.get(account.imam_id)!;
            const distance =
              midpoint && imam.lat != null && imam.lng != null
                ? haversineKm(midpoint.lat, midpoint.lng, imam.lat, imam.lng)
                : null;
            const cityMatch = [member?.uk_city, candidate?.uk_city]
              .filter(Boolean)
              .some((city) => city?.toLocaleLowerCase() === imam.city.toLocaleLowerCase());
            return {
              account,
              distance,
              cityMatch,
              workload: reviewCount.get(account.imam_id) ?? 0,
            };
          })
          .sort((left, right) => {
            const leftInRange =
              left.distance != null && left.distance <= Math.max(left.account.radius_km, 5) * 2;
            const rightInRange =
              right.distance != null && right.distance <= Math.max(right.account.radius_km, 5) * 2;
            if (leftInRange !== rightInRange) return leftInRange ? -1 : 1;
            if (left.cityMatch !== right.cityMatch) return left.cityMatch ? -1 : 1;
            if (left.workload !== right.workload) return left.workload - right.workload;
            if (left.distance != null && right.distance != null)
              return left.distance - right.distance;
            if (left.distance != null) return -1;
            if (right.distance != null) return 1;
            return left.account.imam_id.localeCompare(right.account.imam_id);
          })[0]?.account ?? null
      );
    };

    const { data: existingPairings } = await supabaseAdmin
      .from("pairings")
      .select("user_a,user_b")
      .or(`user_a.eq.${context.userId},user_b.eq.${context.userId}`);
    const existingPairs = new Set(
      (existingPairings ?? []).map((pairing) => [pairing.user_a, pairing.user_b].sort().join(":")),
    );
    let submittedForReview = 0;
    for (const match of enriched) {
      const [userA, userB] = [context.userId, match.match_user_id].sort();
      const pairKey = `${userA}:${userB}`;
      if (existingPairs.has(pairKey)) continue;
      const imamAccount = chooseImam(match.match_user_id);
      const { data: pairing, error: pairingError } = await supabaseAdmin
        .from("pairings")
        .insert({
          user_a: userA,
          user_b: userB,
          imam_id: imamAccount?.imam_id ?? null,
          status: "imam_review",
          compatibility_score: match.score,
          compatibility_summary: {
            strengths: match.strengths,
            considerations: match.considerations,
            scoring_method: match.scoring_method,
          },
        })
        .select("id")
        .maybeSingle();
      if (pairingError?.code === "23505") continue;
      if (pairingError) throw new Error("A suitable result could not be sent for imam review");
      if (!pairing) continue;
      existingPairs.add(pairKey);
      submittedForReview += 1;
      if (imamAccount) {
        reviewCount.set(imamAccount.imam_id, (reviewCount.get(imamAccount.imam_id) ?? 0) + 1);
        const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
          user_id: imamAccount.user_id,
          pairing_id: pairing.id,
          kind: "imam_match_review",
          title: "New compatibility review",
          body: `A ${match.score}% compatibility result is ready for private review.`,
        });
        if (notificationError) throw new Error(notificationError.message);
      }
    }

    return {
      id: saved.id,
      created_at: saved.created_at,
      suitable_match_count: enriched.length,
      submitted_for_imam_review: submittedForReview,
    };
  });

export const getLatestMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matches")
      .select("id, results, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const { data: pairings, error: pairingError } = await supabaseAdmin
      .from("pairings")
      .select("status")
      .or(`user_a.eq.${context.userId},user_b.eq.${context.userId}`);
    if (pairingError) throw new Error(pairingError.message);
    const statuses = pairings ?? [];
    const savedMatches = (data.results as { matches?: unknown[] } | null)?.matches ?? [];
    return {
      id: data.id,
      created_at: data.created_at,
      submitted: true,
      suitable_match_count: savedMatches.length,
      awaiting_imam_review: statuses.filter((pairing) =>
        ["pending", "imam_review"].includes(pairing.status),
      ).length,
      ready_for_member_review: statuses.filter((pairing) => pairing.status === "member_review")
        .length,
      active_introductions: statuses.filter((pairing) =>
        [
          "member_review",
          "awaiting_payment",
          "payment_pending",
          "ready_to_schedule",
          "scheduled",
          "completed",
          "approved",
        ].includes(pairing.status),
      ).length,
    };
  });
