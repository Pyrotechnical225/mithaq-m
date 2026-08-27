import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { BrandName } from "@/components/BrandName";
import { formatPence, MEETING_PACKAGES } from "@/lib/meeting-packages";

export const Route = createFileRoute("/_authenticated/membership")({
  head: () => ({
    meta: [
      { title: "Meeting support — Mithaq" },
      {
        name: "description",
        content: "Mithaq meeting packages for mutually accepted, imam-approved introductions.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MeetingSupportPage,
});

function MeetingSupportPage() {
  const packages = Object.values(MEETING_PACKAGES);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
              ميثاق
            </span>
          </Link>
          <Link
            to="/dashboard"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            After mutual acceptance
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
            Imam-supported meetings
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Matching and anonymous profile review are free. A meeting package becomes available only
            after both members accept the introduction and the imam approves it.
          </p>
        </div>

        <div className="mt-12 grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-3 md:divide-x md:divide-border">
          {packages.map((meetingPackage) => (
            <article
              key={meetingPackage.id}
              className="border-b border-border p-6 last:border-b-0 md:border-b-0 lg:p-8"
            >
              <p className="text-sm font-semibold text-primary">{meetingPackage.label}</p>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">
                {formatPence(meetingPackage.amountPence)}
              </p>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                {meetingPackage.description}
              </p>
              <p className="mt-6 flex items-start gap-2 border-t border-border pt-5 text-sm text-foreground">
                <Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                Offered inside an approved introduction
              </p>
            </article>
          ))}
        </div>

        <section className="mt-10 grid gap-6 border-t border-border pt-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">No payment is needed now</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Continue your member journey. If an introduction reaches mutual acceptance, the
              package choices and secure checkout will appear in that introduction.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Continue my journey
          </Link>
        </section>
      </main>
    </div>
  );
}
