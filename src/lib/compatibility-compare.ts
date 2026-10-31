import { questions } from "./survey-questions";

// The scoring rubric shared by matching (matches.functions.ts) and the imam
// workspace comparison, so both always agree.

export const SECTION_WEIGHTS: Record<string, number> = {
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

export const REQUIRED_IDS = new Set(
  questions.filter((question) => question.required).map((q) => q.id),
);

export type Answers = Record<string, unknown>;

export function normalizedAnswer(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLocaleLowerCase()
    : "";
}

function isFlexible(value: string) {
  return /open|depends|not sure|other|no preference|flexible|undecided/.test(value);
}

/** 1 = same answer, 0.65 = at least one side is open, 0 = different. Inputs are normalised. */
export function answerSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (isFlexible(left) || isFlexible(right)) return 0.65;
  return 0;
}

/** Questions scored by the rubric: choice answers except age and gender. */
export function isScoredQuestion(question: (typeof questions)[number]) {
  return question.id !== 1 && question.id !== 2 && question.type !== "text";
}

export function questionWeight(question: (typeof questions)[number]) {
  return (SECTION_WEIGHTS[question.section] ?? 1) * (REQUIRED_IDS.has(question.id) ? 1.25 : 1);
}

// Differences on these deserve a conversation before the couple meet.
export const DISCUSSION_QUESTION_IDS = new Set([11, 12, 15, 17, 19, 20, 22, 25, 36, 39, 44, 48]);

// Never shown in the imam comparison (health is private to the member).
export const IMAM_HIDDEN_QUESTION_IDS = new Set([26]);

export type ComparisonVerdict = "match" | "flexible" | "differs" | "discuss";

export type ComparisonRow = {
  id: number;
  section: string;
  question: string;
  a: string | null;
  b: string | null;
  verdict: ComparisonVerdict | null;
};

export type SectionScore = { section: string; weight: number; percent: number };

function displayAnswer(answers: Answers, id: number): string | null {
  const value = answers[String(id)];
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const other = answers[`${id}_other`];
  if (text === "Other" && typeof other === "string" && other.trim())
    return `Other: ${other.trim()}`;
  return text;
}

function hasChildren(answers: Answers) {
  const value = normalizedAnswer(answers["7"]);
  return value !== "" && value !== "no children" && value !== "prefer not to say";
}

/**
 * Side-by-side comparison of two members' survey answers for the imam.
 * Scored questions get a verdict and feed the per-section scores; written
 * answers are listed without a verdict.
 */
export function compareAnswers(a: Answers, b: Answers) {
  const rows: ComparisonRow[] = [];
  const sections = new Map<string, { earned: number; available: number }>();

  for (const question of questions) {
    if (question.id === 2 || IMAM_HIDDEN_QUESTION_IDS.has(question.id)) continue;
    const aText = displayAnswer(a, question.id);
    const bText = displayAnswer(b, question.id);
    if (!aText && !bText) continue;

    let verdict: ComparisonVerdict | null = null;
    if (isScoredQuestion(question) && aText && bText) {
      const similarity = answerSimilarity(
        normalizedAnswer(a[String(question.id)]),
        normalizedAnswer(b[String(question.id)]),
      );
      verdict =
        similarity === 1
          ? "match"
          : similarity > 0
            ? "flexible"
            : DISCUSSION_QUESTION_IDS.has(question.id)
              ? "discuss"
              : "differs";
      const weight = questionWeight(question);
      const section = sections.get(question.section) ?? { earned: 0, available: 0 };
      section.earned += weight * similarity;
      section.available += weight;
      sections.set(question.section, section);
    }

    // Someone with children and someone not open to it is always raised.
    if (question.id === 22 && aText && bText) {
      const aNo = normalizedAnswer(a["22"]) === "no";
      const bNo = normalizedAnswer(b["22"]) === "no";
      if ((aNo && hasChildren(b)) || (bNo && hasChildren(a))) verdict = "discuss";
    }

    rows.push({
      id: question.id,
      section: question.section,
      question: question.question,
      a: aText,
      b: bText,
      verdict,
    });
  }

  const sectionScores: SectionScore[] = Array.from(sections.entries())
    .filter(([, value]) => value.available > 0)
    .map(([section, value]) => ({
      section,
      weight: SECTION_WEIGHTS[section] ?? 1,
      percent: Math.round((value.earned / value.available) * 100),
    }))
    .sort((x, y) => y.weight - x.weight || x.section.localeCompare(y.section));

  return { rows, sectionScores };
}
