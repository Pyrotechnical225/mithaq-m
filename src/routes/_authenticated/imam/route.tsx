import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { amIImam } from "@/lib/imam.functions";
import { BrandName } from "@/components/BrandName";

export const Route = createFileRoute("/_authenticated/imam")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const res = await amIImam();
      if (!res.isImam) throw redirect({ to: "/imam-apply" });
      if (res.mfaRequired) {
        throw redirect({ to: "/security", search: { next: "/imam" } });
      }
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
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6">
          <Link to="/imam" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="hidden border-l border-border pl-3 text-sm font-medium text-muted-foreground sm:inline">
              Imam workspace
            </span>
          </Link>
          <Link
            to="/dashboard"
            className="rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent"
          >
            Member view
          </Link>
        </div>
      </header>
      <main id="main-content" className="imam-content mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
