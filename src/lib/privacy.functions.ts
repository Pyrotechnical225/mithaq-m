import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyPrivacy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("privacy_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      data ?? {
        user_id: context.userId,
        visibility: "hidden",
        show_location: true,
        show_occupation: true,
        show_free_text: false,
        reveal_contact_on_mutual: true,
      }
    );
  });

const UpdateInput = z.object({
  visibility: z.enum(["discoverable", "paused", "hidden"]),
  show_location: z.boolean(),
  show_occupation: z.boolean(),
  show_free_text: z.boolean(),
  reveal_contact_on_mutual: z.boolean(),
});

export const updateMyPrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("privacy_settings").upsert({
      user_id: context.userId,
      ...data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const issuedAt = Number((context.claims as { iat?: unknown } | undefined)?.iat);
    if (!Number.isFinite(issuedAt) || Date.now() / 1000 - issuedAt > 10 * 60) {
      throw new Error("For security, sign out and sign in again before deleting your account");
    }
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cascades take care of profile/answers/etc.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
