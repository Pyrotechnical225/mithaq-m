import assert from "node:assert/strict";
import test from "node:test";
import {
  MITHAQ_SUPABASE_PUBLIC_CONFIG,
  assertSupabaseEnvironment,
} from "../src/integrations/supabase/public-config.ts";
import { MEETING_PACKAGES, formatPence, isMeetingPackageId } from "../src/lib/meeting-packages.ts";
import {
  checkoutSessionIsPaid,
  meetingPairingIsPayable,
  meetingSessionHasExpectedShape,
} from "../src/lib/payment-invariants.ts";
import { safeRelativePath } from "../src/lib/safe-navigation.ts";
import { verifyStripeSignature } from "../src/lib/stripe-signature.ts";
import { OPEN_SAFETY_REPORT_STATUSES } from "../src/lib/pilot-readiness-invariants.ts";

test("meeting package ids, allowances and GBP prices stay fixed", () => {
  assert.deepEqual(
    Object.values(MEETING_PACKAGES).map((item) => [item.id, item.meetings, item.amountPence]),
    [
      ["single", 1, 5_000],
      ["three", 3, 12_000],
      ["five", 5, 17_500],
    ],
  );
  assert.equal(formatPence(MEETING_PACKAGES.single.amountPence), "£50");
  assert.equal(isMeetingPackageId("three"), true);
  assert.equal(isMeetingPackageId("custom"), false);
});

test("meeting checkout requires mutual acceptance and a payable state", () => {
  assert.equal(
    meetingPairingIsPayable({
      status: "awaiting_payment",
      member_a_response: "accepted",
      member_b_response: "accepted",
    }),
    true,
  );
  for (const pairing of [
    { status: "approved", member_a_response: "accepted", member_b_response: "accepted" },
    { status: "awaiting_payment", member_a_response: "accepted", member_b_response: "pending" },
    { status: "member_review", member_a_response: "accepted", member_b_response: "accepted" },
  ]) {
    assert.equal(meetingPairingIsPayable(pairing), false);
  }
});

test("only a paid and completed payment-mode Session can fulfil a meeting package", () => {
  assert.equal(
    meetingSessionHasExpectedShape({ mode: "payment", status: "complete", payment_status: "paid" }),
    true,
  );
  assert.equal(checkoutSessionIsPaid({ status: "complete", payment_status: "unpaid" }), false);
  assert.equal(
    meetingSessionHasExpectedShape({
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
    }),
    false,
  );
  assert.equal(
    meetingSessionHasExpectedShape({ mode: "payment", status: "open", payment_status: "paid" }),
    false,
  );
});

test("redirect destinations stay on Mithaq", () => {
  assert.equal(safeRelativePath("/admin?tab=payments#latest"), "/admin?tab=payments#latest");
  for (const unsafe of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/%0Aexample.com",
    "admin",
    null,
  ]) {
    assert.equal(safeRelativePath(unsafe), undefined);
  }
});

test("Supabase browser and server project references must agree", () => {
  assert.equal(
    assertSupabaseEnvironment({ SUPABASE_URL: MITHAQ_SUPABASE_PUBLIC_CONFIG.url }),
    "oxhpvawqmrdvkrlntswl",
  );
  assert.throws(
    () =>
      assertSupabaseEnvironment({
        SUPABASE_PROJECT_ID: "differentprojectref",
      }),
    /Supabase project mismatch/,
  );
});

test("Stripe webhook signatures reject tampering and stale timestamps", async () => {
  const payload = JSON.stringify({ id: "evt_pilot", type: "checkout.session.completed" });
  const secret = "pilot-signature-secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const signature = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(await verifyStripeSignature(payload, header, secret), true);
  assert.equal(await verifyStripeSignature(`${payload} `, header, secret), false);
  assert.equal(await verifyStripeSignature(payload, null, secret), false);
  assert.equal(
    await verifyStripeSignature(payload, `t=${timestamp - 1_000},v1=${signature}`, secret),
    false,
  );
});

test("pilot readiness includes newly submitted safety reports", () => {
  assert.deepEqual(OPEN_SAFETY_REPORT_STATUSES, ["submitted", "reviewing"]);
});
