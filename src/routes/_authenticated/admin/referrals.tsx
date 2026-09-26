import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  listImamReferralsAdmin,
  reviewImamReferralAdmin,
} from "@/lib/imam-referral-review.functions";
export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({
    meta: [{ title: "Imam referrals — Mithaq admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ReferralsAdmin,
});
function ReferralsAdmin() {
  const fetchRows = useServerFn(listImamReferralsAdmin),
    review = useServerFn(reviewImamReferralAdmin);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listImamReferralsAdmin>> | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    fetchRows()
      .then(setRows)
      .catch(() =>
        setError("Referrals could not load. Please refresh or verify your MFA session."),
      );
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl">Imam referrals</h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Latest 200 referrals. Review the details before accepting. Acceptance records your decision
        only; verify and onboard the imam separately before granting account access.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!rows ? (
        <p>Loading…</p>
      ) : !rows.length ? (
        <p>No referrals yet.</p>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-semibold">{row.referred_name}</h2>
                <p className="mt-1 break-all text-sm text-muted-foreground">{row.referred_email}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Submitted {new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm capitalize">{row.status}</p>
            </div>
            {row.status === "pending" && (
              <div className="mt-4 flex gap-3">
                {(["approved", "declined"] as const).map((decision) => (
                  <button
                    key={decision}
                    disabled={busy}
                    className="rounded-md border border-border px-4 py-2 text-sm"
                    onClick={async () => {
                      if (
                        !confirm(
                          `${decision === "approved" ? "Accept" : "Decline"} this imam referral? This does not grant account access.`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        await review({ data: { id: row.id, decision } });
                        await load();
                      } catch {
                        setError("Decision could not be saved. Refresh and try again.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {decision === "approved" ? "Accept referral" : "Decline"}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
