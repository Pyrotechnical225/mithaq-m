import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const payload = await request.text();
        const { verifyStripeSignature, syncSubscriptionFromSession } = await import(
          "@/lib/membership.server"
        );
        const ok = await verifyStripeSignature(
          payload,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!ok) return new Response("Invalid signature", { status: 401 });

        const event = JSON.parse(payload) as {
          type: string;
          data: { object: Record<string, unknown> };
        };
        const obj = event.data.object;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const upsert = async (row: Record<string, unknown>) => {
          const { error } = await supabaseAdmin
            .from("subscriptions")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert(row as any, { onConflict: "user_id" });
          if (error) console.error("subscription upsert failed:", error.message);
        };

        try {
          if (event.type === "checkout.session.completed") {
            await syncSubscriptionFromSession(obj.id as string);
          } else if (

            event.type === "customer.subscription.updated" ||
            event.type === "customer.subscription.deleted"
          ) {
            const meta = (obj.metadata as Record<string, string> | undefined) ?? {};
            if (meta.user_id) {
              await upsert({
                user_id: meta.user_id,
                plan: meta.plan ?? "monthly",
                status:
                  event.type === "customer.subscription.deleted"
                    ? "cancelled"
                    : ((obj.status as string) ?? "active"),
                current_period_end: obj.current_period_end
                  ? new Date((obj.current_period_end as number) * 1000).toISOString()
                  : null,
                provider: "stripe",
                provider_customer_id: obj.customer as string | null,
                provider_subscription_id: obj.id as string,
              });
            }
          }
        } catch (err) {
          console.error("stripe webhook handling failed:", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
