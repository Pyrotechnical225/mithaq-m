type PairingVisibilityFields = {
  status: string;
  member_a_response: string | null;
  member_b_response: string | null;
};

const INTRODUCED_STATUSES = new Set([
  "member_review",
  "awaiting_payment",
  "payment_pending",
  "ready_to_schedule",
  "scheduled",
  "completed",
  "approved",
  "closed",
]);

/**
 * Whether a pairing has been introduced to its members. Pairings still with
 * the imam, or declined by the imam before either member saw them, must stay
 * invisible to members everywhere (lists, exports, safety actions).
 */
export function isPairingVisibleToMembers(pairing: PairingVisibilityFields) {
  if (INTRODUCED_STATUSES.has(pairing.status)) return true;
  return (
    pairing.status === "declined" &&
    (pairing.member_a_response !== "pending" || pairing.member_b_response !== "pending")
  );
}
