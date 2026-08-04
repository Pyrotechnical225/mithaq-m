// Server-only Stripe helpers. Uses Stripe's REST API so it works in the
// edge/Worker runtime without relying on Node-only APIs.
import { PLANS, type PlanId } from "./membership-plans";

const STRIPE_API = "https://api.stripe.com/v1";
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function trustedOrigin(requestedOrigin: string) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  const requested = new URL(requestedOrigin);
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production" && requested.protocol !== "https:") {
    throw new Error("Invalid application URL");
  }
  return requested.origin;
}

function stripeKey() {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_RESTRICTED_API_KEY;
}

function configuredPriceId(plan: PlanId) {
  return plan === "monthly"
    ? process.env.STRIPE_MONTHLY_PRICE_ID
    : process.env.STRIPE_YEARLY_PRICE_ID;
}

export function stripeConfigured() {
  return !!stripeKey();
}

export function stripeKeyInfo() {
  const full = process.env.STRIPE_SECRET_KEY;
  const restricted = process.env.STRIPE_RESTRICTED_API_KEY;
  const key = full || restricted;
  if (!key) return { configured: false as const };
  return {
    configured: true as const,
    source: full ? ("STRIPE_SECRET_KEY" as const) : ("STRIPE_RESTRICTED_API_KEY" as const),
    kind: key.startsWith("rk_") ? ("restricted" as const) : ("secret" as const),
    mode: key.includes("_live_") ? ("live" as const) : ("test" as const),
    prefix: key.slice(0, 4),
    prices_configured: !!configuredPriceId("monthly") && !!configuredPriceId("yearly"),
    webhook_secret_present: !!process.env.STRIPE_WEBHOOK_SECRET,
    webhook_secret_looks_valid: (process.env.STRIPE_WEBHOOK_SECRET ?? "").startsWith("whsec_"),
  };
}

export class StripeError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string | null,
    public stripeType: string | null,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

function form(obj: Record<string, string | number | boolean | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body;
}

async function stripeCall(path: string, body?: URLSearchParams, method: "GET" | "POST" = "POST") {
  const key = stripeKey();
  if (!key) throw new StripeError(0, "Payments are not configured", "not_configured", null);
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? body : undefined,
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Stripe normally returns JSON; retain a safe generic error if it does not.
  }
  if (!response.ok) {
    const error = (parsed.error ?? {}) as { message?: string; code?: string; type?: string };
    console.error(
      `Stripe ${path} failed [${response.status}] ${error.type ?? "?"}/${error.code ?? "?"}: ${error.message ?? "unknown error"}`,
    );
    throw new StripeError(
      response.status,
      error.message ?? `Stripe request failed (${response.status})`,
      error.code ?? null,
      error.type ?? null,
    );
  }
  return parsed;
}

export async function createCheckoutSession(opts: {
  plan: PlanId;
  userId: string;
  email: string | null;
  customerId: string | null;
  origin: string;
}) {
  const plan = PLANS[opts.plan];
  const origin = trustedOrigin(opts.origin);
  const priceId = configuredPriceId(opts.plan);
  const lineItem = priceId
    ? { "line_items[0][price]": priceId }
    : {
        "line_items[0][price_data][currency]": plan.currency,
        "line_items[0][price_data][unit_amount]": plan.amount,
        "line_items[0][price_data][recurring][interval]": plan.interval,
        "line_items[0][price_data][product_data][name]": `Mithaq membership — ${plan.name}`,
      };
  const session = await stripeCall(
    "/checkout/sessions",
    form({
      mode: "subscription",
      success_url: `${origin}/membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/membership?checkout=cancelled`,
      client_reference_id: opts.userId,
      customer: opts.customerId ?? undefined,
      customer_email: opts.customerId ? undefined : (opts.email ?? undefined),
      "line_items[0][quantity]": 1,
      ...lineItem,
      "subscription_data[metadata][user_id]": opts.userId,
      "subscription_data[metadata][plan]": plan.id,
      "metadata[user_id]": opts.userId,
      "metadata[plan]": plan.id,
      allow_promotion_codes: true,
    }),
  );
  if (typeof session.url !== "string") throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

export async function createBillingPortalSession(customerId: string, origin: string) {
  const returnOrigin = trustedOrigin(origin);
  const session = await stripeCall(
    "/billing_portal/sessions",
    form({ customer: customerId, return_url: `${returnOrigin}/membership` }),
  );
  if (typeof session.url !== "string") throw new Error("Stripe did not return a portal URL");
  return { url: session.url };
}

export async function retrieveSubscription(id: string) {
  return stripeCall(`/subscriptions/${encodeURIComponent(id)}`, undefined, "GET");
}

export async function retrieveCheckoutSession(id: string) {
  return stripeCall(`/checkout/sessions/${encodeURIComponent(id)}`, undefined, "GET");
}

function planFromStripe(value: unknown): PlanId {
  return value === "yearly" ? "yearly" : "monthly";
}

export async function syncSubscriptionObject(
  subscription: Record<string, unknown>,
  fallbackUserId?: string,
  fallbackPlan?: PlanId,
) {
  const metadata = (subscription.metadata as Record<string, string> | undefined) ?? {};
  const userId = metadata.user_id ?? fallbackUserId ?? null;
  if (!userId) return { ok: false as const, reason: "no_user" as const };
  const status = String(subscription.status ?? "inactive");
  const periodEnd = subscription.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
    : null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: planFromStripe(metadata.plan ?? fallbackPlan),
      status,
      current_period_end: periodEnd,
      provider: "stripe",
      provider_customer_id:
        typeof subscription.customer === "string" ? subscription.customer : null,
      provider_subscription_id: String(subscription.id),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("Subscription upsert failed:", error.message);
    return { ok: false as const, reason: "db_error" as const };
  }
  return { ok: true as const, status, active: ACTIVE_STATUSES.has(status) };
}

export async function syncSubscriptionById(
  subscriptionId: string,
  fallbackUserId?: string,
  fallbackPlan?: PlanId,
) {
  const subscription = await retrieveSubscription(subscriptionId);
  return syncSubscriptionObject(subscription, fallbackUserId, fallbackPlan);
}

export async function syncSubscriptionFromSession(sessionId: string, expectedUserId?: string) {
  const session = await retrieveCheckoutSession(sessionId);
  const metadata = (session.metadata as Record<string, string> | undefined) ?? {};
  const userId = (session.client_reference_id as string | null) ?? metadata.user_id ?? null;
  if (!userId) return { ok: false as const, reason: "no_user" as const };
  if (expectedUserId && userId !== expectedUserId) {
    return { ok: false as const, reason: "mismatch" as const };
  }
  if (session.status !== "complete" || session.payment_status === "unpaid") {
    return { ok: false as const, reason: "not_paid" as const };
  }
  if (typeof session.subscription !== "string") {
    return { ok: false as const, reason: "no_subscription" as const };
  }
  return syncSubscriptionById(session.subscription, userId, planFromStripe(metadata.plan));
}

/** Admin diagnostic. All checks are read-only and never create Stripe objects. */
export async function diagnoseStripeKey() {
  const key = stripeKeyInfo();
  if (!key.configured) {
    return { key, checks: [{ name: "Key present", ok: false, detail: "No Stripe key saved" }] };
  }
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  for (const [name, path] of [
    ["Read customers", "/customers?limit=1"],
    ["Read subscriptions", "/subscriptions?limit=1"],
  ] as const) {
    try {
      await stripeCall(path, undefined, "GET");
      checks.push({ name, ok: true, detail: "OK" });
    } catch (error) {
      checks.push({
        name,
        ok: false,
        detail:
          error instanceof StripeError
            ? `[${error.status}] ${error.code ?? error.stripeType ?? "error"}: ${error.message}`
            : "Unexpected Stripe error",
      });
    }
  }
  return { key, checks };
}

// Verifies a Stripe-Signature against the exact raw body and rejects replayed
// requests outside Stripe's standard five-minute tolerance.
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
    const [key, ...rest] = part.split("=");
    const value = rest.join("=");
    if (key.trim() === "t") timestamp = value;
    if (key.trim() === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    }
    return difference === 0;
  });
}
