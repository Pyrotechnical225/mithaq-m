import { createFileRoute } from "@tanstack/react-router";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const payload = await request.text();
        const {
          verifyStripeSignature,
          syncSubscriptionById,
          syncSubscriptionFromSession,
          syncSubscriptionObject,
        } = await import("@/lib/membership.server");
        const signatureValid = await verifyStripeSignature(
          payload,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!signatureValid) return new Response("Invalid signature", { status: 400 });

        let event: StripeEvent;
        try {
          event = JSON.parse(payload) as StripeEvent;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          const object = event.data.object;
          const ensureSynced = (result: { ok: boolean; reason?: string }) => {
            if (!result.ok)
              throw new Error(`Subscription sync failed: ${result.reason ?? "unknown"}`);
          };
          switch (event.type) {
            case "checkout.session.completed":
              ensureSynced(await syncSubscriptionFromSession(String(object.id)));
              break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
              ensureSynced(await syncSubscriptionObject(object));
              break;
            case "invoice.paid":
            case "invoice.payment_succeeded":
            case "invoice.payment_failed":
              if (typeof object.subscription === "string") {
                ensureSynced(await syncSubscriptionById(object.subscription));
              }
              break;
            default:
              break;
          }
        } catch (error) {
          console.error(`Stripe webhook ${event.id}/${event.type} failed:`, error);
          // Returning 500 asks Stripe to retry. All handlers only upsert current
          // state, so processing the same event again is safe.
          return new Response("Handler error", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
