import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { safeRelativePath } from "@/lib/safe-navigation";

export const Route = createFileRoute("/_authenticated/security")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeRelativePath(search.next);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [{ title: "Account security — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  component: SecurityPage,
});

type Enrollment = { id: string; qrCode: string; secret: string };

function SecurityPage() {
  const { next } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [assurance, setAssurance] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    const [factorsResult, assuranceResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsResult.error) throw factorsResult.error;
    if (assuranceResult.error) throw assuranceResult.error;
    const verified = factorsResult.data.totp.find((factor) => factor.status === "verified");
    setVerifiedFactorId(verified?.id ?? null);
    setAssurance(assuranceResult.data.currentLevel);
  };

  useEffect(() => {
    refresh()
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Security settings could not load"),
      )
      .finally(() => setLoading(false));
  }, []);

  const startEnrollment = async () => {
    setMessage(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Mithaq authenticator",
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async () => {
    const factorId = enrollment?.id ?? verifiedFactorId;
    if (!factorId || code.trim().length !== 6) return;
    setMessage(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    await supabase.auth.refreshSession();
    await refresh();
    setEnrollment(null);
    setCode("");
    setMessage("Multi-factor authentication is active for this session.");
    if (next) window.location.assign(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-[4.5rem] max-w-3xl items-center justify-between px-5 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
              ميثاق
            </span>
          </Link>
          <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy & settings
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Account security
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Authenticator app
        </h1>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Add a time-based code from an authenticator app. Mithaq requires this second step before
          any administrator workspace can open or make changes.
        </p>

        <section className="mt-8 rounded-lg border border-border bg-card p-6 sm:p-8">
          {loading ? (
            <p className="text-sm text-muted-foreground">Checking security status…</p>
          ) : null}

          {!loading && assurance === "aal2" ? (
            <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
              <p className="font-medium text-foreground">Authenticator verified</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This session has multi-factor protection and can open the admin workspace.
              </p>
              {next ? (
                <button
                  type="button"
                  onClick={() => window.location.assign(next)}
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Continue
                </button>
              ) : null}
            </div>
          ) : null}

          {!loading && assurance !== "aal2" && verifiedFactorId && !enrollment ? (
            <div>
              <h2 className="text-lg font-semibold text-foreground">Enter your 6-digit code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account already has an authenticator. Verify it for this session.
              </p>
              <CodeInput code={code} setCode={setCode} />
              <button
                type="button"
                disabled={code.length !== 6}
                onClick={verify}
                className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                Verify code
              </button>
            </div>
          ) : null}

          {!loading && !verifiedFactorId && !enrollment ? (
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Set up multi-factor authentication
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Open an authenticator app on your phone.</li>
                <li>Scan the QR code Mithaq will show.</li>
                <li>Enter the generated 6-digit code to finish.</li>
              </ol>
              <button
                type="button"
                onClick={startEnrollment}
                className="mt-5 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Start setup
              </button>
            </div>
          ) : null}

          {enrollment ? (
            <div>
              <h2 className="text-lg font-semibold text-foreground">Scan this QR code</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                If scanning is unavailable, enter the setup key manually. Do not share this key.
              </p>
              <img
                src={enrollment.qrCode}
                alt="QR code for the Mithaq authenticator"
                className="mt-5 h-52 w-52 rounded-md border border-border bg-white p-3"
              />
              <p className="mt-4 break-all rounded-md border border-border bg-muted p-3 font-mono text-xs text-foreground">
                {enrollment.secret}
              </p>
              <CodeInput code={code} setCode={setCode} />
              <button
                type="button"
                disabled={code.length !== 6}
                onClick={verify}
                className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                Confirm authenticator
              </button>
            </div>
          ) : null}

          {message ? (
            <p
              className="mt-5 rounded-md border border-border p-4 text-sm text-muted-foreground"
              role="status"
            >
              {message}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function CodeInput({ code, setCode }: { code: string; setCode: (value: string) => void }) {
  return (
    <div className="mt-5 max-w-xs">
      <label htmlFor="mfa-code" className="text-sm font-medium text-foreground">
        6-digit authenticator code
      </label>
      <input
        id="mfa-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        className="mt-2 w-full rounded-md border border-input bg-background px-4 py-3 font-mono text-lg tracking-[0.3em]"
      />
    </div>
  );
}
