import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { amIAdmin } from "@/lib/admin.functions";
import { amIImam } from "@/lib/imam.functions";
import { generateMatches } from "@/lib/matches.functions";
import { getMyPrivacy } from "@/lib/privacy.functions";
import { getMyAnswers } from "@/lib/survey.functions";
import { PairingsSection } from "@/components/PairingsSection";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Your Mithaq journey" }, { name: "robots", content: "noindex" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const fetchAnswers = useServerFn(getMyAnswers);
  const fetchPrivacy = useServerFn(getMyPrivacy);
  const scoreProfiles = useServerFn(generateMatches);
  const checkAdmin = useServerFn(amIAdmin);
  const checkImam = useServerFn(amIImam);
  const [completed, setCompleted] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isImam, setIsImam] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    Promise.all([fetchAnswers(), fetchPrivacy(), checkAdmin(), checkImam()]).then(
      ([a, p, admin, imam]) => {
        setCompleted(!!a?.completed);
        setDiscoverable(p?.visibility === "discoverable");
        setIsAdmin(!!admin.isAdmin);
        setIsImam(!!imam.isImam);
      },
    );
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };
  const begin = async () => {
    setRunning(true);
    setMessage(null);
    try {
      await scoreProfiles();
      setMessage(
        "Your survey has been analysed privately. Only matches scoring 70% or higher are sent to an imam for review.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Matching could not start");
    } finally {
      setRunning(false);
    }
  };

  const links = (
    <>
      <Link to="/settings" onClick={() => setMenu(false)}>
        Privacy & settings
      </Link>
      {isImam && (
        <Link to="/imam" onClick={() => setMenu(false)}>
          Imam dashboard
        </Link>
      )}
      {isAdmin && (
        <Link to="/admin" onClick={() => setMenu(false)}>
          Admin dashboard
        </Link>
      )}
      <button onClick={signOut} className="text-left">
        Sign out
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="font-display text-xl text-foreground">
            م Mithaq
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {links}
          </nav>
          <button
            type="button"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
            className="rounded-xl border border-border p-2 md:hidden"
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menu && (
          <nav className="grid gap-4 border-t border-border px-5 py-5 text-sm md:hidden">
            {links}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-5xl space-y-7 px-5 py-8 sm:py-12">
        <section className="rounded-3xl bg-primary p-7 text-primary-foreground sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Your private journey
          </p>
          <h1 className="mt-3 text-3xl sm:text-4xl">The imam sees compatibility before you do.</h1>
          <p className="mt-4 max-w-3xl leading-7 text-primary-foreground/80">
            AI compares completed opposite-gender profiles. Only scores of 70% or more reach an
            imam. The imam reviews both full profiles first; members only see anonymous profiles
            after approval.
          </p>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <Step n="1" title="Complete your survey" done={completed}>
            <Link to="/survey" className="text-sm font-medium text-primary underline">
              {completed ? "Review answers" : "Start survey"}
            </Link>
          </Step>
          <Step n="2" title="Become discoverable" done={discoverable}>
            <Link to="/settings" className="text-sm font-medium text-primary underline">
              Open privacy settings
            </Link>
          </Step>
          <Step n="3" title="Private AI analysis" done={false}>
            <button
              disabled={!completed || !discoverable || running}
              onClick={begin}
              className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40"
            >
              {running ? "Analysing…" : "Submit for matching"}
            </button>
          </Step>
        </section>
        {message && (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            {message}
          </p>
        )}
        <PairingsSection />
        <section className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-xl text-foreground">What happens next?</h2>
          <ol className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <li>1. Imam approves or declines the private AI suggestion.</li>
            <li>2. Both members independently review anonymous profiles.</li>
            <li>3. If both accept, each pays £39 securely.</li>
            <li>4. Each selects online or face-to-face.</li>
            <li>5. The imam arranges the meeting with both families.</li>
            <li>6. The imam supports the process towards marriage.</li>
          </ol>
        </section>
      </main>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: string;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {done ? "✓" : n}
        </span>
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}
