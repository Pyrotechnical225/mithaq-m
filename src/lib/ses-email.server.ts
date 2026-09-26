import {
  GetAccountCommand,
  GetEmailIdentityCommand,
  GetSuppressedDestinationCommand,
  SendEmailCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { emailOrigin, renderNotificationEmail, validMailbox } from "./notification-email-policy";
import type { EmailKind } from "./notification-email-policy";

type Environment = Record<string, string | undefined>;

export function getSesConfiguration(env: Environment = process.env) {
  if (env.EMAIL_NOTIFICATIONS_ENABLED !== "true") return null;
  if (
    env.EMAIL_DEPLOYMENT_SCOPE !== "production" ||
    (env.VERCEL_ENV && env.VERCEL_ENV !== "production")
  ) {
    throw new Error("Live notification sending is restricted to production");
  }
  const region = env.AWS_REGION?.trim();
  const from = env.SES_FROM_EMAIL?.trim();
  const replyTo = env.SES_REPLY_TO_EMAIL?.trim();
  const roleArn = env.AWS_ROLE_ARN?.trim();
  if (!region || !/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region))
    throw new Error("AWS_REGION is required");
  if (!from || !validMailbox(from)) throw new Error("A verified SES_FROM_EMAIL is required");
  if (replyTo && !validMailbox(replyTo)) throw new Error("SES_REPLY_TO_EMAIL must be a mailbox");
  if (!roleArn || !/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_/-]+$/.test(roleArn))
    throw new Error("A valid AWS_ROLE_ARN is required");
  return {
    region,
    roleArn,
    from,
    identity: from.slice(from.lastIndexOf("@") + 1).toLowerCase(),
    replyTo,
    origin: emailOrigin(env.PUBLIC_SITE_URL ?? ""),
  };
}

export function createSesMailer(env: Environment = process.env) {
  const config = getSesConfiguration(env);
  if (!config) return null;
  // No SDK retries: a network timeout after SES accepts mail is ambiguous.
  const client = new SESv2Client({
    region: config.region,
    credentials: awsCredentialsProvider({
      roleArn: config.roleArn,
      roleSessionName: "mithaq-notification-email",
      durationSeconds: 3600,
      clientConfig: { region: config.region },
    }),
    maxAttempts: 1,
    requestHandler: new FetchHttpHandler({ requestTimeout: 10_000 }),
  });
  return {
    async verifyAccount() {
      const account = await client.send(new GetAccountCommand({}), {
        abortSignal: AbortSignal.timeout(10_000),
      });
      const reasons = account.SuppressionAttributes?.SuppressedReasons ?? [];
      if (
        !account.SendingEnabled ||
        !account.ProductionAccessEnabled ||
        !reasons.includes("BOUNCE") ||
        !reasons.includes("COMPLAINT")
      ) {
        throw new Error(
          "SES must have production access, sending enabled, and bounce/complaint suppression enabled",
        );
      }
      // Domain verification can be revoked or DKIM disabled after deployment.
      // Recheck before claiming a job, not after a message has left the queue.
      const identity = await client.send(
        new GetEmailIdentityCommand({ EmailIdentity: config.identity }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      if (
        !identity.VerifiedForSendingStatus ||
        !identity.DkimAttributes?.SigningEnabled ||
        identity.DkimAttributes.Status !== "SUCCESS"
      ) {
        throw new Error("SES sender domain must be verified with successful DKIM signing");
      }
    },
    async isSuppressed(email: string) {
      if (!validMailbox(email)) return true;
      try {
        await client.send(new GetSuppressedDestinationCommand({ EmailAddress: email }), {
          abortSignal: AbortSignal.timeout(10_000),
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === "NotFoundException") return false;
        throw error;
      }
    },
    async send(kind: EmailKind, recipient: string, jobId: string) {
      if (!validMailbox(recipient)) throw new Error("Invalid recipient");
      const copy = renderNotificationEmail(kind, config.origin);
      const result = await client.send(
        new SendEmailCommand({
          FromEmailAddress: `Mithaq <${config.from}>`,
          Destination: { ToAddresses: [recipient] },
          ...(config.replyTo ? { ReplyToAddresses: [config.replyTo] } : {}),
          Content: {
            Simple: {
              Subject: { Data: copy.subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: copy.text, Charset: "UTF-8" },
                Html: { Data: copy.html, Charset: "UTF-8" },
              },
            },
          },
          EmailTags: [{ Name: "notification_id", Value: jobId }],
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
      if (!result.MessageId) throw new Error("SES acceptance could not be confirmed");
      return result.MessageId;
    },
  };
}
