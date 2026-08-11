import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify-email")({
  head: () => ({
    meta: [{ title: "Verify your email — MeetHaq" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: VerifyEmail,
});

function VerifyEmail() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "checking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      if (data.user.email_confirmed_at) {
        navigate({ to: "/dashboard" });
        return;
      }
      setEmail(data.user.email ?? "");
    });
  }, [navigate]);

  const resend = async () => {
    setError(null);
    setStatus("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
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
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-soft)] text-center">
        <p className="font-arabic text-4xl text-primary" dir="rtl" lang="ar">
          ميثاق
        </p>
        <h1 className="mt-4 text-2xl text-foreground">Verify your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Before you can access your dashboard and matches, please confirm your address:
        </p>
        <p className="mt-3 font-medium text-foreground break-all">{email}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Check your inbox (and spam folder) for the verification link. Links expire after 24 hours.
        </p>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {status === "sent" && (
          <p className="mt-4 text-sm text-primary">Verification email sent. Check your inbox.</p>
        )}

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

        <Link
          to="/"
          className="mt-6 inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
