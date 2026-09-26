import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertAdminMfa } from "@/lib/admin-authorization";
import { OPEN_SAFETY_REPORT_STATUSES } from "@/lib/pilot-readiness-invariants";

type ReadinessStatus = "pass" | "warning" | "blocker";
type ReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  action: string | null;
};

export const getPilotReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      imamsResult,
      accountsResult,
      pairingsResult,
      eventsResult,
      attemptsResult,
      reportsResult,
      applicationsResult,
    ] = await Promise.all([
      supabaseAdmin.from("imams").select("id").eq("verification_status", "verified"),
      supabaseAdmin.from("imam_accounts").select("imam_id").eq("active", true),
      supabaseAdmin.from("pairings").select("id,imam_id,status,payment_a_status,payment_b_status"),
      supabaseAdmin.from("stripe_events").select("id,status").eq("status", "failed"),
      supabaseAdmin
        .from("meeting_checkout_attempts")
        .select("id,status,created_at")
        .in("status", ["creating", "open"]),
      supabaseAdmin
        .from("member_reports")
        .select("id,status")
        .in("status", [...OPEN_SAFETY_REPORT_STATUSES]),
      supabaseAdmin.from("imam_applications").select("id").eq("status", "pending"),
    ]);

    for (const result of [
      imamsResult,
      accountsResult,
      pairingsResult,
      eventsResult,
      attemptsResult,
      reportsResult,
      applicationsResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const verifiedImamIds = new Set((imamsResult.data ?? []).map((imam) => imam.id));
    const activeVerifiedImams = new Set(
      (accountsResult.data ?? [])
        .map((account) => account.imam_id)
        .filter((imamId) => verifiedImamIds.has(imamId)),
    ).size;
    const pairings = pairingsResult.data ?? [];
    const unassignedReviews = pairings.filter(
      (pairing) =>
        ["pending", "imam_review"].includes(pairing.status) &&
        (!pairing.imam_id || !verifiedImamIds.has(pairing.imam_id)),
    ).length;
    const incompletePaymentStates = pairings.filter(
      (pairing) =>
        pairing.status === "ready_to_schedule" &&
        (pairing.payment_a_status !== "paid" || pairing.payment_b_status !== "paid"),
    ).length;
    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
    const staleCheckouts = (attemptsResult.data ?? []).filter(
      (attempt) => new Date(attempt.created_at).getTime() < staleThreshold,
    ).length;

    const checks: ReadinessCheck[] = [];
    try {
      const { assertSupabaseEnvironment } = await import("@/integrations/supabase/public-config");
      const projectRef = assertSupabaseEnvironment(process.env);
      checks.push({
        id: "supabase-project",
        label: "Supabase project alignment",
        status: "pass",
        detail: `Browser and server target project ${projectRef}.`,
        action: null,
      });
    } catch {
      checks.push({
        id: "supabase-project",
        label: "Supabase project alignment",
        status: "blocker",
        detail: "Browser and server Supabase configuration do not agree.",
        action: "Correct the Vercel Supabase environment variables before testing.",
      });
    }

    const { stripeKeyInfo } = await import("@/lib/membership.server");
    const stripe = stripeKeyInfo();
    checks.push({
      id: "stripe-key",
      label: "Stripe API access",
      status: stripe.configured ? "pass" : "blocker",
      detail: stripe.configured
        ? `${stripe.mode} mode using a ${stripe.kind} key.`
        : "No server-side Stripe key is configured.",
      action: stripe.configured
        ? null
        : "Add a test-mode restricted key to the preview environment.",
    });
    checks.push({
      id: "stripe-webhook",
      label: "Stripe webhook signing",
      status: stripe.configured && stripe.webhook_secret_looks_valid ? "pass" : "blocker",
      detail:
        stripe.configured && stripe.webhook_secret_looks_valid
          ? "A Stripe webhook signing secret is present."
          : "The webhook signing secret is missing or malformed.",
      action:
        stripe.configured && stripe.webhook_secret_looks_valid
          ? null
          : "Add the endpoint signing secret and send a Stripe test event.",
    });
    checks.push({
      id: "verified-imams",
      label: "Verified imam coverage",
      status: activeVerifiedImams > 0 ? "pass" : "blocker",
      detail: `${activeVerifiedImams} verified imam${activeVerifiedImams === 1 ? " has" : "s have"} active workspace access.`,
      action: activeVerifiedImams > 0 ? null : "Verify and activate at least one pilot imam.",
    });
    checks.push({
      id: "unassigned-reviews",
      label: "Introduction assignment queue",
      status: unassignedReviews === 0 ? "pass" : "warning",
      detail: `${unassignedReviews} review${unassignedReviews === 1 ? " is" : "s are"} waiting for a verified imam assignment.`,
      action: unassignedReviews === 0 ? null : "Assign every pilot introduction before launch.",
    });
    checks.push({
      id: "payment-state",
      label: "Payment state integrity",
      status: incompletePaymentStates === 0 ? "pass" : "blocker",
      detail: `${incompletePaymentStates} ready-to-schedule pairing${incompletePaymentStates === 1 ? " has" : "s have"} incomplete payment state.`,
      action:
        incompletePaymentStates === 0
          ? null
          : "Investigate the affected pairing and Stripe events before scheduling.",
    });
    checks.push({
      id: "webhook-failures",
      label: "Webhook delivery health",
      status: (eventsResult.data ?? []).length === 0 ? "pass" : "blocker",
      detail: `${(eventsResult.data ?? []).length} Stripe webhook event${(eventsResult.data ?? []).length === 1 ? " is" : "s are"} in failed state.`,
      action:
        (eventsResult.data ?? []).length === 0
          ? null
          : "Resolve the failure and let Stripe retry before pilot payments.",
    });
    checks.push({
      id: "stale-checkouts",
      label: "Stale Checkout Sessions",
      status: staleCheckouts === 0 ? "pass" : "warning",
      detail: `${staleCheckouts} open checkout${staleCheckouts === 1 ? " is" : "s are"} older than 24 hours.`,
      action: staleCheckouts === 0 ? null : "Review or expire stale checkout attempts.",
    });
    checks.push({
      id: "safety-queue",
      label: "Safety review queue",
      status: (reportsResult.data ?? []).length === 0 ? "pass" : "warning",
      detail: `${(reportsResult.data ?? []).length} safety report${(reportsResult.data ?? []).length === 1 ? " needs" : "s need"} review.`,
      action:
        (reportsResult.data ?? []).length === 0
          ? null
          : "Review open safety reports before admitting more pilot members.",
    });
    checks.push({
      id: "imam-applications",
      label: "Imam application queue",
      status: (applicationsResult.data ?? []).length === 0 ? "pass" : "warning",
      detail: `${(applicationsResult.data ?? []).length} imam application${(applicationsResult.data ?? []).length === 1 ? " is" : "s are"} awaiting a decision.`,
      action:
        (applicationsResult.data ?? []).length === 0
          ? null
          : "Approve, decline, or defer each application explicitly.",
    });

    const blockers = checks.filter((check) => check.status === "blocker").length;
    const warnings = checks.filter((check) => check.status === "warning").length;
    return {
      generated_at: new Date().toISOString(),
      deployment: {
        environment: process.env.VERCEL_ENV ?? "local",
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
      summary: {
        status:
          blockers > 0
            ? ("blocked" as const)
            : warnings > 0
              ? ("review" as const)
              : ("ready" as const),
        blockers,
        warnings,
        passed: checks.filter((check) => check.status === "pass").length,
      },
      checks,
      manual: [
        "Complete a two-member test-mode introduction from imam approval through both package payments.",
        "Confirm Stripe webhook retries and refund handling in test mode.",
        "Enable Supabase leaked-password protection if the project plan supports it.",
        "Verify the privacy notice, support contact, incident owner, and pilot member consent wording.",
        "Obtain explicit approval before promoting a preview to public Vercel production.",
      ],
    };
  });
