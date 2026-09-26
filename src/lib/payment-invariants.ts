export function checkoutSessionIsPaid(session: Record<string, unknown>) {
  return session.payment_status === "paid";
}

export function meetingPairingIsPayable(pairing: {
  status: string;
  member_a_response: string;
  member_b_response: string;
}) {
  return (
    ["awaiting_payment", "payment_pending"].includes(pairing.status) &&
    pairing.member_a_response === "accepted" &&
    pairing.member_b_response === "accepted"
  );
}

export function meetingSessionHasExpectedShape(session: Record<string, unknown>) {
  return (
    session.mode === "payment" && session.status === "complete" && checkoutSessionIsPaid(session)
  );
}
