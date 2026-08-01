import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  listAllPairings,
  listImamApplications,
  reviewImamApplication,
  setImamAccountActive,
} from "@/lib/imam-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/imam-applications")({
  head: () => ({
    meta: [
      { title: "Imam applications — Mithaq admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminImamApplications,
});

function AdminImamApplications() {
  const listApps = useServerFn(listImamApplications);
  const review = useServerFn(reviewImamApplication);
  const toggle = useServerFn(setImamAccountActive);
  const listPairings = useServerFn(listAllPairings);

  const [apps, setApps] = useState<Awaited<ReturnType<typeof listImamApplications>> | null>(null);
  const [pairings, setPairings] = useState<Awaited<ReturnType<typeof listAllPairings>> | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [radius, setRadius] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    listApps().then(setApps).catch((e) => setError(String(e)));
    listPairings().then(setPairings).catch(() => undefined);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl text-foreground">Imam applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approving an application adds the imam to the directory and unlocks their imam dashboard.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 space-y-4">
          {apps?.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No applications yet.
            </p>
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
                <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">{a.status}</span>
              </div>
              {a.credentials && (
                <p className="mt-2 text-xs text-muted-foreground">Credentials: {a.credentials}</p>
              )}
              {a.message && <p className="mt-1 text-xs text-muted-foreground">Message: {a.message}</p>}

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
                        await review({
                          data: {
                            application_id: a.id,
                            decision: "approved",
                            admin_notes: notes[a.id] ?? null,
                            radius_km: radius[a.id] ?? 40,
                          },
                        });
                        load();
                      }}
                      className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Approve & grant dashboard
                    </button>
                    <button
                      onClick={async () => {
                        await review({
                          data: {
                            application_id: a.id,
                            decision: "declined",
                            admin_notes: notes[a.id] ?? null,
                            radius_km: 40,
                          },
                        });
                        load();
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
                    Dashboard access: {a.account.active ? "active" : "revoked"} · {a.account.radius_km} km
                  </span>
                  <button
                    onClick={async () => {
                      await toggle({
                        data: { user_id: a.account!.user_id, active: !a.account!.active },
                      });
                      load();
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

      <section>
        <h2 className="text-xl text-foreground">All pairings</h2>
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
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No pairings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
