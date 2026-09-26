import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mithaq — Meet haq in marriage" },
      {
        name: "description",
        content:
          "Meet haq in marriage with Mithaq: private Muslim matchmaking with family involvement, imam review, and structured compatibility assessment.",
      },
    ],
  }),
  component: Index,
});

const principles = [
  {
    number: "01",
    title: "Deen before appearances",
    body: "Compatibility starts with religious practice, character, family values, and the life you hope to build together.",
  },
  {
    number: "02",
    title: "Family involvement is welcome",
    body: "Walis and families can be part of the process from the beginning, without awkward workarounds or hidden conversations.",
  },
  {
    number: "03",
    title: "Introductions, not endless browsing",
    body: "Mithaq is built for people seeking nikah. Profiles stay private and suitable introductions move forward with imam support.",
  },
] as const;

const steps = [
  {
    number: "1",
    title: "Build your profile",
    body: "Answer thoughtful questions about faith, values, family life, and plans for marriage.",
  },
  {
    number: "2",
    title: "Choose your privacy",
    body: "Decide when your completed profile can enter private compatibility assessment.",
  },
  {
    number: "3",
    title: "Assess compatibility",
    body: "A structured rubric compares aligned priorities before suitable results reach an imam.",
  },
  {
    number: "4",
    title: "Review an introduction",
    body: "After imam approval, both people review anonymous profiles and decide independently.",
  },
] as const;

const safeguards = [
  "No public member directory, open profile browsing, or direct messaging",
  "You control when your profile is available and which anonymous details are shown",
  "Names and contact details stay outside compatibility scoring and anonymous review",
  "Both members decide independently before an imam-supported meeting is arranged",
] as const;

const meetingPackages = [
  { label: "One meeting", price: "£50" },
  { label: "Three meetings", price: "£120" },
  { label: "Five meetings", price: "£175" },
] as const;

const trustPoints = [
  {
    number: "01",
    title: "Private, not public",
    body: "Your profile never appears in an open member directory.",
  },
  {
    number: "02",
    title: "Structured, not swipe-led",
    body: "Compatibility follows your answers and the privacy choices you control.",
  },
  {
    number: "03",
    title: "Supported, not pressured",
    body: "Both people decide independently before an imam-supported meeting.",
  },
] as const;

function TrustPreview() {
  return (
    <aside className="overflow-hidden rounded-lg border border-border bg-card sm:shadow-[var(--shadow-elevated)]">
      <div className="border-b border-border px-6 py-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          What makes Mithaq different
        </p>
        <h2 className="mt-2 text-xl font-semibold text-foreground">
          Built around dignity and intention
        </h2>
      </div>

      <ol className="px-6 sm:px-8">
        {trustPoints.map((point) => (
          <li
            key={point.number}
            className="grid grid-cols-[2rem_1fr] gap-4 border-b border-border py-5 last:border-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-semibold text-primary">
              {point.number}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{point.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{point.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-start gap-3 border-t border-border bg-secondary/55 px-6 py-4 text-sm text-secondary-foreground sm:px-8">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <p>Private by default, with wali and family involvement welcomed.</p>
      </div>
    </aside>
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
  const ctaLabel = signedIn ? "Go to dashboard" : "Start your profile";

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />

      <main id="main-content">
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl items-center gap-9 px-5 py-10 sm:gap-14 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div>
              <p className="text-sm font-semibold text-primary">Meet haq in marriage</p>
              <h1 className="mt-4 max-w-3xl text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:mt-5 sm:text-6xl sm:leading-[1.02] lg:text-[4.5rem]">
                A serious way to find a spouse.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-7 sm:text-lg sm:leading-8">
                Mithaq helps practicing Muslims find marriage-minded introductions through shared
                deen, family values, and long-term goals—with privacy, wali involvement, and imam
                support built into the process.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center">
                <Link
                  to={ctaTo}
                  className="group inline-flex items-center justify-center gap-3 rounded-md bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  {ctaLabel}
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-card px-6 py-3.5 font-semibold text-foreground transition hover:bg-accent"
                >
                  See the process
                </a>
              </div>

              <div className="mt-6 flex max-w-2xl flex-wrap gap-x-4 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground sm:mt-8 sm:grid sm:grid-cols-3 sm:gap-3 sm:pt-6 sm:text-sm">
                {["No swiping", "Private profiles", "Imam-supported"].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <Check size={15} className="text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <TrustPreview />
          </div>
        </section>

        <section id="principles" className="scroll-mt-28 bg-card">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:gap-12 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-24">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Our principles
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">
                Marriage deserves a careful beginning.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                The platform is organised around clear intention, Islamic values, and the dignity of
                everyone involved.
              </p>
            </div>

            <div>
              {principles.map((principle) => (
                <article
                  key={principle.title}
                  className="grid gap-3 border-t border-border py-7 sm:grid-cols-[4rem_1fr] sm:gap-6"
                >
                  <span className="text-sm font-semibold text-primary">{principle.number}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{principle.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      {principle.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-28 border-y border-border bg-secondary/45">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:py-20 lg:px-8 lg:py-24">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  How it works
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">
                  One clear step at a time.
                </h2>
              </div>
              <Link
                to={ctaTo}
                className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary hover:underline"
              >
                {ctaLabel} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>

            <ol className="mt-12 grid border-y border-border md:grid-cols-4 md:divide-x md:divide-border">
              {steps.map((step) => (
                <li
                  key={step.number}
                  className="border-b border-border px-0 py-7 last:border-0 md:border-b-0 md:px-6 md:first:pl-0 md:last:pr-0"
                >
                  <span className="text-sm font-semibold text-primary">0{step.number}</span>
                  <h3 className="mt-4 text-xl font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="after-acceptance" className="scroll-mt-28 border-b border-border bg-card">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:py-20 lg:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  After mutual acceptance
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">
                  Meet with support, not pressure.
                </h2>
                <p className="mt-5 leading-7 text-muted-foreground">
                  Matching and anonymous profile review remain free. Meeting packages appear only
                  after both people accept an introduction, so there is no payment before mutual
                  interest is clear.
                </p>
                <p className="mt-6 text-sm font-medium text-primary">
                  Both accept <span className="mx-2 text-muted-foreground">→</span> Choose a package
                  <span className="mx-2 text-muted-foreground">→</span> Imam-supported meeting
                </p>
              </div>

              <div className="grid self-start border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-border">
                {meetingPackages.map((meetingPackage) => (
                  <div
                    key={meetingPackage.label}
                    className="border-t border-border py-6 first:border-t-0 sm:border-t-0 sm:px-6 sm:first:pl-0 sm:last:pr-0"
                  >
                    <p className="text-sm text-muted-foreground">{meetingPackage.label}</p>
                    <p className="mt-2 text-xl font-semibold tracking-[-0.025em] text-foreground">
                      {meetingPackage.price}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="safety" className="scroll-mt-28 px-5 py-12 sm:py-20 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl overflow-hidden rounded-lg bg-primary text-primary-foreground lg:grid-cols-[0.9fr_1.1fr]">
            <div className="p-5 sm:p-12 lg:p-14">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">
                Safety and dignity
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
                Privacy throughout your journey.
              </h2>
              <p className="mt-5 max-w-xl leading-7 text-primary-foreground/75">
                Your profile is never placed in a public catalogue. You choose when it can enter
                private matching and which details may appear anonymously. Compatibility is assessed
                away from public view, while names and contact details remain protected as a
                suitable introduction moves through the supervised process.
              </p>
              <h3 className="mt-8 text-lg font-semibold">How we do it better</h3>
              <p className="mt-3 max-w-xl leading-7 text-primary-foreground/75">
                Instead of swiping, open inboxes, and unrestricted profile browsing, Mithaq uses
                controlled introductions. Only available members enter matching, both people review
                an introduction independently, and no meeting moves forward without mutual
                acceptance. Where an optional AI review is used with consent, it receives bounded,
                anonymised answers—not names, contact details, account IDs, or free-text responses.
              </p>
              <Link
                to="/privacy"
                className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-foreground underline decoration-primary-foreground/35 underline-offset-4 hover:decoration-primary-foreground"
              >
                Read the full privacy notice <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="grid content-center border-t border-white/15 px-5 py-4 sm:px-12 sm:py-5 lg:border-l lg:border-t-0 lg:px-14">
              {safeguards.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 border-b border-white/15 py-4 last:border-0"
                >
                  <Check
                    size={18}
                    className="mt-0.5 shrink-0 text-primary-foreground"
                    aria-hidden="true"
                  />
                  <span className="text-sm leading-6 text-primary-foreground/85">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-16 sm:grid-cols-[1fr_auto] lg:px-8 lg:py-20">
            <div>
              <p dir="rtl" lang="ar" className="font-arabic text-3xl text-primary">
                ميثاق
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                Begin with sincere intention.
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Create your profile and focus on the values that make a marriage last.
              </p>
            </div>
            <Link
              to={ctaTo}
              className="group inline-flex items-center justify-center gap-3 rounded-md bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              {ctaLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
