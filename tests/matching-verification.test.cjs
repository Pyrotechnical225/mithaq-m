// Read-only verification against the real scoring source and installed AI SDK.
// Supabase and OpenAI transport are stubbed: no member records or network calls.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

function loadHarness(options = {}) {
  const cache = new Map();
  const requests = [];
  const errors = [];
  const env = options.env ?? { OPENAI_API_KEY: "synthetic-test-key" };
  function load(file) {
    const filename = path.join(root, file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    let source = fs.readFileSync(filename, "utf8");
    if (file === "src/lib/matches.functions.ts") {
      source += "\nexport { getOpenAIReviews, summarizeSafeAnswers };";
    }
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const customRequire = (name) => {
      if (name === "@tanstack/react-start")
        return {
          createServerFn: () => {
            const builder = {
              middleware() {
                return builder;
              },
              validator() {
                return builder;
              },
              handler(fn) {
                return fn;
              },
            };
            return builder;
          },
        };
      if (name === "@/integrations/supabase/auth-middleware") return { requireSupabaseAuth: {} };
      if (name === "@/integrations/supabase/client.server") return { supabaseAdmin: options.db };
      if (name === "@ai-sdk/openai-compatible") {
        const { createOpenAICompatible } = require(name);
        return {
          createOpenAICompatible: (config) =>
            createOpenAICompatible({
              ...config,
              fetch: async (url, init) => {
                requests.push({ url, body: JSON.parse(init.body) });
                if (options.errorStatus)
                  return new Response(
                    JSON.stringify({
                      error: { message: "Synthetic failure", type: "invalid_request_error" },
                    }),
                    { status: options.errorStatus },
                  );
                const content =
                  options.content ??
                  JSON.stringify({
                    matches: [
                      {
                        candidate_id: "candidate_1",
                        score: 90,
                        strengths: "Shared goals.",
                        considerations: "Discuss expectations.",
                      },
                    ],
                  });
                return new Response(
                  JSON.stringify({
                    id: "synthetic-response",
                    object: "chat.completion",
                    created: 1,
                    model: "synthetic-model",
                    choices: [
                      { index: 0, finish_reason: "stop", message: { role: "assistant", content } },
                    ],
                    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                  }),
                  { status: 200, headers: { "Content-Type": "application/json" } },
                );
              },
            }),
        };
      }
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`.replace(/^/, "src/"));
      if (name.startsWith("."))
        return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      return require(name);
    };
    const context = {
      exports,
      require: customRequire,
      process: { env },
      console: { error: (...args) => errors.push(args), warn: () => {} },
      AbortSignal,
      Response,
      fetch: () => {
        throw new Error("Network disabled in verification");
      },
      setTimeout,
      clearTimeout,
    };
    vm.runInNewContext(code, context, { filename });
    return exports;
  }
  const matching = load("src/lib/matches.functions.ts");
  const { questions } = load("src/lib/survey-questions.ts");
  const answers = Object.fromEntries(
    questions.map((q) => [
      q.id,
      q.type === "choice"
        ? q.options[0]
        : q.type === "number"
          ? "28"
          : "PRIVATE-FREE-TEXT-SENTINEL",
    ]),
  );
  return { ...matching, load, answers, questions, requests, errors };
}

test("fixed scoring is symmetric, bounded, and normalizes case and whitespace", () => {
  const h = loadHarness();
  const other = { ...h.answers, 2: "Female", 11: "Still learning", 19: "Open" };
  assert.equal(h.fixedCompatibilityScore(h.answers, h.answers), 100);
  assert.equal(
    h.fixedCompatibilityScore(h.answers, other),
    h.fixedCompatibilityScore(other, h.answers),
  );
  assert.equal(h.fixedCompatibilityScore({}, {}), 50);
  assert.equal(
    h.fixedCompatibilityScore({ 11: " Very Practicing " }, { 11: "very practicing" }),
    100,
  );
  assert.equal(h.fixedCompatibilityScore({ 11: "Very practicing" }, { 11: "Cultural Muslim" }), 50);
  assert.equal(h.fixedCompatibilityScore({ 19: "Within 6 months" }, { 19: "Open" }), 83);
});

test("free text, age and gender do not change the fixed rubric", () => {
  const h = loadHarness();
  const other = { ...h.answers, 1: "60", 2: "Female" };
  for (const q of h.questions.filter((q) => q.type === "text")) other[q.id] = "DIFFERENT";
  assert.equal(h.fixedCompatibilityScore(h.answers, other), 100);
});

test("AI request uses actual SDK structured output and excludes free text and gender", async () => {
  const h = loadHarness();
  const answersWithOtherDetail = {
    ...h.answers,
    10: "Other",
    "10_other": "PRIVATE-OTHER-DETAIL-SENTINEL",
  };
  const reviews = await h.getOpenAIReviews(answersWithOtherDetail, [
    { candidate_id: "candidate_1", answers: { ...answersWithOtherDetail, 2: "Female" } },
  ]);
  assert.equal(reviews.get("candidate_1")?.score, 90);
  assert.equal(h.requests.length, 1);
  const request = h.requests[0];
  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.body.store, false);
  assert.equal(request.body.response_format.type, "json_schema");
  assert.equal(request.body.max_tokens, 1500);
  const prompt = JSON.stringify(request.body.messages);
  assert.ok(!prompt.includes("PRIVATE-FREE-TEXT-SENTINEL"));
  assert.ok(!prompt.includes("PRIVATE-OTHER-DETAIL-SENTINEL"));
  assert.ok(!prompt.includes("What is your gender?"));
  assert.ok(prompt.includes("candidate_1"));
});

test("madhab choices are split and Other details are stored separately", () => {
  const h = loadHarness();
  const madhab = h.questions.find((question) => question.id === 10);
  assert.deepEqual(Array.from(madhab.options), [
    "Hanafi",
    "Shafi'i",
    "Maliki",
    "Hanbali",
    "Other",
    "No specific madhab",
  ]);

  const { validateSurveyAnswers } = h.load("src/lib/survey-validation.ts");
  const detailed = validateSurveyAnswers(
    { ...h.answers, 10: "Other", "10_other": "A short explanation" },
    true,
  );
  assert.equal(detailed["10_other"], "A short explanation");

  const stale = validateSurveyAnswers(
    { ...h.answers, 10: "Maliki", "10_other": "Stale detail" },
    true,
  );
  assert.equal("10_other" in stale, false);
  assert.equal(
    validateSurveyAnswers({ ...h.answers, 10: "Maliki or Hanbali" }, true)[10],
    "Maliki or Hanbali",
  );
  assert.throws(
    () => validateSurveyAnswers({ ...h.answers, "11_other": "Not allowed" }, false),
    /Unknown survey question: 11_other/,
  );
});

test("missing AI configuration and empty candidate pools make no provider calls", async () => {
  const h = loadHarness({ env: {} });
  assert.equal(
    (await h.getOpenAIReviews(h.answers, [{ candidate_id: "candidate_1", answers: h.answers }]))
      .size,
    0,
  );
  assert.equal((await h.getOpenAIReviews(h.answers, [])).size, 0);
  assert.equal(h.requests.length, 0);
});

test("malformed and out-of-range AI responses use the fixed-rubric fallback", async () => {
  for (const content of [
    "not json",
    JSON.stringify({
      matches: [{ candidate_id: "candidate_1", score: 101, strengths: "x", considerations: "y" }],
    }),
  ]) {
    const h = loadHarness({ content });
    assert.equal(
      (await h.getOpenAIReviews(h.answers, [{ candidate_id: "candidate_1", answers: h.answers }]))
        .size,
      0,
    );
  }
});

test("a provider authentication failure falls back without throwing", async () => {
  const h = loadHarness({ errorStatus: 401 });
  assert.equal(
    (await h.getOpenAIReviews(h.answers, [{ candidate_id: "candidate_1", answers: h.answers }]))
      .size,
    0,
  );
  assert.equal(h.requests.length, 1);
});

test("required survey validation rejects incomplete, underage and invalid-choice profiles", () => {
  const h = loadHarness();
  const { requiredSurveyAnswersAreValid } = h.load("src/lib/survey-validation.ts");
  assert.equal(requiredSurveyAnswersAreValid(h.answers), true);
  assert.equal(requiredSurveyAnswersAreValid({ ...h.answers, 1: "17" }), false);
  assert.equal(requiredSurveyAnswersAreValid({ ...h.answers, 11: "not an option" }), false);
  assert.equal(requiredSurveyAnswersAreValid({ ...h.answers, 30: "" }), false);
});

test("admin authorization denies non-admin and non-MFA sessions", async () => {
  const h = loadHarness();
  const { assertAdmin, assertAdminMfa } = h.load("src/lib/admin-authorization.ts");
  await assert.rejects(
    assertAdmin({
      userId: "synthetic",
      supabase: { rpc: async () => ({ data: false, error: null }) },
    }),
    /admin only/,
  );
  assert.throws(() => assertAdminMfa({ claims: { aal: "aal1" } }), /Multi-factor/);
  assert.doesNotThrow(() => assertAdminMfa({ claims: { aal: "aal2" } }));
});

// Minimal in-memory transport: exercise the real handler, not a reimplementation
// of its eligibility/scoring rules. It cannot connect to Supabase or send notices.
function fakeDatabase(tables, mine) {
  const inserts = [];
  function from(table) {
    let rows = [...(tables[table] ?? [])];
    let single = false;
    let write;
    const query = {
      select() {
        return query;
      },
      eq(key, value) {
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      neq(key, value) {
        rows = rows.filter((row) => row[key] !== value);
        return query;
      },
      in(key, values) {
        rows = rows.filter((row) => values.includes(row[key]));
        return query;
      },
      is(key, value) {
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      not(key, operator, value) {
        assert.equal(operator, "is");
        rows = rows.filter((row) => row[key] !== value);
        return query;
      },
      or() {
        return query;
      },
      order() {
        return query;
      },
      limit(count) {
        rows = rows.slice(0, count);
        return query;
      },
      maybeSingle() {
        single = true;
        return query;
      },
      single() {
        single = true;
        return query;
      },
      upsert(value) {
        write = value;
        return query;
      },
      insert(value) {
        write = value;
        inserts.push({ table, value });
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve({
          error: null,
          data: write
            ? { id: "synthetic-save", created_at: "2026-08-30T00:00:00Z", ...write }
            : single
              ? (rows[0] ?? null)
              : rows,
        }).then(resolve, reject);
      },
    };
    return query;
  }
  return {
    from,
    inserts,
    member: {
      from: (table) =>
        table === "survey_answers"
          ? fakeDatabase({ survey_answers: [mine] }).from(table)
          : from(table),
    },
  };
}

test("matching handler filters hidden, paused, unconsented, withdrawn, blocked, same-gender and incomplete candidates", async () => {
  const base = loadHarness();
  const candidate = (id, patch = {}) => ({
    user_id: id,
    completed: true,
    answers: { ...base.answers, 2: "Female" },
    ...patch,
  });
  const pool = [
    candidate("eligible"),
    candidate("hidden"),
    candidate("paused"),
    candidate("no-consent"),
    candidate("withdrawn"),
    candidate("blocked"),
    candidate("reverse-blocked"),
    candidate("same-gender", { answers: base.answers }),
    candidate("incomplete", { completed: false }),
    candidate("invalid", { answers: { ...base.answers, 1: "17", 2: "Female" } }),
  ];
  const mine = { user_id: "member-main", completed: true, answers: base.answers };
  const db = fakeDatabase(
    {
      survey_answers: pool,
      privacy_settings: pool.map((row) => ({
        user_id: row.user_id,
        visibility:
          row.user_id === "hidden"
            ? "hidden"
            : row.user_id === "paused"
              ? "paused"
              : "discoverable",
      })),
      member_consents: pool.map((row) => ({
        user_id: row.user_id,
        compatibility_processing_consent_at: row.user_id === "no-consent" ? null : "2026-08-30",
        compatibility_processing_withdrawn_at: row.user_id === "withdrawn" ? "2026-08-30" : null,
      })),
      member_blocks: [
        { blocker_user_id: "member-main", blocked_user_id: "blocked" },
        { blocker_user_id: "reverse-blocked", blocked_user_id: "member-main" },
      ],
    },
    mine,
  );
  const h = loadHarness({ db });
  const result = await h.generateMatches({
    context: { userId: "member-main", supabase: db.member },
  });
  const saved = db.inserts.find((item) => item.table === "matches").value.results.matches;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].match_user_id, "eligible");
  assert.equal(saved[0].fixed_score, 100);
  assert.equal(saved[0].openai_score, 90);
  assert.equal(saved[0].score, 98);
  assert.equal(result.suitable_match_count, 1);
  assert.equal(result.submitted_for_imam_review, 1);
  assert.ok(!("matches" in result), "member response must not disclose raw candidates");
  assert.equal(db.inserts.find((item) => item.table === "pairings").value.status, "imam_review");
});

test("matching handler does not call AI with no eligible candidates", async () => {
  const base = loadHarness();
  const mine = { user_id: "member-main", completed: true, answers: base.answers };
  const db = fakeDatabase({ survey_answers: [] }, mine);
  const h = loadHarness({ db });
  const result = await h.generateMatches({
    context: { userId: "member-main", supabase: db.member },
  });
  assert.equal(result.suitable_match_count, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(db.inserts.filter((item) => item.table === "pairings").length, 0);
});

function eligibleFixture(count) {
  const base = loadHarness();
  const mine = { user_id: "member-main", completed: true, answers: base.answers };
  const pool = Array.from({ length: count }, (_, index) => ({
    user_id: `eligible-${index}`,
    completed: true,
    answers: { ...base.answers, 2: "Female" },
  }));
  return {
    mine,
    tables: {
      survey_answers: pool,
      privacy_settings: pool.map((row) => ({ user_id: row.user_id, visibility: "discoverable" })),
      member_consents: pool.map((row) => ({
        user_id: row.user_id,
        compatibility_processing_consent_at: "2026-08-30",
        compatibility_processing_withdrawn_at: null,
      })),
    },
  };
}

test("matching handler does not duplicate existing pairings", async () => {
  const { mine, tables } = eligibleFixture(1);
  tables.pairings = [{ user_a: "eligible-0", user_b: "member-main" }];
  const db = fakeDatabase(tables, mine);
  const h = loadHarness({ db });
  const result = await h.generateMatches({
    context: { userId: "member-main", supabase: db.member },
  });
  assert.equal(result.suitable_match_count, 1);
  assert.equal(result.submitted_for_imam_review, 0);
  assert.equal(db.inserts.filter((item) => item.table === "pairings").length, 0);
});

test("member-facing generation returns at most five suitable results", async () => {
  const { mine, tables } = eligibleFixture(7);
  const db = fakeDatabase(tables, mine);
  const h = loadHarness({ db, env: {} });
  const result = await h.generateMatches({
    context: { userId: "member-main", supabase: db.member },
  });
  assert.equal(result.suitable_match_count, 5);
  assert.equal(db.inserts.find((item) => item.table === "matches").value.results.matches.length, 5);
});

test("the 70-point introduction threshold rejects low-scoring comparisons", async () => {
  const { mine, tables } = eligibleFixture(1);
  const base = loadHarness();
  for (const q of base.questions.filter((q) => q.type === "choice" && q.id !== 2)) {
    const option = q.options.find(
      (value) =>
        value !== mine.answers[q.id] &&
        !/open|depends|not sure|other|no preference|flexible|undecided/i.test(value),
    );
    if (option) tables.survey_answers[0].answers[q.id] = option;
  }
  assert.ok(base.fixedCompatibilityScore(mine.answers, tables.survey_answers[0].answers) < 70);
  const db = fakeDatabase(tables, mine);
  const h = loadHarness({ db, env: {} });
  const result = await h.generateMatches({
    context: { userId: "member-main", supabase: db.member },
  });
  assert.equal(result.suitable_match_count, 0);
  assert.equal(result.submitted_for_imam_review, 0);
});
