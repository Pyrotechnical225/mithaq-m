import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { getPilotReadiness } from "@/lib/pilot-readiness.functions";

export const Route = createFileRoute("/_authenticated/admin/pilot-readiness")({
  head: () => ({
    meta: [{ title: "Pilot readiness — Mithaq admin" }, { name: "robots", content: "noindex" }],
  }),
  component: PilotReadiness,
});

type Readiness = Awaited<ReturnType<typeof getPilotReadiness>>;

function PilotReadiness() {
  const fetchReadiness = useServerFn(getPilotReadiness);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [manualDone, setManualDone] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReadiness(await fetchReadiness());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Readiness checks could not run");
    }
  }, [fetchReadiness]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!readiness && !error) {
    return <p className="text-sm text-muted-foreground">Running pilot readiness checks…</p>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Weeks 9–10
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
            Controlled-pilot readiness
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            A live, read-only preflight across configuration, imam coverage, payments, safety, and
            operational queues. Passing this page does not publish production.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Run checks again
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

      {readiness ? (
        <>
          <section className="grid gap-4 rounded-lg border border-border bg-card p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Automated result
              </p>
              <div className="mt-2 flex items-center gap-3">
                <SummaryIcon status={readiness.summary.status} />
                <div>
                  <h2 className="text-2xl font-semibold capitalize text-foreground">
                    {readiness.summary.status === "review"
                      ? "Manual review needed"
                      : readiness.summary.status}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {readiness.summary.passed} passed · {readiness.summary.warnings} warnings ·{" "}
                    {readiness.summary.blockers} blockers
                  </p>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm lg:text-right">
              <div>
                <dt className="text-xs text-muted-foreground">Environment</dt>
                <dd className="mt-1 font-medium text-foreground">
                  {readiness.deployment.environment}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Commit</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {readiness.deployment.commit ?? "local"}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">Automated checks</h2>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
              {readiness.checks.map((check) => (
                <article
                  key={check.id}
                  className="grid gap-3 p-5 md:grid-cols-[1.5rem_minmax(0,1fr)_auto] md:items-start"
                >
                  <CheckIcon status={check.status} />
                  <div>
                    <h3 className="font-medium text-foreground">{check.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                    {check.action ? (
                      <p className="mt-2 text-xs font-medium text-foreground">
                        Next: {check.action}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs capitalize ${statusClass(check.status)}`}
                  >
                    {check.status}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Manual launch gates</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These boxes are a temporary browser checklist and are not saved as proof.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {Object.values(manualDone).filter(Boolean).length} of {readiness.manual.length}{" "}
                checked
              </span>
            </div>
            <div className="mt-5 divide-y divide-border border-y border-border">
              {readiness.manual.map((item, index) => (
                <label
                  key={item}
                  className="flex cursor-pointer items-start gap-3 py-3 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={manualDone[index] ?? false}
                    onChange={(event) =>
                      setManualDone((current) => ({ ...current, [index]: event.target.checked }))
                    }
                    className="mt-0.5 size-4 rounded border-input"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="flex flex-wrap gap-3 border-t border-border pt-6">
            <Link
              to="/admin/payments"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Review payment operations
            </Link>
            <Link
              to="/admin/imam-applications"
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Review introduction queue
            </Link>
            <Link
              to="/admin/reports"
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Review safety reports
            </Link>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SummaryIcon({ status }: { status: Readiness["summary"]["status"] }) {
  if (status === "ready")
    return <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />;
  if (status === "blocked")
    return <CircleX className="size-8 text-destructive" aria-hidden="true" />;
  return <CircleAlert className="size-8 text-amber-700" aria-hidden="true" />;
}

function CheckIcon({ status }: { status: Readiness["checks"][number]["status"] }) {
  if (status === "pass")
    return <CheckCircle2 className="mt-0.5 size-5 text-primary" aria-hidden="true" />;
  if (status === "blocker")
    return <CircleX className="mt-0.5 size-5 text-destructive" aria-hidden="true" />;
  return <CircleAlert className="mt-0.5 size-5 text-amber-700" aria-hidden="true" />;
}

function statusClass(status: Readiness["checks"][number]["status"]) {
  if (status === "pass") return "bg-primary/10 text-primary";
  if (status === "blocker") return "bg-destructive/10 text-destructive";
  return "bg-amber-100 text-amber-900";
}
