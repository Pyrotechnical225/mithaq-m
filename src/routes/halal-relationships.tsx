import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/halal-relationships")({
  head: () => ({
    meta: [
      { title: "Halal Relationships — Boundaries Before Marriage | Mithaq" },
      {
        name: "description",
        content:
          "How to get to know a potential spouse the halal way: boundaries, chaperones, communication, and the role of intention before nikah.",
      },
      { property: "og:title", content: "Halal Relationships — Boundaries Before Marriage" },
      {
        property: "og:description",
        content:
          "How to get to know a potential spouse the halal way — boundaries, chaperones, and intention.",
      },
    ],
  }),
  component: HalalRelationshipsPage,
});

function HalalRelationshipsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-arabic text-2xl text-primary">الحلال</p>
        <h1 className="mt-2 font-display text-4xl text-foreground md:text-5xl">
          Getting to know someone the halal way
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Islam offers a beautiful framework for approaching marriage: honest intention, appropriate
          boundaries, and the involvement of family. Here's how it works in practice.
        </p>

        <section className="mt-10 space-y-6">
          <h2 className="font-display text-2xl text-foreground">Core principles</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">Intention (niyyah):</strong> Every conversation is
              for the purpose of nikah, not casual dating.
            </li>
            <li>
              <strong className="text-foreground">No khalwa:</strong> Avoid being alone with a
              non-mahram. Chaperoned meetings maintain dignity.
            </li>
            <li>
              <strong className="text-foreground">Lower the gaze:</strong> Modest interaction
              protects both hearts.
            </li>
            <li>
              <strong className="text-foreground">Family involvement:</strong> Include the wali
              early — it protects everyone.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-2xl text-foreground">Meaningful questions to ask</h2>
          <p className="text-muted-foreground">
            Focus on deen, character, and life goals. Discuss prayer, family expectations, finances,
            children, and where you both see life in ten years. These conversations matter more than
            surface chemistry.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
