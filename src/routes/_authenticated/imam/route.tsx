import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { amIImam } from "@/lib/imam.functions";
import { BrandName } from "@/components/BrandName";

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
            <BrandName className="text-lg" />
          </Link>
          <Link
            to="/dashboard"
            className="rounded-full border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            My member view
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </div>
    </div>
  );
}
