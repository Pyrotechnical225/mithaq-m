import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

type AuditInput = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Json;
};

export async function writeAdminAudit(supabaseAdmin: SupabaseClient<Database>, input: AuditInput) {
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    details: input.details ?? {},
  });
  if (error) throw new Error(`Admin action completed but could not be audited: ${error.message}`);
}
