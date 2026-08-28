import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Bookmark, ListChecks } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Question } from "@/lib/survey-questions";
import { questions } from "@/lib/survey-questions";
import { getMyAnswers, saveMyAnswers } from "@/lib/survey.functions";

export const Route = createFileRoute("/_authenticated/survey")({
  head: () => ({
    meta: [{ title: "Your Mithaq profile — 50 questions" }, { name: "robots", content: "noindex" }],
  }),
  component: SurveyPage,
});

const hasValue = (value?: string) => Boolean(value?.trim());

function SurveyPage() {
  const navigate = useNavigate();
  const fetchAnswers = useServerFn(getMyAnswers);
  const save = useServerFn(saveMyAnswers);
  const questionRefs = useRef(new Map<number, HTMLElement>());
  const reviewRef = useRef<HTMLElement>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [revealedCount, setRevealedCount] = useState(1);
  const [showReview, setShowReview] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedTick, setSavedTick] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetchAnswers()
      .then((res) => {
        const raw = (res?.answers ?? {}) as Record<string, string>;
        const initial: Record<number, string> = {};

        for (const key of Object.keys(raw)) initial[Number(key)] = raw[key];

        const highestAnsweredIndex = questions.reduce(
          (highest, question, index) => (hasValue(initial[question.id]) ? index : highest),
          -1,
        );
        const shouldReview =
          Boolean(res?.completed) || highestAnsweredIndex === questions.length - 1;

        setAnswers(initial);
        setRevealedCount(
          shouldReview
            ? questions.length
            : Math.min(questions.length, Math.max(1, highestAnsweredIndex + 2)),
        );
        setShowReview(shouldReview);
      })
      .catch(() => {
        setLoadError("We couldn't load your saved answers. Refresh the page to try again.");
      })
      .finally(() => setLoaded(true));
  }, [fetchAnswers]);

  const requiredMissing = useMemo(
    () =>
      questions
        .filter((question) => question.required && !hasValue(answers[question.id]))
        .map((q) => q.id),
    [answers],
  );
  const unanswered = useMemo(
    () =>
      questions
        .filter((question) => !hasValue(answers[question.id]))
        .map((question) => question.id),
    [answers],
  );
  const skippedToReview = useMemo(
    () => [...skipped].filter((id) => !hasValue(answers[id])).sort((a, b) => a - b),
    [answers, skipped],
  );

  const answeredCount = questions.length - unanswered.length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const visibleQuestions = questions.slice(0, revealedCount);
  const currentQuestion = showReview ? null : questions[revealedCount - 1];

  const scrollToQuestion = (id: number) => {
    const target = questionRefs.current.get(id);
    if (!target) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const scrollToReview = () => {
    const target = reviewRef.current;
    if (!target) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  };

  const setAnswer = (id: number, value: string) => {
    setAnswers((previous) => ({ ...previous, [id]: value }));
    if (hasValue(value)) {
      setSkipped((previous) => {
        if (!previous.has(id)) return previous;
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  };

  const advance = (skipCurrent: boolean) => {
    const question = questions[revealedCount - 1];
    if (!question) return;

    if (skipCurrent && !hasValue(answers[question.id])) {
      setSkipped((previous) => new Set(previous).add(question.id));
      setStatusMessage(
        `Question ${question.id} skipped for now. You can return to it at any time.`,
      );
    } else {
      setStatusMessage(`Answer recorded for question ${question.id}.`);
    }

    if (revealedCount === questions.length) {
      setShowReview(true);
      window.requestAnimationFrame(scrollToReview);
      return;
    }

    const nextCount = revealedCount + 1;
    setRevealedCount(nextCount);
    window.requestAnimationFrame(() => scrollToQuestion(questions[nextCount - 1].id));
  };

  const persist = async (completed: boolean) => {
    setSaving(true);
    setSaveError("");

    try {
      const stringified: Record<string, string> = {};
      for (const key of Object.keys(answers)) stringified[key] = answers[Number(key)];
      await save({ data: { answers: stringified, completed } });
      const savedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSavedTick(savedAt);
      setStatusMessage(
        completed ? "Your survey has been submitted." : `Draft saved at ${savedAt}.`,
      );
      return true;
    } catch {
      setSaveError("We couldn't save your answers. Check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (requiredMissing.length > 0) {
      setRevealedCount(questions.length);
      setShowReview(true);
      setShowErrors(true);
      setStatusMessage(
        `${requiredMissing.length} required question${requiredMissing.length === 1 ? " is" : "s are"} unanswered.`,
      );
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => scrollToQuestion(requiredMissing[0])),
      );
      return;
    }

    if (await persist(true)) navigate({ to: "/dashboard" });
  };

  if (!loaded) {
    return <div className="p-16 text-center text-muted-foreground">Loading your answers…</div>;
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-16">
        <div className="w-full rounded-lg border border-destructive/40 bg-card p-6">
          <h1 className="text-2xl">Your survey could not be opened</h1>
          <p className="mt-3 text-sm text-muted-foreground">{loadError}</p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
            >
              ← Dashboard
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => skippedToReview[0] && scrollToQuestion(skippedToReview[0])}
                disabled={skippedToReview.length === 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                <ListChecks aria-hidden="true" className="size-4" />
                Review skipped
                {skippedToReview.length > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {skippedToReview.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void persist(false)}
                disabled={saving}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/30 bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <Bookmark aria-hidden="true" className="size-4" />
                {saving ? "Saving…" : savedTick ? `Saved ${savedTick}` : "Save draft"}
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span>
              {showReview
                ? "Ready for review"
                : `Question ${currentQuestion?.id ?? revealedCount} of ${questions.length}`}
            </span>
            <span>{answeredCount} answered</span>
          </div>
          <div
            role="progressbar"
            aria-label="Survey completion"
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={answeredCount}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-5 pt-9 sm:px-6 sm:pt-12">
        <p className="font-arabic text-2xl text-primary" dir="rtl" lang="ar">
          ميثاق
        </p>
        <h1 className="mt-2 text-3xl text-foreground sm:text-4xl">Tell us about yourself</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Answer one question at a time. Questions you have visited stay above so you can scroll
          back and edit them. The first 30 questions are required before submission.
        </p>

        <p className="sr-only" aria-live="polite">
          {statusMessage}
        </p>

        {saveError && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {saveError}
          </div>
        )}

        <form onSubmit={submit} className="mt-9 space-y-5">
          {visibleQuestions.map((question, index) => {
            const isNewSection =
              index === 0 || visibleQuestions[index - 1].section !== question.section;
            const missing = showErrors && question.required && !hasValue(answers[question.id]);
            const isCurrent = currentQuestion?.id === question.id;

            return (
              <Fragment key={question.id}>
                {isNewSection && (
                  <div
                    className="flex items-center gap-3 pt-4"
                    aria-label={`${question.section} section`}
                  >
                    <h2 className="shrink-0 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {question.section}
                    </h2>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <QuestionCard
                  question={question}
                  answer={answers[question.id] ?? ""}
                  isCurrent={isCurrent}
                  isSkipped={skippedToReview.includes(question.id)}
                  missing={missing}
                  registerRef={(node) => {
                    if (node) questionRefs.current.set(question.id, node);
                    else questionRefs.current.delete(question.id);
                  }}
                  onAnswer={(value) => setAnswer(question.id, value)}
                  onContinue={() => advance(false)}
                  onSkip={() => advance(true)}
                />
              </Fragment>
            );
          })}

          {showReview && (
            <section
              ref={reviewRef}
              tabIndex={-1}
              aria-labelledby="review-title"
              className="rounded-lg border border-primary/25 bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8"
            >
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                Final review
              </p>
              <h2 id="review-title" className="mt-2 text-2xl">
                Review before you submit
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                You answered {answeredCount} of {questions.length} questions. Optional answers
                improve matching, and you can update this survey later.
              </p>

              {showErrors && requiredMissing.length > 0 && (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                >
                  <p className="font-medium text-destructive">
                    {requiredMissing.length} required question
                    {requiredMissing.length === 1 ? " needs" : "s need"} an answer.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every unanswered required question is highlighted. We moved you to the first
                    one.
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {unanswered.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToQuestion(unanswered[0])}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium hover:bg-accent"
                  >
                    Review unanswered ({unanswered.length})
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? "Submitting…" : "Submit survey"}
                  {!saving && <ArrowRight aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </section>
          )}
        </form>
      </main>
    </div>
  );
}

interface QuestionCardProps {
  question: Question;
  answer: string;
  isCurrent: boolean;
  isSkipped: boolean;
  missing: boolean;
  registerRef: (node: HTMLElement | null) => void;
  onAnswer: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}

function QuestionCard({
  question,
  answer,
  isCurrent,
  isSkipped,
  missing,
  registerRef,
  onAnswer,
  onContinue,
  onSkip,
}: QuestionCardProps) {
  const errorId = `q-${question.id}-error`;
  const answered = hasValue(answer);

  return (
    <article
      ref={registerRef}
      id={`q-${question.id}`}
      tabIndex={-1}
      aria-labelledby={`q-${question.id}-title`}
      className={`scroll-mt-32 rounded-lg border bg-card p-5 transition-colors sm:p-6 ${
        missing
          ? "border-destructive bg-destructive/5"
          : isCurrent
            ? "border-primary/50 shadow-[var(--shadow-soft)]"
            : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Question {question.id} of {questions.length}
          </p>
          <h3 id={`q-${question.id}-title`} className="mt-2 text-lg leading-7 sm:text-xl">
            {question.question}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider ${
            isSkipped
              ? "bg-gold/15 text-gold-foreground"
              : answered
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {isSkipped
            ? "Skipped"
            : answered
              ? "Answered"
              : question.required
                ? "Required"
                : "Optional"}
        </span>
      </div>

      {question.type === "choice" && question.options ? (
        <fieldset
          className="mt-5"
          aria-describedby={missing ? errorId : undefined}
          aria-invalid={missing}
        >
          <legend className="sr-only">{question.question}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => {
              const selected = answer === option;
              return (
                <button
                  type="button"
                  key={option}
                  aria-pressed={selected}
                  onClick={() => onAnswer(option)}
                  className={`min-h-11 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : question.type === "number" ? (
        <input
          aria-label={question.question}
          aria-describedby={missing ? errorId : undefined}
          aria-invalid={missing}
          type="number"
          min={18}
          max={100}
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          className="mt-5 min-h-11 w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 sm:w-48"
          placeholder="e.g. 27"
        />
      ) : (
        <textarea
          aria-label={question.question}
          aria-describedby={missing ? errorId : undefined}
          aria-invalid={missing}
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          rows={4}
          className="mt-5 w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
          placeholder="Type your answer…"
        />
      )}

      {missing && (
        <p id={errorId} className="mt-2 text-sm font-medium text-destructive">
          This question is required.
        </p>
      )}

      {isCurrent && (
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="min-h-11 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!answered}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-45"
          >
            {question.id === questions.length ? "Review answers" : "Continue"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </article>
  );
}
