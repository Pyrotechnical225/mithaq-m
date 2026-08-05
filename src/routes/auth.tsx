import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string; recovery?: boolean } => {
    const next =
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : undefined;
    const recovery = s.recovery === "1" || s.recovery === true;
    return { ...(next ? { next } : {}), ...(recovery ? { recovery: true } : {}) };
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
  const { next, recovery = false } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/dashboard" });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !recovery) goNext();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && !recovery) {
        goNext();
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated. You can now continue to your dashboard.");
        setTimeout(goNext, 800);
        return;
      }
      if (mode === "signup") {
        const emailRedirectTo = next
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    const target = email.trim().toLowerCase();
    if (!target) {
      setError("Enter your email address first.");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/auth?recovery=1`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setMessage("Check your email for a secure password-reset link.");
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Home
        </Link>
        <div className="mt-8 text-center">
          <p className="font-arabic text-4xl text-primary" dir="rtl" lang="ar">
            ميثاق
          </p>
          <h1 className="mt-3 text-3xl text-foreground">
            {recovery ? "Choose a new password" : mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your answers stay private and are only used for matchmaking.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          {!recovery ? <button
            type="button"
            onClick={google}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-accent"
          >
            Continue with Google
          </button> : null}

          {!recovery ? <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div> : null}

          <form onSubmit={submit} className="space-y-3">
            {!recovery ? <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
            /> : null}
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 characters)"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-primary">{message}</p> : null}
            <button
              disabled={loading}
              className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "…" : recovery ? "Save new password" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          {!recovery ? <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button> : null}
          {!recovery && mode === "signin" ? (
            <button type="button" onClick={sendReset} className="mt-3 w-full text-center text-sm text-primary hover:underline">
              Forgot your password?
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
