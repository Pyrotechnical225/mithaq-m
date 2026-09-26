// Verify Stripe's HMAC signature against the untouched request body.
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
) {
  if (!header) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [name, ...rest] = part.split("=");
    const value = rest.join("=");
    if (name.trim() === "t") timestamp = value;
    if (name.trim() === "v1") signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let index = 0; index < expected.length; index += 1) {
      diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    }
    return diff === 0;
  });
}
