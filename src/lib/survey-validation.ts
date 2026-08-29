import { questions } from "./survey-questions";

export type SurveyAnswers = Record<string, string>;

const questionById = new Map(questions.map((question) => [String(question.id), question]));

export function validateSurveyAnswers(answers: SurveyAnswers, completed: boolean): SurveyAnswers {
  const normalized: SurveyAnswers = {};

  for (const [id, rawValue] of Object.entries(answers)) {
    const question = questionById.get(id);
    if (!question) throw new Error(`Unknown survey question: ${id}`);

    const value = rawValue.trim();
    if (value.length > 4_000) throw new Error(`Answer ${id} is too long`);
    if (question.type === "choice" && value && !question.options?.includes(value)) {
      throw new Error(`Answer ${id} is not one of the available choices`);
    }
    if (question.type === "number" && value) {
      const age = Number(value);
      if (!Number.isInteger(age) || age < 18 || age > 100) {
        throw new Error("Age must be a whole number between 18 and 100");
      }
    }
    normalized[id] = value;
  }

  if (completed) {
    const missing = questions
      .filter((question) => question.required && !normalized[String(question.id)]?.trim())
      .map((question) => question.id);
    if (missing.length > 0) {
      throw new Error(`Required survey questions are unanswered: ${missing.join(", ")}`);
    }
  }

  return normalized;
}

export function requiredSurveyAnswersAreValid(answers: SurveyAnswers): boolean {
  try {
    validateSurveyAnswers(answers, true);
    return true;
  } catch {
    return false;
  }
}
