import type { listImamPairings } from "./imam.functions";

// Shared by the imam workspace list and match detail view.

export type Pairing = Awaited<ReturnType<typeof listImamPairings>>[number];
export type Member = Pairing["member_a"] | Pairing["member_b"];

export const STATUS: Record<
  string,
  { label: string; tone: "action" | "progress" | "ready" | "done" }
> = {
  pending: { label: "Needs your review", tone: "action" },
  imam_review: { label: "Needs your review", tone: "action" },
  member_review: { label: "With members", tone: "progress" },
  awaiting_payment: { label: "Awaiting payment", tone: "progress" },
  payment_pending: { label: "One member paid", tone: "progress" },
  ready_to_schedule: { label: "Ready to arrange", tone: "ready" },
  scheduled: { label: "Meeting arranged", tone: "ready" },
  completed: { label: "Completed", tone: "done" },
  declined: { label: "Not taken forward", tone: "done" },
  approved: { label: "Approved", tone: "progress" },
  closed: { label: "Closed", tone: "done" },
};

export const TONE_CLASS = {
  action: "bg-gold/20 text-foreground",
  progress: "border border-border bg-muted text-muted-foreground",
  ready: "bg-primary text-primary-foreground",
  done: "bg-muted text-muted-foreground",
};

export const REVIEW_STATUSES = new Set(["pending", "imam_review"]);
export const CLOSED_STATUSES = new Set(["completed", "declined", "closed"]);

export function statusOf(pairing: Pairing) {
  return STATUS[pairing.status] ?? { label: pairing.status.replaceAll("_", " "), tone: "progress" };
}

export function needsAction(pairing: Pairing) {
  if (REVIEW_STATUSES.has(pairing.status) || pairing.status === "ready_to_schedule") return true;
  return pairing.meetups.some(
    (meeting) =>
      meeting.status === "confirmed" && new Date(meeting.scheduled_at).getTime() <= Date.now(),
  );
}

export function shortName(member: Member) {
  return member.display_name || (member.side === "a" ? "Member A" : "Member B");
}

export function errorText(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  if (message && message.length < 200 && !/^[[{]/.test(message.trim())) return message;
  return "That action could not be completed. Refresh to check the current status before trying again.";
}
