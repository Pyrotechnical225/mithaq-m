import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  amIImam,
  cancelMeetup,
  decidePairing,
  listImamPairings,
  proposeMeetup,
} from "@/lib/imam.functions";
import { listPairingMessages, postPairingMessage } from "@/lib/pairings.functions";
import { formatPence } from "@/lib/meeting-packages";

export const Route = createFileRoute("/_authenticated/imam/")({
  head: () => ({
    meta: [
      { title: "Imam dashboard — MeetHaq" },
      { name: "description", content: "Review local pairings and arrange wali-attended meetings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImamDashboard,
});

type Pairing = Awaited<ReturnType<typeof listImamPairings>>[number];
type Message = Awaited<ReturnType<typeof listPairingMessages>>[number];

function ImamDashboard() {
  const whoami = useServerFn(amIImam);
  const list = useServerFn(listImamPairings);
  const decide = useServerFn(decidePairing);
  const schedule = useServerFn(proposeMeetup);
  const cancel = useServerFn(cancelMeetup);
  const fetchMessages = useServerFn(listPairingMessages);
  const send = useServerFn(postPairingMessage);

  const [me, setMe] = useState<Awaited<ReturnType<typeof amIImam>> | null>(null);
  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [meetForm, setMeetForm] = useState<
    Record<string, { when: string; venue: string; address: string; wali: boolean; note: string }>
  >({});
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");

  const load = () =>
    list()
      .then(setPairings)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    whoami()
      .then(setMe)
      .catch(() => undefined);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = (id: string) =>
    meetForm[id] ?? { when: "", venue: "", address: "", wali: true, note: "" };
  const setForm = (id: string, patch: Partial<ReturnType<typeof form>>) =>
    setMeetForm((f) => ({ ...f, [id]: { ...form(id), ...patch } }));

  const openThread = async (id: string) => {
    setThreadId(id);
    setMessages(await fetchMessages({ data: { pairing_id: id } }));
  };

  const pending = (pairings ?? []).filter((p) => p.status === "pending");
  const decided = (pairings ?? []).filter((p) => p.status !== "pending");

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl text-foreground">
          As-salamu alaykum{me?.imam?.name ? `, ${me.imam.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {me?.imam
            ? `${me.imam.mosque ? `${me.imam.mosque} · ` : ""}${me.imam.city} · covering about ${me.radius_km} km`
            : "Your imam profile is being set up."}
        </p>
        <div className="mt-4 flex gap-3 text-xs">
          <span className="rounded-full bg-muted px-3 py-1">
            {pending.length} awaiting your review
          </span>
          <span className="rounded-full bg-muted px-3 py-1">{decided.length} reviewed</span>
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-4">
        <h2 className="text-xl text-foreground">Local pairings</h2>
        {pairings === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {pairings?.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No pairings assigned to you yet. Mutual matches near you will appear here.
          </p>
        )}
        {(pairings ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                {[p.member_a, p.member_b].map((m) => (
                  <div key={m.id} className="rounded-xl border border-border/70 p-3 text-sm">
                    <p className="font-medium text-foreground">{m.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[m.gender, m.age ? `age ${m.age}` : null, m.uk_city, m.uk_postcode]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {m.distance_km != null && (
                      <p className="text-xs text-muted-foreground">{m.distance_km} km from you</p>
                    )}
                    {m.wali && (
                      <p className="mt-1 text-xs text-muted-foreground">Wali: {String(m.wali)}</p>
                    )}
                    {m.contact_email && (
                      <p className="mt-1 text-xs text-muted-foreground">{m.contact_email}</p>
                    )}
                  </div>
                ))}
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
                {p.status}
              </span>
            </div>

            {p.status === "pending" && (
              <div className="mt-4 space-y-2">
                <textarea
                  value={note[p.id] ?? ""}
                  onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                  rows={2}
                  placeholder="Note for both families (optional)"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await decide({
                        data: { pairing_id: p.id, decision: "approved", note: note[p.id] ?? null },
                      });
                      load();
                    }}
                    className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Approve pairing
                  </button>
                  <button
                    onClick={async () => {
                      await decide({
                        data: { pairing_id: p.id, decision: "declined", note: note[p.id] ?? null },
                      });
                      load();
                    }}
                    className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {p.meetups.length > 0 && (
              <div className="mt-4 space-y-2">
                {p.meetups.map((m) => (
                  <div key={m.id} className="rounded-xl bg-muted/50 p-3 text-sm">
                    <p className="font-medium text-foreground">
                      {new Date(m.scheduled_at).toLocaleString()} · {m.venue}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status {m.status} · A: {m.response_a} · B: {m.response_b}
                      {m.wali_required ? " · wali required" : ""}
                    </p>
                    {m.status !== "cancelled" && (
                      <button
                        onClick={async () => {
                          await cancel({ data: { meetup_id: m.id } });
                          load();
                        }}
                        className="mt-1 text-xs text-destructive underline"
                      >
                        Cancel meeting
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(p.meeting_package_a || p.meeting_package_b) && (
              <div className="mt-4 grid gap-2 rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground sm:grid-cols-3">
                <p>
                  Member A: {p.meeting_package_a
                    ? `${p.meeting_package_a.meeting_count} meeting${p.meeting_package_a.meeting_count === 1 ? "" : "s"} · ${formatPence(p.meeting_package_a.amount_pence)}`
                    : "payment pending"}
                </p>
                <p>
                  Member B: {p.meeting_package_b
                    ? `${p.meeting_package_b.meeting_count} meeting${p.meeting_package_b.meeting_count === 1 ? "" : "s"} · ${formatPence(p.meeting_package_b.amount_pence)}`
                    : "payment pending"}
                </p>
                <p className="font-medium text-primary">
                  Shared allowance: {p.shared_meeting_allowance} · remaining: {p.meetings_remaining}
                </p>
              </div>
            )}

            {["approved", "ready_to_schedule"].includes(p.status) && p.meetings_remaining > 0 && (
              <div className="mt-4 rounded-xl border border-border/70 p-3">
                <p className="text-sm font-medium text-foreground">
                  Arrange a meeting · {p.meetings_remaining} remaining
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input
                    type="datetime-local"
                    value={form(p.id).when}
                    onChange={(e) => setForm(p.id, { when: e.target.value })}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Venue (e.g. mosque meeting room)"
                    value={form(p.id).venue}
                    onChange={(e) => setForm(p.id, { venue: e.target.value })}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Address (optional)"
                    value={form(p.id).address}
                    onChange={(e) => setForm(p.id, { address: e.target.value })}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Note to both families"
                    value={form(p.id).note}
                    onChange={(e) => setForm(p.id, { note: e.target.value })}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form(p.id).wali}
                    onChange={(e) => setForm(p.id, { wali: e.target.checked })}
                  />
                  Wali attendance required
                </label>
                <button
                  onClick={async () => {
                    const f = form(p.id);
                    if (!f.when || !f.venue) {
                      setError("Add a date/time and venue first");
                      return;
                    }
                    setError(null);
                    await schedule({
                      data: {
                        pairing_id: p.id,
                        scheduled_at: f.when,
                        venue: f.venue,
                        address: f.address || null,
                        wali_required: f.wali,
                        note: f.note || null,
                      },
                    });
                    setMeetForm((m) => ({
                      ...m,
                      [p.id]: { when: "", venue: "", address: "", wali: true, note: "" },
                    }));
                    load();
                  }}
                  className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Propose meeting
                </button>
              </div>
            )}

            <button
              onClick={() => (threadId === p.id ? setThreadId(null) : openThread(p.id))}
              className="mt-3 text-xs text-primary underline"
            >
              {threadId === p.id ? "Hide messages" : "Message both families"}
            </button>

            {threadId === p.id && (
              <div className="mt-3 rounded-xl bg-muted/50 p-3">
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {messages.length === 0 && (
                    <p className="text-xs text-muted-foreground">No messages yet.</p>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-card px-3 py-2 text-sm">
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
                    onClick={async () => {
                      if (!draft.trim()) return;
                      await send({ data: { pairing_id: p.id, body: draft } });
                      setDraft("");
                      setMessages(await fetchMessages({ data: { pairing_id: p.id } }));
                    }}
                    className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
