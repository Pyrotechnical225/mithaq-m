// Executes the real worker and eligibility queries against an offline query double.
// PostgreSQL/RLS/trigger behavior is tested separately in notification-database.test.cjs.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");

function workerHarness(options = {}) {
  const job = {
    id: "job",
    user_id: "member-a",
    pairing_id: "pair",
    meetup_id: null,
    check_in_id: null,
    referral_id: null,
    imam_application_id: null,
    kind: "anonymous_profile_ready",
    attempts: 1,
    status: "processing",
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    ...options.job,
  };
  const pair = {
    id: "pair",
    user_a: "member-a",
    user_b: "member-b",
    imam_id: "imam",
    status: "member_review",
    member_a_response: "accepted",
    member_b_response: "accepted",
    payment_a_status: "paid",
    payment_b_status: "paid",
    ...options.pair,
  };
  const tables = {
    notification_email_jobs: [job],
    email_notification_preferences: [
      "matches",
      "journey",
      "meetings",
      "check_ins",
      "payments",
      "imam",
      "admin",
    ].map((category) => ({ user_id: job.user_id, category, enabled: true })),
    pairings: [pair],
    member_blocks: [],
    imam_accounts: [{ user_id: job.user_id, imam_id: "imam", active: true }],
    imams: [{ id: "imam", verification_status: "verified" }],
    user_roles: [],
    survey_answers: [{ user_id: job.user_id, completed: false }],
    privacy_settings: [{ user_id: job.user_id, visibility: "hidden" }],
    imam_applications: [],
    imam_referrals: [],
    meetups: [
      {
        id: "meeting",
        pairing_id: "pair",
        status: "completed",
        scheduled_at: "2026-07-01T12:00:00Z",
        completed_at: "2026-07-01T12:00:00Z",
      },
    ],
    meeting_check_ins: [
      {
        id: "check-in",
        meetup_id: "meeting",
        user_id: job.user_id,
        answered_at: null,
        due_at: "2026-07-22T12:00:00Z",
        outcome: "support_requested",
        reviewed_at: null,
      },
    ],
    ...options.tables,
  };
  const sent = [];
  const queries = [];
  const user = {
    id: job.user_id,
    email: "verified@example.com",
    email_confirmed_at: "2026-01-01",
    ...options.user,
  };
  const db = {
    auth: {
      admin: {
        getUserById: async (id) => {
          assert.equal(id, job.user_id);
          return { data: { user }, error: null };
        },
      },
    },
    rpc: async (name, input) => {
      assert.equal(name, "claim_notification_email");
      job.claim_token = input.p_claim_token;
      return { data: [job], error: null };
    },
    from(table) {
      const filters = [];
      let patch;
      let count;
      queries.push(table);
      function run(single = false) {
        let data = (tables[table] || []).filter((row) => filters.every((fn) => fn(row)));
        if (count) data = data.slice(0, count);
        if (patch) data.forEach((row) => Object.assign(row, patch));
        return { data: single ? data[0] || null : data, error: null };
      }
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return q;
        },
        gt(key, value) {
          filters.push((row) => row[key] > value);
          return q;
        },
        or() {
          return q;
        }, // The fixture contains only the relevant pair's blocks.
        limit(value) {
          count = value;
          return q;
        },
        update(value) {
          patch = value;
          return q;
        },
        maybeSingle() {
          return Promise.resolve(run(true));
        },
        then(resolve, reject) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const filename = path.join(__dirname, "../src/lib/" + name + ".ts");
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(
      code,
      {
        exports,
        crypto: webcrypto,
        Date,
        Error,
        require(id) {
          if (id === "@/integrations/supabase/client.server") return { supabaseAdmin: db };
          if (id === "./ses-email.server")
            return {
              createSesMailer: () =>
                options.disabled
                  ? null
                  : {
                      verifyAccount: async () => {},
                      isSuppressed: async () => false,
                      send: async (...args) => {
                        sent.push(args);
                        return "synthetic-ses-id";
                      },
                    },
            };
          if (id.startsWith("./")) return load(id.slice(2));
          throw new Error("Unexpected test import " + id);
        },
      },
      { filename },
    );
    return exports;
  }
  return {
    run: load("notification-email-worker.server").runNotificationEmailJob,
    job,
    sent,
    queries,
  };
}

test("worker remains disabled without touching database or sending", async () => {
  const h = workerHarness({ disabled: true });
  assert.equal((await h.run()).status, "disabled");
  assert.equal(h.queries.length, 0);
  assert.equal(h.sent.length, 0);
});

test("worker uses verified Auth email and current member eligibility", async () => {
  const success = workerHarness();
  assert.equal((await success.run()).status, "accepted");
  assert.equal(success.sent[0][1], "verified@example.com");
  assert.equal(success.job.ses_message_id, "synthetic-ses-id");
  for (const [options, reason] of [
    [{ tables: { email_notification_preferences: [] } }, "not_opted_in"],
    [{ user: { email_confirmed_at: null } }, "email_unverified"],
    [{ user: { banned_until: new Date(Date.now() + 3600000).toISOString() } }, "account_suspended"],
    [{ job: { pairing_id: null } }, "missing_pair_context"],
    [{ pair: { user_a: "someone-else" } }, "not_pair_participant"],
    [{ pair: { status: "declined" } }, "introduction_no_longer_due"],
    [{ tables: { member_blocks: [{ block_id: "blocked" }] } }, "pair_blocked"],
    [{ job: { kind: "meeting_confirmed" } }, "missing_meeting_context"],
  ]) {
    const h = workerHarness(options);
    assert.equal((await h.run()).status, "skipped", reason);
    assert.equal(h.job.last_error_code, reason);
    assert.equal(h.sent.length, 0);
  }
});

test("weekly journey reminders send only while an opted-in member still has work to do", async () => {
  const job = { kind: "journey_progress_reminder", pairing_id: null };
  const success = workerHarness({ job, tables: { pairings: [] } });
  assert.equal((await success.run()).status, "accepted");

  const completed = workerHarness({
    job,
    tables: {
      pairings: [],
      survey_answers: [{ user_id: "member-a", completed: true }],
      privacy_settings: [{ user_id: "member-a", visibility: "discoverable" }],
    },
  });
  assert.equal((await completed.run()).status, "skipped");
  assert.equal(completed.job.last_error_code, "journey_step_completed");

  const paused = workerHarness({
    job,
    tables: {
      pairings: [],
      privacy_settings: [{ user_id: "member-a", visibility: "paused" }],
    },
  });
  assert.equal((await paused.run()).status, "skipped");
  assert.equal(paused.job.last_error_code, "journey_paused");
});

test("application notifications recheck the current applicant and decision", async () => {
  const job = {
    kind: "imam_application_decision",
    pairing_id: null,
    imam_application_id: "application",
  };
  const success = workerHarness({
    job,
    tables: {
      imam_applications: [{ id: "application", user_id: "member-a", status: "approved" }],
    },
  });
  assert.equal((await success.run()).status, "accepted");

  const stale = workerHarness({
    job,
    tables: {
      imam_applications: [{ id: "application", user_id: "member-a", status: "pending" }],
    },
  });
  assert.equal((await stale.run()).status, "skipped");
  assert.equal(stale.job.last_error_code, "imam_application_no_longer_decided");
});

test("imam notifications recheck role, verification and pair assignment", async () => {
  const job = { kind: "imam_match_review" };
  const success = workerHarness({ job, pair: { status: "imam_review" } });
  assert.equal((await success.run()).status, "accepted");
  for (const [options, reason] of [
    [{ tables: { imam_accounts: [] } }, "imam_inactive"],
    [{ tables: { imams: [{ id: "imam", verification_status: "pending" }] } }, "imam_unverified"],
    [{ pair: { imam_id: "different-imam" } }, "assignment_changed"],
    [{ pair: { status: "member_review" } }, "review_no_longer_due"],
  ]) {
    const h = workerHarness({ job, ...options });
    assert.equal((await h.run()).status, "skipped", reason);
    assert.equal(h.job.last_error_code, reason);
    assert.equal(h.sent.length, 0);
  }
  const admin = workerHarness({ job: { kind: "imam_referral_review", pairing_id: null } });
  assert.equal((await admin.run()).status, "skipped");
  assert.equal(admin.job.last_error_code, "role_changed");
});

test("member support alerts require a current unreviewed request and an admin recipient", async () => {
  const job = {
    kind: "member_support_requested",
    pairing_id: null,
    check_in_id: "check-in",
  };
  const success = workerHarness({
    job,
    tables: {
      user_roles: [{ user_id: "member-a", role: "admin" }],
      meeting_check_ins: [
        {
          id: "check-in",
          outcome: "support_requested",
          answered_at: "2026-07-22T12:00:00Z",
          reviewed_at: null,
        },
      ],
    },
  });
  assert.equal((await success.run()).status, "accepted");
  const reviewed = workerHarness({
    job,
    tables: {
      user_roles: [{ user_id: "member-a", role: "admin" }],
      meeting_check_ins: [
        {
          id: "check-in",
          outcome: "support_requested",
          answered_at: "2026-07-22T12:00:00Z",
          reviewed_at: "2026-07-23T12:00:00Z",
        },
      ],
    },
  });
  assert.equal((await reviewed.run()).status, "skipped");
  assert.equal(reviewed.job.last_error_code, "support_no_longer_due");
  const formerAdmin = workerHarness({ job, tables: { user_roles: [] } });
  assert.equal((await formerAdmin.run()).status, "skipped");
  assert.equal(formerAdmin.job.last_error_code, "role_changed");
});

test("check-ins skip answered, early, obsolete or withdrawn meeting journeys", async () => {
  const job = { kind: "meeting_followup", meetup_id: "meeting" };
  const success = workerHarness({ job, pair: { status: "scheduled" } });
  assert.equal((await success.run()).status, "accepted");
  for (const [options, reason] of [
    [{ pair: { member_b_response: "declined" } }, "consent_changed"],
    [{ pair: { status: "closed" } }, "pair_closed"],
    [
      {
        tables: {
          meeting_check_ins: [
            { meetup_id: "meeting", user_id: "member-a", answered_at: "2026-07-22" },
          ],
        },
      },
      "check_in_not_due",
    ],
    [
      {
        tables: {
          meeting_check_ins: [
            {
              meetup_id: "meeting",
              user_id: "member-a",
              due_at: new Date(Date.now() + 3600000).toISOString(),
            },
          ],
        },
      },
      "check_in_not_due",
    ],
    [
      {
        tables: {
          meetups: [
            { id: "meeting", pairing_id: "pair", status: "completed", completed_at: "2026-07-01" },
            { id: "later", pairing_id: "pair", status: "completed", completed_at: "2026-08-01" },
          ],
        },
      },
      "newer_meeting_completed",
    ],
  ]) {
    const h = workerHarness({ job, ...options });
    assert.equal((await h.run()).status, "skipped", reason);
    assert.equal(h.job.last_error_code, reason);
    assert.equal(h.sent.length, 0);
  }
});
