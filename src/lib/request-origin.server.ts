const DEFAULT_ORIGIN = "https://meet-haq.vercel.app";

function configuredOrigin() {
  const value = process.env.PUBLIC_SITE_URL?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    throw new Error("PUBLIC_SITE_URL must be an absolute URL");
  }
}

/** Resolve redirects only from trusted deployment configuration. */
export function getRequestOrigin(): string {
  return configuredOrigin() ?? DEFAULT_ORIGIN;
}
