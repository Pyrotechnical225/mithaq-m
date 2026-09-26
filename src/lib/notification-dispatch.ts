import { classifyEmailFailure, isEmailKind } from "./notification-email-policy";
import type { EmailKind } from "./notification-email-policy";

export type EmailJob = {
  id: string;
  user_id: string;
  kind: string;
  pairing_id: string | null;
  meetup_id: string | null;
  check_in_id: string | null;
  referral_id: string | null;
  imam_application_id: string | null;
  attempts: number;
  expires_at: string;
};
export type EmailJobResult = "accepted" | "skipped" | "failed" | "unknown" | "queued";
export interface EmailDispatchDependencies {
  verifyAccount(): Promise<void>;
  claim(token: string): Promise<EmailJob | null>;
  recipient(job: EmailJob, kind: EmailKind): Promise<{ email: string } | { skip: string }>;
  isSuppressed(email: string): Promise<boolean>;
  send(kind: EmailKind, email: string, jobId: string): Promise<string>;
  finish(
    job: EmailJob,
    token: string,
    result: EmailJobResult,
    code?: string,
    messageId?: string,
  ): Promise<void>;
}

export function nextEmailRetryAt(attempts: number, now = Date.now()) {
  return now + Math.min(60, 2 ** attempts) * 60_000;
}

/** One recipient per call keeps the job bounded and makes provider quotas explicit. */
export async function dispatchOneNotification(deps: EmailDispatchDependencies, token: string) {
  await deps.verifyAccount(); // Do not claim jobs while the provider is unavailable.
  const job = await deps.claim(token);
  if (!job) return { status: "empty" as const };
  let sendStarted = false;
  let sesAccepted = false;
  try {
    if (!isEmailKind(job.kind)) {
      await deps.finish(job, token, "skipped", "unsupported_kind");
      return { status: "skipped" as const };
    }
    const recipient = await deps.recipient(job, job.kind);
    if ("skip" in recipient) {
      await deps.finish(job, token, "skipped", recipient.skip);
      return { status: "skipped" as const };
    }
    if (await deps.isSuppressed(recipient.email)) {
      await deps.finish(job, token, "skipped", "ses_suppressed");
      return { status: "skipped" as const };
    }
    if (Date.parse(job.expires_at) <= Date.now()) {
      await deps.finish(job, token, "skipped", "expired");
      return { status: "skipped" as const };
    }
    sendStarted = true;
    const messageId = await deps.send(job.kind, recipient.email, job.id);
    sesAccepted = true;
    await deps.finish(job, token, "accepted", undefined, messageId);
    return { status: "accepted" as const };
  } catch (error) {
    // Never resend after an ambiguous timeout or failure recording SES acceptance.
    const classification = sesAccepted
      ? "unknown"
      : sendStarted
        ? classifyEmailFailure(error)
        : "retry";
    let state: EmailJobResult =
      classification === "retry" ? (job.attempts < 5 ? "queued" : "failed") : classification;
    if (state === "queued" && nextEmailRetryAt(job.attempts) >= Date.parse(job.expires_at))
      state = "skipped";
    const code = sesAccepted
      ? "acceptance_recording_failed"
      : sendStarted
        ? classification === "retry"
          ? "ses_throttled"
          : "ses_send_failed"
        : "pre_send_check_failed";
    await deps.finish(job, token, state, code);
    return { status: state };
  }
}

export async function notificationJobAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header || header.length > 4096) return false;
  const encode = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(header)),
    crypto.subtle.digest("SHA-256", encode.encode(`Bearer ${secret}`)),
  ]);
  const left = new Uint8Array(actual),
    right = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
