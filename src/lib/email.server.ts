type MithaqEmail = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  ctaLabel: string;
  path?: string;
  idempotencyKey: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });

const appUrl = () => {
  const configured = process.env.MITHAQ_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl.replace(/\/$/, "")}` : "http://localhost:3000";
};

/**
 * Sends a privacy-safe transactional email through Resend. Email delivery is
 * deliberately best-effort: a provider outage must never block a member or
 * imam decision, and the in-app notification remains the source of truth.
 */
export async function sendMithaqEmail(email: MithaqEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MITHAQ_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn("Email notification skipped: RESEND_API_KEY or MITHAQ_EMAIL_FROM is missing");
    return { sent: false as const, reason: "not_configured" as const };
  }

  const destination = `${appUrl()}${email.path ?? "/dashboard"}`;
  const heading = escapeHtml(email.heading);
  const message = escapeHtml(email.message);
  const ctaLabel = escapeHtml(email.ctaLabel);
  const safeDestination = escapeHtml(destination);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: `${email.heading}\n\n${email.message}\n\n${email.ctaLabel}: ${destination}\n\nMithaq keeps member identities and private profile details out of email.`,
        html: `<!doctype html><html><body style="margin:0;background:#faf7f0;color:#19362d;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="font-family:Georgia,serif;font-size:24px;margin-bottom:28px">Mithaq</div><div style="background:#fff;border:1px solid #ded5c5;border-radius:20px;padding:32px"><h1 style="font-family:Georgia,serif;font-size:28px;font-weight:400;margin:0 0 16px">${heading}</h1><p style="font-size:16px;line-height:1.6;margin:0 0 24px">${message}</p><a href="${safeDestination}" style="display:inline-block;background:#00563f;color:#fff;text-decoration:none;border-radius:999px;padding:13px 20px;font-weight:700">${ctaLabel}</a></div><p style="font-size:12px;line-height:1.5;color:#64706b;margin:18px 4px 0">For your privacy, names, scores and profile details are never included in these emails. Sign in to Mithaq to view the update.</p></div></body></html>`,
      }),
    });

    if (!response.ok) {
      console.error("Email notification failed", { status: response.status });
      return { sent: false as const, reason: "provider_error" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("Email notification failed", error instanceof Error ? error.message : error);
    return { sent: false as const, reason: "network_error" as const };
  }
}

