import { questions, type Question } from "./survey-questions";

/**
 * The wizard's steps are derived from the `section` field on each question, in
 * first-appearance order. Nothing here is hardcoded: adding a question in a new
 * section adds a step, and a section whose questions are all optional becomes
 * skippable automatically.
 */
export type SurveySection = {
  /** 1-based step number. */
  step: number;
  name: string;
  questions: Question[];
  requiredIds: number[];
  /** True when the section contains no required questions, so it can be skipped. */
  skippable: boolean;
};

function deriveSections(): SurveySection[] {
  const byName = new Map<string, Question[]>();
  for (const question of questions) {
    const list = byName.get(question.section);
    if (list) list.push(question);
    else byName.set(question.section, [question]);
  }

  return Array.from(byName.entries()).map(([name, sectionQuestions], index) => {
    const requiredIds = sectionQuestions.filter((q) => q.required).map((q) => q.id);
    return {
      step: index + 1,
      name,
      questions: sectionQuestions,
      requiredIds,
      skippable: requiredIds.length === 0,
    };
  });
}

export const surveySections = deriveSections();

/** The review step sits immediately after the last section. */
export const REVIEW_STEP = surveySections.length + 1;

export const REQUIRED_QUESTION_COUNT = questions.filter((q) => q.required).length;
export const TOTAL_QUESTION_COUNT = questions.length;

/** Rough completion time, surfaced up front so the length isn't a surprise. */
export const ESTIMATED_MINUTES = 12;

export type Answers = Record<number, string>;

export function isAnswered(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export function missingRequiredIds(section: SurveySection, answers: Answers): number[] {
  return section.requiredIds.filter((id) => !isAnswered(answers[id]));
}

export function answeredCount(answers: Answers): number {
  return questions.filter((q) => isAnswered(answers[q.id])).length;
}

export function sectionAnsweredCount(section: SurveySection, answers: Answers): number {
  return section.questions.filter((q) => isAnswered(answers[q.id])).length;
}

/** A section is complete when every required question in it has an answer. */
export function isSectionComplete(section: SurveySection, answers: Answers): boolean {
  return missingRequiredIds(section, answers).length === 0;
}

/**
 * Where to drop a returning member: the first step still missing a required
 * answer, or the review step when every required question is done.
 */
export function firstIncompleteStep(answers: Answers): number {
  const incomplete = surveySections.find((section) => !isSectionComplete(section, answers));
  return incomplete ? incomplete.step : REVIEW_STEP;
}

/**
 * Deep links may not jump past a step with unanswered required questions.
 * Earlier steps stay freely reachable so members can go back and edit.
 */
export function clampStep(requested: number, answers: Answers): number {
  const furthest = firstIncompleteStep(answers);
  if (!Number.isFinite(requested)) return furthest;
  return Math.min(Math.max(Math.trunc(requested), 1), furthest);
}

/**
 * Progress by journey, not raw question count: each completed section is worth
 * one step, and the section in progress contributes its own fraction.
 */
export function progressPercent(answers: Answers, currentStep: number): number {
  if (currentStep >= REVIEW_STEP) return 100;
  const completedSteps = surveySections.filter(
    (section) => section.step < currentStep && isSectionComplete(section, answers),
  ).length;
  const current = surveySections[currentStep - 1];
  const withinCurrent = current
    ? sectionAnsweredCount(current, answers) / current.questions.length
    : 0;
  return Math.round(((completedSteps + withinCurrent) / surveySections.length) * 100);
}

/**
 * Why a section asks what it asks, and who ends up seeing it. Shown on the
 * sections carrying the most sensitive questions rather than only at the top.
 * Keyed by section name so an unlisted section simply shows nothing.
 */
export const SECTION_GUIDANCE: Record<string, string> = {
  "Religious Practice":
    "These shape the largest part of your compatibility score. Only your answers here — never your name or contact details — are used for matching, and a match sees them only after you both approve.",
  "Marriage Intentions":
    "Timeline, wali involvement and mahr expectations are matched against people with compatible intentions, so nobody's time is wasted. Your free-text mahr answer is never sent to our AI review.",
  "Family & Practical Matters":
    "Health, finances and debts are the most private questions we ask. They are stored encrypted, never shown to other members, and never sent to our AI review — free-text answers are excluded from it entirely. Leave anything blank you'd rather discuss in person.",
  "Family & Children":
    "Used to match people who want compatible family lives. Visible to a match only after you have both approved each other.",
  "Compatibility Extras":
    "Free text, in your own words. These are for a future match to read once you've both approved — they are never sent to our AI review.",
};

/** Questions whose answers are free text and therefore never leave the platform. */
export function isPrivateFreeText(question: Question): boolean {
  return question.type === "text";
}
