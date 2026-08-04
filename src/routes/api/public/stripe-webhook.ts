import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook. Signature is verified against the RAW request body before
 * anything is parsed, and every event id is claimed in a ledger so repeated
 * deliveries are applied at most once.
 *
 * Events handled: checkout.session.completed,
 * customer.subscription.created/updated/deleted,
 * invoice.payment_succeeded, invoice.payment_failed.
 */
export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const payload = await request.text();
        const {
          verifyStripeSignature,
          syncSubscriptionFromSession,
          syncSubscriptionObject,
          syncFromInvoice,
          claimStripeEvent,
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

        try {
          switch (event.type) {
            case "checkout.session.completed":
              await syncSubscriptionFromSession(obj.id as string);
              break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
              await syncSubscriptionObject(obj);
              break;
            case "customer.subscription.deleted":
              await syncSubscriptionObject(obj, { deleted: true });
              break;
            case "invoice.payment_succeeded":
              await syncFromInvoice(obj, false);
              break;
            case "invoice.payment_failed":
              await syncFromInvoice(obj, true);
              break;
            default:
              break;
          }
        } catch (err) {
          console.error(`stripe webhook ${event.type} failed:`, err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
