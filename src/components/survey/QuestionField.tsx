import { useRef } from "react";
import type { Question } from "@/lib/survey-questions";

/**
 * One question. The rhythm deliberately varies by type rather than putting all
 * fifty in identical bordered cards: a short choice question is given room to
 * breathe, a long option list tightens up, and free text gets a real input
 * surface. Only a question in an error state draws a border.
 */
export function QuestionField({
  question,
  value,
  onChange,
  invalid,
  index,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  /** Position within the step, shown instead of the global question id. */
  index: number;
}) {
  const optionsRef = useRef<HTMLDivElement>(null);
  const options = question.options ?? [];
  // A short list reads better as a single roomy row; long lists need columns.
  const roomy = question.type === "choice" && options.length <= 3;

  // Arrow keys move between choice buttons; Enter/Space select natively.
  const onOptionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(
      optionsRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]") ?? [],
    );
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex === -1) return;
    event.preventDefault();

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    }
    buttons[nextIndex]?.focus();
  };

  const describedBy = invalid ? `q-${question.id}-error` : undefined;

  return (
    <div
      id={`q-${question.id}`}
      className={[
        "scroll-mt-32 rounded-2xl px-4 py-5 sm:px-6",
        invalid ? "border border-destructive bg-destructive/5" : "border border-transparent",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-base text-foreground sm:text-lg">
          <span aria-hidden="true" className="mr-2 tabular-nums text-muted-foreground">
            {index}.
          </span>
          {question.question}
        </p>
        {!question.required && (
          <span className="mt-1 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Optional
          </span>
        )}
      </div>

      {question.type === "choice" && options.length > 0 ? (
        <div
          ref={optionsRef}
          role="radiogroup"
          aria-label={question.question}
          aria-describedby={describedBy}
          onKeyDown={onOptionKeyDown}
          className={[
            "mt-4 grid gap-2",
            roomy ? "sm:grid-flow-col sm:auto-cols-fr" : "sm:grid-cols-2",
          ].join(" ")}
        >
          {options.map((option) => {
            const selected = value === option;
            return (
              <button
                type="button"
                key={option}
                data-option
                role="radio"
                aria-checked={selected}
                // Roving tabindex: one stop per group, arrows move within it.
                tabIndex={selected || (!value && option === options[0]) ? 0 : -1}
                onClick={() => onChange(option)}
                className={[
                  "rounded-xl border px-4 text-left text-sm transition-colors motion-reduce:transition-none",
                  roomy ? "py-4" : "py-3",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : question.type === "number" ? (
        <input
          type="number"
          min={18}
          max={100}
          inputMode="numeric"
          value={value}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          className="mt-4 w-32 rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="e.g. 27"
        />
      ) : (
        <textarea
          value={value}
          rows={3}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          className="mt-4 w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="In your own words…"
        />
      )}

      {invalid && (
        <p id={`q-${question.id}-error`} className="mt-2 text-xs text-destructive">
          This question is required to continue.
        </p>
      )}
    </div>
  );
}
