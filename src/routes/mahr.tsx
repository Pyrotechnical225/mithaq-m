import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/mahr")({
  head: () => ({
    meta: [
      { title: "Mahr — The Bridal Gift in Islam | MeetHaq" },
      {
        name: "description",
        content:
          "What mahr is, why it's the bride's right, and how to decide on an appropriate amount. A practical guide for couples and families.",
      },
      { property: "og:title", content: "Mahr — The Bridal Gift in Islam" },
      {
        property: "og:description",
        content:
          "What mahr is, why it's the bride's right, and how to decide on an appropriate amount.",
      },
    ],
  }),
  component: MahrPage,
});

function MahrPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-arabic text-2xl text-primary">المهر</p>
        <h1 className="mt-2 font-display text-4xl text-foreground md:text-5xl">
          Mahr — the bride's right
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Mahr is the gift the groom gives to the bride as a required part of the marriage contract.
          It belongs solely to her, not to her family, and reflects the seriousness of the union.
        </p>

        <section className="mt-10 space-y-6">
          <h2 className="font-display text-2xl text-foreground">What to know</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">It's obligatory:</strong> No valid nikah exists
              without an agreed mahr.
            </li>
            <li>
              <strong className="text-foreground">Her right alone:</strong> Mahr is the bride's
              property to keep, spend, or invest.
            </li>
            <li>
              <strong className="text-foreground">Any form:</strong> Money, gold, property, or even
              teaching Qur'an — whatever is agreed.
            </li>
            <li>
              <strong className="text-foreground">Prompt or deferred:</strong> It can be paid at the
              contract or deferred; often it's a mix.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-2xl text-foreground">Choosing an amount</h2>
          <p className="text-muted-foreground">
            The Prophet ﷺ encouraged reasonable mahr — the best marriage is the easiest one. Discuss
            it openly, keep it within the groom's real means, and honor the bride's dignity without
            turning it into a burden.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
