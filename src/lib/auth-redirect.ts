import { safeRelativePath } from "./safe-navigation";

export const DEFAULT_PUBLIC_SITE_URL = "https://www.mithaq.uk";

type AuthRedirectOptions = {
  configuredSiteUrl?: string;
  next?: unknown;
};

function normalizedSiteUrl(value: string | undefined): string {
  const candidate = value?.trim() || DEFAULT_PUBLIC_SITE_URL;

  try {
    const url = new URL(candidate);
    const isHttps = url.protocol === "https:";
    const isLocalHttp =
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (!isHttps && !isLocalHttp) {
      return DEFAULT_PUBLIC_SITE_URL;
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

export function getPublicSiteUrl(configuredSiteUrl?: string): string {
  return normalizedSiteUrl(configuredSiteUrl);
}

export function getAuthCallbackUrl(options: AuthRedirectOptions = {}): string {
  const callback = new URL("/auth/callback", normalizedSiteUrl(options.configuredSiteUrl));
  const next = safeRelativePath(options.next);
  if (next) callback.searchParams.set("next", next);
  return callback.toString();
}
