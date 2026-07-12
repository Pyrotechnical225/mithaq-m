import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/_admin")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const res = await amIAdmin();
      if (!res.isAdmin) throw redirect({ to: "/dashboard" });
    } catch (e) {
      // Any error -> not admin
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const [now, setNow] = useState("");
  useEffect(() => setNow(new Date().toLocaleString()), []);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
              Admin
            </span>
            <span className="font-display text-lg text-foreground">Mithaq control</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/admin" className="text-muted-foreground hover:text-foreground" activeOptions={{ exact: true }} activeProps={{ className: "text-foreground font-medium" }}>
              Overview
            </Link>
            <Link to="/admin/profiles" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
              Profiles
            </Link>
            <Link to="/admin/new-profile" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground font-medium" }}>
              New profile
            </Link>
            <Link to="/dashboard" className="rounded-full border border-border px-3 py-1 hover:bg-accent">
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
