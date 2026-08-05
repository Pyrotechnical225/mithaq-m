import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Current user's membership state.
export const getMyMembership = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscriptions")
      .select(
        "plan, status, current_period_end, cancel_at_period_end, last_payment_status, provider_customer_id",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: active } = await context.supabase.rpc("has_active_membership", {
      _user_id: context.userId,
    });
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { stripeConfigured } = await import("./membership.server");
    return {
      active: !!active,
      plan: data?.plan ?? "none",
      status: data?.status ?? "inactive",
      current_period_end: data?.current_period_end ?? null,
      cancel_at_period_end: !!data?.cancel_at_period_end,
      last_payment_status: data?.last_payment_status ?? null,
      has_billing_portal: !!data?.provider_customer_id,
      payments_configured: stripeConfigured(),
      is_admin: !!isAdmin,
    };
  });

const CheckoutInput = z.object({
  // Allowlisted plan ids only — no client-supplied price or amount.
  plan: z.enum(["monthly", "yearly"]),
});

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const {
      createCheckoutSession,
      stripeConfigured,
      StripeError,
      getOrCreateCustomer,
      customerHasLiveSubscription,
    } = await import("./membership.server");

    if (!stripeConfigured()) {
      throw new Error(
        "Payments are not connected yet. Add your Stripe secret key to enable checkout.",
      );
    }

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    // Already a member? Don't let them buy a second subscription.
    const { data: active } = await context.supabase.rpc("has_active_membership", {
      _user_id: context.userId,
    });
    if (active) {
      throw new Error(
        "You already have an active membership. Use “Manage billing” to change plan.",
      );
    }

    const { data: existing } = await context.supabase
      .from("subscriptions")
      .select("provider_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const email = (context.claims as { email?: string } | undefined)?.email ?? null;

    try {
      const customerId = await getOrCreateCustomer({
        userId: context.userId,
        email,
        storedCustomerId: existing?.provider_customer_id ?? null,
      });

      // Remember the customer immediately so the billing portal and webhooks
      // can always resolve this user, even if checkout is abandoned.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: context.userId,
          provider: "stripe",
          provider_customer_id: customerId,
        },
        { onConflict: "user_id" },
      );

      if (await customerHasLiveSubscription(customerId)) {
        throw new Error(
          "There is already a subscription on your billing account. Use “Manage billing” to review it.",
        );
      }

      return await createCheckoutSession({
        plan: data.plan,
        userId: context.userId,
        customerId,
      });
    } catch (e) {
      // Full detail stays in the server logs; members see a plain message.
      // Admins get the underlying Stripe message so they can self-diagnose.
      if (e instanceof StripeError) {
        const permissionIssue =
          e.status === 401 || e.status === 403 || e.code === "api_key_insufficient_permissions";
        const friendly = permissionIssue
          ? "Payment setup is incomplete — our team has been notified. Please try again later or contact support."
          : "We couldn’t start checkout just now. Please try again in a moment.";
        throw new Error(
          isAdmin ? `${friendly} (Stripe: ${e.status} ${e.code ?? ""} ${e.message})` : friendly,
        );
      }
      if (e instanceof Error) throw e;
      throw new Error("We couldn’t start checkout just now. Please try again in a moment.");
    }
  });

// Called when the member returns from Stripe with ?checkout=success&session_id=…
// so membership activates even if the webhook is delayed or misconfigured.
// The session is only applied when it belongs to the signed-in user.
const ConfirmInput = z.object({ session_id: z.string().min(10).max(200) });

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { syncSubscriptionFromSession } = await import("./membership.server");
    try {
      return await syncSubscriptionFromSession(data.session_id, context.userId);
    } catch (e) {
      console.error("confirmCheckout failed:", e);
      return { ok: false as const, reason: "stripe_error" as const };
    }
  });

// Admin-only Stripe diagnostic — read-only Stripe calls, creates nothing.
export const diagnoseStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { diagnoseStripeKey } = await import("./membership.server");
    return diagnoseStripeKey();
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The customer id always comes from this user's own DB row.
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("provider_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!sub?.provider_customer_id) throw new Error("No billing account yet");
    const { createBillingPortalSession } = await import("./membership.server");
    try {
      return await createBillingPortalSession(sub.provider_customer_id);
    } catch (e) {
      console.error("billing portal failed:", e);
      throw new Error("We couldn’t open the billing portal just now. Please try again shortly.");
    }
  });

// Admin: grant or revoke complimentary membership.
const GrantInput = z.object({
  user_id: z.string().uuid(),
  grant: z.boolean(),
});

export const setComplimentaryMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => GrantInput.parse(input))
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
        cancel_at_period_end: false,
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
      .select("user_id, plan, status, current_period_end, cancel_at_period_end");
    return data ?? [];
  });
