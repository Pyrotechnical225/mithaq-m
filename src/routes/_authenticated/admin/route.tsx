import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/admin.functions";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset className="bg-background">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">Mithaq control</span>
        </header>
        {/* Admin density is deliberately tighter than the member side: admins
            get scannable tables, members get air. */}
        <div className="px-4 py-6 md:px-6">
          <Outlet />
          <p className="mt-8 text-right text-[10px] text-muted-foreground">{now}</p>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
