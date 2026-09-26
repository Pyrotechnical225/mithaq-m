// Server-only Stripe helpers. Uses the REST API over fetch so it works in the
// edge/Worker runtime (no Node-only SDK).
import { PLANS, type PlanId } from "./membership-plans";
import { isMeetingPackageId, MEETING_PACKAGES, type MeetingPackageId } from "./meeting-packages";
import { checkoutSessionIsPaid, meetingSessionHasExpectedShape } from "./payment-invariants";
export { verifyStripeSignature } from "./stripe-signature";

const STRIPE_API = "https://api.stripe.com/v1";

/** Stripe statuses that mean the member should keep access. */
export const ACCESS_STATUSES = ["active", "trialing", "complimentary"] as const;

// Prefer a least-privilege restricted key. A full secret remains a fallback
// for deployments that have not completed the key migration yet.
function stripeKey() {
  return process.env.STRIPE_RESTRICTED_API_KEY || process.env.STRIPE_SECRET_KEY;
}

export function stripeConfigured() {
  return !!stripeKey();
}

/** Non-secret description of the configured key, for admin diagnostics. */
export function stripeKeyInfo() {
  const full = process.env.STRIPE_SECRET_KEY;
  const restricted = process.env.STRIPE_RESTRICTED_API_KEY;
  const key = restricted || full;
  if (!key) return { configured: false as const };
  const prefix = key.slice(0, key.indexOf("_", 3) + 1 || 8);
  return {
    configured: true as const,
    source: restricted ? ("STRIPE_RESTRICTED_API_KEY" as const) : ("STRIPE_SECRET_KEY" as const),
    kind: key.startsWith("rk_") ? ("restricted" as const) : ("secret" as const),
    mode: key.includes("_live_") ? ("live" as const) : ("test" as const),
    prefix,
    webhook_secret_present: !!process.env.STRIPE_WEBHOOK_SECRET,
    webhook_secret_looks_valid: (process.env.STRIPE_WEBHOOK_SECRET ?? "").startsWith("whsec_"),
  };
}

export class StripeError extends Error {
  status: number;
  code: string | null;
  stripeType: string | null;
  constructor(status: number, message: string, code: string | null, stripeType: string | null) {
    super(message);
    this.name = "StripeError";
    this.status = status;
    this.code = code;
    this.stripeType = stripeType;
  }
}

function form(obj: Record<string, string | number | boolean | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) body.set(k, String(v));
  }
  return body;
}

async function stripeCall(
  path: string,
  body?: URLSearchParams,
  method: "GET" | "POST" = "POST",
  idempotencyKey?: string,
) {
  const key = stripeKey();
  if (!key) throw new StripeError(0, "Payments are not configured yet", "not_configured", null);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": "2026-07-29.dahlia",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  if (!res.ok) {
    const err = (parsed.error ?? {}) as { message?: string; code?: string; type?: string };
    // Never log the key or the raw body — only Stripe's own error descriptors.
    console.error(
      `Stripe ${method} ${path} failed [${res.status}] ${err.type ?? "?"}/${err.code ?? "?"}: ${err.message ?? "no message"}`,
    );
    throw new StripeError(
      res.status,
      err.message ?? `Stripe request failed (${res.status})`,
      err.code ?? null,
      err.type ?? null,
    );
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Returns the Stripe customer recorded for this user, or creates a new one.
 * Email alone is not an ownership proof and must never link two accounts.
 */
export async function getOrCreateCustomer(opts: {
  userId: string;
  email: string | null;
  storedCustomerId: string | null;
}) {
  if (opts.storedCustomerId) {
    try {
      const existing = (await stripeCall(
        `/customers/${opts.storedCustomerId}`,
        undefined,
        "GET",
      )) as Record<string, unknown>;
      if (!existing.deleted) return existing.id as string;
    } catch (e) {
      if (!(e instanceof StripeError) || e.status !== 404) throw e;
    }
  }

  const created = await stripeCall(
    "/customers",
    form({
      email: opts.email ?? undefined,
      "metadata[user_id]": opts.userId,
    }),
    "POST",
    `customer:${opts.userId}`,
  );
  return created.id as string;
}

/** True when this Stripe customer already has a live (billable) subscription. */
export async function customerHasLiveSubscription(customerId: string) {
  const list = (await stripeCall(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
    undefined,
    "GET",
  )) as { data?: { id: string; status: string }[] };
  return (list.data ?? []).some((s) =>
    ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status),
  );
}

/* ------------------------------------------------------------------ */
/* Checkout / portal                                                   */
/* ------------------------------------------------------------------ */

async function integrationIdentifier(flow: "membership" | "meeting", seed: string) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mithaq:${flow}:${seed}`)),
  );
  const suffix = Array.from(digest.slice(0, 8), (value) => alphabet[value % alphabet.length]).join(
    "",
  );
  return `mithaq_${flow}_${suffix}`;
}

export async function createCheckoutSession(opts: {
  plan: PlanId;
  userId: string;
  customerId: string;
  origin: string;
}) {
  // Pricing is resolved server-side from the allowlisted plan id only.
  const plan = PLANS[opts.plan];
  if (!plan) throw new StripeError(0, "Unknown plan", "invalid_plan", null);
  const body = form({
    mode: "subscription",
    integration_identifier: await integrationIdentifier(
      "membership",
      `${opts.userId}:${opts.plan}`,
    ),
    success_url: `${opts.origin}/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}/membership?checkout=cancelled`,
    client_reference_id: opts.userId,
    customer: opts.customerId,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": plan.currency,
    "line_items[0][price_data][unit_amount]": plan.amount,
    "line_items[0][price_data][recurring][interval]": plan.interval,
    "line_items[0][price_data][product_data][name]": `Mithaq membership — ${plan.name}`,
    "subscription_data[metadata][user_id]": opts.userId,
    "subscription_data[metadata][plan]": plan.id,
    "metadata[user_id]": opts.userId,
    "metadata[plan]": plan.id,
    allow_promotion_codes: true,
  });
  const session = await stripeCall(
    "/checkout/sessions",
    body,
    "POST",
    `membership-checkout:${opts.userId}:${opts.plan}`,
  );
  return { url: session.url as string };
}

export async function createMeetingPackageCheckout(opts: {
  attemptId: string;
  pairingId: string;
  packageId: MeetingPackageId;
  userId: string;
  email: string | null;
  origin: string;
}) {
  const selected = MEETING_PACKAGES[opts.packageId];
  const body = form({
    mode: "payment",
    integration_identifier: await integrationIdentifier(
      "meeting",
      `${opts.pairingId}:${opts.userId}:${opts.packageId}`,
    ),
    success_url: `${opts.origin}/dashboard?meeting_payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}/dashboard?meeting_payment=cancelled`,
    client_reference_id: opts.userId,
    customer_email: opts.email ?? undefined,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": selected.amountPence,
    "line_items[0][price_data][product_data][name]": `Mithaq ${selected.label} package`,
    "line_items[0][price_data][product_data][description]": selected.description,
    "metadata[kind]": "meeting_package",
    "metadata[attempt_id]": opts.attemptId,
    "metadata[user_id]": opts.userId,
    "metadata[pairing_id]": opts.pairingId,
    "metadata[package_id]": selected.id,
    "metadata[meeting_count]": selected.meetings,
    "metadata[amount_pence]": selected.amountPence,
  });
  const session = await stripeCall(
    "/checkout/sessions",
    body,
    "POST",
    `meeting-package:${opts.attemptId}`,
  );
  return { id: session.id as string, url: session.url as string };
}

export async function createBillingPortalSession(customerId: string, origin: string) {
  const session = await stripeCall(
    "/billing_portal/sessions",
    form({ customer: customerId, return_url: `${origin}/membership` }),
  );
  return { url: session.url as string };
}

export async function retrieveSubscription(id: string) {
  return stripeCall(`/subscriptions/${id}`, undefined, "GET");
}

export async function retrieveCheckoutSession(id: string) {
  return stripeCall(`/checkout/sessions/${id}`, undefined, "GET");
}

/* ------------------------------------------------------------------ */
/* Persisting subscription state                                       */
/* ------------------------------------------------------------------ */

type SubRow = {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  stripe_updated_at: string;
  last_payment_status?: string | null;
};

function planFromSubscription(sub: Record<string, unknown>): string {
  const meta = (sub.metadata as Record<string, string> | undefined) ?? {};
  if (meta.plan === "monthly" || meta.plan === "yearly") return meta.plan;
  const items = (sub.items as { data?: { price?: { recurring?: { interval?: string } } }[] })?.data;
  const interval = items?.[0]?.price?.recurring?.interval;
  return interval === "year" ? "yearly" : "monthly";
}

function periodEnd(sub: Record<string, unknown>): string | null {
  const items = (sub.items as { data?: { current_period_end?: number }[] })?.data;
  const raw =
    (sub.current_period_end as number | undefined) ?? items?.[0]?.current_period_end ?? undefined;
  return raw ? new Date(raw * 1000).toISOString() : null;
}

async function upsertSubscriptionRow(row: SubRow) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("subscription upsert failed:", error.message);
    return false;
  }
  return true;
}

/** Resolve the Mithaq user for a Stripe subscription object. */
async function resolveUserId(sub: Record<string, unknown>): Promise<string | null> {
  const meta = (sub.metadata as Record<string, string> | undefined) ?? {};
  if (meta.user_id) return meta.user_id;
  const customer = sub.customer as string | null;
  if (!customer) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("provider_customer_id", customer)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Writes a Stripe subscription object into our subscriptions table.
 * Idempotent: the same object can be applied any number of times.
 */
export async function syncSubscriptionObject(
  sub: Record<string, unknown>,
  opts: { expectedUserId?: string; deleted?: boolean } = {},
) {
  const userId = opts.expectedUserId ?? (await resolveUserId(sub));
  if (!userId) return { ok: false as const, reason: "no_user" as const };
  if (opts.expectedUserId) {
    const claimed = await resolveUserId(sub);
    if (claimed && claimed !== opts.expectedUserId) {
      return { ok: false as const, reason: "mismatch" as const };
    }
  }

  const rawStatus = (sub.status as string) ?? "active";
  const status = opts.deleted || rawStatus === "canceled" ? "cancelled" : rawStatus;

  const ok = await upsertSubscriptionRow({
    user_id: userId,
    plan: status === "cancelled" ? "none" : planFromSubscription(sub),
    status,
    current_period_end: periodEnd(sub),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    provider: "stripe",
    provider_customer_id: (sub.customer as string | null) ?? null,
    provider_subscription_id: (sub.id as string | null) ?? null,
    stripe_updated_at: new Date().toISOString(),
  });
  return ok ? { ok: true as const, status } : { ok: false as const, reason: "db_error" as const };
}

/**
 * Reads a completed Checkout Session straight from Stripe and writes the
 * matching subscription row. Used by the webhook and as a fallback when the
 * member returns to /membership?checkout=success (so a delayed or misconfigured
 * webhook can't leave a paying member locked out).
 */
export async function syncSubscriptionFromSession(sessionId: string, expectedUserId?: string) {
  const session = (await retrieveCheckoutSession(sessionId)) as Record<string, unknown>;
  const meta = (session.metadata as Record<string, string> | undefined) ?? {};
  const userId = (session.client_reference_id as string | null) ?? meta.user_id ?? null;
  if (!userId) return { ok: false as const, reason: "no_user" as const };
  if (expectedUserId && userId !== expectedUserId) {
    return { ok: false as const, reason: "mismatch" as const };
  }
  // Only membership checkouts grant membership. A meeting-package payment
  // must never be replayed here to create an open-ended "active" membership.
  if (session.mode !== "subscription" || meta.kind === "meeting_package") {
    return { ok: false as const, reason: "invalid_session" as const };
  }
  // A completed Checkout Session can still be unpaid when an asynchronous
  // payment method is pending. Access begins only after Stripe reports paid.
  if (!checkoutSessionIsPaid(session)) {
    return { ok: false as const, reason: "not_paid" as const };
  }

  const subId = session.subscription as string | null;
  if (subId) {
    const sub = (await retrieveSubscription(subId)) as Record<string, unknown>;
    if (!sub.metadata || !(sub.metadata as Record<string, string>).user_id) {
      sub.metadata = { ...(sub.metadata as Record<string, string> | undefined), user_id: userId };
    }
    return syncSubscriptionObject(sub, { expectedUserId: userId });
  }

  const ok = await upsertSubscriptionRow({
    user_id: userId,
    plan: meta.plan ?? "monthly",
    status: "active",
    current_period_end: null,
    cancel_at_period_end: false,
    provider: "stripe",
    provider_customer_id: (session.customer as string | null) ?? null,
    provider_subscription_id: null,
    stripe_updated_at: new Date().toISOString(),
  });
  return ok
    ? { ok: true as const, status: "active" }
    : { ok: false as const, reason: "db_error" as const };
}

export async function syncMeetingPackagePaymentFromSession(
  sessionId: string,
  expectedUserId?: string,
) {
  const session = (await retrieveCheckoutSession(sessionId)) as Record<string, unknown>;
  const metadata = (session.metadata as Record<string, string> | undefined) ?? {};
  if (
    metadata.kind !== "meeting_package" ||
    !metadata.pairing_id ||
    !metadata.user_id ||
    !isMeetingPackageId(metadata.package_id ?? "")
  ) {
    return { ok: false as const, reason: "invalid_session" as const };
  }
  if (expectedUserId && metadata.user_id !== expectedUserId) {
    return { ok: false as const, reason: "wrong_user" as const };
  }
  if (!checkoutSessionIsPaid(session)) {
    return { ok: false as const, reason: "not_paid" as const };
  }
  if (!meetingSessionHasExpectedShape(session)) {
    return { ok: false as const, reason: "invalid_session_state" as const };
  }

  const packageId = metadata.package_id as MeetingPackageId;
  const selected = MEETING_PACKAGES[packageId];
  if (
    Number(session.amount_total) !== selected.amountPence ||
    String(session.currency).toLowerCase() !== "gbp"
  ) {
    return { ok: false as const, reason: "invalid_amount" as const };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (metadata.attempt_id) {
    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("meeting_checkout_attempts")
      .select(
        "id,pairing_id,user_id,package_id,meeting_count,amount_pence,currency,stripe_session_id,status",
      )
      .eq("id", metadata.attempt_id)
      .maybeSingle();
    if (attemptError) throw new Error(`Could not verify checkout attempt: ${attemptError.message}`);
    if (
      !attempt ||
      attempt.pairing_id !== metadata.pairing_id ||
      attempt.user_id !== metadata.user_id ||
      attempt.package_id !== selected.id ||
      attempt.meeting_count !== selected.meetings ||
      attempt.amount_pence !== selected.amountPence ||
      attempt.currency !== "gbp" ||
      attempt.stripe_session_id !== sessionId ||
      // A session Stripe reports as paid is authoritative even if the local
      // attempt was already marked expired.
      !["open", "paid", "expired"].includes(attempt.status)
    ) {
      return { ok: false as const, reason: "checkout_attempt_mismatch" as const };
    }
  }
  const { data: pairing } = await supabaseAdmin
    .from("pairings")
    .select(
      "id,user_a,user_b,imam_id,status,member_a_response,member_b_response,payment_a_status,payment_b_status",
    )
    .eq("id", metadata.pairing_id)
    .maybeSingle();
  if (!pairing || ![pairing.user_a, pairing.user_b].includes(metadata.user_id)) {
    return { ok: false as const, reason: "pairing_not_found" as const };
  }
  if (
    !["awaiting_payment", "payment_pending", "ready_to_schedule"].includes(pairing.status) ||
    pairing.member_a_response !== "accepted" ||
    pairing.member_b_response !== "accepted"
  ) {
    return { ok: false as const, reason: "pairing_not_payable" as const };
  }

  const { data: activeBlock, error: blockError } = await supabaseAdmin
    .from("member_blocks")
    .select("blocker_user_id")
    .or(
      `and(blocker_user_id.eq.${pairing.user_a},blocked_user_id.eq.${pairing.user_b}),and(blocker_user_id.eq.${pairing.user_b},blocked_user_id.eq.${pairing.user_a})`,
    )
    .limit(1)
    .maybeSingle();
  if (blockError) throw new Error(`Could not verify pairing safety: ${blockError.message}`);
  if (activeBlock) return { ok: false as const, reason: "pairing_blocked" as const };

  const side = pairing.user_a === metadata.user_id ? "a" : "b";
  const otherPaid =
    side === "a" ? pairing.payment_b_status === "paid" : pairing.payment_a_status === "paid";
  const { error: purchaseError } = await supabaseAdmin.from("meeting_package_purchases").upsert(
    {
      pairing_id: pairing.id,
      user_id: metadata.user_id,
      package_id: selected.id,
      meeting_count: selected.meetings,
      amount_pence: selected.amountPence,
      currency: "gbp",
      stripe_session_id: sessionId,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      payment_status: "paid",
      paid_at: new Date().toISOString(),
    },
    { onConflict: "pairing_id,user_id" },
  );
  if (purchaseError) throw new Error(`Could not record meeting package: ${purchaseError.message}`);

  const paymentPatch =
    side === "a"
      ? { payment_a_status: "paid", payment_session_a: sessionId }
      : { payment_b_status: "paid", payment_session_b: sessionId };
  const { error: pairingError } = await supabaseAdmin
    .from("pairings")
    .update({ ...paymentPatch, status: otherPaid ? "ready_to_schedule" : "payment_pending" })
    .eq("id", pairing.id)
    // Never reopen a pairing that was closed after the checks above. When both
    // members pay concurrently the database trigger
    // pairings_ready_when_both_paid still moves it to ready_to_schedule.
    .in("status", ["awaiting_payment", "payment_pending", "ready_to_schedule"]);
  if (pairingError) throw new Error(`Could not update payment status: ${pairingError.message}`);

  if (metadata.attempt_id) {
    const { error: attemptError } = await supabaseAdmin
      .from("meeting_checkout_attempts")
      .update({
        status: "paid",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", metadata.attempt_id)
      .eq("stripe_session_id", sessionId);
    if (attemptError)
      throw new Error(`Could not complete checkout attempt: ${attemptError.message}`);
  }

  return { ok: true as const, both_paid: otherPaid };
}

export async function closeMeetingCheckoutAttempt(
  session: Record<string, unknown>,
  status: "expired" | "failed",
) {
  const metadata = (session.metadata as Record<string, string> | undefined) ?? {};
  if (metadata.kind !== "meeting_package" || !metadata.attempt_id) {
    return { ok: true as const, changed: false };
  }
  const sessionId = typeof session.id === "string" ? session.id : null;
  if (!sessionId) return { ok: false as const, reason: "invalid_session" as const };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("meeting_checkout_attempts")
    .update({
      status,
      last_error: status === "failed" ? "Stripe reported that payment failed" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", metadata.attempt_id)
    .eq("stripe_session_id", sessionId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not close checkout attempt: ${error.message}`);
  return { ok: true as const, changed: !!data };
}

/** invoice.payment_succeeded / invoice.payment_failed handling. */
export async function syncFromInvoice(invoice: Record<string, unknown>, failed: boolean) {
  const subId =
    (invoice.subscription as string | null) ??
    (invoice.parent as { subscription_details?: { subscription?: string } } | undefined)
      ?.subscription_details?.subscription ??
    null;
  if (subId) {
    const sub = (await retrieveSubscription(subId)) as Record<string, unknown>;
    const result = await syncSubscriptionObject(sub);
    if (result.ok) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const userId = await resolveUserId(sub);
      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ last_payment_status: failed ? "failed" : "succeeded" })
          .eq("user_id", userId);
      }
    }
    return result;
  }
  return { ok: false as const, reason: "no_subscription" as const };
}

/** Idempotency ledger: returns true for a new event or a failed event retry. */
export async function claimStripeEvent(id: string, type: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("stripe_events").insert({
    id,
    type,
    status: "processing",
    attempts: 1,
    last_attempt_at: now,
    processed_at: null,
  });
  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("stripe_events")
        .select("attempts,status,last_attempt_at")
        .eq("id", id)
        .maybeSingle();
      if (existingError) throw new Error("Could not inspect Stripe event state");
      // A delivery that crashed mid-processing leaves the row "processing";
      // let a later retry take it over instead of acknowledging it forever.
      const staleProcessing =
        existing?.status === "processing" &&
        Date.now() - new Date(existing.last_attempt_at ?? 0).getTime() > 5 * 60 * 1000;
      if (existing?.status !== "failed" && !staleProcessing) return false;
      const { data: reclaimed, error: reclaimError } = await supabaseAdmin
        .from("stripe_events")
        .update({
          status: "processing",
          attempts: existing.attempts + 1,
          last_attempt_at: now,
          last_error: null,
        })
        .eq("id", id)
        .eq("status", existing.status)
        .select("id")
        .maybeSingle();
      if (reclaimError) throw new Error("Could not retry Stripe event");
      return !!reclaimed;
    }
    console.error("stripe_events insert failed:", error.message);
    throw new Error("Could not claim Stripe event for idempotent processing");
  }
  return true;
}

export async function completeStripeEvent(id: string, note?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("stripe_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: note ?? null,
    })
    .eq("id", id)
    .eq("status", "processing");
  if (error) throw new Error("Could not complete Stripe event ledger entry");
}

/** Retain a safe error summary so payment operations can see failed delivery. */
export async function failStripeEvent(id: string, error: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const message = (error instanceof Error ? error.message : "Unknown handler error").slice(0, 500);
  const { error: updateError } = await supabaseAdmin
    .from("stripe_events")
    .update({ status: "failed", last_error: message })
    .eq("id", id)
    .eq("status", "processing");
  if (updateError)
    console.error("stripe event failure could not be recorded:", updateError.message);
}

/**
 * Admin diagnostic: read-only Stripe calls only. It must never create
 * Checkout Sessions, customers or any other object.
 */
export async function diagnoseStripeKey() {
  const info = stripeKeyInfo();
  if (!info.configured) {
    return {
      key: info,
      checks: [{ name: "Key present", ok: false, detail: "No Stripe key saved" }],
    };
  }
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      checks.push({ name, ok: true, detail: "OK" });
    } catch (e) {
      const detail =
        e instanceof StripeError
          ? `[${e.status}] ${e.stripeType ?? "error"}/${e.code ?? "-"}: ${e.message}`
          : e instanceof Error
            ? e.message
            : "Unknown error";
      checks.push({ name, ok: false, detail });
    }
  };

  await run("Read subscriptions", () => stripeCall("/subscriptions?limit=1", undefined, "GET"));
  await run("Read customers", () => stripeCall("/customers?limit=1", undefined, "GET"));
  await run("Read prices", () => stripeCall("/prices?limit=1", undefined, "GET"));
  await run("Read checkout sessions", () =>
    stripeCall("/checkout/sessions?limit=1", undefined, "GET"),
  );

  return { key: info, checks };
}

/**
 * charge.refunded / charge.dispute.created for meeting packages.
 *
 * A full refund (or a chargeback) means the member no longer has a paid
 * package: their side of the pairing goes back to "refunded" and, if no
 * meeting has been arranged yet, the pairing returns to awaiting payment.
 * Pairings that already have meetings are left alone for an admin to decide.
 * Every case is written to the admin audit log.
 */
export async function syncMeetingPackageReversal(
  object: Record<string, unknown>,
  kind: "refund" | "dispute",
) {
  const paymentIntent = typeof object.payment_intent === "string" ? object.payment_intent : null;
  if (!paymentIntent) return { ok: true as const, changed: false };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: purchase, error: purchaseError } = await supabaseAdmin
    .from("meeting_package_purchases")
    .select("id,pairing_id,user_id,amount_pence,payment_status")
    .eq("stripe_payment_intent_id", paymentIntent)
    .maybeSingle();
  if (purchaseError) throw new Error(`Could not look up payment: ${purchaseError.message}`);
  // Not a meeting-package payment (or one this app never recorded).
  if (!purchase) return { ok: true as const, changed: false };

  const amount = Number(object.amount ?? 0);
  const amountRefunded = Number(object.amount_refunded ?? 0);
  const fullyReversed =
    kind === "dispute" || object.refunded === true || (amount > 0 && amountRefunded >= amount);
  const purchaseStatus = fullyReversed ? "refunded" : "partially_refunded";

  const { error: updatePurchaseError } = await supabaseAdmin
    .from("meeting_package_purchases")
    .update({ payment_status: purchaseStatus })
    .eq("id", purchase.id);
  if (updatePurchaseError)
    throw new Error(`Could not record refund: ${updatePurchaseError.message}`);

  let pairingOutcome = "unchanged";
  if (fullyReversed) {
    const { data: pairing, error: pairingError } = await supabaseAdmin
      .from("pairings")
      .select("id,user_a,user_b,status")
      .eq("id", purchase.pairing_id)
      .maybeSingle();
    if (pairingError) throw new Error(`Could not load pairing: ${pairingError.message}`);
    if (pairing && [pairing.user_a, pairing.user_b].includes(purchase.user_id)) {
      const side = pairing.user_a === purchase.user_id ? "a" : "b";
      const beforeMeetings = ["payment_pending", "ready_to_schedule"].includes(pairing.status);
      // Before any meeting is arranged the member can simply pay again, so
      // their side becomes "due"; afterwards it is marked refunded for review.
      const sideStatus = beforeMeetings ? "due" : "refunded";
      const { error: updatePairingError } = await supabaseAdmin
        .from("pairings")
        .update({
          ...(side === "a" ? { payment_a_status: sideStatus } : { payment_b_status: sideStatus }),
          ...(beforeMeetings ? { status: "awaiting_payment" } : {}),
        })
        .eq("id", pairing.id);
      if (updatePairingError)
        throw new Error(`Could not update pairing after refund: ${updatePairingError.message}`);
      pairingOutcome = beforeMeetings ? "returned_to_awaiting_payment" : "needs_admin_review";
    }
  }

  const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: null,
    action: kind === "dispute" ? "stripe_dispute_received" : "stripe_refund_received",
    target_type: "meeting_package_purchase",
    target_id: purchase.id,
    details: {
      pairing_id: purchase.pairing_id,
      purchase_status: purchaseStatus,
      amount_pence: purchase.amount_pence,
      amount_refunded_pence: kind === "refund" ? amountRefunded : null,
      pairing_outcome: pairingOutcome,
    },
  });
  if (auditError) console.error("Refund audit entry failed:", auditError.message);

  return { ok: true as const, changed: true };
}
