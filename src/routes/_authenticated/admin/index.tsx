import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { adminStats } from "@/lib/admin.functions";

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

  const loadStats = () => {
    setError(null);
    fetchStats()
      .then(setStats)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Admin overview could not load.");
      });
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <section className="rounded-3xl border border-destructive/30 bg-card p-7 text-center">
        <h1 className="text-2xl text-foreground">Admin overview could not load</h1>
        <p className="mt-3 text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={loadStats}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!stats) return <p className="text-sm text-muted-foreground">Loading admin overview…</p>;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Admin workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Overview
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A clear view of members, introductions, and work that needs attention.
        </p>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border">
        <Stat label="Profiles" value={stats.profileCount} />
        <Stat label="Completed surveys" value={stats.completedCount} />
        <Stat label="Discoverable" value={stats.discoverableCount} />
        <Stat label="Interests exchanged" value={stats.interestCount} />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
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

      <section className="border-t border-border pt-7">
        <h2 className="text-xl font-semibold text-foreground">Common tasks</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Shortcuts to the main operational areas. Full navigation is always available on the left.
        </p>

        <div className="mt-5 grid gap-x-8 md:grid-cols-2">
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
            title="Compatibility scoring audit"
            body="Compare the fixed-rubric score, OpenAI review and final weighted result for every generated match."
            actions={[{ to: "/admin/compatibility", label: "Compare scores", primary: true }]}
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
    </div>
  );
}

type Action = { to: string; label: string; primary?: boolean };

function ControlCard({ title, body, actions }: { title: string; body: string; actions: Action[] }) {
  return (
    <article className="border-t border-border py-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Link
            key={`${a.to}-${i}`}
            to={a.to}
            className={
              a.primary
                ? "rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                : "rounded-md border border-border bg-card px-3.5 py-2 text-xs hover:bg-accent"
            }
          >
            {a.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-border p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:[&:nth-child(odd)]:border-r-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-foreground">{value}</p>
    </div>
  );
}
