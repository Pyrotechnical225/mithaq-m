export const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "fixture-user", email_confirmed_at: "2026-01-01" } },
    }),
    signOut: async () => undefined,
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
