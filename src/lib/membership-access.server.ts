export async function requireActiveMembership(context: {
  userId: string;
  supabase: {
    rpc: (
      name: "has_active_membership",
      args: { _user_id: string },
    ) => PromiseLike<{
      data: boolean | null;
      error: { message: string } | null;
    }>;
  };
}) {
  const { data, error } = await context.supabase.rpc("has_active_membership", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("An active membership is required for this feature.");
}
