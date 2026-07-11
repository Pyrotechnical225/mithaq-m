import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Muslim Marriage in Your Community | Mithaq" },
      {
        name: "description",
        content:
          "Finding a practicing Muslim spouse locally — how community, masjid networks, and Mithaq work together to keep the search halal.",
      },
      { property: "og:title", content: "Muslim Marriage in Your Community" },
      {
        property: "og:description",
        content: "Finding a practicing Muslim spouse locally — community, masjids, and Mithaq.",
      },
    ],
  }),
  component: CommunityPage,
});

function CommunityPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-arabic text-2xl text-primary">الأمة</p>
        <h1 className="mt-2 font-display text-4xl text-foreground md:text-5xl">
          Marriage within the ummah
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Finding a spouse who shares your deen is easier when the community is involved.
          Masjids, family networks, and platforms like Mithaq each play a role in a halal
          search.
        </p>

        <section className="mt-10 space-y-6">
          <h2 className="font-display text-2xl text-foreground">Where to look</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li><strong className="text-foreground">Your local masjid:</strong> Many host marriage events and have imams who facilitate introductions.</li>
            <li><strong className="text-foreground">Family and elders:</strong> Aunties and uncles often know practicing families looking to arrange.</li>
            <li><strong className="text-foreground">Islamic centers &amp; halaqas:</strong> Meet others who share your values naturally.</li>
            <li><strong className="text-foreground">Platforms like Mithaq:</strong> Reach practicing Muslims beyond your immediate circle — halal from the first message.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-2xl text-foreground">Keep the community close</h2>
          <p className="text-muted-foreground">
            Whether you meet through a masjid dinner or a match on Mithaq, the same principles
            apply: involve your wali, keep conversations dignified, and let your intention for
            nikah lead the way.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
