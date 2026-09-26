import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { NotificationDatabase } from "./notification-database.types";
import { EMAIL_KINDS } from "./notification-email-policy";
import { dispatchOneNotification, nextEmailRetryAt } from "./notification-dispatch";
import { createSesMailer } from "./ses-email.server";

const pairingKinds = new Set([
  "anonymous_profile_ready",
  "mutual_acceptance",
  "introduction_response_reminder",
  "introduction_closed",
  "introduction_unavailable",
  "imam_match_review",
  "imam_match_review_reminder",
  "imam_ready_to_schedule",
  "imam_scheduling_reminder",
  "imam_meeting_update",
  "meeting_proposed",
  "meeting_response_reminder",
  "meeting_confirmed",
  "meeting_cancelled",
  "meeting_reminder",
  "meeting_followup",
  "meeting_check_in_reminder",
  "meeting_payment_received",
  "meeting_package_reminder",
]);
const meetingKinds = new Set([
  "meeting_proposed",
  "meeting_response_reminder",
  "meeting_confirmed",
  "meeting_cancelled",
  "meeting_reminder",
  "meeting_followup",
  "meeting_check_in_reminder",
  "imam_meeting_update",
]);

export async function runNotificationEmailJob() {
  const mailer = createSesMailer();
  if (!mailer) return { status: "disabled" };
  const db = supabaseAdmin as unknown as SupabaseClient<NotificationDatabase>;
  return dispatchOneNotification(
    {
      ...mailer,
      async claim(token) {
        const result = await db.rpc("claim_notification_email", { p_claim_token: token });
        if (result.error) throw new Error("Email queue is unavailable");
        return result.data?.[0] ?? null;
      },
      async recipient(job, kind) {
        const definition = EMAIL_KINDS[kind];
        if (pairingKinds.has(kind) && !job.pairing_id) return { skip: "missing_pair_context" };
        if (meetingKinds.has(kind) && !job.meetup_id) return { skip: "missing_meeting_context" };
        const preference = await db
          .from("email_notification_preferences")
          .select("enabled")
          .eq("user_id", job.user_id)
          .eq("category", definition.category)
          .maybeSingle();
        if (preference.error) throw new Error("Email preference lookup failed");
        if (!preference.data?.enabled) return { skip: "not_opted_in" };
        const auth = await supabaseAdmin.auth.admin.getUserById(job.user_id);
        if (auth.error) throw new Error("Recipient lookup failed");
        if (!auth.data.user.email || !auth.data.user.email_confirmed_at)
          return { skip: "email_unverified" };
        const ban = (auth.data.user as { banned_until?: string }).banned_until;
        if (ban && Date.parse(ban) > Date.now()) return { skip: "account_suspended" };

        if (definition.audience === "admin") {
          const role = await db
            .from("user_roles")
            .select("role")
            .eq("user_id", job.user_id)
            .eq("role", "admin")
            .maybeSingle();
          if (role.error) throw new Error("Recipient role lookup failed");
          if (!role.data) return { skip: "role_changed" };
          if (kind === "member_support_requested") {
            if (!job.check_in_id) return { skip: "missing_check_in_context" };
            const checkIn = await db
              .from("meeting_check_ins")
              .select("outcome,answered_at,reviewed_at")
              .eq("id", job.check_in_id)
              .maybeSingle();
            if (checkIn.error) throw new Error("Support request lookup failed");
            if (
              checkIn.data?.outcome !== "support_requested" ||
              !checkIn.data.answered_at ||
              checkIn.data.reviewed_at
            )
              return { skip: "support_no_longer_due" };
          }
          if (kind === "imam_referral_review" || kind === "admin_referral_reminder") {
            if (!job.referral_id) return { skip: "missing_referral_context" };
            const referral = await db
              .from("imam_referrals")
              .select("status")
              .eq("id", job.referral_id)
              .maybeSingle();
            if (referral.error) throw new Error("Referral lookup failed");
            if (referral.data?.status !== "pending") return { skip: "referral_no_longer_due" };
          }
          if (kind === "imam_application_review" || kind === "imam_application_review_reminder") {
            if (!job.imam_application_id) return { skip: "missing_imam_application_context" };
            const application = await db
              .from("imam_applications")
              .select("status")
              .eq("id", job.imam_application_id)
              .maybeSingle();
            if (application.error) throw new Error("Imam application lookup failed");
            if (application.data?.status !== "pending")
              return { skip: "imam_application_no_longer_due" };
          }
        }
        if (definition.audience === "imam") {
          const account = await db
            .from("imam_accounts")
            .select("imam_id,active")
            .eq("user_id", job.user_id)
            .maybeSingle();
          if (account.error) throw new Error("Imam account lookup failed");
          if (!account.data?.active) return { skip: "imam_inactive" };
          const imam = await db
            .from("imams")
            .select("verification_status")
            .eq("id", account.data.imam_id)
            .maybeSingle();
          if (imam.error) throw new Error("Imam verification lookup failed");
          if (imam.data?.verification_status !== "verified") return { skip: "imam_unverified" };
          if (job.pairing_id) {
            const pair = await db
              .from("pairings")
              .select("imam_id,status")
              .eq("id", job.pairing_id)
              .maybeSingle();
            if (pair.error) throw new Error("Pair lookup failed");
            if (pair.data?.imam_id !== account.data.imam_id) return { skip: "assignment_changed" };
            if (
              (kind === "imam_match_review" || kind === "imam_match_review_reminder") &&
              !["pending", "imam_review"].includes(pair.data.status)
            )
              return { skip: "review_no_longer_due" };
            if (
              (kind === "imam_ready_to_schedule" || kind === "imam_scheduling_reminder") &&
              pair.data.status !== "ready_to_schedule"
            )
              return { skip: "scheduling_no_longer_due" };
          }
          if (kind === "imam_referral_decision") {
            if (!job.referral_id) return { skip: "missing_referral_context" };
            const referral = await db
              .from("imam_referrals")
              .select("referrer_user_id,status")
              .eq("id", job.referral_id)
              .maybeSingle();
            if (referral.error) throw new Error("Referral lookup failed");
            if (referral.data?.referrer_user_id !== job.user_id)
              return { skip: "referrer_changed" };
            if (!referral.data || referral.data.status === "pending")
              return { skip: "referral_no_longer_due" };
          }
        }
        if (definition.audience === "member" && kind === "journey_progress_reminder") {
          const [survey, privacy, activePairing] = await Promise.all([
            db.from("survey_answers").select("completed").eq("user_id", job.user_id).maybeSingle(),
            db
              .from("privacy_settings")
              .select("visibility")
              .eq("user_id", job.user_id)
              .maybeSingle(),
            db
              .from("pairings")
              .select("id,status")
              .or(`user_a.eq.${job.user_id},user_b.eq.${job.user_id}`)
              .limit(20),
          ]);
          if (survey.error || privacy.error || activePairing.error)
            throw new Error("Journey state lookup failed");
          if (privacy.data?.visibility === "paused") return { skip: "journey_paused" };
          if (survey.data?.completed && privacy.data?.visibility !== "hidden")
            return { skip: "journey_step_completed" };
          if (
            activePairing.data?.some(
              (pair) => !["closed", "declined", "completed"].includes(pair.status),
            )
          )
            return { skip: "journey_already_active" };
        }
        if (definition.audience === "member" && kind === "journey_survey_completed") {
          const survey = await db
            .from("survey_answers")
            .select("completed")
            .eq("user_id", job.user_id)
            .maybeSingle();
          if (survey.error) throw new Error("Survey state lookup failed");
          if (!survey.data?.completed) return { skip: "survey_no_longer_complete" };
        }
        if (
          definition.audience === "member" &&
          ["imam_application_received", "imam_application_decision"].includes(kind)
        ) {
          if (!job.imam_application_id) return { skip: "missing_imam_application_context" };
          const application = await db
            .from("imam_applications")
            .select("user_id,status")
            .eq("id", job.imam_application_id)
            .maybeSingle();
          if (application.error) throw new Error("Imam application lookup failed");
          if (application.data?.user_id !== job.user_id)
            return { skip: "imam_application_owner_changed" };
          if (kind === "imam_application_received" && application.data?.status !== "pending")
            return { skip: "imam_application_no_longer_pending" };
          if (
            kind === "imam_application_decision" &&
            !["approved", "declined"].includes(application.data?.status ?? "")
          )
            return { skip: "imam_application_no_longer_decided" };
        }
        if (definition.audience === "member" && job.pairing_id) {
          const pair = await db
            .from("pairings")
            .select(
              "id,user_a,user_b,status,member_a_response,member_b_response,payment_a_status,payment_b_status",
            )
            .eq("id", job.pairing_id)
            .maybeSingle();
          if (pair.error) throw new Error("Pair lookup failed");
          if (!pair.data || ![pair.data.user_a, pair.data.user_b].includes(job.user_id))
            return { skip: "not_pair_participant" };
          const other = pair.data.user_a === job.user_id ? pair.data.user_b : pair.data.user_a;
          const blocks = await db
            .from("member_blocks")
            .select("block_id")
            .or(
              `and(blocker_user_id.eq.${job.user_id},blocked_user_id.eq.${other}),and(blocker_user_id.eq.${other},blocked_user_id.eq.${job.user_id})`,
            )
            .limit(1);
          if (blocks.error) throw new Error("Privacy lookup failed");
          if (blocks.data?.length) return { skip: "pair_blocked" };
          if (kind === "anonymous_profile_ready" && pair.data.status !== "member_review")
            return { skip: "introduction_no_longer_due" };
          if (kind === "introduction_response_reminder") {
            const response =
              pair.data.user_a === job.user_id
                ? pair.data.member_a_response
                : pair.data.member_b_response;
            if (pair.data.status !== "member_review" || response !== "pending")
              return { skip: "introduction_no_longer_due" };
          }
          if (
            (kind === "mutual_acceptance" || job.meetup_id) &&
            (pair.data.member_a_response !== "accepted" ||
              pair.data.member_b_response !== "accepted")
          )
            return { skip: "consent_changed" };
          if (
            kind === "meeting_payment_received" &&
            (pair.data.user_a === job.user_id
              ? pair.data.payment_a_status
              : pair.data.payment_b_status) !== "paid"
          )
            return { skip: "payment_not_verified" };
          if (kind === "meeting_package_reminder") {
            const payment =
              pair.data.user_a === job.user_id
                ? pair.data.payment_a_status
                : pair.data.payment_b_status;
            if (
              !["awaiting_payment", "payment_pending"].includes(pair.data.status) ||
              payment === "paid"
            )
              return { skip: "payment_no_longer_due" };
          }
          if (job.meetup_id) {
            const meetup = await db
              .from("meetups")
              .select("id,pairing_id,status,scheduled_at,completed_at,response_a,response_b")
              .eq("id", job.meetup_id)
              .maybeSingle();
            if (meetup.error) throw new Error("Meeting lookup failed");
            if (meetup.data?.pairing_id !== job.pairing_id) return { skip: "meeting_removed" };
            if (["declined", "closed"].includes(pair.data.status)) return { skip: "pair_closed" };
            if (
              kind === "meeting_reminder" &&
              (meetup.data.status !== "confirmed" ||
                Date.parse(meetup.data.scheduled_at) <= Date.now())
            )
              return { skip: "meeting_changed" };
            if (kind === "meeting_proposed" && meetup.data.status !== "proposed")
              return { skip: "meeting_changed" };
            if (kind === "meeting_response_reminder") {
              const response =
                pair.data.user_a === job.user_id
                  ? meetup.data?.response_a
                  : meetup.data?.response_b;
              if (meetup.data?.status !== "proposed" || response !== "pending")
                return { skip: "meeting_response_no_longer_due" };
            }
            if (kind === "meeting_confirmed" && meetup.data.status !== "confirmed")
              return { skip: "meeting_changed" };
            if (
              kind === "meeting_cancelled" &&
              !["cancelled", "declined"].includes(meetup.data.status)
            )
              return { skip: "meeting_changed" };
            if (kind === "meeting_followup" || kind === "meeting_check_in_reminder") {
              if (meetup.data.status !== "completed" || !meetup.data.completed_at)
                return { skip: "meeting_not_completed" };
              const checkIn = await db
                .from("meeting_check_ins")
                .select("answered_at,due_at")
                .eq("meetup_id", job.meetup_id)
                .eq("user_id", job.user_id)
                .maybeSingle();
              if (checkIn.error) throw new Error("Check-in lookup failed");
              if (
                !checkIn.data ||
                checkIn.data.answered_at ||
                Date.parse(checkIn.data.due_at) > Date.now()
              )
                return { skip: "check_in_not_due" };
              const later = await db
                .from("meetups")
                .select("id")
                .eq("pairing_id", job.pairing_id)
                .eq("status", "completed")
                .gt("completed_at", meetup.data.completed_at)
                .limit(1);
              if (later.error) throw new Error("Latest meeting lookup failed");
              if (later.data?.length) return { skip: "newer_meeting_completed" };
            }
          }
        }
        return { email: auth.data.user.email };
      },
      async finish(job, token, status, code, messageId) {
        const result = await db
          .from("notification_email_jobs")
          .update({
            status,
            last_error_code: code ?? null,
            ses_message_id: messageId ?? null,
            updated_at: new Date().toISOString(),
            ...(status === "queued"
              ? { not_before: new Date(nextEmailRetryAt(job.attempts)).toISOString() }
              : {}),
          })
          .eq("id", job.id)
          .eq("claim_token", token)
          .eq("status", "processing")
          .select("id")
          .maybeSingle();
        if (result.error || !result.data)
          throw new Error("Email queue result could not be recorded");
      },
    },
    crypto.randomUUID(),
  );
}
