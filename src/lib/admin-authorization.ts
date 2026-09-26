export type AdminContext = {
  // TanStack's middleware supplies the typed Supabase client at runtime. Keep
  // this helper framework-agnostic so every admin function uses one check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  claims?: Record<string, unknown>;
};

export async function assertAdmin(context: AdminContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export function assertAdminMfa(context: AdminContext) {
  if (context.claims?.aal !== "aal2") {
    throw new Error(
      "Multi-factor authentication is required for this admin action. Open Security and verify your authenticator code, then try again.",
    );
  }
}
