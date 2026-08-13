/**
 * Accounts that must never be served to a member as a match candidate.
 *
 * Two groups, and neither is a role in the `app_role` enum sense:
 *   - admins, identified by a `user_roles` row with role = 'admin';
 *   - imams, identified by any row in `imam_accounts`. An imam whose dashboard
 *     access has been revoked (`active = false`) is still an imam, so the
 *     `active` flag is deliberately not filtered on here.
 *
 * Shared by the member-facing `generateMatches` and the admin compatibility
 * matrix so the two pools can never drift apart.
 */
export async function getExcludedUserIds(): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: adminRoles, error: roleError }, { data: imamAccounts, error: imamError }] =
    await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
      supabaseAdmin.from("imam_accounts").select("user_id"),
    ]);

  if (roleError) throw new Error(`Could not load admin accounts: ${roleError.message}`);
  if (imamError) throw new Error(`Could not load imam accounts: ${imamError.message}`);

  const excluded = new Set<string>();
  for (const row of adminRoles ?? []) excluded.add(row.user_id);
  for (const row of imamAccounts ?? []) excluded.add(row.user_id);
  return excluded;
}

/**
 * The same two groups, kept separate so the admin matrix can report *why* a
 * candidate was excluded rather than just dropping them silently.
 */
export async function getExcludedUserIdsByReason(): Promise<{
  admins: Set<string>;
  imams: Set<string>;
  all: Set<string>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: adminRoles, error: roleError }, { data: imamAccounts, error: imamError }] =
    await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
      supabaseAdmin.from("imam_accounts").select("user_id"),
    ]);

  if (roleError) throw new Error(`Could not load admin accounts: ${roleError.message}`);
  if (imamError) throw new Error(`Could not load imam accounts: ${imamError.message}`);

  const admins = new Set((adminRoles ?? []).map((row) => row.user_id));
  const imams = new Set((imamAccounts ?? []).map((row) => row.user_id));
  return { admins, imams, all: new Set([...admins, ...imams]) };
}
