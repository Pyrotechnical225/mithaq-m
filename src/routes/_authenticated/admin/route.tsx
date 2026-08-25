import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { amIAdmin } from "@/lib/admin.functions";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const checkAdmin = useServerFn(amIAdmin);
  const [access, setAccess] = useState<"checking" | "granted" | "denied" | "error">("checking");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  const verifyAccess = () => {
    setAccess("checking");
    setAccessError(null);
    checkAdmin()
      .then(({ isAdmin }) => setAccess(isAdmin ? "granted" : "denied"))
      .catch((error) => {
        setAccess("error");
        setAccessError(
          error instanceof Error ? error.message : "Admin access could not be checked.",
        );
      });
  };

  useEffect(() => {
    verifyAccess();
    const closeMenu = (event: KeyboardEvent) => event.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchAccount = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const navLinks = (
    <>
      <AdminLink to="/admin" label="Overview" exact onNavigate={() => setMenu(false)} />
      <AdminLink to="/admin/profiles" label="Profiles" onNavigate={() => setMenu(false)} />
      <AdminLink to="/admin/new-profile" label="New profile" onNavigate={() => setMenu(false)} />
      <AdminLink to="/admin/imams" label="Imams" onNavigate={() => setMenu(false)} />
      <AdminLink
        to="/admin/imam-applications"
        label="Imam applications"
        onNavigate={() => setMenu(false)}
      />
      <AdminLink to="/admin/memberships" label="Memberships" onNavigate={() => setMenu(false)} />
      <AdminLink
        to="/admin/compatibility"
        label="Compatibility"
        onNavigate={() => setMenu(false)}
      />
      <AdminLink to="/admin/seed" label="Seed data" onNavigate={() => setMenu(false)} />
      <Link
        to="/dashboard"
        onClick={() => setMenu(false)}
        className="rounded-full border border-border px-3 py-1.5 text-foreground hover:bg-accent"
      >
        User view
      </Link>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
              Admin
            </span>
            <span className="flex items-baseline gap-1">
              <BrandName className="text-lg" />
              <span className="text-sm text-muted-foreground">control</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm lg:flex">
            {access === "granted" ? navLinks : <Link to="/dashboard">User view</Link>}
          </nav>
          <button
            type="button"
            aria-label={menu ? "Close admin navigation" : "Open admin navigation"}
            aria-expanded={menu}
            onClick={() => setMenu((open) => !open)}
            className="rounded-xl border border-border p-2 lg:hidden"
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menu && (
          <nav className="grid gap-4 border-t border-border px-5 py-5 text-sm lg:hidden">
            {access === "granted" ? navLinks : <Link to="/dashboard">User view</Link>}
          </nav>
        )}
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        {access === "checking" && (
          <AccessPanel title="Checking admin access…">
            <p>Please wait while Mithaq verifies your signed-in account.</p>
          </AccessPanel>
        )}
        {access === "denied" && (
          <AccessPanel title="This account does not have admin access">
            <p>Sign out and use the Mithaq administrator account, then open this page again.</p>
            <button
              type="button"
              onClick={switchAccount}
              className="mt-5 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground"
            >
              Switch account
            </button>
          </AccessPanel>
        )}
        {access === "error" && (
          <AccessPanel title="Admin access could not be verified">
            <p>{accessError}</p>
            <button
              type="button"
              onClick={verifyAccess}
              className="mt-5 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground"
            >
              Try again
            </button>
          </AccessPanel>
        )}
        {access === "granted" && <Outlet />}
      </div>
    </div>
  );
}

function AdminLink({
  to,
  label,
  exact = false,
  onNavigate,
}: {
  to:
    | "/admin"
    | "/admin/profiles"
    | "/admin/new-profile"
    | "/admin/imams"
    | "/admin/imam-applications"
    | "/admin/memberships"
    | "/admin/compatibility"
    | "/admin/seed";
  label: string;
  exact?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="text-muted-foreground hover:text-foreground"
      activeOptions={{ exact }}
      activeProps={{ className: "font-medium text-foreground" }}
    >
      {label}
    </Link>
  );
}

function AccessPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-7 text-center shadow-[var(--shadow-soft)] sm:p-10">
      <h1 className="text-2xl text-foreground">{title}</h1>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}
