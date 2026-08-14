import { REVIEW_STEP, type SurveySection } from "@/lib/survey-sections";

/**
 * Progress that reflects the journey rather than raw question count:
 * named steps on desktop, a compact "Step 3 of 9 · Section" on mobile.
 * Completed steps are clickable so members can go back and edit.
 */
export function StepRail({
  sections,
  currentStep,
  isComplete,
  isSkipped,
  canVisit,
  onVisit,
  percent,
}: {
  sections: SurveySection[];
  currentStep: number;
  isComplete: (step: number) => boolean;
  isSkipped: (step: number) => boolean;
  canVisit: (step: number) => boolean;
  onVisit: (step: number) => void;
  percent: number;
}) {
  const currentSection = sections[currentStep - 1];
  const label =
    currentStep >= REVIEW_STEP
      ? "Review your answers"
      : (currentSection?.name ?? "Review your answers");

  return (
    <div>
      {/* Mobile: compact position indicator. */}
      <div className="flex items-baseline justify-between gap-3 md:hidden">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {currentStep >= REVIEW_STEP ? "Final step" : `Step ${currentStep} of ${sections.length}`}
        </p>
        <p className="truncate text-sm text-foreground">{label}</p>
      </div>

      {/* Desktop: the full named rail. */}
      <ol className="hidden flex-wrap items-center gap-x-1 gap-y-2 md:flex">
        {sections.map((section) => {
          const active = section.step === currentStep;
          const done = isComplete(section.step) && !active;
          const skipped = isSkipped(section.step);
          const reachable = canVisit(section.step);

          return (
            <li key={section.name}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                onClick={() => onVisit(section.step)}
                className={[
                  "rounded-full px-3 py-1 text-xs transition-colors motion-reduce:transition-none",
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground hover:bg-accent",
                  reachable ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                ].join(" ")}
              >
                <span aria-hidden="true" className="mr-1.5 tabular-nums">
                  {done ? "✓" : skipped ? "–" : section.step}
                </span>
                {section.name}
                {done ? <span className="sr-only"> (completed)</span> : null}
                {skipped ? <span className="sr-only"> (skipped)</span> : null}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            disabled={!canVisit(REVIEW_STEP)}
            aria-current={currentStep >= REVIEW_STEP ? "step" : undefined}
            onClick={() => onVisit(REVIEW_STEP)}
            className={[
              "rounded-full px-3 py-1 text-xs transition-colors motion-reduce:transition-none",
              currentStep >= REVIEW_STEP
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
              canVisit(REVIEW_STEP) ? "cursor-pointer" : "cursor-not-allowed opacity-50",
            ].join(" ")}
          >
            Review
          </button>
        </li>
      </ol>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Survey progress"
        >
          <div
            className="h-full bg-primary transition-all motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
    </div>
  );
}
