import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Current user's membership state.
export const getMyMembership = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select("plan, status, current_period_end, provider_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: active } = await context.supabase.rpc("has_active_membership", {
      _user_id: context.userId,
    });
    const { stripeConfigured } = await import("./membership.server");
    return {
      active: !!active,
      plan: data?.plan ?? "none",
      status: data?.status ?? "inactive",
      current_period_end: data?.current_period_end ?? null,
      has_billing_portal: !!data?.provider_customer_id,
      payments_configured: stripeConfigured(),
    };
  });

const CheckoutInput = z.object({
  plan: z.enum(["monthly", "yearly"]),
  origin: z.string().url(),
});

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { createCheckoutSession, stripeConfigured } = await import("./membership.server");
    if (!stripeConfigured()) {
      throw new Error(
        "Payments are not connected yet. Add your Stripe secret key to enable checkout.",
      );
    }
    const email = (context.claims as { email?: string } | undefined)?.email ?? null;
    return createCheckoutSession({
      plan: data.plan,
      userId: context.userId,
      email,
      origin: data.origin,
    });
  });

const PortalInput = z.object({ origin: z.string().url() });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PortalInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("provider_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sub?.provider_customer_id) throw new Error("No billing account yet");
    const { createBillingPortalSession } = await import("./membership.server");
    return createBillingPortalSession(sub.provider_customer_id, data.origin);
  });

// Admin: grant or revoke complimentary membership.
const GrantInput = z.object({
  user_id: z.string().uuid(),
  grant: z.boolean(),
});

export const setComplimentaryMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GrantInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: data.user_id,
        plan: data.grant ? "complimentary" : "none",
        status: data.grant ? "complimentary" : "cancelled",
        current_period_end: null,
        provider: data.grant ? "admin" : null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: membership status for every member.
export const listMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, plan, status, current_period_end");
    return data ?? [];
  });
