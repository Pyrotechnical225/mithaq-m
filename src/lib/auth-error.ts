export type AuthAction = "signin" | "signup" | "oauth" | "password_reset" | "resend";

const SIGNUP_EMAIL_DELIVERY_MESSAGE =
  "We couldn’t send your verification email just now. Please try again in a few minutes, or continue with Google.";
const EMAIL_RATE_LIMIT_MESSAGE =
  "We’ve sent several emails recently. Please wait a few minutes before asking for another one, and check your spam folder in the meantime.";

const INVALID_CREDENTIALS_MESSAGE = "The email or password is wrong. Please try again.";
const SIGNUP_REQUIREMENTS_MESSAGE =
  "Confirm that you are 18+ and accept the privacy notice to continue";

const FALLBACK_CODES: Record<AuthAction, string> = {
  signin: "signin_unknown",
  signup: "signup_unknown",
  oauth: "google_signin_unknown",
  password_reset: "password_reset_unknown",
  resend: "resend_unknown",
};

function stringProperty(value: unknown, property: string) {
  if (!value || typeof value !== "object" || !(property in value)) return "";
  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "string" ? candidate.trim() : "";
}

function isOpaqueMessage(message: string) {
  return !message || message === "{}" || message === "[object Object]";
}

function getDebugCode(error: unknown, action: AuthAction) {
  const code = stringProperty(error, "code") || stringProperty(error, "error_code");
  if (/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(code)) return code.toLowerCase();

  if (error && typeof error === "object" && "status" in error) {
    const status = (error as Record<string, unknown>).status;
    if (typeof status === "number" && Number.isInteger(status)) return `http_${status}`;
    if (typeof status === "string" && /^\d{3}$/.test(status)) return `http_${status}`;
  }

  return FALLBACK_CODES[action];
}

export function getAuthErrorMessage(error: unknown, action: AuthAction) {
  const message = error instanceof Error ? error.message.trim() : stringProperty(error, "message");
  const code = getDebugCode(error, action);

  if (
    action === "signin" &&
    (code === "invalid_credentials" || /^invalid (?:login )?credentials$/i.test(message))
  ) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (action === "signup" && message === SIGNUP_REQUIREMENTS_MESSAGE) return message;

  const sendsEmail = action === "signup" || action === "resend" || action === "password_reset";
  const isEmailRateLimited =
    sendsEmail &&
    (code === "over_email_send_rate_limit" ||
      code === "http_429" ||
      /rate limit|security purposes.*after \d+ seconds/i.test(message));

  if (isEmailRateLimited) return EMAIL_RATE_LIMIT_MESSAGE;

  const isEmailDeliveryFailure =
    (action === "signup" || action === "resend") &&
    (code === "unexpected_failure" ||
      isOpaqueMessage(message) ||
      /(?:confirmation|verification).*email|smtp|could not send email/i.test(message));

  if (isEmailDeliveryFailure) return SIGNUP_EMAIL_DELIVERY_MESSAGE;
  return `Something went wrong. Error code: ${code}`;
}
