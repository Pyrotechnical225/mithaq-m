import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminStats } from "@/lib/admin.functions";
import { ImamReferralQueue } from "@/components/admin/ImamReferralQueue";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [{ title: "Admin overview — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminHome,
});

function AdminHome() {
  const fetchStats = useServerFn(adminStats);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchStats()
      .then((nextStats) => {
        if (active) setStats(nextStats);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load the admin overview");
        }
      });
    return () => {
      active = false;
    };
  }, [fetchStats, reloadKey]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 text-center">
        <h1 className="text-xl text-foreground">Admin overview could not load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className="mt-5 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        Loading admin overview…
      </div>
    );
  }

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
              <span className="text-xs text-muted-foreground">
                {u.created_at ? new Date(u.created_at).toLocaleString() : ""}
              </span>
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
          Everything this admin account can do, in one place.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ControlCard
            title="Spouses database"
            body="Member profiles, survey answers, visibility and exports."
            actions={[
              { to: "/admin/profiles", label: "Browse & edit profiles", primary: true },
              { to: "/admin/new-profile", label: "+ Add profile" },
              { to: "/admin/profiles", label: "Export JSON / CSV" },
            ]}
          />

          <ControlCard
            title="Imams database"
            body="Imam directory: mosque, city, contact details and languages."
            actions={[
              { to: "/admin/imams", label: "Browse & edit imams", primary: true },
              { to: "/admin/imams", label: "+ Add imam" },
              { to: "/admin/seed", label: "Seed / clear example data" },
            ]}
          />

          <ControlCard
            title="Imam applications & pairings"
            body="Approve or decline imam applicants, activate or suspend imam dashboard access, and oversee every pairing and arranged meetup."
            actions={[
              { to: "/admin/imam-applications", label: "Review applications", primary: true },
              { to: "/admin/imam-applications", label: "All pairings & meetups" },
            ]}
          />

          <ControlCard
            title="Example & demo data"
            body="Seed example members and imams for testing, then clear them out again in one click."
            actions={[{ to: "/admin/seed", label: "Seed data tools", primary: true }]}
          />

          <ControlCard
            title="Member experience"
            body="Open the platform exactly as a member sees it — survey, privacy controls, matches, location and imam picker."
            actions={[
              { to: "/dashboard", label: "Open user dashboard", primary: true },
              { to: "/survey", label: "Survey" },
              { to: "/settings", label: "Privacy settings" },
            ]}
          />
        </div>
      </section>

      <ImamReferralQueue />
    </div>
  );
}

type Action = { to: string; label: string; primary?: boolean };

function ControlCard({ title, body, actions }: { title: string; body: string; actions: Action[] }) {
  return (
    <div className="rounded-xl border border-border p-5">
      <h3 className="text-lg text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Link
            key={`${a.to}-${i}`}
            to={a.to}
            className={
              a.primary
                ? "rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                : "rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent"
            }
          >
            {a.label}
          </Link>
        ))}
      </div>
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
