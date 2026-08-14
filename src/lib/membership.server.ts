// Server-only Stripe helpers. Uses the REST API over fetch so it works in the
// edge/Worker runtime (no Node-only SDK).
import { PLANS, type PlanId } from "./membership-plans";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-06-24.dahlia";

/** Stripe statuses that mean the member should keep access. */
export const ACCESS_STATUSES = ["active", "trialing", "complimentary"] as const;

// Prefer a least-privilege restricted key when one is configured. A full
// secret key remains supported for Vercel Marketplace compatibility.
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
    "Stripe-Version": STRIPE_API_VERSION,
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

function appOrigin(requestedOrigin: string) {
  const configured =
    process.env.APP_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw = configured
    ? configured.includes("://")
      ? configured
      : `https://${configured}`
    : requestedOrigin;
  const url = new URL(raw);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new StripeError(0, "Invalid checkout return URL", "invalid_origin", null);
  }
  return url.origin;
}

function randomLetters(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => String.fromCharCode(97 + (value % 26))).join("");
}

function configuredPriceId(plan: PlanId) {
  return (
    plan === "monthly" ? process.env.STRIPE_MONTHLY_PRICE_ID : process.env.STRIPE_YEARLY_PRICE_ID
  )?.trim();
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
  const origin = appOrigin(opts.origin);
  const priceId = configuredPriceId(plan.id);
  const body = form({
    mode: "subscription",
    success_url: `${origin}/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membership?checkout=cancelled`,
    client_reference_id: opts.userId,
    customer: opts.customerId,
    "line_items[0][quantity]": 1,
    "subscription_data[metadata][user_id]": opts.userId,
    "subscription_data[metadata][plan]": plan.id,
    "metadata[user_id]": opts.userId,
    "metadata[plan]": plan.id,
    allow_promotion_codes: true,
    integration_identifier: `meethaq_${randomLetters()}`,
  });
  if (priceId) {
    body.set("line_items[0][price]", priceId);
  } else {
    body.set("line_items[0][price_data][currency]", plan.currency);
    body.set("line_items[0][price_data][unit_amount]", String(plan.amount));
    body.set("line_items[0][price_data][recurring][interval]", plan.interval);
    body.set("line_items[0][price_data][product_data][name]", `MeetHaq membership — ${plan.name}`);
  }
  const session = await stripeCall(
    "/checkout/sessions",
    body,
    "POST",
    `checkout:${opts.userId}:${plan.id}:${Math.floor(Date.now() / 30_000)}`,
  );
  return { url: session.url as string };
}

export async function createBillingPortalSession(customerId: string, origin: string) {
  const session = await stripeCall(
    "/billing_portal/sessions",
    form({ customer: customerId, return_url: `${appOrigin(origin)}/membership` }),
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

/** Resolve the MeetHaq user for a Stripe subscription object. */
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
