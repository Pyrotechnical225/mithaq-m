import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { adminStats } from "@/lib/admin.functions";
import { useAsyncResource } from "@/lib/use-async-resource";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  PageHeadingSkeleton,
  StatGridSkeleton,
} from "@/components/admin/async-states";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [{ title: "Admin overview — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminHome,
});

function AdminHome() {
  const fetchStats = useServerFn(adminStats);
  const { status, data: stats, error, retry, refreshing } = useAsyncResource(fetchStats);

  if (status === "error") {
    return (
      <ErrorState
        title="The overview didn't load"
        message={error}
        onRetry={retry}
        retrying={refreshing}
      />
    );
  }

  if (status === "loading" || !stats) {
    return (
      <div className="space-y-8">
        <PageHeadingSkeleton />
        <StatGridSkeleton />
        <div className="rounded-2xl border border-border bg-card p-6">
          <PageHeadingSkeleton />
        </div>
        <CardGridSkeleton count={4} />
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
            <li className="py-4">
              <EmptyState
                title="No members have signed up yet"
                message="Once someone registers they'll appear here. To try the flows now, seed the example members."
                action={
                  <Link
                    to="/admin/seed"
                    className="rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    Seed example data
                  </Link>
                }
              />
            </li>
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
          >
            <Link to="/admin/profiles" className={PRIMARY_ACTION}>
              Browse & edit profiles
            </Link>
            <Link to="/admin/new-profile" className={SECONDARY_ACTION}>
              + Add profile
            </Link>
            <Link to="/admin/profiles" search={{ export: true }} className={SECONDARY_ACTION}>
              Export JSON / CSV
            </Link>
          </ControlCard>

          <ControlCard
            title="Imams database"
            body="Imam directory: mosque, city, contact details and languages."
          >
            <Link to="/admin/imams" className={PRIMARY_ACTION}>
              Browse & edit imams
            </Link>
            <Link to="/admin/imams" search={{ add: true }} className={SECONDARY_ACTION}>
              + Add imam
            </Link>
            <Link to="/admin/seed" className={SECONDARY_ACTION}>
              Seed / clear example data
            </Link>
          </ControlCard>

          <ControlCard
            title="Imam applications & pairings"
            body="Approve or decline imam applicants, activate or suspend imam dashboard access, and oversee every pairing and arranged meetup."
          >
            <Link to="/admin/imam-applications" className={PRIMARY_ACTION}>
              Review applications
            </Link>
            <Link
              to="/admin/imam-applications"
              search={{ section: "pairings" }}
              className={SECONDARY_ACTION}
            >
              All pairings & meetups
            </Link>
          </ControlCard>

          <ControlCard
            title="Memberships & billing"
            body="See who has an active membership, grant or revoke complimentary access, and check plan renewal dates."
          >
            <Link to="/admin/memberships" className={PRIMARY_ACTION}>
              Manage memberships
            </Link>
            <Link to="/membership" className={SECONDARY_ACTION}>
              Member-facing plans
            </Link>
          </ControlCard>

          <ControlCard
            title="Compatibility scoring audit"
            body="Compare the fixed-rubric score, OpenAI review and final weighted result for every generated match."
          >
            <Link to="/admin/compatibility" className={PRIMARY_ACTION}>
              Compare scores
            </Link>
            {/* A raw JSON endpoint, not a router page — a <Link> here would 404. */}
            <a
              href="/api/public/compatibility-status"
              target="_blank"
              rel="noreferrer"
              className={SECONDARY_ACTION}
            >
              OpenAI status (raw JSON)
            </a>
          </ControlCard>

          <ControlCard
            title="Example & demo data"
            body="Seed example members and imams for testing, then clear them out again in one click."
          >
            <Link to="/admin/seed" className={PRIMARY_ACTION}>
              Seed data tools
            </Link>
          </ControlCard>

          <ControlCard
            title="Member experience"
            body="Open the platform exactly as a member sees it — survey, privacy controls, matches, location and imam picker."
          >
            <Link to="/dashboard" className={PRIMARY_ACTION}>
              Open user dashboard
            </Link>
            <Link to="/survey" className={SECONDARY_ACTION}>
              Survey
            </Link>
            <Link to="/settings" className={SECONDARY_ACTION}>
              Privacy settings
            </Link>
          </ControlCard>
        </div>
      </section>
    </div>
  );
}

const PRIMARY_ACTION =
  "rounded-full bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90";
const SECONDARY_ACTION = "rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent";

/**
 * Actions are passed as real <Link> children rather than a `{ to: string }`
 * array: the widened string form gave up TanStack's route typing, which is how
 * three of these buttons ended up pointing somewhere that didn't do what the
 * label said.
 */
function ControlCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <h3 className="text-lg text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
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
