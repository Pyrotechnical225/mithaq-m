import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Verification status — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: AuthCallback,
});

type Status = "working" | "success" | "already" | "expired" | "invalid" | "error";

function friendly(
  code: string | null,
  message: string | null,
): { status: Status; title: string; body: string } {
  const c = (code ?? "").toLowerCase();
  const m = (message ?? "").toLowerCase();
  if (c.includes("otp_expired") || m.includes("expired")) {
    return {
      status: "expired",
      title: "This verification link has expired",
      body: "Verification links are valid for a limited time. Sign in again and we'll send a fresh one.",
    };
  }
  if (c.includes("access_denied") || m.includes("access_denied")) {
    return {
      status: "invalid",
      title: "This link can't be used",
      body: "It may have already been used or was denied. Try signing in and resending the verification email.",
    };
  }
  return {
    status: "error",
    title: "We couldn't verify your email",
    body: message ?? "Please try signing in and resending the verification email.",
  };
}

function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("working");
  const [title, setTitle] = useState("Verifying your email…");
  const [body, setBody] = useState("Just a moment.");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const errCode = url.searchParams.get("error_code") ?? hashParams.get("error_code");
        const errDesc =
          url.searchParams.get("error_description") ?? hashParams.get("error_description");
        if (errCode || errDesc) {
          const f = friendly(errCode, errDesc);
          setStatus(f.status);
          setTitle(f.title);
          setBody(f.body);
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const token_hash = url.searchParams.get("token_hash");
          const type = url.searchParams.get("type");
          if (token_hash && type) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any });
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

        const nextRaw = url.searchParams.get("next") ?? "";
        const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "";
        const { data } = await supabase.auth.getUser();
        if (data.user?.email_confirmed_at) {
          setStatus("success");
          setTitle("Email verified");
          setBody("Redirecting…");
          setTimeout(() => {
            if (next) window.location.href = next;
            else navigate({ to: "/dashboard", replace: true });
          }, 1200);
        } else {
          setStatus("already");
          setTitle("You're signed in");
          setBody("Please continue to verify your email.");
        }
      } catch (e) {
        const f = friendly(null, e instanceof Error ? e.message : "Verification failed");
        setStatus(f.status);
        setTitle(f.title);
        setBody(f.body);
      }
    };
    run();
  }, [navigate]);

  const icon =
    status === "success" ? "✓" : status === "working" ? "…" : status === "already" ? "→" : "!";

  const tone =
    status === "success"
      ? "text-primary"
      : status === "working"
        ? "text-muted-foreground"
        : status === "already"
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

        {(status === "expired" || status === "invalid" || status === "error") && (
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
