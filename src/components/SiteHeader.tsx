import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const learnLinks = [
  { to: "/nikah", label: "Nikah" },
  { to: "/halal-relationships", label: "Halal relationships" },
  { to: "/mahr", label: "Mahr" },
  { to: "/wali", label: "Wali" },
  { to: "/community", label: "Community" },
] as const;

export function SiteHeader() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link to="/" className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <span className="font-arabic text-lg">م</span>
        </div>
        <span className="font-display text-xl font-semibold text-foreground">Mithaq</span>
      </Link>
      <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
        <div
          className="relative"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            className="flex items-center gap-1 hover:text-foreground"
            onClick={() => setOpen((o) => !o)}
          >
            Learn <span className="text-xs">▾</span>
          </button>
          {open && (
            <div className="absolute left-0 top-full z-10 w-56 rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-elevated)]">
              {learnLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  activeProps={{ className: "block rounded-md px-3 py-2 text-sm bg-accent text-foreground" }}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        <Link
          to={signedIn ? "/dashboard" : "/auth"}
          className="rounded-full border border-border px-4 py-1.5 text-foreground hover:bg-accent"
        >
          {signedIn ? "Dashboard" : "Sign in"}
        </Link>
      </nav>
    </header>
  );
}
