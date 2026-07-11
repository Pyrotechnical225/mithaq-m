import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <span className="font-arabic text-lg">م</span>
          </div>
          <span className="font-display text-xl font-semibold text-foreground">Mithaq</span>
        </div>
        <nav className="hidden gap-8 text-sm text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#principles" className="hover:text-foreground">Our principles</a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center md:pt-24">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            A halal path to marriage
          </div>

          <h1
            dir="rtl"
            lang="ar"
            className="font-arabic text-7xl leading-none text-primary md:text-9xl"
          >
            ميثاق
          </h1>

          <p className="mt-6 font-display text-2xl italic text-foreground md:text-3xl">
            Building homes, the halal way.
          </p>

          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Mithaq honors marriage as the sacred covenant it is described as in Islam.
            Our platform matches practicing Muslims based on religious commitment,
            family values, and life goals, with built-in respect for wali involvement
            and Islamic marriage practices — helping you begin your journey the halal
            way.
          </p>

          <div className="mt-12 flex flex-col items-center gap-4">
            <Link
              to="/survey"
              className="group inline-flex items-center gap-3 rounded-full bg-primary px-10 py-5 text-lg font-medium text-primary-foreground shadow-[var(--shadow-elevated)] transition-all hover:-translate-y-0.5 hover:bg-primary/90"
            >
              Start searching
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              50 thoughtful questions · About 10 minutes
            </p>
          </div>
        </section>

        <section id="principles" className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { title: "Deen first", body: "Compatibility begins with faith, practice, and shared Islamic values — not surface-level filters." },
              { title: "Wali involved", body: "Guardians are welcomed into the process. Every conversation stays dignified and halal." },
              { title: "Serious intentions", body: "Every profile is here for nikah, insha'Allah. No swiping, no games — only intentional matches." },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                <div className="mb-3 h-8 w-8 rounded-full bg-gold/30" />
                <h3 className="mb-2 text-xl text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-3xl text-foreground md:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              { n: "01", t: "Answer honestly", d: "Share your deen, values, and what you seek in a spouse." },
              { n: "02", t: "Get matched", d: "We surface profiles aligned with your practice and life goals." },
              { n: "03", t: "Meet with your wali", d: "Move forward the halal way, with your guardian involved." },
            ].map((s) => (
              <div key={s.n} className="text-left">
                <div className="font-display text-4xl text-gold">{s.n}</div>
                <div className="mt-2 text-lg text-foreground">{s.t}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.d}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        <p className="font-arabic text-lg text-primary">بسم الله</p>
        <p className="mt-2">© {new Date().getFullYear()} Mithaq. Marriage is half of your deen.</p>
      </footer>
    </div>
  );
}
