import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  confirmMeetingPackagePayment,
  listMyNotifications,
  listMyPairings,
  listPairingMessages,
  markNotificationRead,
  postPairingMessage,
  respondToPairing,
  respondToMeetup,
  startMeetingPackageCheckout,
} from "@/lib/pairings.functions";
import { formatPence, MEETING_PACKAGES } from "@/lib/meeting-packages";
import { blockMember, reportMember } from "@/lib/trust.functions";

type Pairing = Awaited<ReturnType<typeof listMyPairings>>[number];
type Message = Awaited<ReturnType<typeof listPairingMessages>>[number];

const INTRODUCTION_LABELS: Record<string, string> = {
  member_review: "Private response needed",
  awaiting_payment: "Both accepted · choose a package",
  payment_pending: "Waiting for both payments",
  ready_to_schedule: "Ready for the imam",
  scheduled: "Meeting scheduled",
  completed: "Introduction completed",
  approved: "Approved by imam",
  closed: "Introduction closed",
  declined: "Not taken forward",
};

const MESSAGING_STATUSES = new Set([
  "awaiting_payment",
  "payment_pending",
  "ready_to_schedule",
  "scheduled",
  "completed",
  "approved",
]);

export function PairingsSection() {
  const list = useServerFn(listMyPairings);
  const listNotifications = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const respondToIntroduction = useServerFn(respondToPairing);
  const checkout = useServerFn(startMeetingPackageCheckout);
  const confirmPayment = useServerFn(confirmMeetingPackagePayment);
  const respond = useServerFn(respondToMeetup);
  const fetchMessages = useServerFn(listPairingMessages);
  const send = useServerFn(postPairingMessage);
  const block = useServerFn(blockMember);
  const report = useServerFn(reportMember);

  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [notifications, setNotifications] = useState<
    Awaited<ReturnType<typeof listMyNotifications>>
  >([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<
    "harassment" | "safety" | "identity" | "inappropriate_content" | "other"
  >("safety");
  const [reportDetails, setReportDetails] = useState("");

  const load = () =>
    Promise.all([list(), listNotifications()])
      .then(([rows, notices]) => {
        setPairings(rows);
        setNotifications(notices);
      })
      .catch((caught) => {
        setPairings([]);
        setError(caught instanceof Error ? caught.message : "Introductions could not be loaded");
      });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const paymentReturn = params.get("meeting_payment");
    const paymentSync =
      paymentReturn === "success" && sessionId
        ? confirmPayment({ data: { session_id: sessionId } })
        : Promise.resolve();
    paymentSync
      .catch(() => setError("We could not confirm that payment yet. Please refresh shortly."))
      .then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openThread = async (id: string) => {
    setOpenId(id);
    setMessages(await fetchMessages({ data: { pairing_id: id } }));
  };

  const submitMessage = async () => {
    if (!openId || !draft.trim()) return;
    try {
      await send({ data: { pairing_id: openId, body: draft } });
      setDraft("");
      setMessages(await fetchMessages({ data: { pairing_id: openId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message");
    }
  };

  const submitReport = async (pairing: Pairing) => {
    setError(null);
    try {
      await report({
        data: {
          pairing_id: pairing.id,
          category: reportCategory,
          details: reportDetails,
        },
      });
      setReportingId(null);
      setReportDetails("");
      setError("Your report was submitted privately for review.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The report could not be submitted");
    }
  };

  const blockPairingMember = async (pairing: Pairing) => {
    if (
      !window.confirm("Block this member? Their pairing will be hidden and messaging will stop.")
    ) {
      return;
    }
    setError(null);
    try {
      await block({
        data: {
          pairing_id: pairing.id,
          reason: "Blocked from pairing safety controls",
        },
      });
      setOpenId(null);
      await load();
      setError("The member was blocked. You can review blocked members in Privacy & settings.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The member could not be blocked");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Private introductions
      </p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">Imam-reviewed compatibility</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        An anonymous profile appears only after an imam approves a score of 70% or higher. Both
        members respond privately. Names, contact details, and account IDs stay hidden.
      </p>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="status" aria-live="polite">
          {error}
        </p>
      )}

      {notifications.some((notice) => !notice.read_at) && (
        <div className="mt-5 space-y-2" aria-label="Unread introduction updates">
          {notifications
            .filter((notice) => !notice.read_at)
            .slice(0, 3)
            .map((notice) => (
              <div
                key={notice.id}
                className="flex items-start justify-between gap-4 rounded-md border border-primary/20 bg-primary/5 p-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{notice.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{notice.body}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await markRead({ data: { notification_id: notice.id } });
                    setNotifications((current) =>
                      current.map((item) =>
                        item.id === notice.id
                          ? { ...item, read_at: new Date().toISOString() }
                          : item,
                      ),
                    );
                  }}
                  className="shrink-0 text-xs text-primary underline"
                >
                  Mark read
                </button>
              </div>
            ))}
        </div>
      )}

      {pairings === null ? (
        <p className="mt-5 text-sm text-muted-foreground">Loading introductions…</p>
      ) : pairings.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No imam-approved introductions yet. Suitable results remain private while an imam reviews
          them.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {pairings.map((p) => {
            const myResponse = p.i_am === "a" ? p.member_a_response : p.member_b_response;
            const summary =
              p.compatibility_summary &&
              typeof p.compatibility_summary === "object" &&
              !Array.isArray(p.compatibility_summary)
                ? p.compatibility_summary
                : {};
            const strengths = typeof summary.strengths === "string" ? summary.strengths : null;
            const considerations =
              typeof summary.considerations === "string" ? summary.considerations : null;
            const details = [
              ["Age", p.other.age],
              ["City", p.other.uk_city],
              ["Background", p.other.ethnicity],
              ["Marital status", p.other.marital_status],
              ["Children", p.other.children],
              ["Education", p.other.education],
              ["Field of work", p.other.occupation_field],
              ["Madhab", p.other.madhab],
              ["Religious practice", p.other.practice_level],
              ["Prayer", p.other.prayer],
              ["Marriage timeline", p.other.marriage_timeline],
              ["Wali involvement", p.other.wali_involvement],
              ["Languages", p.other.languages],
              ["Relocation", p.other.relocation],
            ].filter(
              (detail): detail is [string, string] => typeof detail[1] === "string" && !!detail[1],
            );
            const canMessage = MESSAGING_STATUSES.has(p.status);

            return (
              <article key={p.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Anonymous profile {p.other.reference}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.imam
                        ? `Imam ${p.imam.name}${p.imam.mosque ? ` · ${p.imam.mosque}` : ""} · ${p.imam.city}`
                        : "Reviewed by Mithaq"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      p.status === "approved"
                        ? "bg-primary/10 text-primary"
                        : p.status === "declined"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {INTRODUCTION_LABELS[p.status] ?? p.status.replaceAll("_", " ")}
                  </span>
                </div>

                {p.compatibility_score != null && (
                  <div className="mt-4 flex items-center justify-between gap-4 border-y border-border py-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Imam-approved compatibility
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        The fixed rubric is the primary score; AI can contribute up to 20%.
                      </p>
                    </div>
                    <p className="text-2xl font-semibold text-primary">{p.compatibility_score}%</p>
                  </div>
                )}

                {details.length > 0 && (
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {details.map(([label, value]) => (
                      <div key={label} className="rounded-md bg-muted/60 p-3">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {(strengths || considerations) && (
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    {strengths && (
                      <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
                        <p className="font-medium text-foreground">Shared strengths</p>
                        <p className="mt-1 leading-6 text-muted-foreground">{strengths}</p>
                      </div>
                    )}
                    {considerations && (
                      <div className="rounded-md border border-border p-4">
                        <p className="font-medium text-foreground">Points to discuss</p>
                        <p className="mt-1 leading-6 text-muted-foreground">{considerations}</p>
                      </div>
                    )}
                  </div>
                )}

                {p.status === "member_review" && myResponse === "pending" && (
                  <div className="mt-5 rounded-md border border-border p-4">
                    <p className="text-sm font-medium text-foreground">Your private response</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      The other member cannot see your identity or response while deciding. Payment
                      is requested only if both of you accept.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setError(null);
                          try {
                            await respondToIntroduction({
                              data: { pairing_id: p.id, accept: true },
                            });
                            await load();
                          } catch (caught) {
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : "Response could not be saved",
                            );
                          }
                        }}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      >
                        Accept privately
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Decline this anonymous introduction? This cannot be undone.",
                            )
                          )
                            return;
                          setError(null);
                          try {
                            await respondToIntroduction({
                              data: { pairing_id: p.id, accept: false },
                            });
                            await load();
                          } catch (caught) {
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : "Response could not be saved",
                            );
                          }
                        }}
                        className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}

                {p.status === "member_review" && myResponse === "accepted" && (
                  <p className="mt-4 rounded-md bg-muted p-4 text-sm text-muted-foreground">
                    Your acceptance is saved privately. We will update you after the other member
                    responds.
                  </p>
                )}

                {p.status === "declined" && (
                  <p className="mt-4 rounded-md bg-muted p-4 text-sm text-muted-foreground">
                    This introduction is closed. Mithaq never attributes a private decline to either
                    member.
                  </p>
                )}

                {p.decision_note && (
                  <p className="mt-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    Imam’s note: {p.decision_note}
                  </p>
                )}

                {p.meetups.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {p.meetups.map((m) => {
                      const mine = p.i_am === "a" ? m.response_a : m.response_b;
                      return (
                        <div key={m.id} className="rounded-lg border border-border/70 p-3 text-sm">
                          <p className="font-medium text-foreground">
                            {new Date(m.scheduled_at).toLocaleString()} · {m.venue}
                          </p>
                          {m.address && (
                            <p className="text-xs text-muted-foreground">{m.address}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {m.wali_required
                              ? "Wali attendance required."
                              : "Wali attendance optional."}
                            {m.note ? ` ${m.note}` : ""}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="rounded-full bg-muted px-2 py-0.5">{m.status}</span>
                            {m.status !== "cancelled" && mine === "pending" && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await respond({ data: { meetup_id: m.id, accept: true } });
                                    load();
                                  }}
                                  className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await respond({ data: { meetup_id: m.id, accept: false } });
                                    load();
                                  }}
                                  className="rounded-full border border-border px-3 py-1 hover:bg-accent"
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {mine !== "pending" && (
                              <span className="text-muted-foreground">You: {mine}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {["awaiting_payment", "payment_pending"].includes(p.status) &&
                  (p.i_am === "a" ? p.payment_a_status : p.payment_b_status) !== "paid" && (
                    <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4">
                      <p className="font-medium text-foreground">Choose your meeting package</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Matching and anonymous profile review are free. Both members choose and pay
                        separately after the imam approves the pairing.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {Object.values(MEETING_PACKAGES).map((meetingPackage) => (
                          <div
                            key={meetingPackage.id}
                            className="flex flex-col rounded-md border border-border bg-card p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {meetingPackage.label}
                                </p>
                                <p className="mt-1 text-2xl font-semibold text-primary">
                                  {formatPence(meetingPackage.amountPence)}
                                </p>
                              </div>
                              {meetingPackage.id === "three" && (
                                <span className="rounded-full bg-gold/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                                  Popular
                                </span>
                              )}
                            </div>
                            <p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">
                              {meetingPackage.description}
                            </p>
                            <button
                              type="button"
                              onClick={async () => {
                                setError(null);
                                try {
                                  const result = await checkout({
                                    data: {
                                      pairing_id: p.id,
                                      package_id: meetingPackage.id,
                                    },
                                  });
                                  window.location.href = result.url;
                                } catch (error) {
                                  setError(
                                    error instanceof Error
                                      ? error.message
                                      : "Could not start secure checkout",
                                  );
                                }
                              }}
                              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                            >
                              Choose {meetingPackage.label}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {p.meeting_package && (
                  <p className="mt-4 rounded-xl bg-primary/5 p-3 text-sm text-primary">
                    ✓ Payment received: {p.meeting_package.meeting_count} meeting
                    {p.meeting_package.meeting_count === 1 ? "" : "s"} for{" "}
                    {formatPence(p.meeting_package.amount_pence)}
                    {p.shared_meeting_allowance
                      ? ` · shared allowance: ${p.shared_meeting_allowance}`
                      : " · waiting for the other member to pay"}
                  </p>
                )}

                {canMessage && (
                  <>
                    <button
                      type="button"
                      onClick={() => (openId === p.id ? setOpenId(null) : openThread(p.id))}
                      className="mt-3 text-xs text-primary underline"
                    >
                      {openId === p.id ? "Hide messages" : "Messages with the imam"}
                    </button>
                    <span className="mx-2 text-border" aria-hidden="true">
                      ·
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setReportingId(reportingId === p.id ? null : p.id)}
                  className="mt-3 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {reportingId === p.id ? "Cancel report" : "Report a concern"}
                </button>
                <span className="mx-2 text-border" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => blockPairingMember(p)}
                  className="mt-3 text-xs text-destructive underline"
                >
                  Block member
                </button>

                {reportingId === p.id && (
                  <div className="mt-3 space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                    <div>
                      <label
                        htmlFor={`report-category-${p.id}`}
                        className="text-xs font-medium text-foreground"
                      >
                        Concern type
                      </label>
                      <select
                        id={`report-category-${p.id}`}
                        value={reportCategory}
                        onChange={(event) =>
                          setReportCategory(event.target.value as typeof reportCategory)
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="safety">Safety concern</option>
                        <option value="harassment">Harassment</option>
                        <option value="identity">Identity concern</option>
                        <option value="inappropriate_content">Inappropriate content</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor={`report-details-${p.id}`}
                        className="text-xs font-medium text-foreground"
                      >
                        What happened?
                      </label>
                      <textarea
                        id={`report-details-${p.id}`}
                        value={reportDetails}
                        onChange={(event) => setReportDetails(event.target.value)}
                        rows={4}
                        minLength={10}
                        maxLength={2000}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={reportDetails.trim().length < 10}
                      onClick={() => submitReport(p)}
                      className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-40"
                    >
                      Submit private report
                    </button>
                  </div>
                )}

                {openId === p.id && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                      {messages.length === 0 && (
                        <p className="text-xs text-muted-foreground">No messages yet.</p>
                      )}
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            m.mine ? "bg-primary/10 text-foreground" : "bg-card text-foreground"
                          }`}
                        >
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {m.mine ? "You" : m.sender_role} ·{" "}
                            {new Date(m.created_at).toLocaleString()}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        aria-label="Message to the imam"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Write a message…"
                        className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={submitMessage}
                        className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                      >
                        Send
                      </button>
                    </div>
                  </div>
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
