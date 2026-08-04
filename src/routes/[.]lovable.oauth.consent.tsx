import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Minimal typed shim for the beta supabase.auth.oauth namespace.
type OAuthAuthDetails = {
  client?: { name?: string; client_id?: string; redirect_uris?: string[] } | null;
  scope?: string;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResp = { data: OAuthAuthDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResp>;
  approveAuthorization: (id: string) => Promise<OAuthResp>;
  denyAuthorization: (id: string) => Promise<OAuthResp>;
};
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-foreground">Authorization error</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/) : []);

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="text-center">
        <p className="font-arabic text-4xl text-primary" dir="rtl" lang="ar">
          ميثاق
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          Connect {clientName} to your Mithaq account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use Mithaq as you.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        {scopes.length > 0 && (
          <div className="mb-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Requested access
            </p>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {scopes.map((s: string) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          This does not bypass Mithaq's privacy settings or database policies.
        </p>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "…" : "Approve"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-xl border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
