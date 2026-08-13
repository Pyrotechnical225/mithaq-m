import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    // This guard runs in the browser because Supabase stores the session in localStorage.
    // A document redirect avoids hydrating the sign-in page against the protected route shell.
    if (error || !data.user) throw redirect({ href: "/auth" });
    if (!data.user.email_confirmed_at) throw redirect({ href: "/verify-email" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
