import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      throw redirect({ to: "/auth" });
    }

    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
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
