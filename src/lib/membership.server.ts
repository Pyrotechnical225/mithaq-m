// Server-only helpers for Mithaq's one-off Stripe introduction payment.
// The REST API keeps this compatible with edge/Worker runtimes.
import { getRequest } from "@tanstack/react-start/server";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey() {
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_RESTRICTED_API_KEY;
}

export function stripeConfigured() {
  return !!stripeKey();
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
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body;
}

async function checkoutIdempotencyKey(prefix: string, body: URLSearchParams) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body.toString()),
  );
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${prefix}:${fingerprint}`;
}

async function stripeCall(path: string, body?: URLSearchParams, idempotencyKey?: string) {
  const key = stripeKey();
  if (!key) throw new StripeError(0, "Payments are not configured yet", "not_configured", null);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body,
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const error = (parsed.error ?? {}) as { message?: string; code?: string; type?: string };
    console.error(
      `Stripe POST ${path} failed [${response.status}] ${error.type ?? "?"}/${error.code ?? "?"}: ${error.message ?? "no message"}`,
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

export const INTRODUCTION_FEE_PENCE = 3900;
export const IMAM_MEETING_FEE_PENCE = 4500;

function requestOrigin() {
  const request = getRequest();
  if (!request?.url) throw new Error("Could not determine the secure return address");
  return new URL(request.url).origin;
}

export async function createIntroductionCheckout(opts: {
  pairingId: string;
  userId: string;
  email: string | null;
}) {
  const origin = requestOrigin();
  const body = form({
    mode: "payment",
    success_url: `${origin}/dashboard?introduction=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard?introduction=cancelled`,
    client_reference_id: opts.userId,
    customer_email: opts.email ?? undefined,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": INTRODUCTION_FEE_PENCE,
    "line_items[0][price_data][product_data][name]": "Mithaq imam-supported introduction",
    "metadata[kind]": "introduction",
    "metadata[user_id]": opts.userId,
    "metadata[pairing_id]": opts.pairingId,
    "managed_payments[enabled]": false,
  });
  const session = await stripeCall(
    "/checkout/sessions",
    body,
    await checkoutIdempotencyKey(
      `introduction:${opts.pairingId}:${opts.userId}`,
      body,
    ),
  );
  return { url: session.url as string };
}

async function retrieveCheckoutSession(id: string) {
  const key = stripeKey();
  if (!key) throw new StripeError(0, "Payments are not configured yet", "not_configured", null);
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const parsed = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string; code?: string; type?: string };
  };
  if (!response.ok) {
    throw new StripeError(
      response.status,
      parsed.error?.message ?? `Stripe request failed (${response.status})`,
      parsed.error?.code ?? null,
      parsed.error?.type ?? null,
    );
  }
  return parsed;
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
    if (account?.user_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: account.user_id,
        pairing_id: pairing.id,
        kind: "both_paid",
        title: "Both members have paid",
        body: "Both members have paid their introduction fee. Review their meeting preferences and schedule the meeting.",
      });
    }
  }
  return { ok: true as const, both_paid: otherPaid };
}

export async function claimStripeEvent(id: string, type: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("stripe_events").insert({ id, type });
  if (error) {
    if (error.code === "23505") return false;
    console.error("stripe_events insert failed:", error.message);
    return true;
  }
  return true;
}

export async function releaseStripeEvent(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("stripe_events").delete().eq("id", id);
  if (error) console.error("stripe_events release failed:", error.message);
}

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
    for (let index = 0; index < expected.length; index++) {
      difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    }
    return difference === 0;
  });
}
