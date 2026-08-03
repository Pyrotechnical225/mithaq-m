// Server-only Stripe helpers. Uses the REST API over fetch so it works in the
// edge/Worker runtime (no Node-only SDK).
import { PLANS, type PlanId } from "./membership-plans";

const STRIPE_API = "https://api.stripe.com/v1";

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
) {
  const key = stripeKey();
  if (!key) throw new StripeError(0, "Payments are not configured yet", "not_configured", null);
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
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
    console.error(
      `Stripe ${path} failed [${res.status}] ${err.type ?? "?"}/${err.code ?? "?"}: ${err.message ?? text}`,
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

export async function createCheckoutSession(opts: {
  plan: PlanId;
  userId: string;
  email: string | null;
  origin: string;
}) {
  const plan = PLANS[opts.plan];
  const body = form({
    mode: "subscription",
    success_url: `${opts.origin}/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.origin}/membership?checkout=cancelled`,
    client_reference_id: opts.userId,
    customer_email: opts.email ?? undefined,
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
  if (!userId) return { ok: false as const, reason: "no_user" };
  if (expectedUserId && userId !== expectedUserId) return { ok: false as const, reason: "mismatch" };
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { ok: false as const, reason: "not_paid" };
  }
  const subId = session.subscription as string | null;
  let status = "active";
  let periodEnd: string | null = null;
  if (subId) {
    const sub = (await retrieveSubscription(subId)) as Record<string, unknown>;
    status = (sub.status as string) ?? "active";
    periodEnd = sub.current_period_end
      ? new Date((sub.current_period_end as number) * 1000).toISOString()
      : null;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: meta.plan ?? "monthly",
      status,
      current_period_end: periodEnd,
      provider: "stripe",
      provider_customer_id: (session.customer as string | null) ?? null,
      provider_subscription_id: subId,
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("subscription upsert failed:", error.message);
    return { ok: false as const, reason: "db_error" };
  }
  return { ok: true as const, status };
}

/** Admin diagnostic: exercises the real Stripe API and reports what it says. */
export async function diagnoseStripeKey(origin: string) {
  const info = stripeKeyInfo();
  if (!info.configured) {
    return { key: info, checks: [{ name: "Key present", ok: false, detail: "No Stripe key saved" }] };
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
  await run("Create Checkout Session (write)", () =>
    createCheckoutSession({
      plan: "monthly",
      userId: "diagnostic",
      email: null,
      origin,
    }),
  );

  return { key: info, checks };
}

// Verifies the Stripe-Signature header against the raw request body.
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k.trim(), rest.join("=")];
    }),
  );
  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;

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
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
