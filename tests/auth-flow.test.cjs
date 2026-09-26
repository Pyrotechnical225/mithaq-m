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

test("verification email is responsive, branded, and never points to localhost", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../supabase/templates/confirmation.html"),
    "utf8",
  );
  assert.match(html, /name="viewport"/);
  assert.match(html, /Mithaq/);
  assert.match(html, /{{ \.ConfirmationURL }}/);
  assert.doesNotMatch(html, /localhost|127\.0\.0\.1|<script\b|<form\b/i);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
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
    "We couldn’t send your verification email. Email sign-up is temporarily unavailable while delivery is being activated. Continue with Google or try again later.",
  );
  assert.equal(
    getAuthErrorMessage({ message: "Unexpected error", code: "unexpected_failure" }, "signup"),
    "We couldn’t send your verification email. Email sign-up is temporarily unavailable while delivery is being activated. Continue with Google or try again later.",
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
  assert.equal(result.status, "invalid");
  assert.equal(result.title, "Please start sign-in again");
  assert.equal(
    result.body,
    "This sign-in attempt could not be completed in this browser. Return to sign in and try again.",
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
