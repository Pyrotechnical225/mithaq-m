import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth-error";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Mithaq" },
      { name: "description", content: "Request a secure Mithaq password reset link." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: getAuthCallbackUrl({
            configuredSiteUrl: import.meta.env.VITE_PUBLIC_SITE_URL,
            next: "/reset-password",
          }),
        },
      );

      if (resetError) {
        setError(getAuthErrorMessage(resetError, "password_reset"));
        return;
      }

      setSent(true);
    } catch (unexpectedError) {
      setError(getAuthErrorMessage(unexpectedError, "password_reset"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      id="main-content"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-8"
    >
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-5 sm:p-8 sm:shadow-[var(--shadow-soft)]">
        <Link to="/" className="inline-flex min-h-11 items-center gap-3" aria-label="Mithaq home">
          <BrandName className="text-xl" />
          <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
            ميثاق
          </span>
        </Link>

        <p className="mt-8 text-sm font-medium text-primary">Account recovery</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Reset your password
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enter your account email and we’ll send a secure link to choose a new password.
        </p>

        {sent ? (
          <div className="mt-7" role="status" aria-live="polite">
            <div className="rounded-md border border-primary/25 bg-primary/5 p-4 text-sm leading-6 text-foreground">
              If a Mithaq account exists for that address, a reset link is on its way. Check your
              inbox and spam folder.
            </div>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Try another email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="recovery-email" className="text-sm font-medium text-foreground">
                Email address
              </label>
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-md border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
            </div>
            {error ? (
              <p
                className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Sending secure link…" : "Send reset link"}
            </button>
          </form>
        )}

        <Link
          to="/auth"
          className="mt-6 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to sign in
        </Link>
      </section>
    </main>
  );
}
