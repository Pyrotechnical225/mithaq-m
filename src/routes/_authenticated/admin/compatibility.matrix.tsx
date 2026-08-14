import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compareMemberAgainstPool,
  listComparableMembers,
  refreshPoolAiReviews,
} from "@/lib/admin.functions";
import { useAsyncResource } from "@/lib/use-async-resource";
import { EmptyRow, EmptyState, ErrorState, TableSkeleton } from "@/components/admin/async-states";

export const Route = createFileRoute("/_authenticated/admin/compatibility/matrix")({
  head: () => ({
    meta: [
      { title: "Compatibility matrix — Mithaq admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { member?: string } =>
    typeof search.member === "string" && search.member ? { member: search.member } : {},
  component: CompatibilityMatrixPage,
});

type Member = Awaited<ReturnType<typeof listComparableMembers>>[number];
type Comparison = Awaited<ReturnType<typeof compareMemberAgainstPool>>;
type Row = Comparison["rows"][number];

/**
 * Score bands use the existing palette tokens. Deliberately not red/amber/green
 * — a traffic-light scale both fights the emerald/azure palette and implies a
 * pass/fail verdict, which is exactly the misreading this page guards against.
 */
function scoreBand(score: number) {
  if (score >= 85) return "bg-primary text-primary-foreground";
  if (score >= 70) return "bg-primary/15 text-primary";
  if (score >= 50) return "bg-azure/15 text-foreground";
  return "bg-muted text-muted-foreground";
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function toCsv(rows: Row[]) {
  const cols = [
    "candidate",
    "user_id",
    "age",
    "city",
    "madhab",
    "practice_level",
    "fixed_score",
    "openai_score",
    "final_score",
    "discoverable",
    "notes",
  ];
  const esc = (value: unknown) =>
    `"${(value === null || value === undefined ? "" : String(value)).replace(/"/g, '""')}"`;
  const body = rows.map((row) =>
    [
      row.display_name ?? "",
      row.user_id,
      row.age ?? "",
      row.city ?? "",
      row.madhab ?? "",
      row.practice_level ?? "",
      row.fixed_score,
      row.openai_score ?? "",
      row.final_score,
      row.discoverable ? "yes" : "no",
      row.fallback_reason ?? row.considerations ?? "",
    ]
      .map(esc)
      .join(","),
  );
  return [cols.join(","), ...body].join("\n");
}

function download(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CompatibilityMatrixPage() {
  const { member: memberFromUrl } = Route.useSearch();
  const navigate = Route.useNavigate();

  const fetchMembers = useServerFn(listComparableMembers);
  const compare = useServerFn(compareMemberAgainstPool);
  const refreshAi = useServerFn(refreshPoolAiReviews);

  const members = useAsyncResource<Member[]>(fetchMembers);

  const [selected, setSelected] = useState<string | null>(memberFromUrl ?? null);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [aiFailures, setAiFailures] = useState<number>(0);
  const runIdRef = useRef(0);

  const selectedMember = useMemo(
    () => (members.data ?? []).find((m) => m.user_id === selected) ?? null,
    [members.data, selected],
  );

  const runComparison = useCallback(
    async (userId: string, refresh: boolean) => {
      const runId = ++runIdRef.current;
      setLoadingPool(true);
      setError(null);
      setAiFailures(0);
      try {
        // Fixed scores (plus any cached AI) paint immediately.
        const result = await compare({ data: { userId, refresh } });
        if (runIdRef.current !== runId) return;
        setComparison(result);
        setRows(result.rows);
        setLoadingPool(false);

        if (result.status !== "ok" || result.rows.length === 0) return;

        // Only pay for a run when something is actually missing.
        const missingAi = result.rows.some((row) => row.openai_score === null);
        if (!refresh && !missingAi) return;

        setAiRunning(true);
        const ai = await refreshAi({ data: { userId, refresh } });
        if (runIdRef.current !== runId) return;
        if (ai.status === "ok") {
          const byUser = new Map(ai.reviews.map((review) => [review.user_id, review]));
          setRows((previous) =>
            previous
              .map((row) => {
                const patch = byUser.get(row.user_id);
                return patch ? { ...row, ...patch } : row;
              })
              .sort((left, right) => right.final_score - left.final_score),
          );
          setAiFailures(ai.failures.reduce((sum, f) => sum + f.candidate_ids.length, 0));
        }
      } catch (reason) {
        if (runIdRef.current !== runId) return;
        setError(reason instanceof Error ? reason.message : "The comparison failed");
      } finally {
        if (runIdRef.current === runId) {
          setLoadingPool(false);
          setAiRunning(false);
        }
      }
    },
    [compare, refreshAi],
  );

  useEffect(() => {
    if (selected) void runComparison(selected, false);
  }, [selected, runComparison]);

  const pick = (userId: string) => {
    setSelected(userId);
    setPickerOpen(false);
    setQuery("");
    void navigate({ search: { member: userId }, replace: true });
  };

  const filteredMembers = (members.data ?? []).filter((m) => {
    if (!query) return true;
    const needle = query.toLowerCase();
    return (
      (m.display_name ?? "").toLowerCase().includes(needle) ||
      (m.contact_email ?? "").toLowerCase().includes(needle)
    );
  });

  const summary = useMemo(() => {
    const scores = rows.map((row) => row.final_score);
    const excl = comparison?.exclusions;
    return {
      pool: rows.length,
      mean: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      median: median(scores),
      above70: scores.filter((s) => s >= 70).length,
      exclusions: excl,
      excludedTotal: excl
        ? excl.same_gender + excl.imam + excl.admin + excl.incomplete_survey + excl.no_gender
        : 0,
    };
  }, [rows, comparison]);

  if (members.status === "error") {
    return (
      <ErrorState
        title="The member list didn't load"
        message={members.error}
        onRetry={members.retry}
        retrying={members.refreshing}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-foreground">Compatibility matrix</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Score one member against every eligible member of the opposite gender. Unlike the member
          experience, nothing is filtered out by discoverability, nothing is cut at 70, and the list
          is not trimmed to five.
        </p>
        <p className="mt-2 max-w-3xl rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          These scores are a decision aid, not a ruling. They compare survey answers only — they
          cannot see character, circumstance or compatibility in the ways that matter most. Treat a
          91% as “worth a closer look”, never as a verdict.
        </p>
      </div>

      {/* Member picker */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <label
          htmlFor="member-search"
          className="text-xs uppercase tracking-widest text-muted-foreground"
        >
          Member to compare
        </label>
        {members.status === "loading" ? (
          <div className="mt-2 h-10 w-full max-w-md animate-pulse rounded-xl bg-muted" />
        ) : (
          <div className="relative mt-2 max-w-md">
            <input
              id="member-search"
              role="combobox"
              aria-expanded={pickerOpen}
              aria-controls="member-listbox"
              autoComplete="off"
              value={
                pickerOpen
                  ? query
                  : (selectedMember?.display_name ?? selectedMember?.contact_email ?? "")
              }
              onFocus={() => setPickerOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setPickerOpen(true);
              }}
              placeholder="Search by name or email…"
              className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            {pickerOpen && (
              <ul
                id="member-listbox"
                role="listbox"
                className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg"
              >
                {filteredMembers.slice(0, 50).map((m) => (
                  <li key={m.user_id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={m.user_id === selected}
                      onClick={() => pick(m.user_id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="truncate">
                        {m.display_name ?? m.contact_email ?? m.user_id}
                        {(m.is_imam || m.is_admin) && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {m.is_imam ? "imam" : "admin"}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.gender ?? "no gender"} ·{" "}
                        {m.survey_completed ? "survey done" : "survey incomplete"}
                      </span>
                    </button>
                  </li>
                ))}
                {filteredMembers.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted-foreground">No members match.</li>
                )}
              </ul>
            )}
          </div>
        )}

        {selectedMember && (
          <div className="mt-5 grid gap-x-6 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Name" value={selectedMember.display_name ?? "—"} />
            <Fact label="Email" value={selectedMember.contact_email ?? "—"} />
            <Fact label="Gender" value={selectedMember.gender ?? "Not answered"} />
            <Fact
              label="Survey"
              value={selectedMember.survey_completed ? "Completed" : "Incomplete"}
            />
            <Fact label="Age" value={comparison?.subject.age ?? "—"} />
            <Fact label="City" value={comparison?.subject.city ?? "—"} />
            <Fact label="Madhab" value={comparison?.subject.madhab ?? "—"} />
            <Fact label="Practice" value={comparison?.subject.practice_level ?? "—"} />
            <Fact
              label="Discoverable"
              value={selectedMember.discoverable ? "Yes" : "No — not reaching members"}
            />
            <Fact label="Rubric" value={comparison?.rubricVersion ?? "—"} />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!selected ? (
        <EmptyState
          title="Pick a member to compare"
          message="Choose someone above to score them against every eligible member of the opposite gender. You can also reach this from a profile page via “Compare against pool”."
        />
      ) : loadingPool ? (
        <TableSkeleton rows={8} columns={9} />
      ) : comparison?.status === "subject_survey_incomplete" ? (
        <EmptyState
          title="This member hasn't completed their survey"
          message="Compatibility can only be scored once their survey is marked complete. You can complete or mark it from their profile page."
          action={
            selected ? (
              <Link
                to="/admin/profiles/$userId"
                params={{ userId: selected }}
                className="rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
              >
                Open their profile
              </Link>
            ) : undefined
          }
        />
      ) : comparison?.status === "subject_no_gender" ? (
        <EmptyState
          title="This member hasn't answered the gender question"
          message="Question 2 determines who they can be matched against. Without it we cannot build an opposite-gender pool, and we will not guess."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No opposite-gender members have completed a survey yet"
          message="Everyone else is either the same gender, an imam or admin account, or has not finished their survey. The breakdown is below."
        />
      ) : (
        <>
          <SummaryStrip summary={summary} aiFailures={aiFailures} />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => selected && void runComparison(selected, true)}
              disabled={aiRunning || loadingPool}
              className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
            >
              {aiRunning ? "Recalculating…" : "Recalculate (re-runs paid AI review)"}
            </button>
            <button
              onClick={() => download(`meethaq-matrix-${selected}.csv`, toCsv(rows))}
              className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent"
            >
              Export CSV
            </button>
            {rows[0]?.cached_at && (
              <span className="text-xs text-muted-foreground">
                AI portion cached {new Date(rows[0].cached_at).toLocaleString()}
              </span>
            )}
            {aiRunning && (
              <span className="text-xs text-muted-foreground">
                Running AI review in batches — fixed scores are already final.
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2 text-right">Age</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Madhab</th>
                  <th className="px-3 py-2">Practice</th>
                  <th className="px-3 py-2 text-right">Fixed 80%</th>
                  <th className="px-3 py-2 text-right">AI 20%</th>
                  <th className="px-3 py-2 text-right">Final</th>
                  <th className="px-3 py-2">Discoverable</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const open = expanded === row.user_id;
                  return (
                    <Fragment key={row.user_id}>
                      <tr
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => setExpanded(open ? null : row.user_id)}
                      >
                        <td className="px-3 py-2 text-foreground">
                          {row.display_name ?? row.user_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.age ?? "—"}</td>
                        <td className="px-3 py-2">{row.city ?? "—"}</td>
                        <td className="px-3 py-2">{row.madhab ?? "—"}</td>
                        <td className="px-3 py-2">{row.practice_level ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.fixed_score}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.openai_score ?? (aiRunning ? "…" : "—")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 font-semibold tabular-nums ${scoreBand(row.final_score)}`}
                          >
                            {row.final_score}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {row.discoverable ? (
                            <span className="text-xs text-muted-foreground">Yes</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Not discoverable
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.openai_score === null && !aiRunning ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 uppercase tracking-wider">
                              Fallback
                            </span>
                          ) : (
                            <span className="underline">{open ? "Hide" : "Details"}</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/30">
                          <td colSpan={10} className="px-3 py-4 text-sm">
                            {row.fallback_reason && (
                              <p className="mb-2 text-destructive">
                                No AI score for this candidate: {row.fallback_reason}
                              </p>
                            )}
                            {row.strengths && (
                              <p>
                                <span className="text-muted-foreground">Strengths: </span>
                                {row.strengths}
                              </p>
                            )}
                            {row.considerations && (
                              <p className="mt-1">
                                <span className="text-muted-foreground">To discuss: </span>
                                {row.considerations}
                              </p>
                            )}
                            {!row.strengths && !row.considerations && !row.fallback_reason && (
                              <p className="text-muted-foreground">
                                Fixed-rubric score only — no AI review has been run for this
                                candidate yet.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <EmptyRow
                    colSpan={10}
                    title="No eligible candidates"
                    message="See the exclusion breakdown above for why."
                  />
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

function SummaryStrip({
  summary,
  aiFailures,
}: {
  summary: {
    pool: number;
    mean: number;
    median: number;
    above70: number;
    excludedTotal: number;
    exclusions?: Record<string, number>;
  };
  aiFailures: number;
}) {
  const e = summary.exclusions;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Eligible pool" value={String(summary.pool)} />
        <Metric label="Mean score" value={String(summary.mean)} />
        <Metric label="Median score" value={String(summary.median)} />
        <Metric label="Above 70" value={String(summary.above70)} />
      </div>
      {e && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="text-foreground">{summary.excludedTotal} excluded</span> — same gender{" "}
          {e.same_gender} · imam {e.imam} · admin {e.admin} · incomplete survey{" "}
          {e.incomplete_survey} · no gender answered {e.no_gender}
          {aiFailures > 0 && (
            <>
              {" "}
              · <span className="text-destructive">{aiFailures} candidates fell back</span> to the
              fixed rubric because their AI batch failed
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
