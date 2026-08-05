import { createFileRoute } from "@tanstack/react-router";

/**
 * Stripe webhook. Signature is verified against the RAW request body before
 * anything is parsed, and every event id is claimed in a ledger so repeated
 * deliveries are applied at most once.
 *
 * Only one-off introduction Checkout payments are handled here. Legacy
 * subscription billing has been removed from Mithaq.
 */
export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const payload = await request.text();
        const { verifyStripeSignature, claimStripeEvent, releaseStripeEvent } =
          await import("@/lib/membership.server");

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
          const ensureSynced = (result: { ok: boolean; reason?: string }) => {
            if (!result.ok)
              throw new Error(`Subscription sync failed: ${result.reason ?? "unknown"}`);
          };
          switch (event.type) {
            case "checkout.session.completed":
              if (((obj.metadata ?? {}) as Record<string, string>).kind === "introduction") {
                const { syncIntroductionPaymentFromSession } =
                  await import("@/lib/membership.server");
                ensureSynced(await syncIntroductionPaymentFromSession(obj.id as string));
              }
              break;
            default:
              break;
          }
        } catch (err) {
          console.error(`stripe webhook ${event.type} failed:`, err);
          await releaseStripeEvent(event.id);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
