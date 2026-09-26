/** Email copy deliberately contains no names, survey answers, scores or message text. */
export const EMAIL_KINDS = {
  journey_survey_completed: {
    category: "journey",
    audience: "member",
    subject: "Your Mithaq survey is complete",
    body: "Your survey has been saved as complete. Sign in to review your privacy choices and continue your journey.",
  },
  journey_progress_reminder: {
    category: "journey",
    audience: "member",
    subject: "Continue your Mithaq journey",
    body: "Your Mithaq journey still has a step waiting. Sign in to continue when you are ready.",
  },
  anonymous_profile_ready: {
    category: "matches",
    audience: "member",
    subject: "An introduction is ready to review",
    body: "An anonymous introduction is ready. Sign in to review it and make your own decision.",
  },
  mutual_acceptance: {
    category: "matches",
    audience: "member",
    subject: "Your introduction can move forward",
    body: "You have both accepted privately. Sign in to choose your meeting package and see the next steps.",
  },
  introduction_response_reminder: {
    category: "matches",
    audience: "member",
    subject: "Your introduction is still waiting",
    body: "An anonymous introduction is still waiting for your private decision. Sign in to review it when you are ready.",
  },
  introduction_closed: {
    category: "matches",
    audience: "member",
    subject: "An update to your Mithaq journey",
    body: "An introduction has closed. Sign in to see your current journey. Private decisions are never attributed.",
  },
  introduction_unavailable: {
    category: "matches",
    audience: "member",
    subject: "An update to your Mithaq journey",
    body: "An introduction is no longer available. Sign in to see your current journey.",
  },
  imam_match_review: {
    category: "imam",
    audience: "imam",
    subject: "A match is waiting for your review",
    body: "A proposed pair has been assigned to you. Sign in to compare the profiles and accept or decline the match.",
  },
  imam_match_review_reminder: {
    category: "imam",
    audience: "imam",
    subject: "Reminder: a match is waiting for review",
    body: "An assigned proposed pair is still waiting for your review. Open your secure workspace to compare the profiles.",
  },
  imam_ready_to_schedule: {
    category: "imam",
    audience: "imam",
    subject: "A pair is ready for a meeting",
    body: "Both members have completed the necessary steps. Open your workspace to check their allowance and arrange a meeting.",
  },
  imam_scheduling_reminder: {
    category: "imam",
    audience: "imam",
    subject: "Reminder: a pair is ready to schedule",
    body: "An assigned pair is still ready for a meeting. Open your workspace to coordinate the next steps with both families.",
  },
  imam_meeting_update: {
    category: "imam",
    audience: "imam",
    subject: "A meeting has an update",
    body: "The arrangements for an assigned meeting have changed. Open your workspace to review the current status.",
  },
  meeting_proposed: {
    category: "meetings",
    audience: "member",
    subject: "Please review your meeting arrangements",
    body: "Your meeting arrangements have been proposed or changed. Sign in to review the details and respond.",
  },
  meeting_response_reminder: {
    category: "meetings",
    audience: "member",
    subject: "Please respond to your meeting proposal",
    body: "Your proposed meeting arrangements are still waiting for your response. Sign in to review the current details.",
  },
  meeting_confirmed: {
    category: "meetings",
    audience: "member",
    subject: "Your meeting is confirmed",
    body: "Your meeting is confirmed. Sign in to check the time, venue and family arrangements.",
  },
  meeting_cancelled: {
    category: "meetings",
    audience: "member",
    subject: "Your meeting arrangements have changed",
    body: "A meeting has been cancelled or declined. Sign in for the current arrangements.",
  },
  meeting_reminder: {
    category: "meetings",
    audience: "member",
    subject: "A reminder about your upcoming meeting",
    body: "Your confirmed meeting is coming up within 24 hours. Sign in to check the latest arrangements.",
  },
  meeting_followup: {
    category: "check_ins",
    audience: "member",
    subject: "How is your Mithaq journey going?",
    body: "It has been three weeks since your completed meeting. When you are ready, sign in to share how things are going or request support.",
  },
  meeting_check_in_reminder: {
    category: "check_ins",
    audience: "member",
    subject: "A reminder about your private check-in",
    body: "Your private post-meeting check-in is still available. Sign in if you would like to share an update or request support.",
  },
  meeting_payment_received: {
    category: "payments",
    audience: "member",
    subject: "Your meeting package payment was received",
    body: "Your meeting package payment has been verified. Sign in to see your package and the next steps. This email is not a tax invoice.",
  },
  meeting_package_reminder: {
    category: "payments",
    audience: "member",
    subject: "Your meeting package step is waiting",
    body: "Your introduction has moved forward and your meeting package step is still waiting. Sign in to review the available options.",
  },
  imam_application_received: {
    category: "imam",
    audience: "member",
    subject: "Your imam application was received",
    body: "Your application has been received for review. Sign in to see its current status.",
  },
  imam_application_review: {
    category: "admin",
    audience: "admin",
    subject: "An imam application needs review",
    body: "A new imam application is waiting. Sign in to the administrator workspace to review it.",
  },
  imam_application_review_reminder: {
    category: "admin",
    audience: "admin",
    subject: "Reminder: an imam application needs review",
    body: "An imam application is still waiting for an administrator decision. Sign in to review it.",
  },
  imam_application_decision: {
    category: "imam",
    audience: "member",
    subject: "Your imam application has an update",
    body: "Your imam application has been reviewed. Sign in to view the decision and any next steps.",
  },
  imam_referral_review: {
    category: "imam",
    audience: "admin",
    subject: "An imam referral needs review",
    body: "A new imam referral is waiting. Sign in to the administrator workspace to review it.",
  },
  admin_referral_reminder: {
    category: "admin",
    audience: "admin",
    subject: "Reminder: an imam referral needs review",
    body: "An imam referral is still waiting for an administrator decision. Sign in to review it.",
  },
  imam_referral_decision: {
    category: "imam",
    audience: "imam",
    subject: "Your imam referral has an update",
    body: "The administrator has updated a referral you submitted. Sign in to your workspace to view its status.",
  },
  member_support_requested: {
    category: "admin",
    audience: "admin",
    subject: "A member has requested support",
    body: "A member has requested private support in a three-week check-in. Sign in to the administrator workspace to review it.",
  },
} as const;

export type EmailKind = keyof typeof EMAIL_KINDS;
export type EmailCategory = (typeof EMAIL_KINDS)[EmailKind]["category"];
export const EMAIL_CATEGORIES: readonly EmailCategory[] = [
  "journey",
  "matches",
  "meetings",
  "check_ins",
  "payments",
  "imam",
  "admin",
];
export const FOLLOWUP_DELAY_MS = 21 * 24 * 60 * 60 * 1000;

/** sRGB equivalents of the light-theme tokens in src/styles.css, safe for email clients. */
export const EMAIL_PALETTE = {
  background: "#fbf9f3",
  foreground: "#132018",
  card: "#fffefc",
  primary: "#113f28",
  primaryForeground: "#fcfaf4",
  mutedForeground: "#535e56",
  gold: "#9f8151",
  cream: "#f7f3eb",
  border: "#d7d4cc",
  ring: "#3c694f",
} as const;

const EMAIL_PRESENTATION: Record<EmailKind, { action: string; nextStep: string }> = {
  journey_survey_completed: {
    action: "Continue my journey",
    nextStep: "Review your privacy and visibility choices before moving into compatibility.",
  },
  journey_progress_reminder: {
    action: "Continue my journey",
    nextStep:
      "Continue from the step shown in your dashboard. You can turn off weekly journey reminders in Settings.",
  },
  anonymous_profile_ready: {
    action: "Review introduction",
    nextStep: "Take your time. Your decision is private, and there is no obligation to accept.",
  },
  mutual_acceptance: {
    action: "View next steps",
    nextStep: "Review the available meeting packages in your dashboard before making a payment.",
  },
  introduction_response_reminder: {
    action: "Review introduction",
    nextStep:
      "Take your time. Your decision remains private and is never attributed to the other member.",
  },
  introduction_closed: {
    action: "View my journey",
    nextStep: "Your dashboard will show your current status and any next steps available to you.",
  },
  introduction_unavailable: {
    action: "View my journey",
    nextStep: "Your dashboard will show your current status and any next steps available to you.",
  },
  imam_match_review: {
    action: "Review assigned match",
    nextStep: "Review the assigned profiles in your secure workspace before recording a decision.",
  },
  imam_match_review_reminder: {
    action: "Review assigned match",
    nextStep: "Review both assigned profiles in your secure workspace before recording a decision.",
  },
  imam_ready_to_schedule: {
    action: "Open meeting workspace",
    nextStep:
      "Check the remaining meeting allowance and coordinate arrangements with both families.",
  },
  imam_scheduling_reminder: {
    action: "Open meeting workspace",
    nextStep:
      "Check the current meeting allowance and coordinate the next step with both families.",
  },
  imam_meeting_update: {
    action: "Review meeting update",
    nextStep:
      "Use the latest status in your workspace when coordinating with the members and families.",
  },
  meeting_proposed: {
    action: "Review arrangements",
    nextStep: "Check the proposed time and venue, then respond through your dashboard.",
  },
  meeting_response_reminder: {
    action: "Review meeting proposal",
    nextStep: "Check the current time and venue, then accept or decline through your dashboard.",
  },
  meeting_confirmed: {
    action: "View meeting details",
    nextStep: "Check the latest arrangements in your dashboard before attending.",
  },
  meeting_cancelled: {
    action: "Check meeting status",
    nextStep:
      "Please check your dashboard before travelling or relying on an earlier confirmation.",
  },
  meeting_reminder: {
    action: "View meeting details",
    nextStep: "Sign in to check the latest time, venue and arrangements before you travel.",
  },
  meeting_followup: {
    action: "Share a private update",
    nextStep:
      "Your update is private to you and authorised Mithaq administrators, not the other member or imam. This is not an emergency support service.",
  },
  meeting_check_in_reminder: {
    action: "Open private check-in",
    nextStep:
      "Your update is private to you and authorised Mithaq administrators. This is not an emergency support service.",
  },
  meeting_payment_received: {
    action: "View meeting package",
    nextStep: "You can check your package and remaining meeting allowance in your dashboard.",
  },
  meeting_package_reminder: {
    action: "Review meeting packages",
    nextStep:
      "Matching and anonymous profile review remain free. Payment is only for the meeting package you choose after mutual acceptance.",
  },
  imam_application_received: {
    action: "View application status",
    nextStep: "Mithaq will review the application before any imam workspace access is granted.",
  },
  imam_application_review: {
    action: "Review imam application",
    nextStep: "Verify the applicant carefully before approving directory or workspace access.",
  },
  imam_application_review_reminder: {
    action: "Review imam application",
    nextStep: "Verify the applicant carefully before approving directory or workspace access.",
  },
  imam_application_decision: {
    action: "View application update",
    nextStep: "Open your application page to see the current status and any administrator note.",
  },
  imam_referral_review: {
    action: "Review imam referral",
    nextStep:
      "Review the referral in the administrator workspace. Approval alone does not grant account access.",
  },
  admin_referral_reminder: {
    action: "Review imam referral",
    nextStep:
      "Review the referral in the administrator workspace. Approval alone does not grant account access.",
  },
  imam_referral_decision: {
    action: "View referral status",
    nextStep: "Open the referring-imams tab in your workspace to see the latest decision.",
  },
  member_support_requested: {
    action: "Review support request",
    nextStep:
      "Review the private check-in in the administrator workspace. Do not reply with personal information by email.",
  },
};

const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  journey: "weekly journey guidance",
  matches: "introduction updates",
  meetings: "meeting updates",
  check_ins: "private check-ins",
  payments: "payment updates",
  imam: "workspace updates",
  admin: "administrator alerts",
};

export function isEmailKind(value: string): value is EmailKind {
  return Object.prototype.hasOwnProperty.call(EMAIL_KINDS, value);
}

export function followupDueAt(completedAt: string): string {
  const time = Date.parse(completedAt);
  if (!Number.isFinite(time)) throw new Error("Invalid completion time");
  return new Date(time + FOLLOWUP_DELAY_MS).toISOString();
}

export function emailOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Email links require a trusted HTTPS origin");
  }
  return url.origin;
}

export function validMailbox(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(value)
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function renderNotificationEmail(kind: EmailKind, origin: string) {
  if (!isEmailKind(kind)) throw new Error("Unsupported notification kind");
  const definition = EMAIL_KINDS[kind];
  const presentation = EMAIL_PRESENTATION[kind];
  const base = emailOrigin(origin);
  const path =
    kind === "member_support_requested"
      ? "/admin/check-ins"
      : kind === "imam_application_review" || kind === "imam_application_review_reminder"
        ? "/admin/imam-applications"
        : kind === "imam_application_received" || kind === "imam_application_decision"
          ? "/imam-apply"
          : definition.audience === "admin"
            ? "/admin/referrals"
            : definition.audience === "imam"
              ? "/imam"
              : "/dashboard";
  const href = `${base}${path}${
    kind === "meeting_followup" || kind === "meeting_check_in_reminder" ? "#check-ins" : ""
  }`;
  const preferences = `${base}/settings#email-notifications`;
  const privacy =
    "For your privacy, use your signed-in Mithaq account rather than sending personal details by email.";
  const reason = `You received this email because you enabled ${EMAIL_CATEGORY_LABELS[definition.category]} in Mithaq.`;
  const preheader =
    "A private update is ready in your Mithaq account. Sign in securely to continue.";
  return {
    subject: `${definition.subject} — Mithaq`,
    text: `Mithaq — Meet haq in marriage\n\n${definition.subject}\n\n${definition.body}\n\n${presentation.action}: ${href}\n\nWhat to do next\n${presentation.nextStep}\n\n${privacy}\n\n${reason}\nManage email preferences: ${preferences}`,
    html: `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(definition.subject)} — Mithaq</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    table { border-collapse:collapse; }
    a:focus-visible { outline:3px solid ${EMAIL_PALETTE.ring}; outline-offset:4px; }
    @media screen and (max-width:480px) {
      .outer-pad { padding:20px 16px !important; }
      .content-pad { padding-left:24px !important; padding-right:24px !important; }
      .email-title { font-size:27px !important; line-height:34px !important; }
      .email-action { display:block !important; box-sizing:border-box !important; width:100% !important; min-height:44px !important; text-align:center !important; }
      .fallback-link { word-break:break-all !important; overflow-wrap:anywhere !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${EMAIL_PALETTE.background};color:${EMAIL_PALETTE.foreground};font-family:Arial,Helvetica,sans-serif;">
  <div aria-hidden="true" style="display:none;font-size:1px;color:${EMAIL_PALETTE.background};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_PALETTE.background}">
    <tr><td class="outer-pad" align="center" style="padding:36px 16px;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="article" aria-roledescription="email" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 4px 20px;">
          <p style="margin:0;color:${EMAIL_PALETTE.foreground};font-size:27px;line-height:36px;font-weight:600;letter-spacing:-0.9px;">Mithaq <span lang="ar" dir="rtl" style="margin-left:8px;padding-left:12px;border-left:1px solid ${EMAIL_PALETTE.border};color:${EMAIL_PALETTE.primary};font-size:24px;font-weight:normal;letter-spacing:normal;">ميثاق</span></p>
          <p style="margin:4px 0 0;color:${EMAIL_PALETTE.mutedForeground};font-size:13px;line-height:20px;">Meet haq in marriage</p>
        </td></tr>
        <tr><td bgcolor="${EMAIL_PALETTE.card}" style="background-color:${EMAIL_PALETTE.card};border:1px solid ${EMAIL_PALETTE.border};border-top:4px solid ${EMAIL_PALETTE.primary};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="content-pad" style="padding:36px 36px 0;">
              <p style="margin:0 0 14px;color:${EMAIL_PALETTE.primary};font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase;">${definition.audience === "member" ? "Your private journey" : "Your Mithaq workspace"}</p>
              <h1 class="email-title" style="margin:0 0 20px;color:${EMAIL_PALETTE.foreground};font-size:32px;line-height:40px;font-weight:600;letter-spacing:-0.8px;">${escapeHtml(definition.subject)}</h1>
              <p style="margin:0;color:${EMAIL_PALETTE.mutedForeground};font-size:16px;line-height:27px;">${escapeHtml(definition.body)}</p>
            </td></tr>
            <tr><td class="content-pad" style="padding:28px 36px;">
              <a class="email-action" href="${escapeHtml(href)}" style="display:inline-block;border:1px solid ${EMAIL_PALETTE.primary};border-radius:4px;background-color:${EMAIL_PALETTE.primary};color:${EMAIL_PALETTE.primaryForeground};padding:15px 22px;font-size:16px;line-height:22px;font-weight:bold;text-decoration:none;mso-padding-alt:0;">
                <!--[if mso]><i style="mso-font-width:100%;mso-text-raise:22.5pt;" hidden>&emsp;</i><span style="mso-text-raise:11.25pt;"><![endif]-->${escapeHtml(presentation.action)}<!--[if mso]></span><i style="mso-font-width:100%;" hidden>&emsp;&#8203;</i><![endif]-->
              </a>
            </td></tr>
            <tr><td class="content-pad" style="padding:0 36px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_PALETTE.cream}">
                <tr><td style="padding:20px;border-left:3px solid ${EMAIL_PALETTE.gold};">
                  <h2 style="margin:0 0 8px;color:${EMAIL_PALETTE.foreground};font-size:14px;line-height:21px;font-weight:bold;">What to do next</h2>
                  <p style="margin:0;color:${EMAIL_PALETTE.mutedForeground};font-size:14px;line-height:23px;">${escapeHtml(presentation.nextStep)}</p>
                </td></tr>
              </table>
              <p style="margin:24px 0 8px;color:${EMAIL_PALETTE.mutedForeground};font-size:13px;line-height:21px;">${escapeHtml(privacy)}</p>
          <p style="margin:0;color:${EMAIL_PALETTE.mutedForeground};font-size:12px;line-height:20px;">If the button does not work, open:<br><a class="fallback-link" href="${escapeHtml(href)}" style="color:${EMAIL_PALETTE.primary};text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(href)}</a></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:22px 14px 0;">
          <p style="margin:0 0 8px;color:${EMAIL_PALETTE.mutedForeground};font-size:12px;line-height:20px;">${escapeHtml(reason)}</p>
          <a href="${escapeHtml(preferences)}" style="display:inline-block;padding:12px 4px;color:${EMAIL_PALETTE.primary};font-size:13px;line-height:20px;text-decoration:underline;">Manage email preferences</a>
          <p style="margin:8px 0 0;color:${EMAIL_PALETTE.mutedForeground};font-size:12px;line-height:20px;">Mithaq · Privacy, dignity and clear next steps.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`,
  };
}

/** SES has no send idempotency token: uncertain outcomes must never be auto-retried. */
export function classifyEmailFailure(error: unknown): "retry" | "failed" | "unknown" {
  const name = error instanceof Error ? error.name : "";
  if (name === "TooManyRequestsException") return "retry";
  if (
    [
      "BadRequestException",
      "MessageRejected",
      "MailFromDomainNotVerifiedException",
      "AccountSuspendedException",
      "SendingPausedException",
      "AccessDeniedException",
      "NotFoundException",
    ].includes(name)
  )
    return "failed";
  return "unknown";
}
