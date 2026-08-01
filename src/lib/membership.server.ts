// Server-only Stripe helpers. Uses the REST API over fetch so it works in the
// edge/Worker runtime (no Node-only SDK).
import { PLANS, type PlanId } from "./membership-plans";

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
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
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Payments are not configured yet");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? body : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Stripe ${path} failed [${res.status}]: ${text}`);
    throw new Error(`Payment provider error [${res.status}]: ${text}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
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
    success_url: `${opts.origin}/membership?checkout=success`,
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
