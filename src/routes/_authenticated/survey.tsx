import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMyAnswers, saveMyAnswers } from "@/lib/survey.functions";
import { StepRail } from "@/components/survey/StepRail";
import { QuestionField } from "@/components/survey/QuestionField";
import {
  ESTIMATED_MINUTES,
  REQUIRED_QUESTION_COUNT,
  REVIEW_STEP,
  SECTION_GUIDANCE,
  TOTAL_QUESTION_COUNT,
  type Answers,
  answeredCount,
  clampStep,
  firstIncompleteStep,
  isAnswered,
  isSectionComplete,
  missingRequiredIds,
  progressPercent,
  sectionAnsweredCount,
  surveySections,
} from "@/lib/survey-sections";

export const Route = createFileRoute("/_authenticated/survey")({
  head: () => ({
    meta: [{ title: "Your MeetHaq profile" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): { step?: number } => {
    const raw = Number(search.step);
    return Number.isFinite(raw) && raw >= 1 ? { step: Math.trunc(raw) } : {};
  },
  component: SurveyPage,
});

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function SurveyPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fetchAnswers = useServerFn(getMyAnswers);
  const save = useServerFn(saveMyAnswers);

  const [answers, setAnswers] = useState<Answers>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const answersRef = useRef<Answers>({});
  answersRef.current = answers;

  // ---------------------------------------------------------------------
  // Load. Answers saved by the previous one-page form are plain
  // Record<string, string>, so they load unchanged — the wizard only ever
  // re-keys them to numbers in memory.
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetchAnswers()
      .then((result) => {
        if (cancelled) return;
        const raw = (result?.answers ?? {}) as Record<string, string>;
        const initial: Answers = {};
        for (const key of Object.keys(raw)) {
          const id = Number(key);
          if (Number.isFinite(id)) initial[id] = raw[key];
        }
        setAnswers(initial);
        // Resume where the member actually left off, unless the URL asks for a
        // specific (and permitted) step.
        setStep(
          search.step !== undefined
            ? clampStep(search.step, initial)
            : firstIncompleteStep(initial),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "We couldn't load your saved answers",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: `search.step` is applied on later changes by
    // the sync effect below, and re-running this would clobber unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAnswers]);

  // Keep the URL and the step in sync, so refresh and browser-back behave.
  useEffect(() => {
    if (!loaded) return;
    if (search.step === step) return;
    void navigate({ to: "/survey", search: { step }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loaded]);

  // Browser back/forward changes the search param; honour it, clamped.
  useEffect(() => {
    if (!loaded || search.step === undefined || search.step === step) return;
    setStep(clampStep(search.step, answersRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.step, loaded]);

  // Move focus to the step heading on every transition.
  useEffect(() => {
    if (!loaded) return;
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, [step, loaded, finished]);

  const section = surveySections[step - 1];
  const onReview = step >= REVIEW_STEP;
  const percent = useMemo(() => progressPercent(answers, step), [answers, step]);
  const totalAnswered = useMemo(() => answeredCount(answers), [answers]);

  const setAnswer = (id: number, value: string) =>
    setAnswers((previous) => ({ ...previous, [id]: value }));

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------
  const persist = useCallback(
    async (completed: boolean) => {
      setSaving(true);
      setSaveError(null);
      try {
        const payload: Record<string, string> = {};
        for (const [key, value] of Object.entries(answersRef.current)) {
          if (typeof value === "string") payload[key] = value;
        }
        await save({ data: { answers: payload, completed } });
        setSavedAt(new Date().toLocaleTimeString());
        return true;
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "We couldn't save your answers just now",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [save],
  );

  const goTo = async (nextStep: number, { autosave = true }: { autosave?: boolean } = {}) => {
    if (autosave) {
      const ok = await persist(false);
      // A failed autosave must not silently lose the step's answers.
      if (!ok) return;
    }
    setShowErrors(false);
    setStep(clampStep(nextStep, answersRef.current));
  };

  const onContinue = async () => {
    if (!section) return;
    const missing = missingRequiredIds(section, answers);
    if (missing.length > 0) {
      setShowErrors(true);
      document
        .getElementById(`q-${missing[0]}`)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
      return;
    }
    setSkipped((previous) => {
      const next = new Set(previous);
      next.delete(section.step);
      return next;
    });
    await goTo(step + 1);
  };

  const onSkip = async () => {
    if (!section?.skippable) return;
    setSkipped((previous) => new Set(previous).add(section.step));
    await goTo(step + 1);
  };

  const onFinish = async () => {
    // The only call that marks the survey complete.
    const ok = await persist(true);
    if (ok) setFinished(true);
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
        <div className="mt-8 h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
        <p className="mt-8 text-sm text-muted-foreground">Loading your answers…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl text-foreground">We couldn't load your answers</h1>
        <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing has been lost — your saved answers are still on your account.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    );
  }

  if (finished) return <CompletionMoment />;

  return (
    <div className="min-h-screen pb-40 md:pb-24">
      {/* Sticky header: rail + progress + save draft */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Link
              to="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ← Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                {totalAnswered} / {TOTAL_QUESTION_COUNT} answered
              </span>
              <button
                type="button"
                onClick={() => persist(false)}
                disabled={saving}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : "Save draft"}
              </button>
            </div>
          </div>

          <StepRail
            sections={surveySections}
            currentStep={step}
            percent={percent}
            isComplete={(s) => {
              const target = surveySections[s - 1];
              return target ? isSectionComplete(target, answers) : false;
            }}
            isSkipped={(s) => skipped.has(s)}
            canVisit={(s) => s <= firstIncompleteStep(answers)}
            onVisit={(s) => void goTo(s)}
          />
        </div>
      </div>

      {saveError && (
        <div className="mx-auto mt-4 max-w-3xl px-6">
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {saveError} Your answers are still on this page — try again before closing the tab.
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6">
        {step === 1 && <Intro />}

        {onReview ? (
          <ReviewStep
            answers={answers}
            skipped={skipped}
            headingRef={headingRef}
            onEdit={(s) => void goTo(s)}
          />
        ) : section ? (
          <section className="pt-8" aria-labelledby="step-heading">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Step {step} of {surveySections.length}
            </p>
            <h1
              id="step-heading"
              ref={headingRef}
              tabIndex={-1}
              className="mt-2 text-display text-foreground outline-none"
            >
              {section.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {section.requiredIds.length === 0
                ? `${section.questions.length} optional question${section.questions.length === 1 ? "" : "s"} — skip any that don't apply.`
                : `${section.requiredIds.length} of ${section.questions.length} question${section.questions.length === 1 ? "" : "s"} required.`}
            </p>

            {SECTION_GUIDANCE[section.name] && (
              <p className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                {SECTION_GUIDANCE[section.name]}
              </p>
            )}

            <div className="mt-6 divide-y divide-border/60">
              {section.questions.map((question, index) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  index={index + 1}
                  value={answers[question.id] ?? ""}
                  onChange={(value) => setAnswer(question.id, value)}
                  invalid={showErrors && question.required && !isAnswered(answers[question.id])}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Sticky, thumb-reachable action bar. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => void goTo(step - 1)}
            disabled={step === 1 || saving}
            className="rounded-full border border-border px-5 py-3 text-sm hover:bg-accent disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back
          </button>

          <div className="flex-1" />

          {!onReview && section?.skippable && (
            <button
              type="button"
              onClick={() => void onSkip()}
              disabled={saving}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip for now
            </button>
          )}

          {onReview ? (
            <button
              type="button"
              onClick={() => void onFinish()}
              disabled={saving}
              className="rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {saving ? "Saving…" : "Submit my profile"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onContinue()}
              disabled={saving}
              className="rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {saving ? "Saving…" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="pt-10">
      <p className="font-arabic text-2xl text-primary" dir="rtl" lang="ar">
        ميثاق
      </p>
      <h2 className="mt-2 text-2xl text-foreground">Tell us about yourself</h2>
      <p className="mt-3 text-muted-foreground">
        {surveySections.length} sections, about {ESTIMATED_MINUTES} minutes. Save and return anytime
        — every answer is kept as you go.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        The first {REQUIRED_QUESTION_COUNT} questions are required; the rest help us match you more
        precisely. Your answers are stored privately and never shared until you approve a match.
      </p>
    </div>
  );
}

function ReviewStep({
  answers,
  skipped,
  headingRef,
  onEdit,
}: {
  answers: Answers;
  skipped: Set<number>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onEdit: (step: number) => void;
}) {
  return (
    <section className="pt-8" aria-labelledby="step-heading">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Final step</p>
      <h1
        id="step-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-2 text-display text-foreground outline-none"
      >
        Review your answers
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing is shared with anyone until you approve a match. You can come back and change any of
        this later.
      </p>

      <div className="mt-8 space-y-4">
        {surveySections.map((section) => {
          const answered = sectionAnsweredCount(section, answers);
          const wasSkipped = skipped.has(section.step) && answered === 0;
          return (
            <div key={section.name} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base text-foreground">{section.name}</h3>
                <button
                  type="button"
                  onClick={() => onEdit(section.step)}
                  className="text-xs text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Edit
                </button>
              </div>

              {wasSkipped ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Skipped for now — these {section.questions.length} questions are optional and you
                  can add them any time.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {answered} of {section.questions.length} answered
                  </p>
                  <dl className="mt-3 space-y-2">
                    {section.questions
                      .filter((question) => isAnswered(answers[question.id]))
                      .map((question) => (
                        <div key={question.id} className="text-sm">
                          <dt className="text-muted-foreground">{question.question}</dt>
                          <dd className="text-foreground">{answers[question.id]}</dd>
                        </div>
                      ))}
                  </dl>
                  {answered === 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nothing answered here yet — optional, but it sharpens your matches.
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompletionMoment() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
      <p className="font-arabic text-3xl text-primary" dir="rtl" lang="ar">
        بارك الله فيك
      </p>
      <h1 className="mt-4 text-3xl text-foreground">Your profile is with us.</h1>
      <p className="mt-4 text-muted-foreground">
        Thank you for the care you put into that — it was a lot of questions, and considered answers
        are what make a considered introduction possible.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground">
          What happens now
        </h2>
        <ol className="mt-4 space-y-3 text-sm text-foreground">
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-muted-foreground">
              1.
            </span>
            <span>
              Your answers stay private. Nobody — no other member, no imam — sees them until you
              approve a match.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-muted-foreground">
              2.
            </span>
            <span>
              When you're ready, generate your matches from your dashboard. You choose when, and you
              can change your visibility first.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-muted-foreground">
              3.
            </span>
            <span>
              If you and a match both express interest, an imam near you is introduced to oversee
              the process from there.
            </span>
          </li>
        </ol>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/dashboard"
          className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Go to my dashboard
        </Link>
        <Link
          to="/survey"
          search={{ step: 1 }}
          reloadDocument
          className="rounded-full border border-border px-6 py-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Review my answers again
        </Link>
      </div>
    </div>
  );
}
