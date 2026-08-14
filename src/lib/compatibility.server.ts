import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { questions } from "./survey-questions";
import {
  createOpenAICompatibilityProvider,
  getOpenAIModelName,
} from "./openai-compatibility.server";

/**
 * Shared compatibility scoring. Previously private to matches.functions.ts,
 * which meant the admin matrix would have had to copy-paste the rubric, the
 * prompt and the anonymisation discipline — three things that must never
 * drift between the member-facing and admin-facing paths.
 */

export type Answers = Record<string, string>;

/**
 * Bumped by hand whenever the fixed rubric below changes. Cached rows in
 * public.compatibility_scores are keyed by this, so a bump invalidates them.
 */
export const RUBRIC_VERSION = "fixed-rubric-v1";

const REQUIRED_IDS = new Set(questions.filter((question) => question.required).map((q) => q.id));

/**
 * The only questions that may ever reach the model: non-text (so no free-form
 * writing) and never question 2 (gender). Names, emails and user ids are never
 * included in any prompt — candidates are referred to by opaque handles.
 */
export const AI_SAFE_IDS = new Set(
  questions.filter((question) => question.type !== "text" && question.id !== 2).map((q) => q.id),
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

export function normalized(value: string | undefined) {
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

export function summarizeSafeAnswers(answers: Answers) {
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

export type OpenAIReview = z.infer<typeof OpenAIReviewSchema>["matches"][number];

export type AnonymousCandidate = { candidate_id: string; answers: Answers };

/** The 80/20 weighting, in one place so both callers agree. */
export function weightedFinalScore(fixedScore: number, openAIScore: number | null | undefined) {
  if (typeof openAIScore !== "number") return fixedScore;
  return Math.round(fixedScore * 0.8 + openAIScore * 0.2);
}

function buildPrompt(mine: Answers, candidates: AnonymousCandidate[]) {
  return `You provide a bounded compatibility review for MeetHaq, a halal marriage platform.

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
}

export const REVIEW_BATCH_SIZE = 10;
const REVIEW_CONCURRENCY = 3;
/** Roughly 150 output tokens per candidate, plus headroom for the wrapper. */
const TOKENS_PER_CANDIDATE = 150;

export type BatchFailure = { candidate_ids: string[]; reason: string };

export type ReviewResult = {
  reviews: Map<string, OpenAIReview>;
  /** Batches that fell back to fixed-rubric-only, and why. */
  failures: BatchFailure[];
  configured: boolean;
  model: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `tasks` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Batched, bounded-concurrency OpenAI review.
 *
 * The previous implementation put every candidate into a single prompt capped
 * at 1500 output tokens, which silently truncated once the pool grew. Batching
 * is therefore mandatory here, and a batch that fails degrades only its own
 * candidates to fixed-rubric-only rather than the whole run.
 */
export async function reviewCandidates(
  mine: Answers,
  candidates: AnonymousCandidate[],
  { batchSize = REVIEW_BATCH_SIZE }: { batchSize?: number } = {},
): Promise<ReviewResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || candidates.length === 0) {
    return {
      reviews: new Map(),
      failures: [],
      configured: !!apiKey,
      model: apiKey ? getOpenAIModelName() : null,
    };
  }

  const provider = createOpenAICompatibilityProvider(apiKey);
  const model = getOpenAIModelName();
  const batches = chunk(candidates, Math.max(1, batchSize));

  const settled = await mapWithConcurrency(
    batches,
    REVIEW_CONCURRENCY,
    async (batch): Promise<{ reviews: OpenAIReview[]; failure: BatchFailure | null }> => {
      try {
        const result = await generateText({
          model: provider(model),
          output: Output.object({
            name: "MeetHaqCompatibilityReview",
            description: "An anonymised, bounded compatibility review for each candidate",
            schema: OpenAIReviewSchema,
          }),
          prompt: buildPrompt(mine, batch),
          maxOutputTokens: Math.max(1_500, batch.length * TOKENS_PER_CANDIDATE + 400),
          timeout: 30_000,
          maxRetries: 1,
          providerOptions: { openai: { store: false } },
        });
        return { reviews: result.output.matches, failure: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/404|not found|does not exist|model_not_found/i.test(message)) {
          console.error(
            `[openai-compatibility] MISCONFIGURED MODEL — "${model}" was rejected by OpenAI. ` +
              `Reviews will fall back to the fixed rubric until OPENAI_MODEL is corrected.`,
          );
        } else if (!NoObjectGeneratedError.isInstance(error)) {
          console.error("OpenAI compatibility review batch failed", error);
        }
        return {
          reviews: [],
          failure: {
            candidate_ids: batch.map((c) => c.candidate_id),
            reason: NoObjectGeneratedError.isInstance(error)
              ? "The model did not return a valid structured review for this batch."
              : message.slice(0, 200),
          },
        };
      }
    },
  );

  const reviews = new Map<string, OpenAIReview>();
  const failures: BatchFailure[] = [];
  for (const outcome of settled) {
    for (const review of outcome.reviews) reviews.set(review.candidate_id, review);
    if (outcome.failure) failures.push(outcome.failure);
  }

  return { reviews, failures, configured: true, model };
}
