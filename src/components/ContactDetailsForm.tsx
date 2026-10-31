import { useServerFn } from "@tanstack/react-start";
import { Check, Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  BEST_TIMES,
  CONTACT_METHODS,
  MEETING_FORMATS,
  WALI_RELATIONSHIPS,
  optionLabel,
} from "@/lib/member-contacts";
import { getMyContactDetails, saveMyContactDetails } from "@/lib/member-contacts.functions";

type Method = (typeof CONTACT_METHODS)[number]["value"];
type BestTime = (typeof BEST_TIMES)[number]["value"];
type Relationship = (typeof WALI_RELATIONSHIPS)[number]["value"];
type Format = (typeof MEETING_FORMATS)[number]["value"];

type FormState = {
  contact_method: Method;
  phone: string;
  email: string;
  best_times: BestTime[];
  wali_name: string;
  wali_relationship: Relationship | "";
  wali_phone: string;
  meeting_formats: Format[];
};

const EMPTY: FormState = {
  contact_method: "whatsapp",
  phone: "",
  email: "",
  best_times: [],
  wali_name: "",
  wali_relationship: "",
  wali_phone: "",
  meeting_formats: [],
};

const inputClass =
  "min-h-11 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/55 focus:border-primary focus:ring-2 focus:ring-ring/30";
const choiceClass =
  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground has-[:checked]:border-primary has-[:checked]:bg-primary/5";
const boxClass = "h-5 w-5 shrink-0 cursor-pointer accent-primary";

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * "How your imam can reach you". In the survey it is optional and saved on
 * its own. After both members pay ("confirm" mode) the member confirms it so
 * the assigned imam can arrange the meeting.
 */
export function ContactDetailsForm({
  mode,
  waliRequired: waliRequiredOverride,
}: {
  mode: "survey" | "confirm";
  waliRequired?: boolean;
}) {
  const load = useServerFn(getMyContactDetails);
  const save = useServerFn(saveMyContactDetails);
  const id = useId();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [serverWaliRequired, setServerWaliRequired] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(mode === "survey");
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const waliRequired = waliRequiredOverride ?? serverWaliRequired;

  useEffect(() => {
    let active = true;
    load()
      .then((result) => {
        if (!active) return;
        setAvailable(result.available);
        setAccountEmail(result.accountEmail);
        setServerWaliRequired(result.waliRequired);
        const details = result.details;
        if (details) {
          setForm({
            contact_method: (details.contact_method as Method) ?? "whatsapp",
            phone: details.phone ?? "",
            email: details.email ?? "",
            best_times: (details.best_times ?? []) as BestTime[],
            wali_name: details.wali_name ?? "",
            wali_relationship: (details.wali_relationship as Relationship | null) ?? "",
            wali_phone: details.wali_phone ?? "",
            meeting_formats: (details.meeting_formats ?? []) as Format[],
          });
          setConfirmedAt(details.confirmed_at ?? null);
          if (mode === "confirm" && !details.confirmed_at) setEditing(true);
        } else if (mode === "confirm") {
          setEditing(true);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setMessage({ kind: "error", text: "Your contact details could not be loaded." });
        setLoaded(true);
        setEditing(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  // This sits inside the survey <form>: Enter must not submit the survey.
  const stopEnter = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT")
      event.preventDefault();
  };

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await save({
        data: {
          ...form,
          wali_relationship: form.wali_relationship || null,
          confirm: mode === "confirm",
        },
      });
      if (mode === "confirm") {
        setConfirmedAt(new Date().toISOString());
        setEditing(false);
        setMessage({ kind: "ok", text: "Thank you. Your imam can now arrange your meeting." });
      } else {
        setMessage({ kind: "ok", text: "Saved. Only your assigned imam will see these details." });
      }
    } catch (caught) {
      const text =
        caught instanceof Error && caught.message
          ? caught.message
          : "Your contact details could not be saved.";
      setMessage({ kind: "error", text: friendlyError(text) });
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "confirm" ? "Help your imam arrange your meeting" : "How your imam can reach you";

  if (!available) return null;

  if (!loaded) {
    return (
      <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        Loading your contact details…
      </section>
    );
  }

  if (!editing) {
    return (
      <section
        aria-labelledby={`${id}-title`}
        className="rounded-lg border border-primary/25 bg-primary/5 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id={`${id}-title`} className="flex items-center gap-2 font-semibold">
              <Check aria-hidden="true" className="size-4 text-primary" />
              Your imam has your contact details
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {optionLabel(CONTACT_METHODS, form.contact_method)}
              {form.phone ? ` · ${form.phone}` : ""}
              {form.wali_name ? ` · Wali: ${form.wali_name}` : ""}
            </p>
            {confirmedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Confirmed{" "}
                {new Date(confirmedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
                . Your match never sees these details.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent"
          >
            Edit
          </button>
        </div>
        {message?.kind === "ok" && (
          <p className="mt-3 text-sm font-medium text-primary" role="status">
            {message.text}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      onKeyDown={stopEnter}
      className="rounded-lg border border-border bg-card p-5 sm:p-7"
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
        {mode === "confirm" ? "Next step" : "Optional · private"}
      </p>
      <h2 id={`${id}-title`} className="mt-2 text-xl sm:text-2xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {mode === "confirm"
          ? "You have both chosen a meeting package. Check these details so your imam can contact you and your wali to arrange the first meeting."
          : "Only the imam assigned to your match sees this, and only after you both decide to go ahead and pay. You can also add it later."}
      </p>

      <div className="mt-6 space-y-6">
        <fieldset>
          <legend className="text-sm font-semibold">How should your imam contact you?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CONTACT_METHODS.map((option) => (
              <label key={option.value} className={choiceClass}>
                <input
                  type="radio"
                  name={`${id}-method`}
                  className={boxClass}
                  checked={form.contact_method === option.value}
                  onChange={() => update("contact_method", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-phone`} className="text-sm font-semibold">
              Mobile number
              {mode === "confirm" && form.contact_method !== "email" ? "" : " (optional)"}
            </label>
            <input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07700 900123"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-email`} className="text-sm font-semibold">
              Email (optional)
            </label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              placeholder={accountEmail ?? "you@example.com"}
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave blank to use your account email.
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Best times to contact you</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BEST_TIMES.map((option) => (
              <label key={option.value} className={choiceClass}>
                <input
                  type="checkbox"
                  className={boxClass}
                  checked={form.best_times.includes(option.value)}
                  onChange={() => update("best_times", toggle(form.best_times, option.value))}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="border-t border-border pt-5">
          <h3 className="text-sm font-semibold">
            Your wali{" "}
            <span className="font-normal text-muted-foreground">
              {waliRequired ? "(required for sisters)" : "(optional)"}
            </span>
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Your imam may call your wali to agree the meeting arrangements.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-wali-name`} className="text-sm font-medium">
                Wali's name
              </label>
              <input
                id={`${id}-wali-name`}
                type="text"
                autoComplete="off"
                value={form.wali_name}
                onChange={(event) => update("wali_name", event.target.value)}
                className={`mt-2 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor={`${id}-wali-rel`} className="text-sm font-medium">
                Relationship to you
              </label>
              <select
                id={`${id}-wali-rel`}
                value={form.wali_relationship}
                onChange={(event) =>
                  update("wali_relationship", event.target.value as Relationship | "")
                }
                className={`mt-2 ${inputClass}`}
              >
                <option value="">Choose…</option>
                {WALI_RELATIONSHIPS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-wali-phone`} className="text-sm font-medium">
                Wali's phone number
              </label>
              <input
                id={`${id}-wali-phone`}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={form.wali_phone}
                onChange={(event) => update("wali_phone", event.target.value)}
                className={`mt-2 ${inputClass} sm:max-w-xs`}
              />
            </div>
          </div>
        </div>

        <fieldset className="border-t border-border pt-5">
          <legend className="text-sm font-semibold">
            How would you be happy to meet the first time?
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {MEETING_FORMATS.map((option) => (
              <label key={option.value} className={choiceClass}>
                <input
                  type="checkbox"
                  className={boxClass}
                  checked={form.meeting_formats.includes(option.value)}
                  onChange={() =>
                    update("meeting_formats", toggle(form.meeting_formats, option.value))
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="flex items-start gap-2.5 rounded-lg bg-primary/5 p-3.5 text-sm text-foreground">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          Your match never sees these details. They are shared only with your assigned imam, and
          never used for compatibility scoring.
        </p>

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm font-medium ${message.kind === "error" ? "text-destructive" : "text-primary"}`}
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : mode === "confirm"
                ? "Confirm my details"
                : "Save contact details"}
          </button>
          {mode === "confirm" && confirmedAt && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function friendlyError(text: string) {
  // Zod validation errors arrive as JSON; show the first readable message.
  if (text.trim().startsWith("[") || text.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as Array<{ message?: string }> | { message?: string };
      const first = Array.isArray(parsed) ? parsed[0]?.message : parsed.message;
      if (first) return first;
    } catch {
      // fall through
    }
    return "Please check the details you entered.";
  }
  return text;
}
