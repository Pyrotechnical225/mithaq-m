const SAFE_NAVIGATION_BASE = "https://mithaq.invalid";

/** Return a same-origin relative destination, or undefined when it could escape the site. */
export function safeRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (value.startsWith("//") || value.includes("\\") || hasControlCharacter) {
    return undefined;
  }

  try {
    const resolved = new URL(value, SAFE_NAVIGATION_BASE);
    if (resolved.origin !== SAFE_NAVIGATION_BASE) return undefined;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return undefined;
  }
}
