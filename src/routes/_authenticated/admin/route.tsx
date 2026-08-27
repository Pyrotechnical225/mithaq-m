import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { amIAdmin } from "@/lib/admin.functions";

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

  const mainLinks = (
    <>
      <AdminLink to="/admin" label="Overview" exact onNavigate={() => setMenu(false)} />
      <AdminLink to="/admin/profiles" label="Member profiles" onNavigate={() => setMenu(false)} />
      <AdminLink to="/admin/new-profile" label="Add a profile" onNavigate={() => setMenu(false)} />
      <AdminLink to="/admin/imams" label="Imams" onNavigate={() => setMenu(false)} />
      <AdminLink
        to="/admin/imam-applications"
        label="Imam applications"
        onNavigate={() => setMenu(false)}
      />
      <AdminLink
        to="/admin/compatibility"
        label="Compatibility audit"
        onNavigate={() => setMenu(false)}
      />
    </>
  );

  const systemLinks = (
    <>
      <AdminLink to="/admin/seed" label="Example data" onNavigate={() => setMenu(false)} />
      <Link
        to="/dashboard"
        onClick={() => setMenu(false)}
        className="block border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition hover:border-border hover:bg-accent hover:text-foreground"
      >
        Open member view
      </Link>
    </>
  );

  const navigation =
    access === "granted" ? (
      <>
        <div>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Operations
          </p>
          <div className="mt-2 grid gap-1">{mainLinks}</div>
        </div>
        <div className="mt-8">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            System
          </p>
          <div className="mt-2 grid gap-1">{systemLinks}</div>
        </div>
      </>
    ) : (
      <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
        Open member view
      </Link>
    );

  return (
    <div className="min-h-screen bg-secondary/25">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-[4.5rem] max-w-[90rem] items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link to="/admin" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="border-l border-border pl-3 text-sm font-medium text-muted-foreground">
              Admin workspace
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="hidden rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-accent sm:inline-flex"
            >
              Member view
            </Link>
            <button
              type="button"
              aria-label={menu ? "Close admin navigation" : "Open admin navigation"}
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
              className="rounded-md border border-border p-2 lg:hidden"
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu ? (
          <nav
            className="border-t border-border bg-card px-5 py-5 lg:hidden"
            aria-label="Admin navigation"
          >
            {navigation}
          </nav>
        ) : null}
      </header>

      <div className="mx-auto grid max-w-[90rem] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4.5rem)] border-r border-border bg-card px-5 py-8 lg:block">
          <nav className="sticky top-24" aria-label="Admin navigation">
            {navigation}
          </nav>
        </aside>

        <main id="main-content" className="min-w-0 px-5 py-8 sm:px-6 lg:px-10 lg:py-10">
          {access === "checking" ? (
            <AccessPanel title="Checking admin access…">
              <p>Please wait while Mithaq verifies your signed-in account.</p>
            </AccessPanel>
          ) : null}
          {access === "denied" ? (
            <AccessPanel title="This account does not have admin access">
              <p>Sign out and use the Mithaq administrator account, then open this page again.</p>
              <button
                type="button"
                onClick={switchAccount}
                className="mt-5 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground"
              >
                Switch account
              </button>
            </AccessPanel>
          ) : null}
          {access === "error" ? (
            <AccessPanel title="Admin access could not be verified">
              <p>{accessError}</p>
              <button
                type="button"
                onClick={verifyAccess}
                className="mt-5 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground"
              >
                Try again
              </button>
            </AccessPanel>
          ) : null}
          {access === "granted" ? <Outlet /> : null}
        </main>
      </div>
    </div>
  );
}

type AdminPath =
  | "/admin"
  | "/admin/profiles"
  | "/admin/new-profile"
  | "/admin/imams"
  | "/admin/imam-applications"
  | "/admin/compatibility"
  | "/admin/seed";

function AdminLink({
  to,
  label,
  exact = false,
  onNavigate,
}: {
  to: AdminPath;
  label: string;
  exact?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="block border-l-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition hover:border-border hover:bg-accent hover:text-foreground"
      activeOptions={{ exact }}
      activeProps={{
        className:
          "block border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm font-medium text-foreground",
      }}
    >
      {label}
    </Link>
  );
}

function AccessPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-xl rounded-lg border border-border bg-card p-7 text-center sm:p-10">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}
