import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { createImamReferral, listMyImamReferrals } from "@/lib/imam-referrals.functions";

export const Route = createFileRoute("/_authenticated/imam/refer")({
  head: () => ({
    meta: [{ title: "Refer an imam — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  component: ReferImamPage,
});

function ReferImamPage() {
  const createReferral = useServerFn(createImamReferral);
  const fetchReferrals = useServerFn(listMyImamReferrals);
  const [referrals, setReferrals] = useState<Awaited<
    ReturnType<typeof listMyImamReferrals>
  > | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetchReferrals()
      .then(setReferrals)
      .catch((cause) => setError(String(cause)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8 pb-20">
      <section className="rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Grow the trusted network
        </p>
        <h1 className="mt-2 text-3xl text-foreground">Refer an imam</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Recommend an imam you know and trust. The Mithaq administrator will contact them first.
          They will only receive an account invitation after approval.
        </p>

        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              await createReferral({ data: { name, email } });
              setName("");
              setEmail("");
              setMessage("Referral sent to the Mithaq administrator for review.");
              await load();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not send the referral");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm text-foreground">
            Imam’s full name
            <input
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5"
            />
          </label>
          <label className="text-sm text-foreground">
            Imam’s email address
            <input
              required
              type="email"
              maxLength={320}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Sending referral…" : "Refer imam"}
            </button>
          </div>
        </form>
        {message ? <p className="mt-4 text-sm text-primary">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </section>

      <section>
        <h2 className="text-xl text-foreground">Your referrals</h2>
        <div className="mt-3 space-y-3">
          {referrals === null ? (
            <p className="text-sm text-muted-foreground">Loading referrals…</p>
          ) : referrals.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              You have not referred an imam yet.
            </p>
          ) : (
            referrals.map((referral) => (
              <article key={referral.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{referral.referred_name}</p>
                    <p className="text-sm text-muted-foreground">{referral.referred_email}</p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">
                    {referral.status === "invited" ? "invitation sent" : referral.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Referred {new Date(referral.created_at).toLocaleDateString()}
                </p>
                {referral.admin_notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Administrator note: {referral.admin_notes}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
