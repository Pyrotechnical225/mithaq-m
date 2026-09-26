import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth-error";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): { verified?: boolean } =>
    search.verified === "1" || search.verified === true ? { verified: true } : {},
  head: () => ({
    meta: [{ title: "Verify your email — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: VerifyEmail,
});

function VerifyEmail() {
  const navigate = useNavigate();
  const { verified } = Route.useSearch();
  const [email, setEmail] = useState<string>("");
  const [status, setStatus] = useState<
    "idle" | "verified" | "sending" | "sent" | "checking" | "error"
  >(verified ? "checking" : "idle");
  const [error, setError] = useState<string | null>(null);
  const isFinishingVerification = Boolean(verified && status === "checking");

  useEffect(() => {
    let active = true;
    let redirectTimeout: number | undefined;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        if (verified) {
          setError(
            "Your verification finished, but the sign-in session was not found. Please sign in.",
          );
          setStatus("error");
          return;
        }
        const pendingEmail = sessionStorage.getItem("mithaq:pending-verification-email");
        if (pendingEmail) setEmail(pendingEmail);
        return;
      }
      if (data.user.email_confirmed_at) {
        sessionStorage.removeItem("mithaq:pending-verification-email");
        if (verified) {
          setStatus("verified");
          setEmail(data.user.email ?? "");
          redirectTimeout = window.setTimeout(
            () => navigate({ to: "/dashboard", replace: true }),
            2200,
          );
          return;
        }
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setEmail(data.user.email ?? "");
    });
    return () => {
      active = false;
      if (redirectTimeout) window.clearTimeout(redirectTimeout);
    };
  }, [navigate, verified]);

  const resend = async () => {
    setError(null);
    setStatus("sending");
    if (!email) {
      setError("Enter the email address you used to create your account.");
      setStatus("error");
      return;
    }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: getAuthCallbackUrl({
          configuredSiteUrl: import.meta.env.VITE_PUBLIC_SITE_URL,
        }),
      },
    });
    if (error) {
      setError(getAuthErrorMessage(error, "resend"));
      setStatus("error");
    } else {
      setStatus("sent");
    }
  };

  const refresh = async () => {
    setStatus("checking");
    setError(null);
    // Force refresh of the session to pick up any confirmation
    await supabase.auth.refreshSession();
    const { data } = await supabase.auth.getUser();
    if (data.user?.email_confirmed_at) {
      navigate({ to: "/dashboard" });
    } else {
      setError("Still unverified. Please click the link in your email first.");
      setStatus("idle");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <main
      id="main-content"
      className="min-h-dvh bg-background flex items-start justify-center px-4 py-8 sm:items-center sm:px-6"
    >
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-5 sm:p-8 sm:shadow-[var(--shadow-soft)] text-center">
        <p className="font-arabic text-4xl text-primary" dir="rtl" lang="ar">
          ميثاق
        </p>
        <div className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-xl font-semibold text-primary">
          {status === "verified" ? "✓" : isFinishingVerification ? "…" : "@"}
        </div>
        <h1 className="mt-4 text-2xl text-foreground">
          {status === "verified"
            ? "Email verified successfully"
            : isFinishingVerification
              ? "Finishing your sign-in"
              : "Check your email"}
        </h1>
        {status === "verified" ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground" role="status">
            You are signed in. Taking you to your private dashboard…
          </p>
        ) : isFinishingVerification ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground" role="status">
            Confirming your secure Mithaq session…
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              We sent a private verification link to complete your account.
            </p>
            <label htmlFor="verification-email" className="sr-only">
              Email address
            </label>
            <input
              id="verification-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-4 w-full rounded-md border border-input bg-background px-4 py-3 text-center text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
            />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              You can open the link on this device or another one. If it isn&rsquo;t in your inbox
              within a couple of minutes, check your spam folder.
            </p>
          </>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {status === "sent" && (
          <p className="mt-4 text-sm text-primary">Verification email sent. Check your inbox.</p>
        )}

        {status !== "verified" && !isFinishingVerification ? (
          <div className="mt-6 space-y-2">
            <button
              onClick={resend}
              disabled={status === "sending"}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Resend verification email"}
            </button>
            <button
              onClick={refresh}
              disabled={status === "checking"}
              className="w-full rounded-xl border border-border px-4 py-3 text-sm hover:bg-accent"
            >
              {status === "checking" ? "Checking…" : "I've verified — refresh"}
            </button>
            <button
              onClick={signOut}
              className="w-full text-xs text-muted-foreground hover:text-foreground pt-2"
            >
              Sign out
            </button>
          </div>
        ) : status === "verified" ? (
          <Link
            to="/dashboard"
            className="mt-6 block w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Continue to dashboard
          </Link>
        ) : null}

        <Link
          to="/"
          className="mt-6 inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
