export type SurveyAnswers = Record<string, string>;

export interface CompatibilityResult {
  score: number;
  strengths: string;
  considerations: string;
  categories: Record<CompatibilityCategory, number>;
}

export type CompatibilityCategory =
  | "Religious alignment"
  | "Marriage readiness"
  | "Family expectations"
  | "Lifestyle and values"
  | "Practical feasibility";

interface Criterion {
  questionId: string;
  weight: number;
  similarity?: (
    mine: string,
    theirs: string,
    mineAnswers: SurveyAnswers,
    theirAnswers: SurveyAnswers,
  ) => number;
}

interface CategoryRule {
  weight: number;
  criteria: Criterion[];
}

const normalize = (value: string) => value.trim().toLowerCase();
const clamp = (value: number) => Math.max(0, Math.min(1, value));

const exact = (mine: string, theirs: string) => (normalize(mine) === normalize(theirs) ? 1 : 0.25);

const ordered = (values: string[]) => (mine: string, theirs: string) => {
  const mineIndex = values.map(normalize).indexOf(normalize(mine));
  const theirIndex = values.map(normalize).indexOf(normalize(theirs));
  if (mineIndex < 0 || theirIndex < 0) return exact(mine, theirs);
  return clamp(1 - Math.abs(mineIndex - theirIndex) / Math.max(1, values.length - 1));
};

const flexibleChoice = (flexibleValues: string[]) => (mine: string, theirs: string) => {
  if (normalize(mine) === normalize(theirs)) return 1;
  if (flexibleValues.map(normalize).includes(normalize(mine))) return 0.75;
  if (flexibleValues.map(normalize).includes(normalize(theirs))) return 0.75;
  return 0.2;
};

const sharedWords = (mine: string, theirs: string) => {
  const tokenize = (value: string) =>
    new Set(
      normalize(value)
        .split(/[^\p{L}]+/u)
        .filter((word) => word.length >= 2),
    );
  const mineWords = tokenize(mine);
  const theirWords = tokenize(theirs);
  if (mineWords.size === 0 || theirWords.size === 0) return 0.5;
  return [...mineWords].some((word) => theirWords.has(word)) ? 1 : 0.4;
};

const locationFeasibility = (
  mine: string,
  theirs: string,
  mineAnswers: SurveyAnswers,
  theirAnswers: SurveyAnswers,
) => {
  if (normalize(mine) === normalize(theirs)) return 1;
  const flexible = ["yes", "depends on location", "not sure"];
  const mineRelocation = normalize(mineAnswers["4"] ?? "");
  const theirRelocation = normalize(theirAnswers["4"] ?? "");
  if (mineRelocation === "yes" || theirRelocation === "yes") return 0.85;
  if (flexible.includes(mineRelocation) || flexible.includes(theirRelocation)) return 0.65;
  return 0.2;
};

const categoryRules: Record<CompatibilityCategory, CategoryRule> = {
  "Religious alignment": {
    weight: 30,
    criteria: [
      { questionId: "10", weight: 2, similarity: flexibleChoice(["Other", "No specific madhab"]) },
      {
        questionId: "11",
        weight: 4,
        similarity: ordered([
          "Cultural Muslim",
          "Still learning",
          "Moderately practicing",
          "Very practicing",
        ]),
      },
      {
        questionId: "12",
        weight: 4,
        similarity: ordered(["Rarely", "Occasionally", "Most of them", "All five daily"]),
      },
      {
        questionId: "13",
        weight: 2,
        similarity: ordered(["Never", "Rarely", "Often", "Always"]),
      },
      { questionId: "14", weight: 1, similarity: flexibleChoice(["Sometimes", "Other"]) },
      {
        questionId: "16",
        weight: 3,
        similarity: ordered(["Other", "Occasionally lenient", "Mostly", "Yes, always"]),
      },
      {
        questionId: "17",
        weight: 4,
        similarity: ordered([
          "Not a major concern",
          "Other",
          "Prefer none but flexible",
          "Strictly none",
        ]),
      },
      {
        questionId: "18",
        weight: 2,
        similarity: ordered(["Rarely", "Occasionally", "Weekly", "Daily"]),
      },
      {
        questionId: "47",
        weight: 2,
        similarity: ordered([
          "Not a priority",
          "Open to spouse's input",
          "Somewhat important",
          "Very important",
        ]),
      },
    ],
  },
  "Marriage readiness": {
    weight: 20,
    criteria: [
      {
        questionId: "19",
        weight: 5,
        similarity: ordered(["Within 6 months", "6–12 months", "1–2 years", "Open", "Not sure"]),
      },
      { questionId: "20", weight: 3, similarity: flexibleChoice(["Yes, preferred", "Other"]) },
      {
        questionId: "24",
        weight: 2,
        similarity: ordered([
          "Fully independent",
          "Minimal involvement",
          "Somewhat involved",
          "Very involved",
        ]),
      },
      { questionId: "48", weight: 3, similarity: flexibleChoice(["Other"]) },
    ],
  },
  "Family expectations": {
    weight: 20,
    criteria: [
      {
        questionId: "22",
        weight: 3,
        similarity: flexibleChoice(["Open to it, depending on circumstances", "Not sure"]),
      },
      { questionId: "36", weight: 4, similarity: flexibleChoice(["Open/undecided"]) },
      { questionId: "37", weight: 2, similarity: flexibleChoice(["Balanced", "Other"]) },
      { questionId: "38", weight: 2, similarity: flexibleChoice(["Other"]) },
      { questionId: "39", weight: 2, similarity: flexibleChoice(["Open to either", "Other"]) },
      {
        questionId: "40",
        weight: 3,
        similarity: flexibleChoice(["Flexible based on circumstance", "Other"]),
      },
    ],
  },
  "Lifestyle and values": {
    weight: 20,
    criteria: [
      {
        questionId: "25",
        weight: 4,
        similarity: flexibleChoice(["Occasionally", "Trying to quit"]),
      },
      { questionId: "31", weight: 1, similarity: flexibleChoice(["Balanced", "Other"]) },
      { questionId: "33", weight: 1, similarity: flexibleChoice(["Other"]) },
      { questionId: "35", weight: 3, similarity: flexibleChoice(["Other"]) },
      { questionId: "41", weight: 3, similarity: flexibleChoice(["Other"]) },
      {
        questionId: "43",
        weight: 2,
        similarity: ordered([
          "Not important",
          "No preference",
          "Somewhat important",
          "Very important",
        ]),
      },
      { questionId: "44", weight: 4, similarity: flexibleChoice(["Other"]) },
      {
        questionId: "45",
        weight: 1,
        similarity: ordered(["Not currently", "Other", "Occasionally", "Yes, actively"]),
      },
    ],
  },
  "Practical feasibility": {
    weight: 10,
    criteria: [
      { questionId: "3", weight: 4, similarity: locationFeasibility },
      { questionId: "27", weight: 2, similarity: sharedWords },
    ],
  },
};

function scoreCategory(rule: CategoryRule, mine: SurveyAnswers, theirs: SurveyAnswers) {
  let achieved = 0;
  let available = 0;
  for (const criterion of rule.criteria) {
    const mineValue = mine[criterion.questionId];
    const theirValue = theirs[criterion.questionId];
    if (!mineValue?.trim() || !theirValue?.trim()) continue;
    const similarity = criterion.similarity ?? exact;
    achieved += criterion.weight * clamp(similarity(mineValue, theirValue, mine, theirs));
    available += criterion.weight;
  }
  return available === 0 ? 50 : Math.round((achieved / available) * 100);
}

export function calculateCompatibility(
  mine: SurveyAnswers,
  theirs: SurveyAnswers,
): CompatibilityResult {
  const categories = Object.fromEntries(
    Object.entries(categoryRules).map(([name, rule]) => [name, scoreCategory(rule, mine, theirs)]),
  ) as Record<CompatibilityCategory, number>;

  const score = Math.round(
    Object.entries(categoryRules).reduce(
      (total, [name, rule]) =>
        total + categories[name as CompatibilityCategory] * (rule.weight / 100),
      0,
    ),
  );
  const ranked = (Object.entries(categories) as [CompatibilityCategory, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const strengths = ranked
    .filter(([, categoryScore]) => categoryScore >= 70)
    .slice(0, 2)
    .map(([name]) => name)
    .join(" and ");
  const considerations = [...ranked]
    .reverse()
    .filter(([, categoryScore]) => categoryScore < 70)
    .slice(0, 2)
    .map(([name]) => name)
    .join(" and ");

  return {
    score,
    categories,
    strengths: strengths
      ? `Strong alignment in ${strengths.toLowerCase()}.`
      : "The profiles show a balanced level of alignment across the assessed areas.",
    considerations: considerations
      ? `The imam should explore ${considerations.toLowerCase()} during review.`
      : "No major differences were identified by the fixed compatibility rubric.",
  };
}
