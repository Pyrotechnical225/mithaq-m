import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

function AdminLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Link
        to="/admin"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeOptions={{ exact: true }}
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        Overview
      </Link>
      <Link
        to="/admin/profiles"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        Profiles
      </Link>
      <Link
        to="/admin/new-profile"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        New profile
      </Link>
      <Link
        to="/admin/imams"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        Imams
      </Link>
      <Link
        to="/admin/imam-applications"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        Imam applications
      </Link>
      <Link
        to="/admin/memberships"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        Memberships
      </Link>
      <Link
        to="/admin/seed"
        className="rounded-xl px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        activeProps={{ className: "rounded-xl bg-accent px-3 py-2 font-medium text-foreground" }}
        onClick={onNavigate}
      >
        Seed data
      </Link>
      <Link
        to="/dashboard"
        className="rounded-xl border border-border px-3 py-2 text-foreground hover:bg-accent"
        onClick={onNavigate}
      >
        User view
      </Link>
    </>
  );
}

function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState("");

  useEffect(() => setNow(new Date().toLocaleString()), []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
          <Link
            to="/admin"
            className="flex min-w-0 items-center gap-2"
            onClick={() => setMobileOpen(false)}
          >
            <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
              Admin
            </span>
            <span className="truncate font-display text-lg text-foreground">Mithaq control</span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="Admin navigation">
            <AdminLinks />
          </nav>

          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground lg:hidden"
            aria-label={mobileOpen ? "Close admin menu" : "Open admin menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>

        {mobileOpen ? (
          <nav
            className="border-t border-border bg-card px-5 py-4 text-sm shadow-[var(--shadow-soft)] lg:hidden"
            aria-label="Mobile admin navigation"
          >
            <div className="mx-auto grid max-w-6xl gap-1">
              <AdminLinks onNavigate={() => setMobileOpen(false)} />
            </div>
          </nav>
        ) : null}
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
        <Outlet />
        <p className="mt-8 text-right text-[10px] text-muted-foreground">{now}</p>
      </div>
    </div>
  );
}
