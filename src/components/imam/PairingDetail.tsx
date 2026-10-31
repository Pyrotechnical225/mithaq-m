import { useServerFn } from "@tanstack/react-start";
import { Lock, MessageSquare } from "lucide-react";
import { useState } from "react";
import { cancelMeetup, completePairing, decidePairing, proposeMeetup } from "@/lib/imam.functions";
import { listPairingMessages, postPairingMessage } from "@/lib/pairings.functions";
import { formatPence } from "@/lib/meeting-packages";
import { completeAssignedMeeting } from "@/lib/member-notifications.functions";
import {
  BEST_TIMES,
  CONTACT_METHODS,
  MEETING_FORMATS,
  WALI_RELATIONSHIPS,
  optionLabel,
} from "@/lib/member-contacts";
import type { ComparisonRow, ComparisonVerdict } from "@/lib/compatibility-compare";

import {
  CLOSED_STATUSES,
  REVIEW_STATUSES,
  TONE_CLASS,
  errorText,
  shortName,
  statusOf,
  type Member,
  type Pairing,
} from "@/lib/imam-workspace";

const HEADER_QUESTION_IDS = new Set([1, 3, 9]);

type Message = Awaited<ReturnType<typeof listPairingMessages>>[number];

const ARRANGE_STATUSES = new Set(["ready_to_schedule", "scheduled"]);

const MESSAGING_STATUSES = new Set([
  "awaiting_payment",
  "payment_pending",
  "ready_to_schedule",
  "scheduled",
  "completed",
]);

const VERDICT: Record<ComparisonVerdict, { label: string; className: string }> = {
  match: { label: "Match", className: "bg-primary/10 text-primary" },
  flexible: { label: "Flexible", className: "bg-accent text-accent-foreground" },
  differs: { label: "Differs", className: "bg-gold/20 text-foreground" },
  discuss: { label: "Discuss", className: "bg-destructive text-destructive-foreground" },
};

function compatibilitySummary(value: Pairing["compatibility_summary"], key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value[key] === "string" ? value[key] : null;
}

function sideLabel(member: Member) {
  const gender = typeof member.gender === "string" ? member.gender.toLowerCase() : "";
  return gender === "male" ? "Brother" : gender === "female" ? "Sister" : "Member";
}

export function PairingDetail({
  pairing: p,
  reload,
}: {
  pairing: Pairing;
  reload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "differences" | "discuss">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runAction = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await reload();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const scored = p.comparison.rows.filter((row) => row.verdict !== null);
  // Age, city and work already appear on the member cards.
  const written = p.comparison.rows.filter(
    (row) => row.verdict === null && !HEADER_QUESTION_IDS.has(row.id),
  );
  const differences = scored.filter(
    (row) => row.verdict === "differs" || row.verdict === "discuss",
  );
  const discuss = scored.filter((row) => row.verdict === "discuss");
  const visible = filter === "discuss" ? discuss : filter === "differences" ? differences : scored;
  const talkingPoints = [
    ...discuss,
    ...differences.filter((row) => row.verdict === "differs"),
  ].slice(0, 6);
  const strengths = compatibilitySummary(p.compatibility_summary, "strengths");
  const considerations = compatibilitySummary(p.compatibility_summary, "considerations");
  const status = statusOf(p);

  return (
    <article
      className="space-y-5"
      aria-label={`${shortName(p.member_a)} and ${shortName(p.member_b)}`}
    >
      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <PersonCard member={p.member_a} />
        <div className="order-first flex items-center gap-3 sm:order-none sm:flex-col sm:gap-1">
          <ScoreRing score={p.compatibility_score} />
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[status.tone]}`}
          >
            {status.label}
          </span>
        </div>
        <PersonCard member={p.member_b} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Score by section</h2>
            <p className="text-xs text-muted-foreground">×n = how much it counts</p>
          </div>
          {p.comparison.sectionScores.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Not enough survey answers to compare yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {p.comparison.sectionScores.map((section) => (
                <li key={section.section}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {section.section}{" "}
                      <span className="text-xs text-muted-foreground">×{section.weight}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{section.percent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        section.percent >= 80
                          ? "bg-primary"
                          : section.percent >= 60
                            ? "bg-gold"
                            : "bg-destructive"
                      }`}
                      style={{ width: `${section.percent}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Talk about before meeting</h2>
            <p className="text-xs text-muted-foreground">{differences.length} differences</p>
          </div>
          {talkingPoints.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No differences in their answers.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {talkingPoints.map((row) => (
                <li key={row.id} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-2 size-2 shrink-0 rounded-full ${
                      row.verdict === "discuss" ? "bg-destructive" : "bg-gold"
                    }`}
                  />
                  <span>
                    <span className="font-medium">{row.question}</span>{" "}
                    <span className="text-muted-foreground">
                      {row.a} · {row.b}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(strengths || considerations) && (
            <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm text-muted-foreground">
              {strengths && (
                <p>
                  <span className="font-medium text-foreground">Strengths: </span>
                  {strengths}
                </p>
              )}
              {considerations && (
                <p>
                  <span className="font-medium text-foreground">To discuss: </span>
                  {considerations}
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Answers side by side</h2>
          <div role="group" aria-label="Filter answers" className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All", scored.length],
                ["differences", "Differences", differences.length],
                ["discuss", "Discuss", discuss.length],
              ] as const
            ).map(([value, label, total]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-full border px-3 text-sm ${
                  filter === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {label} <span className="tabular-nums opacity-75">{total}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className={`mr-1 rounded-full px-2 py-0.5 ${VERDICT.match.className}`}>Match</span>
          same answer ·{" "}
          <span className={`mx-1 rounded-full px-2 py-0.5 ${VERDICT.flexible.className}`}>
            Flexible
          </span>
          one is open ·{" "}
          <span className={`mx-1 rounded-full px-2 py-0.5 ${VERDICT.differs.className}`}>
            Differs
          </span>
          minor ·{" "}
          <span className={`mx-1 rounded-full px-2 py-0.5 ${VERDICT.discuss.className}`}>
            Discuss
          </span>
          important difference
        </p>
        <ComparisonTable rows={visible} pairing={p} />
      </section>

      {written.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">In their own words</h2>
          {written.map((row) => (
            <details key={row.id} className="rounded-lg border border-border bg-card">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm font-medium">
                {row.question}
              </summary>
              <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
                {[
                  [p.member_a, row.a],
                  [p.member_b, row.b],
                ].map(([member, answer]) => (
                  <div key={(member as Member).side} className="bg-card px-4 py-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gold">
                      {shortName(member as Member)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {(answer as string | null) ?? (
                        <span className="text-muted-foreground">Not answered</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      {error && (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-primary/5 p-3 text-sm font-medium text-primary" role="status">
          {notice}
        </p>
      )}

      <StagePanel pairing={p} busy={busy} runAction={runAction} setError={setError} />

      {MESSAGING_STATUSES.has(p.status) && <MessageThread pairingId={p.id} />}
    </article>
  );
}

function PersonCard({ member }: { member: Member }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gold">
        {sideLabel(member)}
      </p>
      <p className="mt-0.5 font-semibold">
        {shortName(member)}
        {member.age ? `, ${String(member.age)}` : ""}
      </p>
      <p className="text-sm text-muted-foreground">
        {[member.uk_city ?? member.residence, member.occupation]
          .filter(Boolean)
          .map(String)
          .join(" · ")}
      </p>
      {member.distance_km != null && (
        <p className="text-xs text-muted-foreground">{member.distance_km} km from you</p>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, score ?? 0));
  return (
    <svg
      viewBox="0 0 84 84"
      className="size-20 shrink-0"
      role="img"
      aria-label={score == null ? "No compatibility score" : `Compatibility ${score} percent`}
    >
      <circle cx="42" cy="42" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value / 100)}
        transform="rotate(-90 42 42)"
        className="stroke-primary"
      />
      <text
        x="42"
        y="48"
        textAnchor="middle"
        className="fill-foreground text-[18px] font-bold tabular-nums"
      >
        {score == null ? "—" : `${score}%`}
      </text>
    </svg>
  );
}

function ComparisonTable({ rows, pairing }: { rows: ComparisonRow[]; pairing: Pairing }) {
  if (rows.length === 0)
    return (
      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Nothing to show here. Everything else lines up.
      </p>
    );
  let lastSection = "";
  return (
    <div
      role="region"
      aria-label="Answers side by side; scroll sideways on small screens"
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border bg-card"
    >
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="bg-muted text-xs uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            <th scope="col" className="w-[36%] px-4 py-2.5 font-semibold">
              Question
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              {shortName(pairing.member_a)}
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              {shortName(pairing.member_b)}
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Result
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) => {
            const cells = [];
            if (row.section !== lastSection) {
              lastSection = row.section;
              cells.push(
                <tr key={`section-${row.section}`} className="border-t border-border bg-muted/50">
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="px-4 py-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    {row.section}
                  </th>
                </tr>,
              );
            }
            const verdict = row.verdict ? VERDICT[row.verdict] : null;
            cells.push(
              <tr
                key={row.id}
                className={`border-t border-border ${row.verdict === "discuss" ? "bg-destructive/5" : ""}`}
              >
                <td className="px-4 py-2.5 align-top text-muted-foreground">{row.question}</td>
                <td
                  className={`px-4 py-2.5 align-top ${row.verdict === "differs" || row.verdict === "discuss" ? "font-semibold" : ""}`}
                >
                  {row.a ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td
                  className={`px-4 py-2.5 align-top ${row.verdict === "differs" || row.verdict === "discuss" ? "font-semibold" : ""}`}
                >
                  {row.b ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 align-top">
                  {verdict && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${verdict.className}`}
                    >
                      {verdict.label}
                    </span>
                  )}
                </td>
              </tr>,
            );
            return cells;
          })}
        </tbody>
      </table>
    </div>
  );
}

type RunAction = (action: () => Promise<unknown>, success?: string) => Promise<void>;

function StagePanel({
  pairing: p,
  busy,
  runAction,
  setError,
}: {
  pairing: Pairing;
  busy: boolean;
  runAction: RunAction;
  setError: (value: string | null) => void;
}) {
  const decide = useServerFn(decidePairing);
  const [note, setNote] = useState("");

  if (REVIEW_STATUSES.has(p.status)) {
    return (
      <section className="space-y-3 rounded-lg border border-primary bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">Your decision</h2>
        <p className="text-sm text-muted-foreground">
          If you introduce them, both members see an anonymous profile and respond privately.
        </p>
        <label className="block text-sm font-medium" htmlFor={`note-${p.id}`}>
          Note to both members (optional)
        </label>
        <textarea
          id={`note-${p.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="For example: please talk openly about work after marriage."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Introduce these two members to each other?")) return;
              void runAction(
                () =>
                  decide({ data: { pairing_id: p.id, decision: "approved", note: note || null } }),
                "Introduced. Both members can now review the match privately.",
              );
            }}
            className="min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Introduce them
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Decline this match? Neither member will see it.")) return;
              void runAction(
                () =>
                  decide({ data: { pairing_id: p.id, decision: "declined", note: note || null } }),
                "Declined. Neither member will see this match.",
              );
            }}
            className="min-h-11 rounded-md border border-border px-5 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      </section>
    );
  }

  if (p.status === "member_review") {
    const response = (value: string | null) =>
      value === "accepted" ? "accepted" : value === "declined" ? "declined" : "not answered yet";
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-sm sm:p-5">
        <h2 className="text-base font-semibold">Waiting for both members</h2>
        <p className="mt-1 text-muted-foreground">
          {shortName(p.member_a)}: {response(p.member_a_response)} · {shortName(p.member_b)}:{" "}
          {response(p.member_b_response)}
        </p>
      </section>
    );
  }

  if (p.status === "awaiting_payment" || p.status === "payment_pending") {
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-sm sm:p-5">
        <h2 className="text-base font-semibold">Waiting for payment</h2>
        <p className="mt-1 text-muted-foreground">
          Both accepted the introduction. Contact details unlock for you once both have chosen a
          meeting package.
        </p>
        <PackageSummary pairing={p} />
      </section>
    );
  }

  if (ARRANGE_STATUSES.has(p.status) || p.status === "completed") {
    return <ArrangePanel pairing={p} busy={busy} runAction={runAction} setError={setError} />;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground sm:p-5">
      {p.status === "declined"
        ? "This match was not taken forward."
        : "There is nothing for you to do on this match right now."}
      {p.decision_note && <p className="mt-2">Your note: {p.decision_note}</p>}
    </section>
  );
}

function PackageSummary({ pairing: p }: { pairing: Pairing }) {
  const describe = (pkg: Pairing["meeting_package_a"]) =>
    pkg
      ? `paid · ${pkg.meeting_count} meeting${pkg.meeting_count === 1 ? "" : "s"} · ${formatPence(pkg.amount_pence)}`
      : "not paid yet";
  return (
    <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
      <li className="rounded-md bg-muted/60 px-3 py-2">
        {shortName(p.member_a)}: {describe(p.meeting_package_a)}
      </li>
      <li className="rounded-md bg-muted/60 px-3 py-2">
        {shortName(p.member_b)}: {describe(p.meeting_package_b)}
      </li>
      <li className="rounded-md bg-primary/5 px-3 py-2 font-medium text-primary">
        Meetings left: {p.meetings_remaining} of {p.shared_meeting_allowance}
      </li>
    </ul>
  );
}

function ContactCard({ member }: { member: Member }) {
  const contact = member.contact;
  const rows: Array<[string, string | null]> = contact
    ? [
        ["Prefers", optionLabel(CONTACT_METHODS, contact.contact_method)],
        ["Phone", contact.phone],
        ["Email", contact.email ?? member.contact_email],
        [
          "Best times",
          (contact.best_times ?? [])
            .map((value) => optionLabel(BEST_TIMES, value))
            .filter(Boolean)
            .join(", ") || null,
        ],
        [
          "Wali",
          contact.wali_name
            ? [
                contact.wali_name,
                optionLabel(WALI_RELATIONSHIPS, contact.wali_relationship)?.toLowerCase(),
                contact.wali_phone,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
        ],
        [
          "Happy to meet",
          (contact.meeting_formats ?? [])
            .map((value) => optionLabel(MEETING_FORMATS, value))
            .filter(Boolean)
            .join(", ") || null,
        ],
      ]
    : [["Email", member.contact_email]];
  return (
    <div className="min-w-0 rounded-lg border border-border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{shortName(member)}</p>
        {contact?.confirmed_at ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Confirmed
          </span>
        ) : (
          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium">
            Not confirmed yet
          </span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words">
              {value ?? <span className="text-muted-foreground">—</span>}
            </dd>
          </div>
        ))}
      </dl>
      {!contact && (
        <p className="mt-2 text-xs text-muted-foreground">
          They have been asked to add a phone number and wali details.
        </p>
      )}
    </div>
  );
}

function ArrangePanel({
  pairing: p,
  busy,
  runAction,
  setError,
}: {
  pairing: Pairing;
  busy: boolean;
  runAction: RunAction;
  setError: (value: string | null) => void;
}) {
  const schedule = useServerFn(proposeMeetup);
  const cancel = useServerFn(cancelMeetup);
  const completeMeeting = useServerFn(completeAssignedMeeting);
  const closeMatch = useServerFn(completePairing);
  const [form, setForm] = useState({ when: "", venue: "", address: "", wali: true, note: "" });

  const completedMeetings = p.meetups.filter((meeting) => meeting.status === "completed").length;
  const openMeeting = p.meetups.some((meeting) =>
    ["proposed", "confirmed"].includes(meeting.status),
  );
  const canClose = p.status === "scheduled" && completedMeetings > 0 && !openMeeting;

  return (
    <section className="space-y-5 rounded-lg border border-primary bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {p.status === "completed" ? "Match completed" : "Arrange their meetings"}
        </h2>
        <span className="text-xs text-muted-foreground">
          {completedMeetings} completed · {p.meetings_remaining} left
        </span>
      </div>

      {p.member_a.contact_shared && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-md bg-primary/5 px-3 py-2.5 text-sm">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            Only you can see these details. The members cannot see each other's.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <ContactCard member={p.member_a} />
            <ContactCard member={p.member_b} />
          </div>
        </div>
      )}

      <PackageSummary pairing={p} />

      {p.meetups.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Meetings</h3>
          {p.meetups.map((meeting) => (
            <div key={meeting.id} className="rounded-md border border-border px-4 py-3 text-sm">
              <p className="font-medium">
                {new Date(meeting.scheduled_at).toLocaleString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                · {meeting.venue}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {meeting.status} · {shortName(p.member_a)}: {meeting.response_a} ·{" "}
                {shortName(p.member_b)}: {meeting.response_b}
                {meeting.wali_required ? " · wali attending" : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {meeting.status === "confirmed" &&
                  new Date(meeting.scheduled_at).getTime() <= Date.now() && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Confirm that this meeting took place? Each member gets a private check-in three weeks later.",
                          )
                        )
                          return;
                        void runAction(
                          () => completeMeeting({ data: { meetup_id: meeting.id } }),
                          "Meeting marked as completed.",
                        );
                      }}
                      className="min-h-10 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
                    >
                      Mark meeting completed
                    </button>
                  )}
                {["proposed", "confirmed"].includes(meeting.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm("Cancel this meeting for both members?")) return;
                      void runAction(
                        () => cancel({ data: { meetup_id: meeting.id } }),
                        "Meeting cancelled. Both members have been told.",
                      );
                    }}
                    className="min-h-10 rounded-md border border-border px-3 text-xs font-semibold text-destructive"
                  >
                    Cancel meeting
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {ARRANGE_STATUSES.has(p.status) && p.meetings_remaining > 0 && (
        <div className="space-y-3 rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold">Propose a meeting</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="font-medium">Date and time</span>
              <input
                type="datetime-local"
                value={form.when}
                onChange={(event) => setForm({ ...form, when: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Venue</span>
              <input
                placeholder="For example: mosque meeting room, or video call"
                value={form.venue}
                onChange={(event) => setForm({ ...form, venue: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Address or link (optional)</span>
              <input
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Note to both families (optional)</span>
              <input
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.wali}
              onChange={(event) => setForm({ ...form, wali: event.target.checked })}
              className="h-5 w-5 shrink-0 accent-primary"
            />
            Wali must attend
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const when = new Date(form.when).getTime();
              if (
                !form.when ||
                !form.venue.trim() ||
                !Number.isFinite(when) ||
                when <= Date.now()
              ) {
                setError("Add a future date and time and a venue first.");
                return;
              }
              void runAction(async () => {
                await schedule({
                  data: {
                    pairing_id: p.id,
                    scheduled_at: new Date(form.when).toISOString(),
                    venue: form.venue.trim(),
                    address: form.address.trim() || null,
                    wali_required: form.wali,
                    note: form.note.trim() || null,
                  },
                });
                setForm({ when: "", venue: "", address: "", wali: true, note: "" });
              }, "Meeting proposed. Both members have been asked to accept it.");
            }}
            className="min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Propose meeting
          </button>
        </div>
      )}

      {canClose && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
          <p className="text-muted-foreground">
            When the families are taking things forward themselves, or no more meetings are planned,
            close the match.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm("Mark this match as completed? No more meetings can be arranged.")
              )
                return;
              void runAction(
                () => closeMatch({ data: { pairing_id: p.id } }),
                "Match marked as completed.",
              );
            }}
            className="min-h-11 rounded-md border border-border px-4 font-semibold hover:bg-accent disabled:opacity-60"
          >
            Mark match completed
          </button>
        </div>
      )}
    </section>
  );
}

function MessageThread({ pairingId }: { pairingId: string }) {
  const fetchMessages = useServerFn(listPairingMessages);
  const send = useServerFn(postPairingMessage);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => setMessages(await fetchMessages({ data: { pairing_id: pairingId } }));

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    setError(null);
    try {
      await refresh();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ data: { pairing_id: pairingId, body: draft } });
      setDraft("");
      await refresh();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => void toggle()}
        className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        <MessageSquare aria-hidden="true" className="size-4" />
        {open ? "Hide messages" : "Messages with both members"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            )}
            {messages.map((message) => (
              <div key={message.id} className="rounded-md bg-muted/60 px-3 py-2 text-sm">
                <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  {message.mine ? "You" : message.sender_role} ·{" "}
                  {new Date(message.created_at).toLocaleString("en-GB")}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
              </div>
            ))}
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              aria-label="Message both members"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message…"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
