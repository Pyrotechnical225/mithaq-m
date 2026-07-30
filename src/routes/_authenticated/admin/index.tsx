import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin overview — Mithaq" }, { name: "robots", content: "noindex" }] }),
  component: AdminHome,
});

function AdminHome() {
  const fetchStats = useServerFn(adminStats);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null);
  useEffect(() => { fetchStats().then(setStats); }, [fetchStats]);

  if (!stats) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground">Everything happening on Mithaq right now.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Profiles" value={stats.profileCount} />
        <Stat label="Completed surveys" value={stats.completedCount} />
        <Stat label="Discoverable" value={stats.discoverableCount} />
        <Stat label="Interests exchanged" value={stats.interestCount} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg text-foreground">Recent signups</h2>
          <Link to="/admin/profiles" className="text-xs text-primary hover:underline">
            View all profiles →
          </Link>
        </div>
        <ul className="mt-4 divide-y divide-border text-sm">
          {stats.recentUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2">
              <span className="text-foreground">{u.email}</span>
              <span className="text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleString() : ""}</span>
            </li>
          ))}
          {stats.recentUsers.length === 0 && (
            <li className="py-4 text-muted-foreground">No users yet.</li>
          )}
        </ul>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground">Admin controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct access to the spouse (member) and imam records — view, edit, add or delete.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-5">
            <h3 className="text-lg text-foreground">Spouses database</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Member profiles, survey answers, visibility and exports.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/admin/profiles" className="rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                Browse & edit profiles
              </Link>
              <Link to="/admin/new-profile" className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent">
                + Add profile
              </Link>
              <Link to="/admin/profiles" className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent">
                Export JSON / CSV
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border p-5">
            <h3 className="text-lg text-foreground">Imams database</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Imam directory: mosque, city, contact details and languages.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/admin/imams" className="rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                Browse & edit imams
              </Link>
              <Link to="/admin/imams" className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent">
                + Add imam
              </Link>
              <Link to="/admin/seed" className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent">
                Seed / clear example data
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
