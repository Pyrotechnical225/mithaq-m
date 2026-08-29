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
          syncSubscriptionObject,
          syncFromInvoice,
          claimStripeEvent,
          releaseStripeEvent,
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
          const ensureSynced = (result: { ok: boolean; reason?: string }) => {
            if (!result.ok)
              throw new Error(`Subscription sync failed: ${result.reason ?? "unknown"}`);
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
              }
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
