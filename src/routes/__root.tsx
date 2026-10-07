import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { VercelObservability } from "../components/VercelObservability";
import { ScrollReveal } from "../components/ScrollReveal";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const NOT_FOUND_LINKS = [
  { to: "/", label: "Home", hint: "Start from the beginning" },
  { to: "/nikah", label: "Nikah", hint: "The Islamic marriage contract" },
  { to: "/wali", label: "Wali", hint: "Family and guardian involvement" },
  { to: "/privacy", label: "Privacy", hint: "How your information is protected" },
] as const;

function NotFoundComponent() {
  useEffect(() => {
    document.title = "Page not found — Mithaq";
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main
        id="main-content"
        className="relative flex flex-1 items-center overflow-hidden px-5 py-16 sm:py-24"
      >
        <div aria-hidden="true">
          <span className="idle-orb -left-24 top-10 h-72 w-72 bg-primary/25" />
          <span
            className="idle-orb -right-20 bottom-0 h-80 w-80 bg-gold/30"
            style={{ animationDelay: "-9s" }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-2xl text-center">
          <p
            aria-hidden="true"
            dir="rtl"
            lang="ar"
            className="idle-breathe font-arabic text-5xl text-primary/80 sm:text-6xl"
          >
            ميثاق
          </p>
          <p className="idle-float mt-4 text-7xl font-semibold tracking-[-0.06em] text-foreground sm:text-8xl">
            404
          </p>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
            This page could not be found
          </h1>
          <p className="mx-auto mt-3 max-w-md leading-7 text-muted-foreground">
            The link may be old or mistyped. Everything else on Mithaq is still here — choose where
            you would like to go next.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Back to home <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card px-6 py-3 font-semibold text-foreground hover:bg-accent"
            >
              Sign in
            </Link>
          </div>

          <ul className="mt-12 grid gap-3 text-left sm:grid-cols-2">
            {NOT_FOUND_LINKS.map((link, index) => (
              <li key={link.to} data-reveal style={{ "--reveal-index": index } as CSSProperties}>
                <Link
                  to={link.to}
                  className="hover-lift flex items-center justify-between gap-4 rounded-md border border-border bg-card px-5 py-4"
                >
                  <span>
                    <span className="block font-semibold text-foreground">{link.label}</span>
                    <span className="block text-sm text-muted-foreground">{link.hint}</span>
                  </span>
                  <ArrowRight size={17} className="shrink-0 text-primary" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <SiteFooter />
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
      {
        name: "google-site-verification",
        content: "KEHDyHTeZNrFcNwxKeI5-ZV4OE2RtAr4wq54Fz1CzsU",
      },
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
        <ScrollReveal />
        <VercelObservability />
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
