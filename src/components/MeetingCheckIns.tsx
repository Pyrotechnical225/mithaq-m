import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { answerMyCheckIn, getMyCheckIns } from "@/lib/member-notifications.functions";
import { checkInLabels } from "@/lib/check-in-labels";
type MeetingCheckIn = Awaited<ReturnType<typeof getMyCheckIns>>["items"][number];

export function MeetingCheckIns() {
  const fetchItems = useServerFn(getMyCheckIns);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyCheckIns>> | null>(null);
  const [error, setError] = useState("");
  const load = () =>
    fetchItems()
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch(() => setError("Your check-ins could not load. Please try again."));
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  return (
    <section
      id="check-ins"
      className="scroll-mt-24 rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        After your meeting
      </p>
      <h2 className="mt-2 text-xl font-semibold">How are things going?</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Three weeks after a completed meeting, you can share a private update. Only you and
        authorised Mithaq administrators can read your response—not the other member or imam. This
        does not change your match status.
      </p>
      {error ? (
        <div className="mt-4">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <button
            onClick={() => void load()}
            className="mt-3 rounded-md border border-border px-4 py-2 text-sm"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading check-ins…
        </p>
      ) : !data.items.length ? (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          No check-ins are due right now.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {data.items.map((item) => (
            <CheckInForm key={item.id} item={item} onSaved={load} />
          ))}
        </div>
      )}
    </section>
  );
}

function CheckInForm({ item, onSaved }: { item: MeetingCheckIn; onSaved: () => Promise<void> }) {
  const save = useServerFn(answerMyCheckIn);
  const [outcome, setOutcome] = useState<keyof typeof checkInLabels | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (item.answered_at)
    return (
      <details className="rounded-md border border-border p-4 text-sm">
        <summary className="cursor-pointer py-2 font-medium">
          Update shared {new Date(item.answered_at).toLocaleDateString()}
        </summary>
        <p className="mt-3">
          {checkInLabels[item.outcome as keyof typeof checkInLabels] ?? "Response recorded"}
        </p>
        {item.note && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.note}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          {item.reviewed_at
            ? "Reviewed by Mithaq."
            : "Available for Mithaq to review. This is not an emergency support service."}
        </p>
      </details>
    );
  return (
    <form
      className="rounded-md border border-border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!outcome || busy) return;
        setBusy(true);
        setError("");
        try {
          await save({ data: { id: item.id, outcome, note } });
          await onSaved();
        } catch {
          setError(
            "Your response could not be saved. Refresh to check whether it has already been recorded.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-medium">
        Check-in due {new Date(item.due_at).toLocaleDateString()}
      </p>
      <label className="mt-4 block text-sm font-medium" htmlFor={`outcome-${item.id}`}>
        How is your introduction going?
      </label>
      <select
        required
        id={`outcome-${item.id}`}
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as keyof typeof checkInLabels)}
        className="mt-2 w-full rounded-md border border-input bg-background p-3"
      >
        <option value="">Choose an update</option>
        {Object.entries(checkInLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-sm font-medium" htmlFor={`note-${item.id}`}>
        Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <textarea
        id={`note-${item.id}`}
        value={note}
        maxLength={1000}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        className="mt-2 w-full rounded-md border border-input bg-background p-3"
      />
      <p className="text-xs leading-5 text-muted-foreground">
        Avoid unnecessary sensitive information. For an urgent safety issue, use the report controls
        in your introduction; this form is not monitored continuously.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        disabled={busy || !outcome}
        className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Saving…" : "Share private update"}
      </button>
    </form>
  );
}
