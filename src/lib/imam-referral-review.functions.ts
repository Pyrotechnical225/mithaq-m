import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertAdminMfa } from "@/lib/admin-authorization";

export const listImamReferralsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("imam_referrals")
      .select("id,referred_name,referred_email,referrer_imam_id,status,created_at,reviewed_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Referrals could not load.");
    return data ?? [];
  });

export const reviewImamReferralAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "declined"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("imam_referrals")
      .update({
        status: data.decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error || !updated)
      throw new Error("Referral was not updated. Refresh to check its current status.");
    // Review never creates an account, grants an imam role, or sends an invitation.
    return { ok: true };
  });
