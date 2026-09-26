const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");

const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = path.join(__dirname, "../src/lib", name + ".ts");
  const exports = {};
  cache.set(name, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      require: (id) => (id.startsWith(".") ? load(id.slice(2)) : require(id)),
      process: { env: {} },
      URL,
      Date,
      Error,
      TextEncoder,
      Uint8Array,
      crypto: webcrypto,
      AbortSignal,
    },
    { filename: file },
  );
  return exports;
}
const policy = load("notification-email-policy");
const { dispatchOneNotification, notificationJobAuthorized } = load("notification-dispatch");
const { getSesConfiguration, createSesMailer } = load("ses-email.server");
const env = {
  EMAIL_NOTIFICATIONS_ENABLED: "true",
  EMAIL_DEPLOYMENT_SCOPE: "production",
  AWS_REGION: "eu-west-2",
  AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/mithaq-ses-production",
  SES_FROM_EMAIL: "notifications@example.com",
  PUBLIC_SITE_URL: "https://example.com",
};

test("SES is off by default and rejects preview or missing configuration", () => {
  assert.equal(createSesMailer({}), null);
  assert.throws(() => getSesConfiguration({ ...env, VERCEL_ENV: "preview" }));
  assert.throws(() => getSesConfiguration({ ...env, EMAIL_DEPLOYMENT_SCOPE: "" }));
  assert.throws(() => getSesConfiguration({ ...env, AWS_ROLE_ARN: "" }));
  assert.throws(() => getSesConfiguration({ ...env, AWS_ROLE_ARN: "not-an-iam-role" }));
  assert.throws(() =>
    getSesConfiguration({ ...env, SES_FROM_EMAIL: "x@example.com\r\nBcc: other@example.com" }),
  );
  assert.equal(getSesConfiguration(env).region, "eu-west-2");
});

test("all notification templates use private fixed copy and safe links", () => {
  for (const kind of Object.keys(policy.EMAIL_KINDS)) {
    const copy = policy.renderNotificationEmail(kind, "https://meet-haq.vercel.app");
    assert.match(copy.text, /https:\/\/meet-haq.vercel.app\//);
    assert.match(copy.html, /Manage email preferences/);
    assert.doesNotMatch(copy.html, /<script\b|tracking-pixel|compatibility score|survey answer/i);
  }
  for (const origin of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?next=evil",
  ]) {
    assert.throws(() => policy.renderNotificationEmail("meeting_followup", origin));
  }
  assert.equal(policy.isEmailKind("__proto__"), false);
  assert.throws(() => policy.renderNotificationEmail("__proto__", "https://www.mithaq.uk"));
});

test("all branded templates have matching text, accessible structure and no remote assets", () => {
  for (const [kind, definition] of Object.entries(policy.EMAIL_KINDS)) {
    const email = policy.renderNotificationEmail(kind, "https://www.mithaq.uk");
    assert.match(email.html, /lang="en"/);
    assert.match(email.html, /lang="ar" dir="rtl"/);
    assert.match(email.html, /max-width:480px/);
    assert.match(email.html, /max-width:600px/);
    assert.match(email.html, /aria-hidden="true"/);
    assert.match(email.html, /What to do next/);
    assert.match(email.text, /What to do next/);
    assert.match(email.text, /because you enabled/);
    assert.equal((email.html.match(/<h1\b/g) ?? []).length, 1);
    assert.ok(email.text.includes(definition.body));
    assert.doesNotMatch(email.html, /<(img|script|form|input|iframe)\b|url\(|src=/i);
    assert.ok(Buffer.byteLength(email.html) < 20_000);
    const links = [...email.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(links.length, 3);
    const destination = new URL(links[0]);
    assert.equal(destination.origin, "https://www.mithaq.uk");
    const expectedPath =
      kind === "member_support_requested"
        ? "/admin/check-ins"
        : ["imam_application_review", "imam_application_review_reminder"].includes(kind)
          ? "/admin/imam-applications"
          : ["imam_application_received", "imam_application_decision"].includes(kind)
            ? "/imam-apply"
            : definition.audience === "admin"
              ? "/admin/referrals"
              : definition.audience === "imam"
                ? "/imam"
                : "/dashboard";
    assert.equal(destination.pathname, expectedPath);
    assert.equal(
      destination.hash,
      ["meeting_followup", "meeting_check_in_reminder"].includes(kind) ? "#check-ins" : "",
    );
    assert.equal(links[0], links[1]);
    assert.equal(links[2], "https://www.mithaq.uk/settings#email-notifications");
    for (const link of links) assert.ok(email.text.includes(link));
  }
  const followup = policy.renderNotificationEmail("meeting_followup", "https://www.mithaq.uk");
  assert.match(followup.text, /not the other member or imam/);
  assert.match(followup.text, /not an emergency support service/);
});

test("follow-up is exactly 21 days from actual completion across DST", () => {
  assert.equal(policy.followupDueAt("2026-10-10T14:00:00.000Z"), "2026-10-31T14:00:00.000Z");
  assert.throws(() => policy.followupDueAt("not-a-date"));
});

test("email colours stay aligned with the website's light-theme tokens", () => {
  const styles = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");
  const root = styles.match(/:root\s*\{([\s\S]*?)\}/)[1];
  // Rounded sRGB fallbacks for the site's OKLCH colours. Fail on brand drift.
  const tokens = [
    ["background", "background", "0.982 0.008 86", "#fbf9f3"],
    ["foreground", "foreground", "0.23 0.025 155", "#132018"],
    ["card", "card", "0.997 0.003 86", "#fffefc"],
    ["primary", "primary", "0.33 0.065 158", "#113f28"],
    ["primary-foreground", "primaryForeground", "0.985 0.008 86", "#fcfaf4"],
    ["muted-foreground", "mutedForeground", "0.47 0.018 155", "#535e56"],
    ["gold", "gold", "0.62 0.075 78", "#9f8151"],
    ["cream", "cream", "0.965 0.012 86", "#f7f3eb"],
    ["border", "border", "0.87 0.012 88", "#d7d4cc"],
    ["ring", "ring", "0.48 0.065 158", "#3c694f"],
  ];
  for (const [cssName, emailName, oklch, hex] of tokens) {
    assert.ok(root.includes(`--${cssName}: oklch(${oklch});`), cssName);
    assert.equal(policy.EMAIL_PALETTE[emailName], hex, emailName);
  }
  const allowed = new Set(Object.values(policy.EMAIL_PALETTE));
  for (const kind of Object.keys(policy.EMAIL_KINDS)) {
    const email = policy.renderNotificationEmail(kind, "https://www.mithaq.uk");
    for (const [colour] of email.html.matchAll(/#[0-9a-f]{6}\b/gi)) {
      assert.ok(allowed.has(colour), `${kind}: unexpected colour ${colour}`);
    }
    assert.ok(email.html.includes(`border-top:4px solid ${policy.EMAIL_PALETTE.primary}`));
  }
});

test("email text and button colour pairs exceed WCAG AA normal-text contrast", () => {
  const luminance = (hex) => {
    const rgb = hex
      .slice(1)
      .match(/../g)
      .map((channel) => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const palette = policy.EMAIL_PALETTE;
  for (const [text, background] of [
    [palette.foreground, palette.card],
    [palette.foreground, palette.background],
    [palette.mutedForeground, palette.card],
    [palette.mutedForeground, palette.background],
    [palette.mutedForeground, palette.cream],
    [palette.primary, palette.card],
    [palette.primary, palette.background],
    [palette.primaryForeground, palette.primary],
  ]) {
    const a = luminance(text);
    const b = luminance(background);
    const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(contrast >= 4.5, `${text} on ${background}: ${contrast.toFixed(2)}:1`);
  }
});

test("job endpoint requires an exact bearer secret of sufficient length", async () => {
  const secret = "synthetic-secret-with-at-least-32-characters";
  assert.equal(await notificationJobAuthorized("Bearer " + secret, secret), true);
  assert.equal(await notificationJobAuthorized("Bearer wrong", secret), false);
  assert.equal(await notificationJobAuthorized(null, secret), false);
  assert.equal(await notificationJobAuthorized("Bearer short", "short"), false);
});

function harness(overrides = {}) {
  const events = [];
  const job = {
    id: "job-1",
    user_id: "member-1",
    kind: "anonymous_profile_ready",
    pairing_id: "pair-1",
    meetup_id: null,
    attempts: 1,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  return {
    events,
    deps: {
      verifyAccount: async () => events.push("verified"),
      claim: async () => job,
      recipient: async () => ({ email: "synthetic@example.com" }),
      isSuppressed: async () => false,
      send: async () => {
        events.push("sent");
        return "ses-1";
      },
      finish: async (_job, _token, status, code) => events.push({ status, code }),
      ...overrides,
    },
  };
}

test("accepted mail is recorded as accepted, never claimed delivered", async () => {
  const h = harness();
  const result = await dispatchOneNotification(h.deps, "token");
  assert.equal(result.status, "accepted");
  assert.equal(h.events.filter((e) => e === "sent").length, 1);
});
test("opt-outs and suppressed addresses never send", async () => {
  for (const overrides of [
    { recipient: async () => ({ skip: "not_opted_in" }) },
    { isSuppressed: async () => true },
  ]) {
    const h = harness(overrides);
    assert.equal((await dispatchOneNotification(h.deps, "token")).status, "skipped");
    assert.equal(h.events.includes("sent"), false);
  }
});
test("provider readiness failure does not claim the queue", async () => {
  let claimed = false;
  const h = harness({
    verifyAccount: async () => {
      throw new Error("not ready");
    },
    claim: async () => {
      claimed = true;
    },
  });
  await assert.rejects(dispatchOneNotification(h.deps, "token"));
  assert.equal(claimed, false);
});
test("known SES throttling can retry but send timeouts cannot", async () => {
  const throttle = new Error("test");
  throttle.name = "TooManyRequestsException";
  const retry = harness({
    send: async () => {
      throw throttle;
    },
  });
  assert.equal((await dispatchOneNotification(retry.deps, "token")).status, "queued");
  const uncertain = harness({
    send: async () => {
      throw new Error("connection lost");
    },
  });
  assert.equal((await dispatchOneNotification(uncertain.deps, "token")).status, "unknown");
});
test("failure recording an accepted send is held for review, not resent", async () => {
  const states = [];
  const h = harness({
    finish: async (_job, _token, status) => {
      states.push(status);
      if (status === "accepted") throw new Error("database unavailable");
    },
  });
  assert.equal((await dispatchOneNotification(h.deps, "token")).status, "unknown");
  assert.deepEqual(states, ["accepted", "unknown"]);
  assert.equal(h.events.filter((e) => e === "sent").length, 1);
});
