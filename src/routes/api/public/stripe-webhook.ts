import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook. Signature is verified against the RAW request body before
 * anything is parsed, and every event id is claimed in a ledger so repeated
 * deliveries are applied at most once.
 *
 * Events handled: checkout.session.completed,
 * customer.subscription.created/updated/deleted,
 * invoice.payment_succeeded, invoice.payment_failed,
 * charge.refunded, charge.dispute.created.
 */
const PERMANENT_REASONS = new Set([
  "invalid_session",
  "invalid_session_state",
  "invalid_amount",
  "wrong_user",
  "mismatch",
  "no_user",
  "no_subscription",
  "not_paid",
  "checkout_attempt_mismatch",
  "pairing_not_found",
  "pairing_not_payable",
  "pairing_blocked",
]);

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } }),
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
          return new Response("Payload too large", { status: 413 });
        }
        const payload = await request.text();
        if (payload.length > 1_000_000) return new Response("Payload too large", { status: 413 });
        const {
          verifyStripeSignature,
          syncSubscriptionFromSession,
          syncMeetingPackagePaymentFromSession,
          closeMeetingCheckoutAttempt,
          syncSubscriptionObject,
          syncFromInvoice,
          syncMeetingPackageReversal,
          claimStripeEvent,
          completeStripeEvent,
          failStripeEvent,
        } = await import("@/lib/membership.server");

        const ok = await verifyStripeSignature(
          payload,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let event: { id: string; type: string; data: { object: Record<string, unknown> } };
        try {
          event = JSON.parse(payload);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }
        if (!event?.id || !event?.type) return new Response("Bad payload", { status: 400 });

        const fresh = await claimStripeEvent(event.id, event.type);
        if (!fresh) return new Response("ok (duplicate)");

        const obj = event.data?.object ?? {};

        // Outcomes that retrying can never change. Stripe retries a 5xx for
        // days, so these are acknowledged and recorded for an admin instead.
        let reviewNote: string | null = null;
        try {
          const ensureSynced = (result: { ok: boolean; reason?: string }) => {
            if (result.ok) return;
            const reason = result.reason ?? "unknown";
            if (PERMANENT_REASONS.has(reason)) {
              reviewNote = `needs_review: ${event.type} ${reason}`;
              console.error(`stripe webhook ${event.id} needs admin review: ${reviewNote}`);
              return;
            }
            throw new Error(`Stripe sync failed: ${reason}`);
          };
          switch (event.type) {
            case "checkout.session.completed":
              if (((obj.metadata ?? {}) as Record<string, string>).kind === "meeting_package") {
                ensureSynced(await syncMeetingPackagePaymentFromSession(obj.id as string));
              } else {
                ensureSynced(await syncSubscriptionFromSession(obj.id as string));
              }
              break;
            case "checkout.session.async_payment_succeeded":
              if (((obj.metadata ?? {}) as Record<string, string>).kind === "meeting_package") {
                ensureSynced(await syncMeetingPackagePaymentFromSession(obj.id as string));
              } else {
                ensureSynced(await syncSubscriptionFromSession(obj.id as string));
              }
              break;
            case "checkout.session.async_payment_failed":
              ensureSynced(await closeMeetingCheckoutAttempt(obj, "failed"));
              break;
            case "checkout.session.expired":
              ensureSynced(await closeMeetingCheckoutAttempt(obj, "expired"));
              break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
              ensureSynced(await syncSubscriptionObject(obj));
              break;
            case "customer.subscription.deleted":
              ensureSynced(await syncSubscriptionObject(obj, { deleted: true }));
              break;
            case "invoice.paid":
            case "invoice.payment_succeeded":
              ensureSynced(await syncFromInvoice(obj, false));
              break;
            case "invoice.payment_failed":
              ensureSynced(await syncFromInvoice(obj, true));
              break;
            case "charge.refunded":
              ensureSynced(await syncMeetingPackageReversal(obj, "refund"));
              break;
            case "charge.dispute.created":
              ensureSynced(await syncMeetingPackageReversal(obj, "dispute"));
              break;
            default:
              break;
          }
          await completeStripeEvent(event.id, reviewNote ?? undefined);
        } catch (err) {
          console.error(`stripe webhook ${event.type} failed:`, err);
          await failStripeEvent(event.id, err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
