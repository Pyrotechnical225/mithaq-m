import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listMemberReportsAdmin, reviewMemberReportAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [{ title: "Safety reports — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: SafetyReports,
});

type Report = Awaited<ReturnType<typeof listMemberReportsAdmin>>[number];
type ReviewStatus = "reviewing" | "actioned" | "dismissed";

function SafetyReports() {
  const listReports = useServerFn(listMemberReportsAdmin);
  const reviewReport = useServerFn(reviewMemberReportAdmin);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () =>
    listReports()
      .then(setReports)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Safety reports could not load"),
      );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (reportId: string, status: ReviewStatus) => {
    setSavingId(reportId);
    setError(null);
    try {
      await reviewReport({ data: { report_id: reportId, status } });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be updated");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Safeguarding
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Safety reports</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review member concerns privately. Status changes record the reviewing administrator and
          create an immutable audit event.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {reports === null ? (
        <p className="text-sm text-muted-foreground">Loading safety reports…</p>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No safety reports have been submitted.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <article key={report.id} className="rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                      {report.category.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                      {report.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-foreground">
                    <strong>Reporter:</strong> {report.reporter?.display_name ?? "Unnamed member"}
                    {report.reporter?.contact_email ? ` · ${report.reporter.contact_email}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    <strong>Reported member:</strong>{" "}
                    {report.reported?.display_name ?? "Unnamed member"}
                    {report.reported?.contact_email ? ` · ${report.reported.contact_email}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{new Date(report.created_at).toLocaleString()}</p>
                  <p className="mt-1 font-mono">{report.id}</p>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-sm leading-6 text-foreground">
                {report.details}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {(["reviewing", "actioned", "dismissed"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={savingId === report.id || report.status === status}
                    onClick={() => updateStatus(report.id, status)}
                    className="rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium capitalize text-foreground hover:bg-accent disabled:opacity-40"
                  >
                    Mark {status}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
