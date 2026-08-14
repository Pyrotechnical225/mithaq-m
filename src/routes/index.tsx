import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
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

const steps = [
  {
    number: "01",
    title: "Tell us about yourself",
    body: "Answer thoughtful questions about your deen, values, family life, and hopes for marriage.",
  },
  {
    number: "02",
    title: "Discover aligned matches",
    body: "Explore OpenAI-scored, imam-reviewed matches grounded in shared practice, priorities, and long-term goals.",
  },
  {
    number: "03",
    title: "Move forward respectfully",
    body: "Connect with clear intentions and bring your wali into the process from the beginning.",
  },
] as const;

const safeguards = [
  "Built for marriage, not casual dating",
  "Wali-friendly communication",
  "Private information stays protected",
  "Clear reporting and moderation tools",
] as const;

function MatchPreview() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-azure/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-card/95 p-5 shadow-[var(--shadow-elevated)] sm:p-7">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-azure">
              Your journey
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-foreground">
              A thoughtful match
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HeartHandshake size={22} aria-hidden="true" />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-background/70 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="font-display text-lg font-semibold">92%</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Strong values alignment</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Similar religious practice, family expectations, and marriage timeline.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {["Deen & practice", "Family values", "Life goals", "Marriage timeline"].map((label) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-xl bg-secondary/65 px-3 py-3 text-xs font-medium text-secondary-foreground"
            >
              <Check size={14} className="text-primary" aria-hidden="true" />
              {label}
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-primary-foreground">
          <ShieldCheck size={19} className="shrink-0 text-azure" aria-hidden="true" />
          <p className="text-sm">Respectful, private, and designed for wali involvement.</p>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-soft)] sm:flex">
        <Sparkles size={17} className="text-azure" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">
          Compatibility beyond appearances
        </span>
      </div>
    </div>
  );
}

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
        <section className="relative">
          <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_78%_20%,color-mix(in_oklch,var(--color-azure)_18%,transparent),transparent_45%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-32 lg:pt-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-[var(--shadow-soft)]">
                <span className="h-2 w-2 rounded-full bg-azure" />A halal path to marriage
              </div>

              <h1 className="mt-7 max-w-2xl font-display text-5xl font-semibold leading-[0.98] text-foreground sm:text-6xl lg:text-7xl">
                Meet with purpose.
                <span className="block text-primary">Marry with confidence.</span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                MeetHaq helps practicing Muslims find marriage-minded matches through shared deen,
                family values, and life goals — with respect for wali involvement at every step.
              </p>

              <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
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
                  href="#how"
                  className="inline-flex items-center justify-center rounded-full border border-border bg-card px-7 py-4 font-semibold text-foreground transition hover:bg-accent"
                >
                  See how it works
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                {["Serious profiles", "Wali-friendly", "Private by design"].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <Check size={15} className="text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <MatchPreview />
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
                Every part of MeetHaq is designed around Islamic values, clear intentions, and the
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

        <section id="how" className="scroll-mt-28">
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-azure">
                  How it works
                </p>
                <h2 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
                  From intention to introduction.
                </h2>
                <p className="mt-5 text-base leading-7 text-muted-foreground">
                  A calm, structured process that helps you focus on the things that make a marriage
                  last.
                </p>
                <Link
                  to={ctaTo}
                  className="mt-8 inline-flex items-center gap-2 font-semibold text-primary hover:underline"
                >
                  {ctaLabel} <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>

              <ol className="grid gap-4">
                {steps.map((step) => (
                  <li
                    key={step.number}
                    className="grid grid-cols-[auto_1fr] gap-5 rounded-3xl border border-border bg-card p-6 sm:p-7"
                  >
                    <span className="font-display text-4xl font-semibold text-azure">
                      {step.number}
                    </span>
                    <div>
                      <h3 className="text-2xl font-semibold text-foreground">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
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
              About 10 minutes · Your answers remain private
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
