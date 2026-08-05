// Server-only Stripe helpers. Uses the REST API over fetch so it works in the
// edge/Worker runtime (no Node-only SDK).
import { PLANS, type PlanId } from "./membership-plans";

const STRIPE_API = "https://api.stripe.com/v1";

/** Stripe statuses that mean the member should keep access. */
export const ACCESS_STATUSES = ["active", "trialing", "complimentary"] as const;

// Prefer the full secret key; fall back to a restricted key (rk_...) which
// works for Checkout/Billing calls as long as it has write access to those
// resources.
function stripeKey() {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_RESTRICTED_API_KEY;
}

export function stripeConfigured() {
  return !!stripeKey();
}

/** Non-secret description of the configured key, for admin diagnostics. */
export function stripeKeyInfo() {
  const full = process.env.STRIPE_SECRET_KEY;
  const restricted = process.env.STRIPE_RESTRICTED_API_KEY;
  const key = full || restricted;
  if (!key) return { configured: false as const };
  const prefix = key.slice(0, key.indexOf("_", 3) + 1 || 8);
  return {
    configured: true as const,
    source: full ? ("STRIPE_SECRET_KEY" as const) : ("STRIPE_RESTRICTED_API_KEY" as const),
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

export const INTRODUCTION_FEE_PENCE = 3900;
export const IMAM_MEETING_FEE_PENCE = 4500;

export async function createIntroductionCheckout(opts: {
  pairingId: string;
  userId: string;
  customerId: string;
  origin: string;
}) {
  const session = await stripeCall(
    "/checkout/sessions",
    form({
      mode: "payment",
      success_url: `${opts.origin}/dashboard?introduction=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${opts.origin}/dashboard?introduction=cancelled`,
      client_reference_id: opts.userId,
      customer: opts.customerId,
      "line_items[0][quantity]": 1,
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": INTRODUCTION_FEE_PENCE,
      "line_items[0][price_data][product_data][name]": "Mithaq imam-supported introduction",
      "metadata[kind]": "introduction",
      "metadata[user_id]": opts.userId,
      "metadata[pairing_id]": opts.pairingId,
    }),
    "POST",
    `introduction:${opts.pairingId}:${opts.userId}`,
  );
  return { url: session.url as string };
}

export async function syncIntroductionPaymentFromSession(
  sessionId: string,
  expectedUserId?: string,
) {
  const session = await retrieveCheckoutSession(sessionId);
  const metadata = (session.metadata ?? {}) as Record<string, string>;
  if (metadata.kind !== "introduction" || !metadata.pairing_id || !metadata.user_id) {
    return { ok: false as const, reason: "not_introduction" as const };
  }
  if (expectedUserId && metadata.user_id !== expectedUserId) {
    return { ok: false as const, reason: "wrong_user" as const };
  }
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { ok: false as const, reason: "not_paid" as const };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: pairing } = await supabaseAdmin
    .from("pairings")
    .select("id,user_a,user_b,imam_id,payment_a_status,payment_b_status")
    .eq("id", metadata.pairing_id)
    .maybeSingle();
  if (!pairing || ![pairing.user_a, pairing.user_b].includes(metadata.user_id)) {
    return { ok: false as const, reason: "pairing_not_found" as const };
  }
  const side = pairing.user_a === metadata.user_id ? "a" : "b";
  const otherPaid =
    side === "a" ? pairing.payment_b_status === "paid" : pairing.payment_a_status === "paid";
  const patch =
    side === "a"
      ? { payment_a_status: "paid", payment_session_a: sessionId }
      : { payment_b_status: "paid", payment_session_b: sessionId };
  await supabaseAdmin
    .from("pairings")
    .update({ ...patch, status: otherPaid ? "ready_to_schedule" : "payment_pending" })
    .eq("id", pairing.id);
  if (otherPaid && pairing.imam_id) {
    const { data: account } = await supabaseAdmin
      .from("imam_accounts")
      .select("user_id")
      .eq("imam_id", pairing.imam_id)
      .eq("active", true)
      .maybeSingle();
    if (account?.user_id)
      await supabaseAdmin.from("notifications").insert({
        user_id: account.user_id,
        pairing_id: pairing.id,
        kind: "both_paid",
        title: "Both members have paid",
        body: "Both members have paid their introduction fee. Review their meeting preferences and schedule the meeting.",
      });
  }
  return { ok: true as const, both_paid: otherPaid };
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Returns the Stripe customer for this user, reusing the stored one when we
 * have it, then an existing Stripe customer with the same email, and only
 * creating a new customer as a last resort.
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

  if (opts.email) {
    try {
      const list = (await stripeCall(
        `/customers?limit=1&email=${encodeURIComponent(opts.email)}`,
        undefined,
        "GET",
      )) as { data?: { id: string }[] };
      const found = list.data?.[0]?.id;
      if (found) return found;
    } catch (e) {
      // Missing read permission on customers must not block checkout.
      if (!(e instanceof StripeError)) throw e;
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
  try {
    const list = (await stripeCall(
      `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`,
      undefined,
      "GET",
    )) as { data?: { id: string; status: string }[] };
    return (list.data ?? []).some((s) =>
      ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status),
    );
  } catch {
    // If we can't check, don't block the member — Stripe Checkout and the
    // billing portal still prevent genuine double-charging on the same plan.
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Checkout / portal                                                   */
/* ------------------------------------------------------------------ */

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
  const session = await stripeCall("/checkout/sessions", body);
  return { url: session.url as string };
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
  if (session.payment_status !== "paid" && session.status !== "complete") {
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

/** Idempotency ledger: returns true when this event has not been seen before. */
export async function claimStripeEvent(id: string, type: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("stripe_events").insert({ id, type });
  if (error) {
    // Unique violation = already processed.
    if (error.code === "23505") return false;
    console.error("stripe_events insert failed:", error.message);
    return true; // fail open so a ledger problem doesn't drop real events
  }
  return true;
}

/** Allow Stripe to retry an event whose handler failed after it was claimed. */
export async function releaseStripeEvent(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("stripe_events").delete().eq("id", id);
  if (error) console.error("stripe_events release failed:", error.message);
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

// Verifies the Stripe-Signature header against the raw request body.
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
) {
  if (!header) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [name, ...rest] = part.split("=");
    const value = rest.join("=");
    if (name.trim() === "t") timestamp = value;
    if (name.trim() === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  });
}
