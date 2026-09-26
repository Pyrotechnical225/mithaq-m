import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { getAuthErrorMessage } from "@/lib/auth-error";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — Mithaq" },
      { name: "description", content: "Securely update your Mithaq password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return;
        const cameFromRecovery = sessionStorage.getItem("mithaq:password-recovery") === "1";
        setHasSession(Boolean(data.user) && cameFromRecovery);
      })
      .catch(() => {
        if (active) setHasSession(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match. Please try again.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(getAuthErrorMessage(updateError, "password_reset"));
        return;
      }

      sessionStorage.removeItem("mithaq:password-recovery");
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
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

        {checking ? (
          <p className="mt-8 text-sm text-muted-foreground" role="status">
            Checking your secure reset link…
          </p>
        ) : complete ? (
          <div className="mt-8" role="status" aria-live="polite">
            <p className="text-sm font-medium text-primary">Password updated</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
              Your new password is ready
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              You remain securely signed in and can continue to your private dashboard.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/dashboard", replace: true })}
              className="mt-7 w-full rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Continue to dashboard
            </button>
          </div>
        ) : !hasSession ? (
          <div className="mt-8">
            <p className="text-sm font-medium text-destructive">This reset link is not ready</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
              Request a new secure link
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The link may have expired or already been used. Request another link and open it in
              the same browser if possible.
            </p>
            <Link
              to="/forgot-password"
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Request another link
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-8 text-sm font-medium text-primary">Secure account recovery</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
              Choose a new password
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use at least 8 characters and avoid reusing a password from another service.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="new-password" className="text-sm font-medium text-foreground">
                  New password
                </label>
                <div className="relative mt-2">
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-4 py-3 pr-28 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute inset-y-0 right-0 flex min-w-24 items-center justify-center px-3 text-sm text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
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
                {loading ? "Updating password…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
