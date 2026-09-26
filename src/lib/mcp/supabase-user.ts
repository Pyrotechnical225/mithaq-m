import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";
import { getServerSupabasePublicConfigs } from "@/integrations/supabase/public-config";
import { supabaseConfigForToken } from "@/lib/supabase-token";

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken()!;
  const config = supabaseConfigForToken(token, getServerSupabasePublicConfigs());
  if (!config) throw new Error("The authentication token was not issued for this Mithaq project");
  const { url, publishableKey: key } = config;
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (isNewKey(key) && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        if (!h.has("Authorization")) h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function unauthed() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated" }],
    isError: true,
  };
}

export function errResult(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export function jsonResult<T>(value: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { value } as Record<string, unknown>,
  };
}
