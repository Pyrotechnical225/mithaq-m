import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listAllPairings,
  listImamApplications,
  reviewImamApplication,
  setImamAccountActive,
} from "@/lib/imam-admin.functions";
import { useAsyncResource } from "@/lib/use-async-resource";
import { EmptyRow, EmptyState, ErrorState, TableSkeleton } from "@/components/admin/async-states";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/imam-applications")({
  head: () => ({
    meta: [{ title: "Imam applications — MeetHaq admin" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): { section?: "pairings" } => ({
    section: search.section === "pairings" ? "pairings" : undefined,
  }),
  component: AdminImamApplications,
});

function AdminImamApplications() {
  const { section } = Route.useSearch();
  const listApps = useServerFn(listImamApplications);
  const review = useServerFn(reviewImamApplication);
  const toggle = useServerFn(setImamAccountActive);
  const listPairings = useServerFn(listAllPairings);

  const loadBoth = useCallback(
    async () => ({ apps: await listApps(), pairings: await listPairings() }),
    [listApps, listPairings],
  );
  const { status, data, error, retry, reload, refreshing } = useAsyncResource(loadBoth);
  const apps = data?.apps ?? null;
  const pairings = data?.pairings ?? null;

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [radius, setRadius] = useState<Record<string, number>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const pairingsRef = useRef<HTMLElement>(null);

  // "All pairings & meetups" on the overview links here with ?section=pairings,
  // so land on the pairings table instead of the top of the applications list.
  useEffect(() => {
    if (section !== "pairings" || status !== "ready") return;
    pairingsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [section, status]);

  const load = () => {
    setActionError(null);
    void reload();
  };

  if (status === "error") {
    return (
      <ErrorState
        title="Imam applications didn't load"
        message={error}
        onRetry={retry}
        retrying={refreshing}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl text-foreground">Imam applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approving an application adds the imam to the directory and unlocks their imam dashboard.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {actionError}
          </p>
        )}
        <div className="mt-4 space-y-4">
          {status === "loading" &&
            Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-5">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="mt-2 h-3 w-72" />
                <Skeleton className="mt-4 h-8 w-full" />
              </div>
            ))}
          {apps?.length === 0 && (
            <EmptyState
              title="No imam applications yet"
              message="When an imam applies through /imam-apply they'll appear here for approval. Nothing to review right now."
            />
          )}
          {(apps ?? []).map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {a.name} {a.mosque ? `· ${a.mosque}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[a.city, a.postcode, a.email, a.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">
                  {a.status}
                </span>
              </div>
              {a.credentials && (
                <p className="mt-2 text-xs text-muted-foreground">Credentials: {a.credentials}</p>
              )}
              {a.message && (
                <p className="mt-1 text-xs text-muted-foreground">Message: {a.message}</p>
              )}

              {a.status === "pending" && (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Admin note (shown to the applicant)"
                    value={notes[a.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Coverage radius (km)
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={radius[a.id] ?? 40}
                      onChange={(e) => setRadius((r) => ({ ...r, [a.id]: Number(e.target.value) }))}
                      className="w-20 rounded-lg border border-input bg-background px-2 py-1"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await review({
                            data: {
                              application_id: a.id,
                              decision: "approved",
                              admin_notes: notes[a.id] ?? null,
                              radius_km: radius[a.id] ?? 40,
                            },
                          });
                          load();
                        } catch (e) {
                          setActionError(
                            e instanceof Error ? e.message : "Could not approve this application",
                          );
                        }
                      }}
                      className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Approve & grant dashboard
                    </button>
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            `Decline ${a.name}'s application${a.mosque ? ` (${a.mosque})` : ""}?\n\nThey will not be added to the imam directory and will not get imam dashboard access.`,
                          )
                        )
                          return;
                        try {
                          await review({
                            data: {
                              application_id: a.id,
                              decision: "declined",
                              admin_notes: notes[a.id] ?? null,
                              radius_km: 40,
                            },
                          });
                          load();
                        } catch (e) {
                          setActionError(
                            e instanceof Error ? e.message : "Could not decline this application",
                          );
                        }
                      }}
                      className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {a.account && (
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Dashboard access: {a.account.active ? "active" : "revoked"} ·{" "}
                    {a.account.radius_km} km
                  </span>
                  <button
                    onClick={async () => {
                      const account = a.account!;
                      if (
                        account.active &&
                        !confirm(
                          `Revoke ${a.name}'s imam dashboard access?\n\nThey will immediately lose sight of their pairings and meetups. They stay in the imam directory and can be restored later.`,
                        )
                      )
                        return;
                      try {
                        await toggle({
                          data: { user_id: account.user_id, active: !account.active },
                        });
                        load();
                      } catch (e) {
                        setActionError(
                          e instanceof Error ? e.message : "Could not change dashboard access",
                        );
                      }
                    }}
                    className="underline hover:text-foreground"
                  >
                    {a.account.active ? "Revoke access" : "Restore access"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section ref={pairingsRef} id="pairings" className="scroll-mt-6">
        <h2 className="text-xl text-foreground">All pairings & meetups</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every pairing on the platform, the imam overseeing it, and how many meetups have been
          arranged.
        </p>
        {status === "loading" ? (
          <div className="mt-3">
            <TableSkeleton rows={4} columns={4} />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Members</th>
                  <th className="px-4 py-2">Imam</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Meetings</th>
                </tr>
              </thead>
              <tbody>
                {(pairings ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2">
                      {(p.a?.display_name ?? "Member") + " ↔ " + (p.b?.display_name ?? "Member")}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.imam ? `${p.imam.name} · ${p.imam.city}` : "Unassigned"}
                    </td>
                    <td className="px-4 py-2 capitalize">{p.status}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.meetups.length}</td>
                  </tr>
                ))}
                {pairings?.length === 0 && (
                  <EmptyRow
                    colSpan={4}
                    title="No pairings yet"
                    message="A pairing is created when two members accept each other's interest. Once that happens you can assign an imam here."
                  />
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
