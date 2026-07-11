import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/wali")({
  head: () => ({
    meta: [
      { title: "The Role of the Wali in Islamic Marriage | Mithaq" },
      {
        name: "description",
        content:
          "Who the wali is, why he matters, and how his involvement protects the bride and dignifies the marriage process.",
      },
      { property: "og:title", content: "The Role of the Wali in Islamic Marriage" },
      {
        property: "og:description",
        content: "Who the wali is, why he matters, and how his involvement protects the bride.",
      },
    ],
  }),
  component: WaliPage,
});

function WaliPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-arabic text-2xl text-primary">الولي</p>
        <h1 className="mt-2 font-display text-4xl text-foreground md:text-5xl">
          The wali — a guardian, not a gatekeeper
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          The wali is the bride's guardian in the nikah — usually her father, or another
          responsible male relative. Far from being a formality, his role protects the bride
          and grounds the marriage in family.
        </p>

        <section className="mt-10 space-y-6">
          <h2 className="font-display text-2xl text-foreground">What the wali does</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>Represents the bride in the marriage contract.</li>
            <li>Vets the groom's character, deen, and ability to fulfill his responsibilities.</li>
            <li>Ensures the terms of the nikah — mahr, conditions — reflect the bride's wishes.</li>
            <li>Provides ongoing support and mediation after marriage.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-2xl text-foreground">When there is no wali</h2>
          <p className="text-muted-foreground">
            If a bride's father has passed away or is unavailable, the role passes to the next
            appropriate male relative, or in some cases to a trusted imam. What matters is that
            she is protected and represented — not left to navigate alone.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
