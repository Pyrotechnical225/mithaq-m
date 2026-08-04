import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/nikah")({
  head: () => ({
    meta: [
      { title: "Nikah Explained — The Islamic Marriage Contract | Mithaq" },
      {
        name: "description",
        content:
          "A clear guide to nikah: meaning, pillars, conditions, and how the Islamic marriage contract is performed. Learn what makes a nikah valid.",
      },
      { property: "og:title", content: "Nikah Explained — The Islamic Marriage Contract" },
      {
        property: "og:description",
        content:
          "A clear guide to nikah: meaning, pillars, conditions, and how the Islamic marriage contract is performed.",
      },
    ],
  }),
  component: NikahPage,
});

function NikahPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-arabic text-2xl text-primary">النكاح</p>
        <h1 className="mt-2 font-display text-4xl text-foreground md:text-5xl">Nikah explained</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Nikah is the sacred contract by which a man and woman enter marriage under Islamic law. It
          is not merely a ceremony — it is a covenant (mithaq) mentioned in the Qur'an as weighty
          and solemn.
        </p>

        <section className="mt-10 space-y-6">
          <h2 className="font-display text-2xl text-foreground">The pillars of a valid nikah</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">Consent (ijab &amp; qabul):</strong> A clear offer
              and acceptance between the bride and groom.
            </li>
            <li>
              <strong className="text-foreground">Wali:</strong> The bride's guardian, typically her
              father, who represents her interests.
            </li>
            <li>
              <strong className="text-foreground">Two witnesses:</strong> Adult Muslim witnesses to
              the contract.
            </li>
            <li>
              <strong className="text-foreground">Mahr:</strong> The bridal gift given by the groom
              to the bride as her right.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="font-display text-2xl text-foreground">Why the covenant matters</h2>
          <p className="text-muted-foreground">
            Allah describes the marriage contract as <em>mithaqan ghaleeza</em> — a solemn covenant
            (Qur'an 4:21). This framing shapes how Muslims approach marriage: with intention,
            dignity, and the involvement of family from the very start.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
