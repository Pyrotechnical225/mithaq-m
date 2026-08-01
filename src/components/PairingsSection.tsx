import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  listMyPairings,
  listPairingMessages,
  postPairingMessage,
  respondToMeetup,
  syncMyPairings,
} from "@/lib/pairings.functions";

type Pairing = Awaited<ReturnType<typeof listMyPairings>>[number];
type Message = Awaited<ReturnType<typeof listPairingMessages>>[number];

export function PairingsSection() {
  const sync = useServerFn(syncMyPairings);
  const list = useServerFn(listMyPairings);
  const respond = useServerFn(respondToMeetup);
  const fetchMessages = useServerFn(listPairingMessages);
  const send = useServerFn(postPairingMessage);

  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => list().then(setPairings).catch(() => setPairings([]));

  useEffect(() => {
    sync()
      .catch(() => undefined)
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

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <h2 className="text-xl text-foreground">Imam-arranged meetings</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Once both sides accept an interest, a local imam reviews the pairing and arranges a
        wali-attended meeting. You can message the imam and the other family here.
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {pairings === null ? (
        <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
      ) : pairings.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No pairings yet. When an interest is accepted on both sides, it appears here for imam
          review.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {pairings.map((p) => (
            <div key={p.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {p.other.display_name ?? "Member"}
                    {p.other.uk_city ? ` · ${p.other.uk_city}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.imam
                      ? `Imam ${p.imam.name}${p.imam.mosque ? ` · ${p.imam.mosque}` : ""} · ${p.imam.city}`
                      : "Awaiting imam assignment"}
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
                  {p.status === "approved"
                    ? "Approved by imam"
                    : p.status === "declined"
                      ? "Not taken forward"
                      : "Awaiting imam review"}
                </span>
              </div>

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
                        {m.address && <p className="text-xs text-muted-foreground">{m.address}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {m.wali_required ? "Wali attendance required." : "Wali attendance optional."}
                          {m.note ? ` ${m.note}` : ""}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="rounded-full bg-muted px-2 py-0.5">{m.status}</span>
                          {m.status !== "cancelled" && mine === "pending" && (
                            <>
                              <button
                                onClick={async () => {
                                  await respond({ data: { meetup_id: m.id, accept: true } });
                                  load();
                                }}
                                className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                Accept
                              </button>
                              <button
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

              <button
                onClick={() => (openId === p.id ? setOpenId(null) : openThread(p.id))}
                className="mt-3 text-xs text-primary underline"
              >
                {openId === p.id ? "Hide messages" : "Messages with the imam"}
              </button>

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
                          {m.mine ? "You" : m.sender_role} · {new Date(m.created_at).toLocaleString()}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message…"
                      className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                    />
                    <button
                      onClick={submitMessage}
                      className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default PairingsSection;
