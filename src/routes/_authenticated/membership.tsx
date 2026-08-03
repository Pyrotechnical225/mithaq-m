import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  confirmCheckout,
  diagnoseStripe,
  getMyMembership,
  openBillingPortal,
  startCheckout,
} from "@/lib/membership.functions";
import { MEMBERSHIP_BENEFITS, PLANS, formatPrice, type PlanId } from "@/lib/membership-plans";

export const Route = createFileRoute("/_authenticated/membership")({
  head: () => ({
    meta: [
      { title: "Mithaq membership" },
      { name: "description", content: "Unlock your matches with a Mithaq membership." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MembershipPage,
});

function MembershipPage() {
  const fetchMembership = useServerFn(getMyMembership);
  const checkout = useServerFn(startCheckout);
  const portal = useServerFn(openBillingPortal);
  const confirm = useServerFn(confirmCheckout);
  const diagnose = useServerFn(diagnoseStripe);

  const [state, setState] = useState<Awaited<ReturnType<typeof getMyMembership>> | null>(null);
  const [busy, setBusy] = useState<PlanId | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diag, setDiag] = useState<Awaited<ReturnType<typeof diagnoseStripe>> | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  useEffect(() => {
    const load = () => fetchMembership().then(setState).catch(() => setState(null));
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") === "success" && sessionId) {
      setNotice("Confirming your payment…");
      confirm({ data: { session_id: sessionId } })
        .then((r) =>
          setNotice(
            r.ok
              ? "Payment confirmed — your membership is active."
              : "Payment received. Your membership will activate shortly; refresh in a moment.",
          ),
        )
        .catch(() =>
          setNotice("Payment received. Your membership will activate shortly; refresh in a moment."),
        )
        .finally(load);
    } else {
      if (params.get("checkout") === "cancelled") setNotice("Checkout was cancelled.");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async (plan: PlanId) => {
    setError(null);
    setBusy(plan);
    try {
      const { url } = await checkout({ data: { plan, origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(null);
    }
  };

  const runDiagnostic = async () => {
    setDiagBusy(true);
    try {
      setDiag(await diagnose({ data: { origin: window.location.origin } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diagnostic failed");
    } finally {
      setDiagBusy(false);
    }
  };

  const manage = async () => {
    setError(null);
    setBusy("portal");
    try {
      const { url } = await portal({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing");
      setBusy(null);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>

        <h1 className="mt-6 text-3xl text-foreground">Mithaq membership</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Your survey and privacy controls are always free. Membership unlocks your matches and the
          imam-arranged meeting process, and helps us keep Mithaq serious, moderated and halal.
        </p>

        {state?.active && (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <p className="text-sm font-medium text-foreground">
              Your membership is active ({state.plan}).
              {state.current_period_end &&
                ` Renews ${new Date(state.current_period_end).toLocaleDateString()}.`}
            </p>
            {state.has_billing_portal && (
              <button
                onClick={manage}
                disabled={busy === "portal"}
                className="mt-3 rounded-full border border-border px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
              >
                {busy === "portal" ? "Opening…" : "Manage billing"}
              </button>
            )}
          </div>
        )}

        {notice && (
          <p className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">
            {notice}
          </p>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {state?.is_admin && (
          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-foreground">Admin: Stripe diagnostic</h3>
              <button
                onClick={runDiagnostic}
                disabled={diagBusy}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
              >
                {diagBusy ? "Testing…" : "Test Stripe connection"}
              </button>
            </div>
            {diag && (
              <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                {diag.key.configured ? (
                  <p>
                    Key: <strong>{diag.key.kind}</strong> ({diag.key.source}), mode{" "}
                    <strong>{diag.key.mode}</strong>, prefix <code>{diag.key.prefix}</code> · webhook
                    secret{" "}
                    {diag.key.webhook_secret_present
                      ? diag.key.webhook_secret_looks_valid
                        ? "saved (whsec_…)"
                        : "saved but does NOT start with whsec_"
                      : "missing"}
                  </p>
                ) : (
                  <p>No Stripe key saved.</p>
                )}
                <ul className="space-y-1">
                  {diag.checks.map((c) => (
                    <li key={c.name}>
                      <span className={c.ok ? "text-primary" : "text-destructive"}>
                        {c.ok ? "✓" : "✕"}
                      </span>{" "}
                      {c.name} — <span className="break-all">{c.detail}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-1">
                  A restricted key needs write access to Checkout Sessions, Billing Portal Sessions
                  and Products/Prices, plus read on Subscriptions and Customers.
                </p>
              </div>
            )}
          </div>
        )}

        {state && !state.payments_configured && (
          <p className="mt-4 rounded-xl bg-muted p-4 text-xs text-muted-foreground">
            Card payments aren’t connected yet, so checkout is disabled. An admin can also grant
            complimentary access from the admin panel.
          </p>
        )}

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {(Object.values(PLANS) as (typeof PLANS)[PlanId][]).map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl text-foreground">{plan.name}</h2>
                {plan.highlight && (
                  <span className="rounded-full bg-gold/30 px-3 py-1 text-xs text-foreground">
                    {plan.highlight}
                  </span>
                )}
              </div>
              <p className="mt-3 font-display text-3xl text-foreground">
                {formatPrice(plan.amount)}
                <span className="text-sm text-muted-foreground"> / {plan.interval}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
              <button
                onClick={() => go(plan.id)}
                disabled={busy !== null || state?.active || state?.payments_configured === false}
                className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {state?.active ? "Already a member" : busy === plan.id ? "Redirecting…" : `Choose ${plan.name.toLowerCase()}`}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg text-foreground">What membership includes</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {MEMBERSHIP_BENEFITS.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-primary">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
