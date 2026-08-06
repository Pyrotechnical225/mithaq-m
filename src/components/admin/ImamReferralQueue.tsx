import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listAllImamReferrals, reviewImamReferral } from "@/lib/imam-referrals.functions";

export function ImamReferralQueue() {
  const listReferrals = useServerFn(listAllImamReferrals);
  const reviewReferral = useServerFn(reviewImamReferral);
  const [referrals, setReferrals] = useState<Awaited<
    ReturnType<typeof listAllImamReferrals>
  > | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listReferrals()
      .then(setReferrals)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (id: string, decision: "approved" | "declined") => {
    setBusyId(id);
    setError(null);
    setMessage(null);
    try {
      const result = await reviewReferral({
        data: { referral_id: id, decision, admin_notes: notes[id] || null },
      });
      if (result.invitation_url) {
        setLinks((current) => ({ ...current, [id]: result.invitation_url! }));
        setMessage("Invitation created. Copy it now and send it to the approved imam.");
      } else {
        setMessage("Referral declined.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the referral");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-xl text-foreground">Imam referrals</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Contact referred imams personally, then approve them to create a private 14-day account
        invitation.
      </p>
      {message ? <p className="mt-3 text-sm text-primary">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-5 space-y-4">
        {referrals === null ? (
          <p className="text-sm text-muted-foreground">Loading referrals…</p>
        ) : referrals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No imam referrals yet.
          </p>
        ) : (
          referrals.map((referral) => {
            const canReview = ["pending", "approved", "invited"].includes(referral.status);
            return (
              <article key={referral.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{referral.referred_name}</p>
                    <a
                      href={`mailto:${referral.referred_email}`}
                      className="text-sm text-primary underline-offset-2 hover:underline"
                    >
                      {referral.referred_email}
                    </a>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Referred by {referral.referrer?.name ?? "an imam"}
                      {referral.referrer?.mosque ? ` · ${referral.referrer.mosque}` : ""}
                      {referral.referrer?.city ? ` · ${referral.referrer.city}` : ""}
                      {` · ${new Date(referral.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs capitalize">
                    {referral.status === "invited" ? "invitation created" : referral.status}
                  </span>
                </div>

                {canReview ? (
                  <div className="mt-4 space-y-3">
                    <textarea
                      rows={2}
                      maxLength={2000}
                      placeholder="Private review note (optional)"
                      value={notes[referral.id] ?? referral.admin_notes ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [referral.id]: event.target.value }))
                      }
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={busyId === referral.id}
                        onClick={() => decide(referral.id, "approved")}
                        className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                      >
                        {referral.status === "invited"
                          ? "Generate a new link"
                          : "Accept & create link"}
                      </button>
                      <button
                        disabled={busyId === referral.id}
                        onClick={() => decide(referral.id, "declined")}
                        className="rounded-full border border-border px-4 py-2 text-xs hover:bg-accent disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ) : null}

                {links[referral.id] ? (
                  <div className="mt-4 rounded-xl bg-primary/5 p-3">
                    <label className="text-xs font-medium text-foreground">
                      Private invitation link
                      <input
                        readOnly
                        value={links[referral.id]}
                        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(links[referral.id]);
                        setMessage("Invitation link copied.");
                      }}
                      className="mt-2 rounded-full border border-primary px-4 py-1.5 text-xs text-primary"
                    >
                      Copy link
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
