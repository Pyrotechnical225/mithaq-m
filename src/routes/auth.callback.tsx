import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Verifying — Mithaq" },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);

        // Error from Supabase (expired link, etc.)
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const errDesc = url.searchParams.get("error_description") ?? hashParams.get("error_description");
        if (errDesc) {
          setError(errDesc);
          return;
        }

        // New-style PKCE / verification: ?code=...
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Legacy: ?token_hash=...&type=signup|recovery|email|magiclink|invite
          const token_hash = url.searchParams.get("token_hash");
          const type = url.searchParams.get("type");
          if (token_hash && type) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any });
            if (error) throw error;
          } else {
            // Implicit flow: tokens in hash fragment (access_token / refresh_token)
            const access_token = hashParams.get("access_token");
            const refresh_token = hashParams.get("refresh_token");
            if (access_token && refresh_token) {
              const { error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (error) throw error;
            }
          }
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setMessage("Email verified. Redirecting…");
          navigate({ to: "/dashboard", replace: true });
        } else {
          setMessage("Verified. Please sign in.");
          navigate({ to: "/auth", replace: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verification failed");
      }
    };
    run();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="font-arabic text-4xl text-primary" dir="rtl" lang="ar">ميثاق</p>
        {error ? (
          <>
            <h1 className="mt-4 text-2xl text-foreground">Verification link problem</h1>
            <p className="mt-2 text-sm text-destructive">{error}</p>
            <a href="/auth" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="mt-4 text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}
