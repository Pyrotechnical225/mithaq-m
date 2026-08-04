import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side paywall used by paid server functions. Never rely on the UI
 * hiding a button. Admins and complimentary members pass via the DB function.
 */
export async function assertActiveMembership(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data: active } = await context.supabase.rpc("has_active_membership", {
    _user_id: context.userId,
  });
  if (active) return;
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (isAdmin) return;
  throw new Error("A Mithaq membership is required to view and act on matches.");
}
