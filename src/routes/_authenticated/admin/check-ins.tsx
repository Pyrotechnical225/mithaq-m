import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listCheckInsAdmin, reviewCheckInAdmin } from "@/lib/member-notifications.functions";
import { checkInLabels } from "@/lib/check-in-labels";

export const Route = createFileRoute("/_authenticated/admin/check-ins")({
  head: () => ({
    meta: [{ title: "Private check-ins — Mithaq admin" }, { name: "robots", content: "noindex" }],
  }),
  component: CheckInsAdmin,
});
function CheckInsAdmin() {
  const fetchItems = useServerFn(listCheckInsAdmin),
    review = useServerFn(reviewCheckInAdmin);
  const [data, setData] = useState<Awaited<ReturnType<typeof listCheckInsAdmin>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    fetchItems()
      .then(setData)
      .catch(() =>
        setError("Check-ins could not load. Please refresh or verify your MFA session."),
      );
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Member care</p>
        <h1 className="mt-2 text-3xl">Private check-ins</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Latest 200 responses, newest first. Do not share these private updates with the other
          member or imam. Follow your safeguarding process for support requests; marking reviewed
          does not contact anyone.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data ? (
        <p>Loading…</p>
      ) : !data.available ? (
        <p>Check-ins are awaiting database setup.</p>
      ) : !data.items.length ? (
        <p className="rounded-lg border border-border bg-card p-5">No responses yet.</p>
      ) : (
        data.items.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  {checkInLabels[item.outcome as keyof typeof checkInLabels] ?? "Member update"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.answered_at!).toLocaleString()} ·{" "}
                  {item.reviewed_at ? "Reviewed" : "Awaiting review"}
                </p>
              </div>
              <Link
                to="/admin/profiles/$userId"
                params={{ userId: item.user_id }}
                className="flex min-h-11 items-center rounded-md border border-border px-3 text-sm"
              >
                Open member
              </Link>
            </div>
            {item.note && <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{item.note}</p>}
            {!item.reviewed_at && (
              <button
                disabled={busy}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await review({ data: { id: item.id } });
                    await load();
                  } catch {
                    setError("Review could not be saved. Please refresh and try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Mark reviewed
              </button>
            )}
          </article>
        ))
      )}
    </div>
  );
}
