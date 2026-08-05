import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  confirmIntroductionPayment,
  listMyNotifications,
  listMyPairings,
  respondToPairing,
  setMeetingPreference,
  startIntroductionCheckout,
} from "@/lib/pairings.functions";

type Pairing = Awaited<ReturnType<typeof listMyPairings>>[number];

const labels: Record<string, string> = {
  member_review: "Your private response",
  awaiting_payment: "Both accepted — payment due",
  payment_pending: "Waiting for both payments",
  ready_to_schedule: "Ready for the imam to arrange",
  scheduled: "Meeting scheduled",
  declined: "Not taken forward",
};

export function PairingsSection() {
  const list = useServerFn(listMyPairings);
  const listNotifications = useServerFn(listMyNotifications);
  const respond = useServerFn(respondToPairing);
  const checkout = useServerFn(startIntroductionCheckout);
  const confirm = useServerFn(confirmIntroductionPayment);
  const savePreference = useServerFn(setMeetingPreference);
  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<
    Awaited<ReturnType<typeof listMyNotifications>>
  >([]);
  const load = () =>
    Promise.all([list(), listNotifications()])
      .then(([rows, notices]) => {
        setPairings(rows);
        setNotifications(notices);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load introductions"));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session_id");
    if (params.get("introduction") === "success" && session) {
      confirm({ data: { session_id: session } }).finally(load);
    } else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update introduction");
    }
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        Private introductions
      </p>
      <h2 className="mt-2 text-2xl text-foreground">Imam-reviewed matches</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        You will see the compatibility score and anonymous profile only after the imam approves the
        match. Names and searchable contact details stay hidden.
      </p>
      {error && (
        <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      {notifications.length > 0 && (
        <div className="mt-5 space-y-2" aria-label="Recent notifications">
          {notifications.slice(0, 3).map((notice) => (
            <div key={notice.id} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium text-foreground">{notice.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{notice.body}</p>
            </div>
          ))}
        </div>
      )}
      {pairings === null ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading introductions…</p>
      ) : pairings.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No imam-approved introductions yet. We will notify you when one is ready.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {pairings.map((p) => {
            const mine = p.i_am === "a" ? p.member_a_response : p.member_b_response;
            const payment = p.i_am === "a" ? p.payment_a_status : p.payment_b_status;
            const preference = p.i_am === "a" ? p.meeting_preference_a : p.meeting_preference_b;
            const details = [
              ["Age", p.other.age],
              ["City", p.other.uk_city],
              ["Background", p.other.ethnicity],
              ["Marital status", p.other.marital_status],
              ["Children", p.other.children],
              ["Education", p.other.education],
              ["Field of work", p.other.occupation_field],
              ["Religious practice", p.other.practice_level],
              ["Languages", p.other.languages],
              ["Marriage timeline", p.other.marriage_timeline],
              ["Relocation", p.other.relocation],
            ].filter((x) => x[1]);
            return (
              <article key={p.id} className="rounded-2xl border border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">
                        Anonymous profile {p.other.reference}
                      </p>
                      {p.compatibility_score != null && (
                        <span className="rounded-full bg-gold/15 px-3 py-1 text-sm font-semibold text-foreground">
                          {p.compatibility_score}% compatible
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reviewed by {p.imam ? `Imam ${p.imam.name}` : "a Mithaq imam"}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {labels[p.status] ?? p.status}
                  </span>
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {details.map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl bg-muted/60 p-3">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
                {p.status === "member_review" && mine === "pending" && (
                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={() =>
                        act(() => respond({ data: { pairing_id: p.id, accept: true } }))
                      }
                      className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                    >
                      Accept privately
                    </button>
                    <button
                      onClick={() =>
                        act(() => respond({ data: { pairing_id: p.id, accept: false } }))
                      }
                      className="rounded-full border border-border px-5 py-2 text-sm"
                    >
                      Decline
                    </button>
                  </div>
                )}
                {p.status === "member_review" && mine !== "pending" && (
                  <p className="mt-5 text-sm text-muted-foreground">
                    Your response: {mine}. The other member cannot see your identity while they
                    decide.
                  </p>
                )}
                {["awaiting_payment", "payment_pending"].includes(p.status) &&
                  payment !== "paid" && (
                    <div className="mt-5 rounded-2xl border border-gold/40 bg-gold/10 p-4">
                      <p className="font-medium text-foreground">Both members accepted</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pay £39 to continue to the imam-arranged meeting. Both members pay
                        separately.
                      </p>
                      <button
                        onClick={() =>
                          act(async () => {
                            const r = await checkout({
                              data: { pairing_id: p.id },
                            });
                            window.location.href = r.url;
                          })
                        }
                        className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                      >
                        Pay securely
                      </button>
                    </div>
                  )}
                {payment === "paid" && !preference && (
                  <div className="mt-5">
                    <p className="text-sm font-medium text-foreground">
                      Payment received. Choose your meeting preference:
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        onClick={() =>
                          act(() =>
                            savePreference({ data: { pairing_id: p.id, preference: "online" } }),
                          )
                        }
                        className="rounded-full border border-border px-4 py-2 text-sm"
                      >
                        Online
                      </button>
                      <button
                        onClick={() =>
                          act(() =>
                            savePreference({
                              data: { pairing_id: p.id, preference: "face_to_face" },
                            }),
                          )
                        }
                        className="rounded-full border border-border px-4 py-2 text-sm"
                      >
                        Face-to-face
                      </button>
                    </div>
                  </div>
                )}
                {preference && (
                  <p className="mt-5 text-sm text-primary">
                    ✓ Your preference: {preference === "face_to_face" ? "Face-to-face" : "Online"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default PairingsSection;
