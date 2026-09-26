export type AuthCallbackStatus = "expired" | "invalid" | "error";

export function getAuthCallbackError(
  code: string | null,
  message: string | null,
): { status: AuthCallbackStatus; title: string; body: string } {
  const normalizedCode = (code ?? "").toLowerCase();
  const normalizedMessage = (message ?? "").toLowerCase();

  if (normalizedCode.includes("otp_expired") || normalizedMessage.includes("expired")) {
    return {
      status: "expired",
      title: "This verification link has expired",
      body: "Verification links are valid for a limited time. Sign in again and we'll send a fresh one.",
    };
  }

  if (normalizedCode.includes("access_denied") || normalizedMessage.includes("access_denied")) {
    return {
      status: "invalid",
      title: "This link can't be used",
      body: "It may have already been used or was denied. Try signing in and resending the verification email.",
    };
  }

  if (
    normalizedMessage.includes("pkce") ||
    normalizedMessage.includes("code verifier") ||
    normalizedMessage.includes("both auth code and code verifier")
  ) {
    return {
      status: "invalid",
      title: "Please start sign-in again",
      body: "This sign-in attempt could not be completed in this browser. Return to sign in and try again.",
    };
  }

  return {
    status: "error",
    title: "We couldn't verify your email",
    body: "Please try signing in again or request a fresh verification email.",
  };
}
