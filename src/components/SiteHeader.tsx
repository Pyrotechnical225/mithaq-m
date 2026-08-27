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
