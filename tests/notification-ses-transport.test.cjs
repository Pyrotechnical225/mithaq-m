// Offline contract tests: no real AWS credentials, endpoints or recipients.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function transportHarness(overrides = {}) {
  const calls = [];
  let clientConfig;
  let oidcInit;
  const oidcCredentials = async () => ({
    accessKeyId: "synthetic-oidc-only",
    secretAccessKey: "synthetic-oidc-only",
    sessionToken: "synthetic-oidc-only",
  });
  class GetAccountCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetEmailIdentityCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetSuppressedDestinationCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class SendEmailCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class SESv2Client {
    constructor(config) {
      clientConfig = config;
    }
    async send(command) {
      calls.push(command);
      if (command instanceof GetAccountCommand)
        return (
          overrides.account ?? {
            SendingEnabled: true,
            ProductionAccessEnabled: true,
            SuppressionAttributes: { SuppressedReasons: ["BOUNCE", "COMPLAINT"] },
          }
        );
      if (command instanceof GetEmailIdentityCommand)
        return (
          overrides.identity ?? {
            VerifiedForSendingStatus: true,
            DkimAttributes: { SigningEnabled: true, Status: "SUCCESS" },
          }
        );
      if (command instanceof GetSuppressedDestinationCommand) {
        if (overrides.suppressionError) throw overrides.suppressionError;
        return {};
      }
      if (command instanceof SendEmailCommand)
        return overrides.sendResult ?? { MessageId: "synthetic-id" };
      throw new Error("Unexpected AWS command");
    }
  }
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const file = path.join(__dirname, "../src/lib", `${name}.ts`);
    const exports = {};
    cache.set(name, exports);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(
      code,
      {
        exports,
        URL,
        Date,
        Error,
        AbortSignal,
        process: { env: {} },
        require: (id) => {
          if (id.startsWith(".")) return load(id.slice(2));
          if (id === "@aws-sdk/client-sesv2")
            return {
              SESv2Client,
              GetAccountCommand,
              GetEmailIdentityCommand,
              GetSuppressedDestinationCommand,
              SendEmailCommand,
            };
          if (id === "@smithy/fetch-http-handler") return { FetchHttpHandler: class {} };
          if (id === "@vercel/oidc-aws-credentials-provider")
            return {
              awsCredentialsProvider: (init) => {
                oidcInit = init;
                return oidcCredentials;
              },
            };
          throw new Error(`Unexpected import: ${id}`);
        },
      },
      { filename: file },
    );
    return exports;
  }
  const mailer = load("ses-email.server").createSesMailer({
    EMAIL_NOTIFICATIONS_ENABLED: "true",
    EMAIL_DEPLOYMENT_SCOPE: "production",
    VERCEL_ENV: "production",
    AWS_REGION: "eu-north-1",
    AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/mithaq-ses-production",
    SES_FROM_EMAIL: "no-reply@mithaq.uk",
    PUBLIC_SITE_URL: "https://www.mithaq.uk",
  });
  return { mailer, calls, clientConfig, oidcCredentials, oidcInit };
}

test("SES preflight checks production, suppression and domain DKIM before sending", async () => {
  const h = transportHarness();
  await h.mailer.verifyAccount();
  assert.deepEqual(
    h.calls.map((c) => c.constructor.name),
    ["GetAccountCommand", "GetEmailIdentityCommand"],
  );
  assert.equal(h.calls[1].input.EmailIdentity, "mithaq.uk");
  assert.equal(h.clientConfig.maxAttempts, 1);
  assert.equal(h.clientConfig.region, "eu-north-1");
  assert.equal(h.clientConfig.credentials, h.oidcCredentials);
  assert.equal(h.oidcInit.roleArn, "arn:aws:iam::123456789012:role/mithaq-ses-production");
  assert.equal(h.oidcInit.roleSessionName, "mithaq-notification-email");
  assert.equal(h.oidcInit.durationSeconds, 3600);
  assert.equal(h.oidcInit.clientConfig.region, "eu-north-1");
});

test("SES refuses sandbox, paused accounts and incomplete suppression", async () => {
  for (const account of [
    { SendingEnabled: true, ProductionAccessEnabled: false },
    { SendingEnabled: false, ProductionAccessEnabled: true },
    {
      SendingEnabled: true,
      ProductionAccessEnabled: true,
      SuppressionAttributes: { SuppressedReasons: ["BOUNCE"] },
    },
  ]) {
    const h = transportHarness({ account });
    await assert.rejects(h.mailer.verifyAccount(), /production access/);
    assert.equal(h.calls.length, 1);
  }
});

test("SES refuses a revoked identity or unsuccessful DKIM", async () => {
  for (const identity of [
    { VerifiedForSendingStatus: false },
    {
      VerifiedForSendingStatus: true,
      DkimAttributes: { SigningEnabled: false, Status: "SUCCESS" },
    },
    { VerifiedForSendingStatus: true, DkimAttributes: { SigningEnabled: true, Status: "PENDING" } },
    { VerifiedForSendingStatus: true },
  ]) {
    const h = transportHarness({ identity });
    await assert.rejects(h.mailer.verifyAccount(), /successful DKIM/);
    assert.ok(h.calls.every((c) => c.constructor.name !== "SendEmailCommand"));
  }
});

test("SES sends branded HTML and text to exactly one recipient without tracking", async () => {
  const h = transportHarness();
  await h.mailer.verifyAccount();
  assert.equal(
    await h.mailer.send("meeting_followup", "qa@example.invalid", "synthetic-job"),
    "synthetic-id",
  );
  const { input } = h.calls.at(-1);
  assert.equal(input.FromEmailAddress, "Mithaq <no-reply@mithaq.uk>");
  assert.equal(input.Destination.ToAddresses.length, 1);
  assert.equal(input.Destination.ToAddresses[0], "qa@example.invalid");
  assert.equal(input.Destination.CcAddresses, undefined);
  assert.equal(input.Destination.BccAddresses, undefined);
  assert.match(input.Content.Simple.Body.Html.Data, /Share a private update/);
  assert.match(input.Content.Simple.Body.Text.Data, /https:\/\/www.mithaq.uk\/dashboard#check-ins/);
  assert.equal(input.Content.Simple.Subject.Charset, "UTF-8");
  assert.equal(input.EmailTags[0].Value, "synthetic-job");
});

test("suppression lookups fail closed except an explicit NotFound response", async () => {
  assert.equal(await transportHarness().mailer.isSuppressed("qa@example.invalid"), true);
  const missing = new Error("synthetic");
  missing.name = "NotFoundException";
  assert.equal(
    await transportHarness({ suppressionError: missing }).mailer.isSuppressed("qa@example.invalid"),
    false,
  );
  const denied = new Error("synthetic");
  denied.name = "AccessDeniedException";
  await assert.rejects(
    transportHarness({ suppressionError: denied }).mailer.isSuppressed("qa@example.invalid"),
  );
});

test("a provider response without a message ID is never called accepted", async () => {
  await assert.rejects(
    transportHarness({ sendResult: {} }).mailer.send(
      "meeting_reminder",
      "qa@example.invalid",
      "synthetic-job",
    ),
    /acceptance/,
  );
});
