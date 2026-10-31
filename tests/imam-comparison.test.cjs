// Pure-logic checks for the imam answer comparison and the private contact
// details members give their imam. No network or database.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

function loadModule(file) {
  const cache = new Map();
  function load(relative) {
    const filename = path.join(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} };
    cache.set(filename, module.exports);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (name) =>
      name.startsWith(".")
        ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)))
        : require(name);
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire });
    return module.exports;
  }
  return load(file);
}

const compare = loadModule("src/lib/compatibility-compare.ts");
const contacts = loadModule("src/lib/member-contacts.ts");
const { questions } = loadModule("src/lib/survey-questions.ts");

const base = {
  1: "29",
  2: "Male",
  6: "Never married",
  7: "No children",
  10: "Hanafi",
  11: "Very practicing",
  12: "All five daily",
  19: "Within 6 months",
  21: "Agreed with families",
  22: "Yes",
  25: "No",
  26: "Asthma",
  36: "3+",
};

test("identical answers all match and every section scores 100", () => {
  const result = compare.compareAnswers(base, { ...base, 2: "Female" });
  const scored = result.rows.filter((row) => row.verdict !== null);
  assert.ok(scored.length > 0);
  assert.ok(scored.every((row) => row.verdict === "match"));
  assert.ok(result.sectionScores.every((section) => section.percent === 100));
});

test("health and gender answers are never shown to the imam", () => {
  const { rows } = compare.compareAnswers(base, base);
  assert.equal(
    rows.some((row) => row.id === 26),
    false,
  );
  assert.equal(
    rows.some((row) => row.id === 2),
    false,
  );
});

test("written answers are listed without a verdict and do not affect scores", () => {
  const { rows } = compare.compareAnswers(base, { ...base, 21: "Something different" });
  const mahr = rows.find((row) => row.id === 21);
  assert.equal(mahr.verdict, null);
  assert.equal(mahr.b, "Something different");
});

test("important differences are flagged to discuss, minor ones as differs", () => {
  const { rows, sectionScores } = compare.compareAnswers(base, {
    ...base,
    10: "Shafi'i",
    12: "Most of them",
    19: "1–2 years",
  });
  assert.equal(rows.find((row) => row.id === 10).verdict, "differs");
  assert.equal(rows.find((row) => row.id === 12).verdict, "discuss");
  const religious = sectionScores.find((section) => section.section === "Religious Practice");
  assert.ok(religious.percent < 100);
  assert.equal(religious.weight, 4);
  assert.equal(sectionScores[0].section, "Religious Practice", "heaviest section is listed first");
});

test("an open answer counts as flexible, matching the scoring rule", () => {
  const { rows } = compare.compareAnswers(base, { ...base, 36: "Open/undecided" });
  assert.equal(rows.find((row) => row.id === 36).verdict, "flexible");
  assert.equal(compare.answerSimilarity("3+", "open/undecided"), 0.65);
});

test("a member not open to stepchildren is flagged when the other has children", () => {
  const { rows } = compare.compareAnswers(
    { ...base, 22: "No" },
    { ...base, 7: "1–2 children", 22: "No" },
  );
  assert.equal(rows.find((row) => row.id === 22).verdict, "discuss");
});

test("'Other' answers show the member's own detail", () => {
  const { rows } = compare.compareAnswers({ ...base, 10: "Other", "10_other": "Ja'fari" }, base);
  assert.equal(rows.find((row) => row.id === 10).a, "Other: Ja'fari");
});

test("section weights match the matching engine for every scored question", () => {
  for (const question of questions) {
    if (!compare.isScoredQuestion(question)) continue;
    assert.ok(compare.questionWeight(question) >= 1, `question ${question.id} has a weight`);
  }
});

const validDetails = {
  contact_method: "whatsapp",
  phone: " 07700  900123 ",
  email: "",
  best_times: ["evenings"],
  wali_name: "Ibrahim",
  wali_relationship: "father",
  wali_phone: "07700 900456",
  meeting_formats: ["mosque"],
};

test("contact details are trimmed and phone numbers normalised", () => {
  const parsed = contacts.ContactDetailsInput.parse(validDetails);
  assert.equal(parsed.phone, "07700 900123");
  assert.equal(parsed.email, null);
  assert.equal(parsed.confirm, false);
});

test("invalid phone numbers and emails are rejected", () => {
  assert.equal(
    contacts.ContactDetailsInput.safeParse({ ...validDetails, phone: "call me" }).success,
    false,
  );
  assert.equal(
    contacts.ContactDetailsInput.safeParse({ ...validDetails, phone: "12" }).success,
    false,
  );
  assert.equal(
    contacts.ContactDetailsInput.safeParse({ ...validDetails, email: "not-an-email" }).success,
    false,
  );
  assert.equal(
    contacts.ContactDetailsInput.safeParse({ ...validDetails, phone: "+44 7700 900123" }).success,
    true,
  );
});

test("confirming needs a phone unless email is chosen, and wali details for sisters", () => {
  const parsed = contacts.ContactDetailsInput.parse({
    ...validDetails,
    phone: "",
    wali_name: "",
    wali_phone: "",
  });
  const problems = contacts.contactConfirmationProblems(parsed, {
    waliRequired: true,
    accountEmail: "a@example.com",
  });
  assert.equal(problems.length, 3);
  const brother = contacts.contactConfirmationProblems(
    { ...parsed, contact_method: "email" },
    { waliRequired: false, accountEmail: "a@example.com" },
  );
  assert.equal(brother.length, 0);
});

test("wali details are required for sisters only", () => {
  assert.equal(contacts.waliRequiredFor({ 2: "Female" }), true);
  assert.equal(contacts.waliRequiredFor({ 2: "Male" }), false);
  assert.equal(contacts.waliRequiredFor(null), false);
});
