const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadAuthModule(entrypoint = "auth-redirect") {
  const cache = new Map();
  const load = (name) => {
    if (cache.has(name)) return cache.get(name);
    const file = path.join(__dirname, "../src/lib", name + ".ts");
    const exports = {};
    cache.set(name, exports);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(
      code,
      { exports, require: (id) => load(id.replace(/^\.\//, "")), URL },
      { filename: file },
    );
    return exports;
  };
  return load(entrypoint);
}

test("auth callbacks use the canonical production site and keep redirects local", () => {
  const { getAuthCallbackUrl } = loadAuthModule();
  assert.equal(getAuthCallbackUrl(), "https://www.mithaq.uk/auth/callback");
  assert.equal(
    getAuthCallbackUrl({ next: "/survey?step=2" }),
    "https://www.mithaq.uk/auth/callback?next=%2Fsurvey%3Fstep%3D2",
  );
  assert.equal(
    getAuthCallbackUrl({ next: "https://evil.example" }),
    "https://www.mithaq.uk/auth/callback",
  );
  assert.equal(
    getAuthCallbackUrl({ configuredSiteUrl: "javascript:alert(1)" }),
    "https://www.mithaq.uk/auth/callback",
  );
  assert.equal(
    getAuthCallbackUrl({ configuredSiteUrl: "ftp://localhost" }),
    "https://www.mithaq.uk/auth/callback",
  );
});

test("auth emails are responsive, branded, and never point to localhost", () => {
  for (const template of ["confirmation.html", "recovery.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "../supabase/templates", template), "utf8");
    assert.match(html, /name="viewport"/);
    assert.match(html, /Mithaq/);
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1|<script\b|<form\b/i);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  }
});

test("auth email links use token hashes so they work on any device", () => {
  const read = (name) =>
    fs.readFileSync(path.join(__dirname, "../supabase/templates", name), "utf8");
  const confirmation = read("confirmation.html");
  const recovery = read("recovery.html");

  // A ConfirmationURL link carries a PKCE code that only the original browser can redeem.
  assert.doesNotMatch(confirmation + recovery, /\.ConfirmationURL/);
  assert.match(
    confirmation,
    /href="https:\/\/www\.mithaq\.uk\/auth\/callback\?token_hash={{ \.TokenHash }}&amp;type=email"/,
  );
  assert.match(
    recovery,
    /href="https:\/\/www\.mithaq\.uk\/auth\/callback\?token_hash={{ \.TokenHash }}&amp;type=recovery&amp;next=%2Freset-password"/,
  );

  const callback = fs.readFileSync(path.join(__dirname, "../src/routes/auth.callback.tsx"), "utf8");
  assert.match(callback, /verifyOtp\(/);
  assert.match(callback, /searchParams\.get\("type"\) === "recovery"/);
});

test("the auth layout renders callback child routes instead of masking them", () => {
  const authRoute = fs.readFileSync(path.join(__dirname, "../src/routes/auth.tsx"), "utf8");
  assert.match(authRoute, /<Outlet\s*\/>/);
  assert.match(authRoute, /pathname === ["']\/auth["']/);
});

test("signup replaces opaque email delivery failures with useful guidance", () => {
  const { getAuthErrorMessage } = loadAuthModule("auth-error");
  assert.equal(
    getAuthErrorMessage(new Error("{}"), "signup"),
    "We couldn’t send your verification email just now. Please try again in a few minutes, or continue with Google.",
  );
  assert.equal(
    getAuthErrorMessage({ message: "Unexpected error", code: "unexpected_failure" }, "signup"),
    "We couldn’t send your verification email just now. Please try again in a few minutes, or continue with Google.",
  );
});

test("auth errors distinguish incorrect credentials from system failures", () => {
  const { getAuthErrorMessage } = loadAuthModule("auth-error");
  assert.equal(
    getAuthErrorMessage(new Error("Invalid login credentials"), "signin"),
    "The email or password is wrong. Please try again.",
  );
  assert.equal(
    getAuthErrorMessage(
      { message: "Invalid login credentials", code: "invalid_credentials", status: 400 },
      "signin",
    ),
    "The email or password is wrong. Please try again.",
  );
  assert.equal(
    getAuthErrorMessage(
      { message: "Provider unavailable", code: "provider_unavailable" },
      "signin",
    ),
    "Something went wrong. Error code: provider_unavailable",
  );
  assert.equal(
    getAuthErrorMessage({ message: "Gateway error", status: 503 }, "oauth"),
    "Something went wrong. Error code: http_503",
  );
  assert.equal(
    getAuthErrorMessage({}, "oauth"),
    "Something went wrong. Error code: google_signin_unknown",
  );
});

test("local signup requirements remain clear instead of looking like a system failure", () => {
  const { getAuthErrorMessage } = loadAuthModule("auth-error");
  assert.equal(
    getAuthErrorMessage(
      new Error("Confirm that you are 18+ and accept the privacy notice to continue"),
      "signup",
    ),
    "Confirm that you are 18+ and accept the privacy notice to continue",
  );
});

test("auth callback owns the PKCE exchange and never leaks verifier internals", () => {
  const client = fs.readFileSync(
    path.join(__dirname, "../src/integrations/supabase/client.ts"),
    "utf8",
  );
  const callback = fs.readFileSync(path.join(__dirname, "../src/routes/auth.callback.tsx"), "utf8");
  const { getAuthCallbackError } = loadAuthModule("auth-callback");

  assert.match(client, /detectSessionInUrl:\s*false/);
  assert.match(callback, /started\.current/);
  assert.match(callback, /auth\.getSession\(\)/);
  const result = getAuthCallbackError(null, "PKCE code verifier not found in storage");
  assert.equal(result.status, "verified-signin");
  assert.equal(result.title, "Please sign in to continue");
  assert.doesNotMatch(result.body, /pkce|verifier/i);

  const reset = getAuthCallbackError(null, "PKCE code verifier not found in storage", {
    isPasswordRecovery: true,
  });
  assert.equal(reset.status, "reset-elsewhere");
  assert.doesNotMatch(reset.body, /pkce|verifier/i);

  const expiredReset = getAuthCallbackError("otp_expired", null, { isPasswordRecovery: true });
  assert.equal(expiredReset.status, "expired");
  assert.equal(expiredReset.title, "This reset link has expired");
});

test("email rate limits get a clear wait-and-retry message", () => {
  const { getAuthErrorMessage } = loadAuthModule("auth-error");
  const expected =
    "We’ve sent several emails recently. Please wait a few minutes before asking for another one, and check your spam folder in the meantime.";
  assert.equal(
    getAuthErrorMessage(
      { message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 },
      "signup",
    ),
    expected,
  );
  assert.equal(
    getAuthErrorMessage(
      new Error("For security purposes, you can only request this after 42 seconds."),
      "resend",
    ),
    expected,
  );
  assert.equal(
    getAuthErrorMessage({ message: "Too many requests", status: 429 }, "password_reset"),
    expected,
  );
  assert.equal(
    getAuthErrorMessage({ message: "email rate limit exceeded", status: 429 }, "signin"),
    "Something went wrong. Error code: http_429",
  );
});

test("password recovery uses the canonical callback and a local reset destination", () => {
  const forgotPassword = fs.readFileSync(
    path.join(__dirname, "../src/routes/forgot-password.tsx"),
    "utf8",
  );
  const resetPassword = fs.readFileSync(
    path.join(__dirname, "../src/routes/reset-password.tsx"),
    "utf8",
  );

  assert.match(forgotPassword, /resetPasswordForEmail/);
  assert.match(forgotPassword, /next:\s*["']\/reset-password["']/);
  assert.match(forgotPassword, /If a Mithaq account exists/);
  assert.match(resetPassword, /updateUser\(\{ password \}\)/);
  assert.match(resetPassword, /autoComplete="new-password"/);
  assert.doesNotMatch(forgotPassword + resetPassword, /localhost|127\.0\.0\.1/i);
});
