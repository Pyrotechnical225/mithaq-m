export type AuthCallbackStatus =
  "expired" | "invalid" | "error" | "verified-signin" | "reset-elsewhere";

export type AuthCallbackContext = {
  /** True when the link was a password-reset link rather than an email verification. */
  isPasswordRecovery?: boolean;
};

function isPkceVerifierError(message: string) {
  return (
    message.includes("pkce") ||
    message.includes("code verifier") ||
    message.includes("both auth code and code verifier")
  );
}

export function getAuthCallbackError(
  code: string | null,
  message: string | null,
  context: AuthCallbackContext = {},
): { status: AuthCallbackStatus; title: string; body: string } {
  const normalizedCode = (code ?? "").toLowerCase();
  const normalizedMessage = (message ?? "").toLowerCase();

  if (normalizedCode.includes("otp_expired") || normalizedMessage.includes("expired")) {
    return context.isPasswordRecovery
      ? {
          status: "expired",
          title: "This reset link has expired",
          body: "Reset links are valid for a limited time. Request a new one and use it straight away.",
        }
      : {
          status: "expired",
          title: "This verification link has expired",
          body: "Verification links are valid for a limited time. Sign in again and we'll send a fresh one.",
        };
  }

  if (normalizedCode.includes("access_denied") || normalizedMessage.includes("access_denied")) {
    return {
      status: "invalid",
      title: "This link can't be used",
      body: context.isPasswordRecovery
        ? "It may have already been used. Request a new password reset link."
        : "It may have already been used or was denied. Try signing in and resending the verification email.",
    };
  }

  // Older email links (and Google sign-in) use a one-time code that only the
  // browser which started the flow can finish. Supabase has already confirmed
  // the email by the time we see this error, so a verification link opened on
  // another device should lead to sign-in, not to a dead end.
  if (isPkceVerifierError(normalizedMessage)) {
    return context.isPasswordRecovery
      ? {
          status: "reset-elsewhere",
          title: "Finish the reset where you requested it",
          body: "For your security, this reset link must be opened in the browser where you asked for it. Open it there, or request a new link here.",
        }
      : {
          status: "verified-signin",
          title: "Please sign in to continue",
          body: "This link was opened in a different browser, so we couldn't sign you in automatically. If you were verifying your email, it's confirmed — sign in with your email and password.",
        };
  }

  return {
    status: "error",
    title: context.isPasswordRecovery
      ? "We couldn't verify your reset link"
      : "We couldn't verify your email",
    body: context.isPasswordRecovery
      ? "Please request a new password reset link."
      : "Please try signing in again or request a fresh verification email.",
  };
}
