import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationDatabase } from "@/lib/notification-database.types";

export { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";

export const getMyTrustSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: consent, error: consentError }, { count, error: blocksError }] =
      await Promise.all([
        supabaseAdmin
          .from("member_consents")
          .select(
            "adult_confirmed_at,privacy_notice_version,privacy_notice_accepted_at,compatibility_processing_consent_at,compatibility_processing_withdrawn_at,updated_at",
          )
          .eq("user_id", context.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("member_blocks")
          .select("blocked_user_id", { count: "exact", head: true })
          .eq("blocker_user_id", context.userId),
      ]);
    if (consentError) throw new Error(consentError.message);
    if (blocksError) throw new Error(blocksError.message);
    return {
      adult_confirmed_at: consent?.adult_confirmed_at ?? null,
      privacy_notice_version: consent?.privacy_notice_version ?? null,
      privacy_notice_accepted_at: consent?.privacy_notice_accepted_at ?? null,
      compatibility_processing_consent_at: consent?.compatibility_processing_consent_at ?? null,
      compatibility_processing_withdrawn_at: consent?.compatibility_processing_withdrawn_at ?? null,
      active_compatibility_consent:
        !!consent?.compatibility_processing_consent_at &&
        !consent?.compatibility_processing_withdrawn_at,
      blocked_members: count ?? 0,
    };
  });

const RequiredConsentInput = z.object({
  adultConfirmed: z.literal(true),
  privacyNoticeAccepted: z.literal(true),
});

export const recordRequiredConsents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => RequiredConsentInput.parse(input))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("member_consents").upsert(
      {
        user_id: context.userId,
        adult_confirmed_at: now,
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        privacy_notice_accepted_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const withdrawCompatibilityConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("member_consents")
      .update({ compatibility_processing_withdrawn_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .not("compatibility_processing_consent_at", "is", null)
      .select("user_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("No active compatibility consent was found");
    const { data: openPairings, error: pairingError } = await supabaseAdmin
      .from("pairings")
      .select("id,user_a,user_b")
      .or(`user_a.eq.${context.userId},user_b.eq.${context.userId}`)
      .in("status", ["pending", "imam_review", "member_review"]);
    if (pairingError) throw new Error(pairingError.message);
    const pairingIds = (openPairings ?? []).map((pairing) => pairing.id);
    if (pairingIds.length > 0) {
      const { error: closeError } = await supabaseAdmin
        .from("pairings")
        .update({ status: "declined" })
        .in("id", pairingIds);
      if (closeError) throw new Error(closeError.message);
      const notifications = (openPairings ?? []).flatMap((pairing) =>
        [pairing.user_a, pairing.user_b].map((userId) => ({
          user_id: userId,
          pairing_id: pairing.id,
          kind: "introduction_unavailable",
          title: "Introduction unavailable",
          body: "This private compatibility result is no longer available. No member response is attributed.",
        })),
      );
      const { error: notificationError } = await supabaseAdmin
        .from("notifications")
        .insert(notifications);
      if (notificationError) throw new Error(notificationError.message);
    }
    return { ok: true };
  });

const PairingMemberInput = z.object({
  pairing_id: z.string().uuid(),
});

async function assertPairingRelationship(pairingId: string, currentUserId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("pairings")
    .select("id,user_a,user_b")
    .eq("id", pairingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || ![data.user_a, data.user_b].includes(currentUserId)) {
    throw new Error("This safety action is not available for that member");
  }
  const otherUserId = data.user_a === currentUserId ? data.user_b : data.user_a;
  return { supabaseAdmin, otherUserId };
}

const BlockMemberInput = PairingMemberInput.extend({
  reason: z.string().max(500).optional().nullable(),
});

export const blockMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BlockMemberInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, otherUserId } = await assertPairingRelationship(
      data.pairing_id,
      context.userId,
    );
    const { error } = await supabaseAdmin.from("member_blocks").upsert(
      {
        blocker_user_id: context.userId,
        blocked_user_id: otherUserId,
        reason: data.reason?.trim() || null,
      },
      { onConflict: "blocker_user_id,blocked_user_id" },
    );
    if (error) throw new Error(error.message);

    await Promise.all([
      supabaseAdmin
        .from("interests")
        .update({ status: "declined" })
        .eq("from_user", context.userId)
        .eq("to_user", otherUserId),
      supabaseAdmin
        .from("interests")
        .update({ status: "declined" })
        .eq("from_user", otherUserId)
        .eq("to_user", context.userId),
      supabaseAdmin.from("pairings").update({ status: "declined" }).eq("id", data.pairing_id),
    ]);
    const { error: notificationError } = await supabaseAdmin.from("notifications").insert(
      [context.userId, otherUserId].map((userId) => ({
        user_id: userId,
        pairing_id: data.pairing_id,
        kind: "introduction_unavailable",
        title: "Introduction unavailable",
        body: "This private introduction is no longer available. Safety actions remain confidential.",
      })),
    );
    if (notificationError) throw new Error(notificationError.message);
    return { ok: true };
  });

const ReportMemberInput = PairingMemberInput.extend({
  category: z.enum(["harassment", "safety", "identity", "inappropriate_content", "other"]),
  details: z.string().trim().min(10).max(2000),
});

export const reportMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ReportMemberInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, otherUserId } = await assertPairingRelationship(
      data.pairing_id,
      context.userId,
    );
    const { data: report, error } = await supabaseAdmin
      .from("member_reports")
      .insert({
        reporter_user_id: context.userId,
        reported_user_id: otherUserId,
        pairing_id: data.pairing_id,
        category: data.category,
        details: data.details,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, report_id: report.id };
  });

export const listMyBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: blocks, error } = await supabaseAdmin
      .from("member_blocks")
      .select("block_id,blocked_user_id,reason,created_at")
      .eq("blocker_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (blocks ?? []).map((row) => row.blocked_user_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,display_name").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((row) => [row.id, row.display_name]));
    return (blocks ?? []).map((row) => ({
      block_id: row.block_id,
      reason: row.reason,
      created_at: row.created_at,
      display_name: names.get(row.blocked_user_id) ?? "Blocked member",
    }));
  });

const UnblockInput = z.object({ block_id: z.string().uuid() });

export const unblockMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UnblockInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("member_blocks")
      .delete()
      .eq("blocker_user_id", context.userId)
      .eq("block_id", data.block_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function removeOtherMemberIds(value: Json): Json {
  if (Array.isArray(value)) return value.map(removeOtherMemberIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "match_user_id" && key !== "candidate_id")
        .map(([key, item]) => [key, removeOtherMemberIds(item ?? null)]),
    );
  }
  return value;
}

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const [
      profile,
      survey,
      privacy,
      consent,
      matches,
      interests,
      pairings,
      subscription,
      blocks,
      reports,
      notifications,
      messages,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabaseAdmin.from("survey_answers").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("privacy_settings").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("member_consents").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("matches").select("id,results,created_at").eq("user_id", uid),
      supabaseAdmin
        .from("interests")
        .select("id,from_user,to_user,status,created_at")
        .or(`from_user.eq.${uid},to_user.eq.${uid}`),
      supabaseAdmin
        .from("pairings")
        .select(
          "id,user_a,user_b,imam_id,status,decision_note,decided_at,created_at,updated_at,compatibility_score,compatibility_summary,meeting_preference_a,meeting_preference_b,member_a_response,member_b_response,payment_a_status,payment_b_status",
        )
        .or(`user_a.eq.${uid},user_b.eq.${uid}`),
      supabaseAdmin
        .from("subscriptions")
        .select(
          "plan,status,current_period_end,cancel_at_period_end,last_payment_status,provider,created_at,updated_at",
        )
        .eq("user_id", uid)
        .maybeSingle(),
      supabaseAdmin.from("member_blocks").select("reason,created_at").eq("blocker_user_id", uid),
      supabaseAdmin
        .from("member_reports")
        .select("id,pairing_id,category,details,status,reviewed_at,created_at,updated_at")
        .eq("reporter_user_id", uid),
      supabaseAdmin
        .from("notifications")
        .select("id,kind,title,body,pairing_id,read_at,created_at")
        .eq("user_id", uid),
      supabaseAdmin
        .from("pairing_messages")
        .select("id,pairing_id,sender_role,body,created_at")
        .eq("sender_id", uid),
    ]);

    for (const result of [
      profile,
      survey,
      privacy,
      consent,
      matches,
      interests,
      pairings,
      subscription,
      blocks,
      reports,
      notifications,
      messages,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const pairingRows = (pairings.data ?? []).map(({ user_a, user_b, ...row }) => ({
      ...row,
      my_side: user_a === uid ? "a" : "b",
    }));
    const pairingIds = pairingRows.map((row) => row.id);
    const [meetups, purchases] = pairingIds.length
      ? await Promise.all([
          supabaseAdmin
            .from("meetups")
            .select(
              "id,pairing_id,scheduled_at,venue,address,wali_required,note,status,created_at,updated_at",
            )
            .in("pairing_id", pairingIds),
          supabaseAdmin
            .from("meeting_package_purchases")
            .select(
              "id,pairing_id,package_id,meeting_count,amount_pence,currency,payment_status,paid_at,created_at",
            )
            .eq("user_id", uid),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (meetups.error) throw new Error(meetups.error.message);
    if (purchases.error) throw new Error(purchases.error.message);

    const notificationDb = supabaseAdmin as unknown as SupabaseClient<NotificationDatabase>;
    const [emailPreferences, checkIns] = await Promise.all([
      notificationDb
        .from("email_notification_preferences")
        .select("category,enabled,updated_at")
        .eq("user_id", uid),
      notificationDb
        .from("meeting_check_ins")
        .select("id,meetup_id,due_at,answered_at,outcome,note,created_at,reviewed_at")
        .eq("user_id", uid),
    ]);
    for (const result of [emailPreferences, checkIns]) {
      if (result.error && !["42P01", "PGRST205", "42703"].includes(result.error.code))
        throw new Error("Notification records could not be exported.");
    }
    const document = {
      generated_at: new Date().toISOString(),
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      account: { id: uid, email: context.claims?.email ?? null },
      profile: profile.data,
      survey: survey.data,
      privacy: privacy.data,
      consents: consent.data,
      compatibility_runs: (matches.data ?? []).map((row) => ({
        ...row,
        results: removeOtherMemberIds(row.results),
      })),
      interests: (interests.data ?? []).map(({ from_user, to_user, ...row }) => ({
        ...row,
        direction: from_user === uid ? "sent" : "received",
      })),
      pairings: pairingRows,
      my_messages: messages.data ?? [],
      meetings: meetups.data ?? [],
      meeting_package_purchases: purchases.data ?? [],
      membership: subscription.data,
      blocks: blocks.data ?? [],
      safety_reports: reports.data ?? [],
      notifications: notifications.data ?? [],
      email_notification_preferences: emailPreferences.data ?? [],
      meeting_check_ins: checkIns.data ?? [],
    };

    return {
      filename: `mithaq-my-data-${new Date().toISOString().slice(0, 10)}.json`,
      mime: "application/json",
      body: JSON.stringify(document, null, 2),
    };
  });
