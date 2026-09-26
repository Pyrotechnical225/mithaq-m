import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { formatPence } from "@/lib/meeting-packages";
import { diagnoseStripe, listPaymentOperations } from "@/lib/membership.functions";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({
    meta: [{ title: "Payment operations — Mithaq admin" }, { name: "robots", content: "noindex" }],
  }),
  component: PaymentOperations,
});

type Operations = Awaited<ReturnType<typeof listPaymentOperations>>;
type Diagnostic = Awaited<ReturnType<typeof diagnoseStripe>>;

function PaymentOperations() {
  const fetchOperations = useServerFn(listPaymentOperations);
  const runDiagnostic = useServerFn(diagnoseStripe);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOperations(await fetchOperations());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment operations could not load");
    }
  }, [fetchOperations]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!operations && !error) {
    return <p className="text-sm text-muted-foreground">Loading payment operations…</p>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Finance operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
            Payments
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Read-only payment state for meeting packages and Stripe deliveries. Refunds and charge
            changes remain in the Stripe Dashboard.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setDiagnostic(await runDiagnostic());
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Stripe diagnostic failed");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? "Checking…" : "Run read-only Stripe check"}
        </button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {operations ? (
        <>
          <section className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-5 xl:divide-x xl:divide-border">
            <Metric
              label="Package revenue"
              value={formatPence(operations.summary.collected_pence)}
            />
            <Metric label="Paid packages" value={operations.summary.paid_packages} />
            <Metric
              label="Pairings awaiting payment"
              value={operations.summary.payments_outstanding}
            />
            <Metric label="Open checkouts" value={operations.summary.open_checkouts} />
            <Metric
              label="Failed webhooks"
              value={operations.summary.failed_webhooks}
              alert={operations.summary.failed_webhooks > 0}
            />
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Stripe configuration</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Secret values are never displayed in this workspace.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${operations.stripe.configured ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}
              >
                {operations.stripe.configured
                  ? `${operations.stripe.mode} · ${operations.stripe.kind} key`
                  : "not configured"}
              </span>
            </div>
            {operations.stripe.configured ? (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <KeyValue label="Key source" value={operations.stripe.source} />
                <KeyValue
                  label="Webhook secret"
                  value={
                    operations.stripe.webhook_secret_looks_valid ? "present" : "needs attention"
                  }
                />
                <KeyValue
                  label="Key recommendation"
                  value={
                    operations.stripe.kind === "restricted"
                      ? "least privilege"
                      : "move to restricted key"
                  }
                />
              </dl>
            ) : null}
            {diagnostic ? (
              <ul className="mt-5 divide-y divide-border border-t border-border text-sm">
                {diagnostic.checks.map((check) => (
                  <li key={check.name} className="flex flex-wrap justify-between gap-3 py-2.5">
                    <span className="text-foreground">{check.name}</span>
                    <span className={check.ok ? "text-primary" : "text-destructive"}>
                      {check.ok ? "Passed" : check.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Checkout attempts</h2>
              <span className="text-xs text-muted-foreground">Latest 250</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {operations.attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="px-4 py-3 text-foreground">{attempt.member}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {attempt.meeting_count} meeting{attempt.meeting_count === 1 ? "" : "s"} ·{" "}
                        {formatPence(attempt.amount_pence)}
                      </td>
                      <td className="px-4 py-3">
                        <Status value={attempt.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(attempt.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {attempt.stripe_session_id?.slice(-12) ?? "preparing"}
                      </td>
                    </tr>
                  ))}
                  {operations.attempts.length === 0 ? (
                    <EmptyRow columns={5} label="No meeting-package checkouts yet." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Webhook delivery ledger</h2>
              <span className="text-xs text-muted-foreground">
                Failed entries are retried safely
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Last delivery</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {operations.events.map((event) => (
                    <tr key={event.id}>
                      <td className="px-4 py-3">
                        <p className="text-foreground">{event.type}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          …{event.id.slice(-12)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Status value={event.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{event.attempts}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(event.last_attempt_at).toLocaleString()}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-xs text-destructive">
                        {event.last_error ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {operations.events.length === 0 ? (
                    <EmptyRow columns={5} label="No Stripe webhook deliveries yet." />
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="border-b border-border p-5 last:border-b-0 xl:border-b-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${alert ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const problem = ["failed", "expired"].includes(value);
  const complete = ["paid", "processed"].includes(value);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${problem ? "bg-destructive/10 text-destructive" : complete ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-8 text-center text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}
