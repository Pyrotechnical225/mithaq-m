import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const ADMIN_EMAIL = "admin@mithaq.com";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next =
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : undefined;
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Mithaq" },
      { name: "description", content: "Sign in or create your Mithaq account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/dashboard" });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        goNext();
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const normalized = email.trim().toLowerCase();
      if (mode === "signin" && (normalized === "admin" || normalized === ADMIN_EMAIL)) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password,
        });
        if (signInError) throw signInError;
        return;
      }

      if (mode === "signup") {
        const emailRedirectTo = next
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : `${window.location.origin}/auth/callback`;
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError(null);
    const redirect_uri = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : window.location.origin;
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri });
    if (result.error) setError(result.error.message);
  };

  return (
    <main id="main-content" className="min-h-screen bg-card lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden bg-primary text-primary-foreground lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <Link to="/" className="flex w-fit items-center gap-3">
          <span className="text-xl font-semibold tracking-[-0.035em]">Mithaq</span>
          <span className="border-l border-white/25 pl-3 font-arabic text-xl">ميثاق</span>
        </Link>

        <div className="max-w-lg py-16">
          <p className="text-sm font-semibold text-primary-foreground/65">Meet haq in marriage</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">
            A private process for a serious decision.
          </h1>
          <div className="mt-8 grid gap-4 text-sm text-primary-foreground/80">
            {[
              "Profiles stay private during compatibility assessment",
              "Suitable introductions are reviewed by an imam",
              "Wali and family involvement is welcomed",
            ].map((item) => (
              <p key={item} className="flex items-start gap-3 border-t border-white/15 pt-4">
                <Check size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                {item}
              </p>
            ))}
          </div>
        </div>

        <p className="text-sm text-primary-foreground/55">
          Matching and anonymous profile review remain free.
        </p>
      </section>

      <section className="flex min-h-screen items-center px-5 py-10 sm:px-8 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between lg:hidden">
            <Link to="/" className="flex items-center gap-3">
              <BrandName className="text-xl" />
              <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
                ميثاق
              </span>
            </Link>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Home
            </Link>
          </div>

          <div className="mt-12 lg:mt-0">
            <p className="text-sm font-medium text-primary">
              {mode === "signup" ? "Create your Mithaq account" : "Welcome back"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
              {mode === "signup" ? "Start your private profile" : "Sign in to continue"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your answers are used for matchmaking and are not shown publicly.
            </p>
          </div>

          <div
            className="mt-8 grid grid-cols-2 border-b border-border"
            role="tablist"
            aria-label="Account action"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`border-b-2 px-2 py-3 text-sm font-semibold ${
                mode === "signin"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`border-b-2 px-2 py-3 text-sm font-semibold ${
                mode === "signup"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Create account
            </button>
          </div>

          <button
            type="button"
            onClick={google}
            className="mt-6 w-full rounded-md border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or use email
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-md border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative mt-2">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-md border border-input bg-background px-4 py-3 pr-12 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
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
              {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            By continuing, you agree to use Mithaq respectfully and only for the purpose of seeking
            marriage.
          </p>
        </div>
      </section>
    </main>
  );
}
