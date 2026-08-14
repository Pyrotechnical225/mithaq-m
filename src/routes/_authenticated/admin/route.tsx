import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/admin.functions";
import { BrandName } from "@/components/BrandName";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async (): Promise<{ adminCheckError: string | null }> => {
    // A failed role check and a genuine "not an admin" are different things.
    // Only the latter may bounce the user; the former has to be visible,
    // otherwise a Supabase outage is indistinguishable from a permissions
    // decision and a real admin gets silently redirected with no explanation.
    let isAdmin: boolean;
    try {
      const result = await amIAdmin();
      isAdmin = !!result.isAdmin;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The admin permission check did not complete";
      // An expired or missing session is an auth problem, not an outage.
      if (message.startsWith("Unauthorized")) throw redirect({ to: "/auth" });
      return { adminCheckError: message };
    }

    if (!isAdmin) throw redirect({ to: "/dashboard" });
    return { adminCheckError: null };
  },
  component: AdminLayout,
});

function AdminCheckFailed({ message }: { message: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h1 className="text-lg font-medium text-foreground">
          We couldn't confirm your admin access
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is not a permissions decision — the check itself failed to complete, so we've kept
          you here rather than sending you away.
        </p>
        <p className="mt-2 rounded-lg bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
          {message}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              setRetrying(true);
              try {
                await router.invalidate();
              } finally {
                setRetrying(false);
              }
            }}
            disabled={retrying}
            className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {retrying ? "Checking…" : "Try again"}
          </button>
          <Link
            to="/dashboard"
            className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-accent"
          >
            Go to my dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminLayout() {
  const { adminCheckError } = Route.useRouteContext();
  const [now, setNow] = useState("");
  useEffect(() => setNow(new Date().toLocaleString()), []);

  if (adminCheckError) return <AdminCheckFailed message={adminCheckError} />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
              Admin
            </span>
            <span className="flex items-baseline gap-1">
              <BrandName className="text-lg" />
              <span className="text-sm text-muted-foreground">control</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/admin"
              className="text-muted-foreground hover:text-foreground"
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Overview
            </Link>
            <Link
              to="/admin/profiles"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Profiles
            </Link>
            <Link
              to="/admin/new-profile"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              New profile
            </Link>
            <Link
              to="/admin/imams"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Imams
            </Link>
            <Link
              to="/admin/imam-applications"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Imam applications
            </Link>
            <Link
              to="/admin/memberships"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Memberships
            </Link>
            {/* Compatibility is two pages, grouped rather than added as a
                tenth top-level link — the nav already wraps badly. */}
            <span className="flex items-center gap-2 rounded-full border border-border px-3 py-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Compatibility
              </span>
              <Link
                to="/admin/compatibility"
                className="text-muted-foreground hover:text-foreground"
                activeOptions={{ exact: true }}
                activeProps={{ className: "text-foreground font-medium" }}
              >
                Audit
              </Link>
              <Link
                to="/admin/compatibility/matrix"
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                Matrix
              </Link>
            </span>

            <Link
              to="/admin/seed"
              className="text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Seed data
            </Link>
            <Link
              to="/dashboard"
              className="rounded-full border border-border px-3 py-1 hover:bg-accent"
            >
              User view
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
        <p className="mt-8 text-right text-[10px] text-muted-foreground">{now}</p>
      </div>
    </div>
  );
}
