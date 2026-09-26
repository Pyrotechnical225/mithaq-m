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
import { completeAssignedMeeting } from "@/lib/member-notifications.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImamReferrals } from "@/components/ImamReferrals";

export const Route = createFileRoute("/_authenticated/imam/")({
  head: () => ({
    meta: [
      { title: "Imam dashboard — Mithaq" },
      { name: "description", content: "Review local pairings and arrange wali-attended meetings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImamDashboard,
});

type Pairing = Awaited<ReturnType<typeof listImamPairings>>[number];
type Message = Awaited<ReturnType<typeof listPairingMessages>>[number];

function compatibilitySummary(value: Pairing["compatibility_summary"], key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value[key] === "string" ? value[key] : null;
}

function ImamDashboard() {
  const whoami = useServerFn(amIImam);
  const list = useServerFn(listImamPairings);
  const decide = useServerFn(decidePairing);
  const schedule = useServerFn(proposeMeetup);
  const cancel = useServerFn(cancelMeetup);
  const fetchMessages = useServerFn(listPairingMessages);
  const send = useServerFn(postPairingMessage);
  const complete = useServerFn(completeAssignedMeeting);

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
  const [tab, setTab] = useState("matches");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tableView, setTableView] = useState(false);
  const [busy, setBusy] = useState(false);

  const runAction = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(
        "That action could not be completed. Refresh to check the current status before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };

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
    setMessages([]);
    setDraft("");
    setThreadId(id);
    await runAction(async () => setMessages(await fetchMessages({ data: { pairing_id: id } })));
  };

  const pending = (pairings ?? []).filter((p) => ["pending", "imam_review"].includes(p.status));
  const memberReview = (pairings ?? []).filter((p) => p.status === "member_review");
  const paymentQueue = (pairings ?? []).filter((p) =>
    ["awaiting_payment", "payment_pending"].includes(p.status),
  );
  const schedulingQueue = (pairings ?? []).filter((p) => p.status === "ready_to_schedule");
  const filteredPairings = (pairings ?? []).filter((p) =>
    `${p.id} ${p.member_a.display_name} ${p.member_b.display_name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h1 className="text-2xl text-foreground">
          As-salamu alaykum{me?.imam?.name ? `, ${me.imam.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {me?.imam
            ? `${me.imam.mosque ? `${me.imam.mosque} · ` : ""}${me.imam.city} · covering about ${me.radius_km} km`
            : "Your imam profile is being set up."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap">
          <span className="rounded-full bg-muted px-3 py-1">
            {pending.length} awaiting your review
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            {memberReview.length} with members
          </span>
          <span className="rounded-full bg-muted px-3 py-1">
            {paymentQueue.length} awaiting payment
          </span>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
            {schedulingQueue.length} ready to schedule
          </span>
        </div>
      </section>

      {error && (
        <p className="text-sm text-destructive" role="status" aria-live="polite">
          {error}
        </p>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          setSelected(null);
          setThreadId(null);
          setQuery("");
          if (pairings !== null) setError(null);
        }}
      >
        <TabsList
          aria-label="Imam workspace sections"
          className="grid h-auto grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-4"
        >
          {[
            ["matches", "Matches"],
            ["meetings", "Meetings"],
            ["payments", "Payments"],
            ["referrals", "Referring imams"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              aria-controls={`imam-${value}`}
              className="min-h-11 rounded-md border border-border bg-card px-3 py-3 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} id={`imam-${tab}`} className="mt-5">
          {tab === "referrals" ? (
            <ImamReferrals />
          ) : (
            <section className="space-y-4">
              <h2 className="text-xl text-foreground">
                {tab === "matches"
                  ? "Assigned compatibility reviews"
                  : tab === "meetings"
                    ? "Meetings & attendance"
                    : "Meeting packages & payments"}
              </h2>
              <input
                aria-label="Search assigned pairings"
                placeholder="Search members or match reference"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-md border border-input bg-card px-4 py-3 text-sm sm:max-w-md"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {filteredPairings.length} assigned pairings
                </p>
                <button
                  type="button"
                  aria-pressed={tableView}
                  onClick={() => setTableView(!tableView)}
                  className="min-h-11 rounded-md border border-border bg-card px-3 text-sm"
                >
                  {tableView ? "Show records" : "Show spreadsheet"}
                </button>
              </div>
              {tableView && (
                <div
                  role="region"
                  aria-label="Assigned pairings spreadsheet; scroll horizontally for more columns"
                  tabIndex={0}
                  className="overflow-x-auto rounded-lg border border-border bg-card"
                >
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-muted text-xs text-muted-foreground">
                      <tr>
                        {[
                          "Member A",
                          "Member B",
                          "Compatibility",
                          "Status",
                          "Meetings completed",
                          "Allowance left",
                          "Review",
                        ].map((label) => (
                          <th key={label} scope="col" className="px-4 py-3">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredPairings.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3">{p.member_a.display_name}</td>
                          <td className="px-4 py-3">{p.member_b.display_name}</td>
                          <td className="px-4 py-3 font-semibold text-primary">
                            {p.compatibility_score == null ? "—" : `${p.compatibility_score}%`}
                          </td>
                          <td className="px-4 py-3 capitalize">{p.status.replaceAll("_", " ")}</td>
                          <td className="px-4 py-3">
                            {p.meetups.filter((m) => m.status === "completed").length}
                          </td>
                          <td className="px-4 py-3">{p.meetings_remaining}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(p.id);
                                setThreadId(null);
                              }}
                              className="min-h-11 rounded-md border border-border px-3"
                            >
                              View details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pairings === null && <p className="text-sm text-muted-foreground">Loading…</p>}
              {pairings?.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No suitable compatibility results are assigned to you yet.
                </p>
              )}
              {filteredPairings
                .filter((p) => !tableView || selected === p.id)
                .map((p) => (
                  <div key={p.id} className="rounded-lg border border-border bg-card p-4 sm:p-5">
                    <button
                      type="button"
                      aria-expanded={selected === p.id}
                      aria-controls={`pair-${p.id}`}
                      onClick={() => {
                        setSelected(selected === p.id ? null : p.id);
                        setThreadId(null);
                      }}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span>
                        <span className="block text-sm font-semibold">
                          {p.member_a.display_name} & {p.member_b.display_name}
                        </span>
                        <span className="mt-1 block text-xs capitalize text-muted-foreground">
                          {p.status.replaceAll("_", " ")} · {p.id.slice(0, 8)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-lg font-semibold text-primary">
                          {p.compatibility_score == null ? "—" : `${p.compatibility_score}%`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {selected === p.id ? "Close" : "View details"}
                        </span>
                      </span>
                    </button>
                    {selected === p.id && (
                      <div id={`pair-${p.id}`} className="mt-4 border-t border-border pt-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3">
                            {[p.member_a, p.member_b].map((m) => (
                              <div
                                key={m.side}
                                className="rounded-xl border border-border/70 p-3 text-sm"
                              >
                                <p className="font-medium text-foreground">{m.display_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {[
                                    m.gender,
                                    m.age ? `age ${m.age}` : null,
                                    m.uk_city,
                                    m.uk_postcode,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                                {m.distance_km != null && (
                                  <p className="text-xs text-muted-foreground">
                                    {m.distance_km} km from you
                                  </p>
                                )}
                                {m.wali && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Wali: {String(m.wali)}
                                  </p>
                                )}
                                {m.contact_email && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {m.contact_email}
                                  </p>
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

                        {tab === "matches" && p.compatibility_score != null && (
                          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                            <div className="flex items-baseline justify-between gap-4">
                              <p className="text-sm font-medium text-foreground">
                                Private compatibility review
                              </p>
                              <p className="text-2xl font-semibold text-primary">
                                {p.compatibility_score}%
                              </p>
                            </div>
                            {compatibilitySummary(p.compatibility_summary, "strengths") && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Strengths: </span>
                                {compatibilitySummary(p.compatibility_summary, "strengths")}
                              </p>
                            )}
                            {compatibilitySummary(p.compatibility_summary, "considerations") && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Discuss: </span>
                                {compatibilitySummary(p.compatibility_summary, "considerations")}
                              </p>
                            )}
                          </div>
                        )}

                        {tab === "matches" && ["pending", "imam_review"].includes(p.status) && (
                          <div className="mt-4 space-y-2">
                            <textarea
                              aria-label={`Review note for pairing ${p.id.slice(0, 8)}`}
                              value={note[p.id] ?? ""}
                              onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
                              rows={2}
                              placeholder="Note for both families (optional)"
                              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    !confirm(
                                      "Approve this introduction for both members to review privately?",
                                    )
                                  )
                                    return;
                                  void runAction(async () => {
                                    await decide({
                                      data: {
                                        pairing_id: p.id,
                                        decision: "approved",
                                        note: note[p.id] ?? null,
                                      },
                                    });
                                    await load();
                                  });
                                }}
                                className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                Approve pairing
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  if (!confirm("Decline this proposed introduction?")) return;
                                  void runAction(async () => {
                                    await decide({
                                      data: {
                                        pairing_id: p.id,
                                        decision: "declined",
                                        note: note[p.id] ?? null,
                                      },
                                    });
                                    await load();
                                  });
                                }}
                                className="rounded-full border border-border px-4 py-1.5 text-xs hover:bg-accent"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}

                        {tab === "meetings" && p.meetups.length > 0 && (
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
                                {m.status === "confirmed" &&
                                  new Date(m.scheduled_at).getTime() <= Date.now() && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="mt-3 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground"
                                      onClick={() => {
                                        if (
                                          !confirm(
                                            "Confirm that this meeting took place? This records attendance and schedules a private check-in three weeks after the meeting date.",
                                          )
                                        )
                                          return;
                                        void runAction(async () => {
                                          await complete({ data: { meetup_id: m.id } });
                                          await load();
                                        });
                                      }}
                                    >
                                      Mark meeting completed
                                    </button>
                                  )}
                                {["proposed", "confirmed"].includes(m.status) && (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      if (!confirm("Cancel this meeting for both members?")) return;
                                      void runAction(async () => {
                                        await cancel({ data: { meetup_id: m.id } });
                                        await load();
                                      });
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

                        {(tab === "payments" || tab === "meetings") && (
                          <div className="mt-4 grid gap-2 rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground sm:grid-cols-3">
                            <p>
                              Member A:{" "}
                              {p.meeting_package_a
                                ? `${p.meeting_package_a.meeting_count} meeting${p.meeting_package_a.meeting_count === 1 ? "" : "s"} · ${formatPence(p.meeting_package_a.amount_pence)}`
                                : "payment pending"}
                            </p>
                            <p>
                              Member B:{" "}
                              {p.meeting_package_b
                                ? `${p.meeting_package_b.meeting_count} meeting${p.meeting_package_b.meeting_count === 1 ? "" : "s"} · ${formatPence(p.meeting_package_b.amount_pence)}`
                                : "payment pending"}
                            </p>
                            <p className="font-medium text-primary">
                              Shared allowance: {p.shared_meeting_allowance} · remaining:{" "}
                              {p.meetings_remaining}
                            </p>
                          </div>
                        )}

                        {tab === "meetings" &&
                          ["ready_to_schedule", "scheduled"].includes(p.status) &&
                          p.meetings_remaining > 0 && (
                            <div className="mt-4 rounded-xl border border-border/70 p-3">
                              <p className="text-sm font-medium text-foreground">
                                Arrange a meeting · {p.meetings_remaining} remaining
                              </p>
                              <div className="mt-2 grid gap-2 md:grid-cols-2">
                                <input
                                  type="datetime-local"
                                  aria-label="Meeting date and time"
                                  value={form(p.id).when}
                                  onChange={(e) => setForm(p.id, { when: e.target.value })}
                                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                                <input
                                  placeholder="Venue (e.g. mosque meeting room)"
                                  aria-label="Meeting venue"
                                  value={form(p.id).venue}
                                  onChange={(e) => setForm(p.id, { venue: e.target.value })}
                                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                                <input
                                  placeholder="Address (optional)"
                                  aria-label="Meeting address (optional)"
                                  value={form(p.id).address}
                                  onChange={(e) => setForm(p.id, { address: e.target.value })}
                                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                                />
                                <input
                                  placeholder="Note to both families"
                                  aria-label="Note to both families"
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
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void runAction(async () => {
                                    const f = form(p.id);
                                    if (
                                      !f.when ||
                                      !f.venue.trim() ||
                                      !Number.isFinite(new Date(f.when).getTime()) ||
                                      new Date(f.when).getTime() <= Date.now()
                                    ) {
                                      setError("Add a future date/time and venue first");
                                      return;
                                    }
                                    setError(null);
                                    await schedule({
                                      data: {
                                        pairing_id: p.id,
                                        scheduled_at: new Date(f.when).toISOString(),
                                        venue: f.venue.trim(),
                                        address: f.address || null,
                                        wali_required: f.wali,
                                        note: f.note || null,
                                      },
                                    });
                                    setMeetForm((m) => ({
                                      ...m,
                                      [p.id]: {
                                        when: "",
                                        venue: "",
                                        address: "",
                                        wali: true,
                                        note: "",
                                      },
                                    }));
                                    await load();
                                  })
                                }
                                className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                Propose meeting
                              </button>
                            </div>
                          )}

                        {tab === "meetings" &&
                          [
                            "awaiting_payment",
                            "payment_pending",
                            "ready_to_schedule",
                            "scheduled",
                            "completed",
                          ].includes(p.status) && (
                            <button
                              type="button"
                              onClick={() =>
                                threadId === p.id ? setThreadId(null) : openThread(p.id)
                              }
                              className="mt-3 text-xs text-primary underline"
                            >
                              {threadId === p.id ? "Hide messages" : "Message both families"}
                            </button>
                          )}

                        {threadId === p.id && (
                          <div className="mt-3 rounded-xl bg-muted/50 p-3">
                            <div className="max-h-56 space-y-2 overflow-y-auto">
                              {messages.length === 0 && (
                                <p className="text-xs text-muted-foreground">No messages yet.</p>
                              )}
                              {messages.map((m) => (
                                <div key={m.id} className="rounded-lg bg-card px-3 py-2 text-sm">
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
                                aria-label="Message both families"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Write a message…"
                                className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                              />
                              <button
                                disabled={busy || !draft.trim()}
                                onClick={() =>
                                  void runAction(async () => {
                                    if (!draft.trim()) return;
                                    await send({ data: { pairing_id: p.id, body: draft } });
                                    setDraft("");
                                    setMessages(
                                      await fetchMessages({ data: { pairing_id: p.id } }),
                                    );
                                  })
                                }
                                className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              {pairings && query && !filteredPairings.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No assigned pairings match your search.
                </p>
              )}
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
