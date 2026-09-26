import type { SupabasePublicConfig } from "@/integrations/supabase/public-config";

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decode the untrusted JWT payload only to route it to its issuing Supabase project.
 * Authentication still happens with Supabase getClaims before any claim is trusted.
 */
export function jwtIssuer(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { iss?: unknown };
    return typeof parsed.iss === "string" ? parsed.iss : undefined;
  } catch {
    return undefined;
  }
}

export function supabaseConfigForToken(
  token: string,
  configs: SupabasePublicConfig[],
): SupabasePublicConfig | undefined {
  const issuer = jwtIssuer(token);
  if (!issuer) return undefined;

  try {
    const issuerOrigin = new URL(issuer).origin;
    return configs.find((config) => new URL(config.url).origin === issuerOrigin);
  } catch {
    return undefined;
  }
}
