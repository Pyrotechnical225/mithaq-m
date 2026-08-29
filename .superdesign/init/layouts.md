# Shared layouts

- `src/routes/__root.tsx`: document shell, global metadata, root providers, error and 404 surfaces.
- `src/components/SiteHeader.tsx`: sticky public navigation with account, admin, learning, and mobile states.
- `src/components/SiteFooter.tsx`: public footer and marriage-guidance navigation.
- `src/components/BrandName.tsx`: reusable Mithaq wordmark treatment.
- `src/routes/_authenticated/route.tsx`: authenticated member shell and session gate.
- `src/routes/_authenticated/admin/route.tsx`: protected admin workspace shell.
- `src/routes/_authenticated/imam/route.tsx`: protected imam workspace shell.

## `src/routes/__root.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mithaq — Building homes, the halal way" },
      {
        name: "description",
        content:
          "Meet haq in marriage with Mithaq. Find marriage-minded Muslims through shared deen, family values, life goals, wali involvement, and imam-supported introductions.",
      },
      { name: "author", content: "Mithaq" },
      { property: "og:title", content: "Mithaq — Building homes, the halal way" },
      {
        property: "og:description",
        content:
          "Meet haq in marriage with Mithaq. Find marriage-minded Muslims through shared deen, family values, life goals, wali involvement, and imam-supported introductions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Mithaq — Building homes, the halal way" },
      {
        name: "twitter:description",
        content:
          "Meet haq in marriage with Mithaq. Find marriage-minded Muslims through shared deen, family values, life goals, wali involvement, and imam-supported introductions.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5fda5e24-946e-4578-803d-8d2a7ebb1edc",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5fda5e24-946e-4578-803d-8d2a7ebb1edc",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
        integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
        crossOrigin: "",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only"
        >
          Skip to main content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

```

## `src/components/SiteHeader.tsx`

```tsx
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandName } from "@/components/BrandName";

const learnLinks = [
  { to: "/nikah", label: "Nikah" },
  { to: "/halal-relationships", label: "Halal relationships" },
  { to: "/mahr", label: "Mahr" },
  { to: "/wali", label: "Wali" },
  { to: "/community", label: "Community" },
] as const;

const homeLinks = [
  { href: "/#principles", label: "Our principles" },
  { href: "/#how", label: "How it works" },
  { href: "/#safety", label: "Safety" },
] as const;

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  const [verified, setVerified] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    setSignedIn(!!user);
    setVerified(!!user?.email_confirmed_at);

    if (user) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      setIsAdmin(!!roles?.some((role) => role.role === "admin"));
    } else {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const accountTo = signedIn ? "/dashboard" : "/auth";
  const accountLabel = signedIn ? "Dashboard" : "Sign in";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <BrandName className="text-[1.4rem]" />
          <span className="border-l border-border pl-3 font-arabic text-lg leading-none text-primary">
            ميثاق
          </span>
        </Link>

        <nav
          className="hidden items-center gap-8 text-sm font-medium text-muted-foreground lg:flex"
          aria-label="Main navigation"
        >
          {homeLinks.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}

          <div
            className="relative"
            onMouseEnter={() => setLearnOpen(true)}
            onMouseLeave={() => setLearnOpen(false)}
          >
            <button
              type="button"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
              aria-expanded={learnOpen}
              onClick={() => setLearnOpen((current) => !current)}
            >
              Learn <ChevronDown size={14} aria-hidden="true" />
            </button>
            {learnOpen ? (
              <div className="absolute left-0 top-full z-10 mt-3 w-56 rounded-lg border border-border bg-card p-2 shadow-[var(--shadow-elevated)]">
                {learnLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="block rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent"
                    activeProps={{
                      className: "block rounded-md px-3 py-2.5 text-sm bg-accent text-foreground",
                    }}
                    onClick={() => setLearnOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {signedIn && !verified ? (
            <Link
              to="/verify-email"
              className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
            >
              Verify email
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              to="/admin"
              className="rounded-md bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
            >
              Admin
            </Link>
          ) : null}
          <Link
            to={accountTo}
            className="rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-accent"
          >
            {accountLabel}
          </Link>
          {!signedIn ? (
            <Link
              to="/auth"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Get started
            </Link>
          ) : null}
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-foreground lg:hidden"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen((current) => !current)}
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {mobileOpen ? (
        <nav
          id="mobile-navigation"
          className="border-t border-border bg-card px-5 py-4 shadow-[var(--shadow-soft)] lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            {homeLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-3 text-sm font-medium text-foreground hover:bg-accent"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            {learnLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {signedIn && !verified ? (
              <Link
                to="/verify-email"
                className="rounded-md px-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10"
                onClick={() => setMobileOpen(false)}
              >
                Verify email
              </Link>
            ) : null}
            {isAdmin ? (
              <Link
                to="/admin"
                className="rounded-md px-3 py-3 text-sm font-semibold text-primary hover:bg-primary/10"
                onClick={() => setMobileOpen(false)}
              >
                Admin dashboard
              </Link>
            ) : null}
            <Link
              to={accountTo}
              className="mt-3 rounded-md bg-primary px-5 py-3 text-center text-sm font-semibold text-primary-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {signedIn ? "Go to dashboard" : "Sign in or get started"}
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

```

## `src/components/SiteFooter.tsx`

```tsx
import { Link } from "@tanstack/react-router";
import { BrandName } from "@/components/BrandName";

const footerLinks = [
  { href: "/#principles", label: "Our principles" },
  { href: "/#how", label: "How it works" },
  { href: "/#safety", label: "Safety" },
] as const;

const learningLinks = [
  { to: "/nikah", label: "Nikah" },
  { to: "/mahr", label: "Mahr" },
  { to: "/wali", label: "Wali" },
  { to: "/halal-relationships", label: "Halal relationships" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:px-8 lg:py-16">
        <div>
          <Link to="/" className="inline-flex items-center gap-3" aria-label="Mithaq home">
            <BrandName className="text-[1.4rem]" />
            <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
              ميثاق
            </span>
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">
            Meet haq in marriage through a private, respectful process supported by families and
            imams.
          </p>
        </div>

        <nav aria-label="About Mithaq">
          <p className="text-sm font-semibold text-foreground">About</p>
          <div className="mt-3 grid gap-2.5 text-sm text-muted-foreground">
            {footerLinks.map((link) => (
              <a key={link.href} href={link.href} className="w-fit hover:text-foreground">
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        <nav aria-label="Marriage guidance">
          <p className="text-sm font-semibold text-foreground">Learn</p>
          <div className="mt-3 grid gap-2.5 text-sm text-muted-foreground">
            {learningLinks.map((link) => (
              <Link key={link.to} to={link.to} className="w-fit hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <div className="border-t border-border px-5 py-5 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:px-3">
          <p>© {new Date().getFullYear()} Mithaq.</p>
          <p>Private matchmaking. Imam-supported introductions.</p>
        </div>
      </div>
    </footer>
  );
}

```

## `src/components/BrandName.tsx`

```tsx
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-sans font-semibold tracking-[-0.035em] ${className}`}
      aria-label="Mithaq"
    >
      <span className="text-foreground">Mithaq</span>
    </span>
  );
}

```

## `src/routes/_authenticated/route.tsx`

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        window.location.replace("/auth");
        return;
      }
      if (!data.user.email_confirmed_at) {
        window.location.replace("/verify-email");
        return;
      }
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Checking your account…</p>
      </div>
    );
  }

  return <Outlet />;
}

```

## `src/routes/_authenticated/admin/route.tsx`

```tsx
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

```

## `src/routes/_authenticated/imam/route.tsx`

```tsx
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
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-6">
          <Link to="/imam" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="border-l border-border pl-3 text-sm font-medium text-muted-foreground">
              Imam workspace
            </span>
          </Link>
          <Link
            to="/dashboard"
            className="rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent"
          >
            My member view
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

```
