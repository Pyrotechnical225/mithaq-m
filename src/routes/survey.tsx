import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { questions } from "@/lib/survey-questions";

export const Route = createFileRoute("/survey")({
  head: () => ({
    meta: [
      { title: "Your Mithaq profile — 50 questions" },
      {
        name: "description",
        content:
          "Answer 50 thoughtful questions so we can match you with a spouse who shares your deen, values, and goals.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SurveyPage,
});

function SurveyPage() {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const requiredMissing = useMemo(
    () =>
      questions
        .filter((q) => q.required)
        .filter((q) => !answers[q.id] || answers[q.id].trim() === "")
        .map((q) => q.id),
    [answers],
  );

  const answeredCount = Object.values(answers).filter((v) => v && v.trim() !== "").length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  const sections = useMemo(() => {
    const map = new Map<string, typeof questions>();
    for (const q of questions) {
      if (!map.has(q.section)) map.set(q.section, []);
      map.get(q.section)!.push(q);
    }
    return Array.from(map.entries());
  }, []);

  const set = (id: number, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requiredMissing.length > 0) {
      setShowErrors(true);
      const first = document.getElementById(`q-${requiredMissing[0]}`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-2xl px-6 py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <span className="font-arabic text-2xl">✓</span>
          </div>
          <h1 className="text-4xl text-foreground">Jazakum Allahu khayran</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Your answers have been received. We'll begin reviewing compatible profiles
            and reach out with next steps insha'Allah.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex rounded-full bg-primary px-8 py-3 text-primary-foreground hover:bg-primary/90"
          >
            Return home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <span>←</span> Home
            </Link>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {answeredCount} / {questions.length}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 pt-10">
        <p className="font-arabic text-2xl text-primary" dir="rtl" lang="ar">ميثاق</p>
        <h1 className="mt-2 text-4xl text-foreground md:text-5xl">Tell us about yourself</h1>
        <p className="mt-3 text-muted-foreground">
          Fifty questions — the first 30 are required, the rest help us match you more
          precisely. Answer honestly; your answers are for matchmaking only.
        </p>
      </div>

      <form onSubmit={submit} className="mx-auto mt-10 max-w-3xl space-y-12 px-6">
        {sections.map(([section, qs]) => (
          <section key={section}>
            <div className="mb-6 flex items-baseline gap-3">
              <div className="h-px flex-1 bg-border" />
              <h2 className="text-sm uppercase tracking-[0.25em] text-muted-foreground">{section}</h2>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-6">
              {qs.map((q) => {
                const missing =
                  showErrors && q.required && (!answers[q.id] || answers[q.id].trim() === "");
                return (
                  <div
                    key={q.id}
                    id={`q-${q.id}`}
                    className={`rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] ${
                      missing ? "border-destructive" : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-base font-medium text-foreground">
                        <span className="mr-2 font-display text-gold">{q.id}.</span>
                        {q.question}
                      </span>
                      {!q.required && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          Optional
                        </span>
                      )}
                    </div>

                    {q.type === "choice" && q.options ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {q.options.map((opt) => {
                          const selected = answers[q.id] === opt;
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() => set(q.id, opt)}
                              className={`rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                                selected
                                  ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                                  : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ) : q.type === "number" ? (
                      <input
                        type="number"
                        min={18}
                        max={100}
                        value={answers[q.id] ?? ""}
                        onChange={(e) => set(q.id, e.target.value)}
                        className="mt-4 w-40 rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
                        placeholder="e.g. 27"
                      />
                    ) : (
                      <textarea
                        value={answers[q.id] ?? ""}
                        onChange={(e) => set(q.id, e.target.value)}
                        rows={3}
                        className="mt-4 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/40"
                        placeholder="Type your answer…"
                      />
                    )}

                    {missing && (
                      <p className="mt-2 text-xs text-destructive">This question is required.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-soft)]">
          {showErrors && requiredMissing.length > 0 && (
            <p className="mb-4 text-sm text-destructive">
              {requiredMissing.length} required question{requiredMissing.length === 1 ? "" : "s"} still need answering.
            </p>
          )}
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-10 py-4 text-lg font-medium text-primary-foreground shadow-[var(--shadow-elevated)] transition-all hover:-translate-y-0.5 hover:bg-primary/90"
          >
            Submit my profile →
          </button>
          <p className="mt-3 text-xs text-muted-foreground">
            By submitting, you affirm your intention to pursue marriage the halal way, insha'Allah.
          </p>
        </div>
      </form>
    </div>
  );
}
