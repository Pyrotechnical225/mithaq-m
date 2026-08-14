import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/")({
  component: Index,
});

const principles = [
  {
    icon: HeartHandshake,
    title: "Deen comes first",
    body: "Compatibility begins with faith, practice, and shared Islamic values — not surface-level filters.",
  },
  {
    icon: Users,
    title: "Wali involvement",
    body: "Guardians are welcomed into the process so every conversation can remain dignified and halal.",
  },
  {
    icon: UserRoundCheck,
    title: "Serious intentions",
    body: "Every profile is here for nikah, insha'Allah. No swiping, no games — only intentional matches.",
  },
] as const;

/**
 * The front page leads with the journey rather than a claim, so these five
 * stages are the page's primary content. `who` states who can see the member's
 * information at each stage — the reassurance is attached to the step it
 * belongs to, rather than buried in a settings page.
 */
const journey = [
  {
    n: "1",
    title: "Complete your profile",
    body: "Nine sections, about twelve minutes. Save and return whenever you like — nothing is submitted until you are ready.",
    who: "Visible to: you only",
  },
  {
    n: "2",
    title: "Set your visibility",
    body: "You choose whether you can be found at all, and you can pause it at any time without losing your answers.",
    who: "Visible to: you only",
  },
  {
    n: "3",
    title: "Receive considered introductions",
    body: "Weighted toward religious practice, marriage intentions and family expectations — not appearance or activity.",
    who: "Visible to: you only",
  },
  {
    n: "4",
    title: "Express interest",
    body: "Nothing of yours is shared until you have both agreed. Contact details come last, never first.",
    who: "Shared with the other person only once you both accept",
  },
  {
    n: "5",
    title: "Meet with an imam",
    body: "A local imam oversees the introduction from there — the same person, from first meeting through to nikah.",
    who: "Introduced once you and your match have both accepted",
    key: true,
  },
] as const;

const safeguards = [
  "Built for marriage, not casual dating",
  "Wali-friendly communication",
  "Private information stays protected",
  "Clear reporting and moderation tools",
] as const;

function Index() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const ctaTo = signedIn ? "/dashboard" : "/auth";
  const ctaLabel = signedIn ? "Go to dashboard" : "Start your journey";

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />

      <main>
        {/*
          Carries id="how": the header's "How it works" link points at /#how,
          and the journey rail is now what that link is describing. Removing the
          old section without rehoming the anchor left the nav item dead.
        */}
        <section id="how" className="relative scroll-mt-24">
          <div className="mx-auto max-w-7xl px-5 pb-20 pt-14 lg:px-8 lg:pb-24 lg:pt-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-[var(--shadow-soft)]">
                <span className="h-2 w-2 rounded-full bg-azure" />A halal path to marriage
              </div>

              <h1 className="mt-7 max-w-[18ch] font-display text-4xl leading-[1.06] tracking-tight text-foreground sm:text-5xl">
                Five steps, and an imam at the end of them.
              </h1>

              <p className="mt-6 text-base leading-7 text-muted-foreground sm:text-lg">
                No swiping and no open browsing. Here is exactly what happens, and who can see what
                at each stage.
              </p>
            </div>

            <ol className="mt-12 lg:mt-16">
              {journey.map((stage) => {
                const highlighted = "key" in stage && stage.key;
                return (
                  <li
                    key={stage.n}
                    className={
                      highlighted
                        ? "mt-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-6 sm:px-7"
                        : "border-t border-border py-6 first:border-t-0 first:pt-0"
                    }
                  >
                    <div className="grid grid-cols-[2.5rem_1fr] gap-4 sm:grid-cols-[3.5rem_1fr] sm:gap-7">
                      <span
                        className={`font-display text-3xl font-light leading-none tabular-nums sm:text-4xl ${
                          highlighted ? "text-primary" : "text-azure"
                        }`}
                        aria-hidden="true"
                      >
                        {stage.n}
                      </span>
                      <div>
                        <h2 className="font-display text-lg text-foreground sm:text-xl">
                          {stage.title}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                          {stage.body}
                        </p>
                        <p className="mt-3 text-xs text-azure sm:text-[13px]">{stage.who}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                to={ctaTo}
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-primary px-7 py-4 font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition hover:-translate-y-0.5 hover:bg-primary/90"
              >
                {ctaLabel}
                <ArrowRight
                  size={18}
                  className="transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
              <a
                href="#principles"
                className="inline-flex items-center justify-center rounded-full border border-border bg-card px-7 py-4 font-semibold text-foreground transition hover:bg-accent"
              >
                Read our principles
              </a>
            </div>
          </div>
        </section>

        <section id="principles" className="scroll-mt-28 border-y border-border/70 bg-card/45">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-azure">
                Our principles
              </p>
              <h2 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
                Marriage deserves a better beginning.
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                Every part of Mithaq is designed around Islamic values, clear intentions, and the
                dignity of everyone involved.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {principles.map((principle) => {
                const Icon = principle.icon;
                return (
                  <article
                    key={principle.title}
                    className="group rounded-3xl border border-border bg-card p-7 shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon size={22} aria-hidden="true" />
                    </div>
                    <h3 className="mt-6 text-2xl font-semibold text-foreground">
                      {principle.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{principle.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="safety" className="scroll-mt-28 px-5 pb-20 lg:px-8 lg:pb-28">
          <div className="mx-auto grid max-w-7xl overflow-hidden rounded-[2rem] bg-primary text-primary-foreground lg:grid-cols-2">
            <div className="p-8 sm:p-12 lg:p-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-azure">
                <LockKeyhole size={23} aria-hidden="true" />
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-azure">
                Safety and dignity
              </p>
              <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Your trust comes first.</h2>
              <p className="mt-5 max-w-xl leading-7 text-primary-foreground/75">
                We are building a respectful environment where people can search seriously without
                the pressure and behaviour of conventional dating apps.
              </p>
            </div>
            <div className="grid content-center gap-3 bg-black/10 p-8 sm:p-12 lg:p-16">
              {safeguards.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                >
                  <ShieldCheck size={19} className="shrink-0 text-azure" aria-hidden="true" />
                  <span className="font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/70 bg-card/50">
          <div className="mx-auto max-w-4xl px-5 py-20 text-center lg:py-28">
            <p
              dir="rtl"
              lang="ar"
              className="font-arabic text-6xl leading-none text-primary sm:text-7xl"
            >
              ميثاق
            </p>
            <h2 className="mt-6 text-4xl font-semibold text-foreground sm:text-5xl">
              Begin with sincere intention.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl leading-7 text-muted-foreground">
              Create your profile, answer 50 thoughtful questions, and start looking for a spouse
              whose deen and direction align with yours.
            </p>
            <Link
              to={ctaTo}
              className="group mt-9 inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition hover:-translate-y-0.5 hover:bg-primary/90"
            >
              {ctaLabel}
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
            <p className="mt-4 text-xs text-muted-foreground">
              Nine sections, about 12 minutes · Your answers remain private
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
