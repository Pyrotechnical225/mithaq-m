import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { LayoutDashboard, UserPlus } from "lucide-react";
import { amIImam } from "@/lib/imam.functions";

export const Route = createFileRoute("/_authenticated/imam")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const res = await amIImam();
      if (!res.isImam) throw redirect({ to: "/imam-apply" });
      return { imam: res.imam };
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/imam-apply" });
    }
  },
  component: ImamLayout,
});

function ImamLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/imam" className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
              Imam
            </span>
            <span className="font-display text-lg text-foreground">Mithaq</span>
          </Link>
          <Link
            to="/dashboard"
            className="rounded-full border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            My member view
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-6">
        <Outlet />
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
        aria-label="Imam dashboard"
      >
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Link
            to="/imam"
            activeOptions={{ exact: true }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm text-muted-foreground"
            activeProps={{ className: "bg-primary/10 font-medium text-primary" }}
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            Dashboard
          </Link>
          <Link
            to="/imam/refer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm text-muted-foreground"
            activeProps={{ className: "bg-primary/10 font-medium text-primary" }}
          >
            <UserPlus size={18} aria-hidden="true" />
            Refer imam
          </Link>
        </div>
      </nav>
    </div>
  );
}
