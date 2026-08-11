import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listCompatibilityComparisonsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/compatibility")({
  head: () => ({
    meta: [
      { title: "Compatibility comparison — MeetHaq admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompatibilityComparisonPage,
});

function CompatibilityComparisonPage() {
  const fetchComparisons = useServerFn(listCompatibilityComparisonsAdmin);
  const [rows, setRows] = useState<Awaited<
    ReturnType<typeof listCompatibilityComparisonsAdmin>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchComparisons()
      .then(setRows)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Unable to load compatibility scores");
      });
  }, [fetchComparisons]);

  const summary = useMemo(() => {
    const all = rows ?? [];
    const reviewed = all.filter((row) => row.openai_score !== null);
    const averageDifference = reviewed.length
      ? reviewed.reduce((sum, row) => sum + Math.abs(row.difference ?? 0), 0) / reviewed.length
      : 0;
    return { total: all.length, reviewed: reviewed.length, averageDifference };
  }, [rows]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-foreground">Compatibility comparison</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Audit how MeetHaq combines the fixed rubric (80%) with the anonymised OpenAI review (20%).
          A missing OpenAI score means the safe fixed-rubric fallback was used.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Stored results" value={String(summary.total)} />
        <Metric label="OpenAI reviewed" value={String(summary.reviewed)} />
        <Metric
          label="Average AI / rubric gap"
          value={`${summary.averageDifference.toFixed(1)} pts`}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Generated</th>
              <th className="px-4 py-3">Member → candidate</th>
              <th className="px-4 py-3 text-center">Fixed 80%</th>
              <th className="px-4 py-3 text-center">OpenAI 20%</th>
              <th className="px-4 py-3 text-center">Final</th>
              <th className="px-4 py-3">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">
                  {new Date(row.generated_at).toLocaleString()}
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium text-foreground">{row.member}</p>
                  <p className="text-muted-foreground">→ {row.candidate}</p>
                </td>
                <td className="px-4 py-4 text-center font-medium">{row.fixed_score}%</td>
                <td className="px-4 py-4 text-center font-medium">
                  {row.openai_score === null ? "Fallback" : `${row.openai_score}%`}
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                    {row.final_score}%
                  </span>
                </td>
                <td className="max-w-sm px-4 py-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{row.scoring_method}</p>
                  {row.strengths ? <p className="mt-1">{row.strengths}</p> : null}
                  {row.considerations ? <p className="mt-1">{row.considerations}</p> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No compatibility scores have been generated yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
