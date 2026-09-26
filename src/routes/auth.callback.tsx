import { createFileRoute, Link } from "@tanstack/react-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthCallbackError } from "@/lib/auth-callback";
import { safeRelativePath } from "@/lib/safe-navigation";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Verification status — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: AuthCallback,
});

type Status =
  | "working"
  | "success"
  | "already"
  | "expired"
  | "invalid"
  | "error"
  | "verified-signin"
  | "reset-elsewhere";

function AuthCallback() {
  const started = useRef(false);
  const [status, setStatus] = useState<Status>("working");
  const [isRecoveryLink, setIsRecoveryLink] = useState(false);
  const [title, setTitle] = useState("Verifying your email…");
  const [body, setBody] = useState("Just a moment.");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let redirectTimeout: number | undefined;
    const url = new URL(window.location.href);
    const next = safeRelativePath(url.searchParams.get("next"));
    const isPasswordRecovery =
      next === "/reset-password" || url.searchParams.get("type") === "recovery";
    const context = { isPasswordRecovery };
    setIsRecoveryLink(isPasswordRecovery);
    if (isPasswordRecovery) setTitle("Checking your reset link…");
    const run = async () => {
      try {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const errCode = url.searchParams.get("error_code") ?? hashParams.get("error_code");
        const errDesc =
          url.searchParams.get("error_description") ?? hashParams.get("error_description");
        if (errCode || errDesc) {
          const f = getAuthCallbackError(errCode, errDesc, context);
          setStatus(f.status);
          setTitle(f.title);
          setBody(f.body);
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            // A session may already exist if a callback is resumed after the
            // one-time code was consumed. Never replace a valid login with a
            // misleading PKCE error screen.
            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData.session) throw error;
          }
        } else {
          const token_hash = url.searchParams.get("token_hash");
          const type = url.searchParams.get("type");
          if (token_hash && type) {
            const { error } = await supabase.auth.verifyOtp({
              token_hash,
              type: type as EmailOtpType,
            });
            if (error) throw error;
          } else {
            const access_token = hashParams.get("access_token");
            const refresh_token = hashParams.get("refresh_token");
            if (access_token && refresh_token) {
              const { error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (error) throw error;
            }
          }
        }

        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          throw new Error("No verified sign-in session was returned. Please request a new link.");
        }
        if (data.user.email_confirmed_at) {
          setStatus("success");
          const isGoogle = data.user.app_metadata?.provider === "google";
          if (isPasswordRecovery) {
            sessionStorage.setItem("mithaq:password-recovery", "1");
          }
          setTitle(
            isPasswordRecovery
              ? "Secure reset link verified"
              : isGoogle
                ? "Google sign-in successful"
                : "Email verified successfully",
          );
          setBody(
            isPasswordRecovery
              ? "Taking you to choose a new password…"
              : "Your account is ready. Taking you to your private dashboard…",
          );
          sessionStorage.removeItem("mithaq:pending-verification-email");
          redirectTimeout = window.setTimeout(() => {
            if (isPasswordRecovery) window.location.href = "/reset-password";
            else if (next) window.location.href = next;
            else window.location.replace("/verify-email?verified=1");
          }, 1600);
        } else {
          setStatus("already");
          setTitle("You're signed in");
          setBody("Please continue to verify your email.");
        }
      } catch (e) {
        const f = getAuthCallbackError(
          null,
          e instanceof Error ? e.message : "Verification failed",
          context,
        );
        setStatus(f.status);
        setTitle(f.title);
        setBody(f.body);
      }
    };
    run();
    return () => {
      if (redirectTimeout) window.clearTimeout(redirectTimeout);
    };
  }, []);

  const icon =
    status === "success" || status === "verified-signin"
      ? "✓"
      : status === "working"
        ? "…"
        : status === "already" || status === "reset-elsewhere"
          ? "→"
          : "!";

  const tone =
    status === "success" || status === "verified-signin"
      ? "text-primary"
      : status === "working"
        ? "text-muted-foreground"
        : status === "already" || status === "reset-elsewhere"
          ? "text-foreground"
          : "text-destructive";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-soft)] text-center">
        <p className="font-arabic text-4xl text-primary" dir="rtl" lang="ar">
          ميثاق
        </p>
        <div
          className={`mt-6 mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border text-2xl ${tone}`}
        >
          {icon}
        </div>
        <h1 className="mt-4 text-2xl text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>

        {status === "verified-signin" && (
          <Link
            to="/auth"
            className="mt-6 block w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        )}

        {(status === "reset-elsewhere" ||
          (isRecoveryLink &&
            (status === "expired" || status === "invalid" || status === "error"))) && (
          <div className="mt-6 space-y-2">
            <Link
              to="/forgot-password"
              className="block w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Request a new reset link
            </Link>
            <Link
              to="/auth"
              className="block w-full rounded-xl border border-border px-4 py-3 text-sm hover:bg-accent"
            >
              Back to sign in
            </Link>
          </div>
        )}

        {!isRecoveryLink &&
          (status === "expired" || status === "invalid" || status === "error") && (
            <div className="mt-6 space-y-2">
              <Link
                to="/verify-email"
                className="block w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Resend verification email
              </Link>
              <Link
                to="/auth"
                className="block w-full rounded-xl border border-border px-4 py-3 text-sm hover:bg-accent"
              >
                Back to sign in
              </Link>
            </div>
          )}

        {status === "already" && (
          <Link
            to="/verify-email"
            className="mt-6 block w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </Link>
        )}
      </div>
    </div>
  );
}
