import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listMyImamReferrals, submitImamReferral } from "@/lib/imam.functions";

export function ImamReferrals() {
  const fetchRows = useServerFn(listMyImamReferrals),
    submit = useServerFn(submitImamReferral);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMyImamReferrals>> | null>(null);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = () =>
    fetchRows()
      .then(setRows)
      .catch(() => setMessage("Referrals could not load. Refresh and try again."));
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  return (
    <div className="space-y-5">
      <form
        className="rounded-lg border border-border bg-card p-4 sm:p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !permission) return;
          setBusy(true);
          setMessage("");
          try {
            await submit({ data: { name, email, permission: true } });
            setName("");
            setEmail("");
            setPermission(false);
            setMessage(
              "Referral sent to the Mithaq administrator for review. No account access has been granted.",
            );
            await load();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Referral could not be saved.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-xl font-semibold">Refer an imam</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Suggest an imam for Mithaq to review. Referring someone does not transfer your matches or
          give them access to member information.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Imam’s name
            <input
              required
              minLength={2}
              maxLength={120}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background p-3"
            />
          </label>
          <label className="text-sm font-medium">
            Email address
            <input
              required
              type="email"
              maxLength={320}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background p-3"
            />
          </label>
        </div>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm">
          <input
            required
            type="checkbox"
            checked={permission}
            onChange={(e) => setPermission(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-primary"
          />
          <span>I have permission to share these details with Mithaq for this referral.</span>
        </label>
        <button
          disabled={busy || !permission}
          className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto"
        >
          {busy ? "Submitting…" : "Send for review"}
        </button>
      </form>
      {message && (
        <p role="status" className="rounded-md border border-border p-3 text-sm">
          {message}
        </p>
      )}
      <h2 className="text-lg font-semibold">Your referrals</h2>
      {!rows ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">No referrals yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((row) => (
            <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div>
                <h3 className="text-sm font-medium">{row.referred_name}</h3>
                <p className="mt-1 break-all text-sm text-muted-foreground">{row.referred_email}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Submitted {new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="rounded-md bg-muted px-3 py-1 text-xs capitalize">{row.status}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
