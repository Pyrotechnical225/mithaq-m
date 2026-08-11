import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { listAllProfiles } from "@/lib/admin.functions";
import { listMemberships, setComplimentaryMembership } from "@/lib/membership.functions";

export const Route = createFileRoute("/_authenticated/admin/memberships")({
  head: () => ({
    meta: [{ title: "Memberships — MeetHaq admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminMemberships,
});

type Row = {
  id: string;
  email: string | null;
  plan: string;
  status: string;
  period_end: string | null;
};

const ACTIVE = ["active", "trialing", "complimentary"];

function AdminMemberships() {
  const fetchProfiles = useServerFn(listAllProfiles);
  const fetchMemberships = useServerFn(listMemberships);
  const grant = useServerFn(setComplimentaryMembership);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [profiles, subs] = await Promise.all([fetchProfiles(), fetchMemberships()]);
    const subMap = new Map(subs.map((s) => [s.user_id, s]));
    setRows(
      profiles.map((p) => {
        const s = subMap.get(p.id);
        return {
          id: p.id,
          email: p.contact_email ?? p.auth_email,
          plan: s?.plan ?? "none",
          status: s?.status ?? "inactive",
          period_end: s?.current_period_end ?? null,
        };
      }),
    );
  }, [fetchProfiles, fetchMemberships]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (userId: string, give: boolean) => {
    setBusy(userId);
    setError("");
    try {
      await grant({ data: { user_id: userId, grant: give } });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update membership");
    } finally {
      setBusy(null);
    }
  };

  if (!rows) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const filtered = rows.filter((r) =>
    query ? (r.email ?? "").toLowerCase().includes(query.toLowerCase()) : true,
  );
  const activeCount = rows.filter((r) => ACTIVE.includes(r.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-foreground">Memberships</h1>
        <p className="text-sm text-muted-foreground">
          {activeCount} of {rows.length} members currently have access to matches. Grant
          complimentary membership to anyone who should not be charged.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by email"
        className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Renews / ends</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => {
              const isActive = ACTIVE.includes(r.status);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-foreground">{r.email ?? r.id}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.plan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        isActive
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.period_end ? new Date(r.period_end).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={busy === r.id}
                      onClick={() => toggle(r.id, r.plan !== "complimentary")}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
                    >
                      {busy === r.id
                        ? "Saving…"
                        : r.plan === "complimentary"
                          ? "Revoke complimentary"
                          : "Grant complimentary"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No members match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
