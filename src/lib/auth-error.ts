export type AuthAction = "signin" | "signup" | "oauth" | "password_reset";

const SIGNUP_EMAIL_DELIVERY_MESSAGE =
  "We couldn’t send your verification email. Email sign-up is temporarily unavailable while delivery is being activated. Continue with Google or try again later.";

const INVALID_CREDENTIALS_MESSAGE = "The email or password is wrong. Please try again.";
const SIGNUP_REQUIREMENTS_MESSAGE =
  "Confirm that you are 18+ and accept the privacy notice to continue";

const FALLBACK_CODES: Record<AuthAction, string> = {
  signin: "signin_unknown",
  signup: "signup_unknown",
  oauth: "google_signin_unknown",
  password_reset: "password_reset_unknown",
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

  const isEmailDeliveryFailure =
    action === "signup" &&
    (code === "unexpected_failure" ||
      isOpaqueMessage(message) ||
      /(?:confirmation|verification).*email|smtp|could not send email/i.test(message));

  if (isEmailDeliveryFailure) return SIGNUP_EMAIL_DELIVERY_MESSAGE;
  return `Something went wrong. Error code: ${code}`;
}
