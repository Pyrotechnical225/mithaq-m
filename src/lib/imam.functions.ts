import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type ImamAuthContext = { userId: string; claims?: Record<string, unknown> };

async function requireVerifiedImamAccount(context: ImamAuthContext) {
  if (context.claims?.aal !== "aal2") {
    throw new Error(
      "Multi-factor authentication is required for the imam workspace. Open Security and verify your authenticator code, then try again.",
    );
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: account } = await supabaseAdmin
    .from("imam_accounts")
    .select("imam_id,active")
    .eq("user_id", context.userId)
    .maybeSingle();
  const { data: imam } = account
    ? await supabaseAdmin
        .from("imams")
        .select("verification_status")
        .eq("id", account.imam_id)
        .maybeSingle()
    : { data: null };
  if (!account?.active || imam?.verification_status !== "verified") {
    throw new Error("Forbidden: verified imam only");
  }
  return { supabaseAdmin, account };
}

// Does the signed-in user have an active imam account?
export const amIImam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isImam } = await context.supabase.rpc("is_imam", {
      _user_id: context.userId,
    });
    if (!isImam) return { isImam: false as const, imam: null, mfaRequired: false as const };
    const { data: account } = await context.supabase
      .from("imam_accounts")
      .select("imam_id, radius_km, active")
      .eq("user_id", context.userId)
      .maybeSingle();
    let imam = null;
    if (account?.imam_id) {
      const { data } = await context.supabase
        .from("imams")
        .select(
          "id, name, title, mosque, city, postcode, languages, lat, lng, verification_status, verified_at",
        )
        .eq("id", account.imam_id)
        .eq("verification_status", "verified")
        .maybeSingle();
      imam = data ?? null;
    }
    return {
      isImam: true as const,
      imam,
      radius_km: account?.radius_km ?? 40,
      mfaRequired: context.claims?.aal !== "aal2",
    };
  });

// -----------------------------------------------------------------------------
// Apply to become a Mithaq imam (any signed-in user).
// -----------------------------------------------------------------------------
const ApplyInput = z.object({
  name: z.string().min(2).max(120),
  mosque: z.string().max(160).optional().nullable(),
  city: z.string().min(2).max(80),
  postcode: z.string().max(20).optional().nullable(),
  languages: z.array(z.string().max(40)).max(10).default([]),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().max(160),
  credentials: z.string().max(2000).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
});

export const applyAsImam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("imam_applications").insert({
      user_id: context.userId,
      name: data.name.trim(),
      mosque: data.mosque?.trim() || null,
      city: data.city.trim(),
      postcode: data.postcode?.trim() || null,
      languages: data.languages,
      phone: data.phone?.trim() || null,
      email: data.email.trim(),
      credentials: data.credentials?.trim() || null,
      message: data.message?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyImamApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("imam_applications")
      .select("id, status, city, mosque, admin_notes, created_at, reviewed_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

// -----------------------------------------------------------------------------
// Imam dashboard: local pairings awaiting review.
// -----------------------------------------------------------------------------
export const listImamPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, account } = await requireVerifiedImamAccount(context);
    const imamId = account.imam_id;
    const { data: pairings, error } = await supabaseAdmin
      .from("pairings")
      .select(
        "id,user_a,user_b,status,decision_note,decided_at,created_at,compatibility_score,compatibility_summary,member_a_response,member_b_response,payment_a_status,payment_b_status,meeting_preference_a,meeting_preference_b",
      )
      .eq("imam_id", imamId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!pairings || pairings.length === 0) return [];

    const { data: meetups } = await supabaseAdmin
      .from("meetups")
      .select(
        "id, pairing_id, scheduled_at, venue, address, wali_required, note, status, response_a, response_b",
      )
      .in(
        "pairing_id",
        pairings.map((pairing) => pairing.id),
      )
      .order("scheduled_at", { ascending: true });

    const ids = Array.from(new Set(pairings.flatMap((p) => [p.user_a, p.user_b])));
    const [{ data: profs }, { data: surveys }, { data: imam }, { data: purchases }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select(
            "id, display_name, contact_email, uk_city, uk_postcode, location_lat, location_lng",
          )
          .in("id", ids),
        supabaseAdmin.from("survey_answers").select("user_id, answers").in("user_id", ids),
        supabaseAdmin.from("imams").select("lat, lng").eq("id", imamId).maybeSingle(),
        supabaseAdmin
          .from("meeting_package_purchases")
          .select("pairing_id,user_id,package_id,meeting_count,amount_pence,payment_status")
          .in(
            "pairing_id",
            pairings.map((pairing) => pairing.id),
          )
          .eq("payment_status", "paid"),
      ]);
    const { haversineKm } = await import("./geo");
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const answerMap = new Map(
      (surveys ?? []).map((s) => [s.user_id, (s.answers ?? {}) as Record<string, unknown>]),
    );

    const summarise = (id: string) => {
      const p = profMap.get(id);
      const a = answerMap.get(id) ?? {};
      const km =
        imam?.lat && imam?.lng && p?.location_lat && p?.location_lng
          ? Math.round(haversineKm(imam.lat, imam.lng, p.location_lat, p.location_lng))
          : null;
      return {
        display_name: p?.display_name ?? "Member",
        contact_email: p?.contact_email ?? null,
        uk_city: p?.uk_city ?? null,
        uk_postcode: p?.uk_postcode ?? null,
        distance_km: km,
        age: a["1"] ?? null,
        gender: a["2"] ?? null,
        residence: a["3"] ?? null,
        wali: a["20"] ?? null,
      };
    };

    return pairings.map((p) => {
      const { user_a: userA, user_b: userB, ...pairing } = p;
      const pairingMeetups = (meetups ?? []).filter((m) => m.pairing_id === p.id);
      const activeMeetings = pairingMeetups.filter((m) => m.status !== "cancelled").length;
      const pairingPurchases = (purchases ?? []).filter((row) => row.pairing_id === p.id);
      const packageAWithUser = pairingPurchases.find((row) => row.user_id === p.user_a) ?? null;
      const packageBWithUser = pairingPurchases.find((row) => row.user_id === p.user_b) ?? null;
      const packageA = packageAWithUser
        ? (({ user_id: _userId, ...meetingPackage }) => meetingPackage)(packageAWithUser)
        : null;
      const packageB = packageBWithUser
        ? (({ user_id: _userId, ...meetingPackage }) => meetingPackage)(packageBWithUser)
        : null;
      const sharedAllowance =
        packageA && packageB ? Math.min(packageA.meeting_count, packageB.meeting_count) : 0;
      return {
        ...pairing,
        member_a: { side: "a" as const, ...summarise(userA) },
        member_b: { side: "b" as const, ...summarise(userB) },
        meeting_package_a: packageA,
        meeting_package_b: packageB,
        shared_meeting_allowance: sharedAllowance,
        meetings_remaining: Math.max(0, sharedAllowance - activeMeetings),
        meetups: pairingMeetups,
      };
    });
  });

const DecideInput = z.object({
  pairing_id: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  note: z.string().max(2000).optional().nullable(),
});

export const decidePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DecideInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, account } = await requireVerifiedImamAccount(context);
    const { data: pairing, error: pairingError } = await supabaseAdmin
      .from("pairings")
      .select("id,user_a,user_b,status,compatibility_score")
      .eq("id", data.pairing_id)
      .eq("imam_id", account.imam_id)
      .maybeSingle();
    if (pairingError) throw new Error(pairingError.message);
    if (!pairing || !["imam_review", "pending"].includes(pairing.status)) {
      throw new Error("This pairing is not available for your review");
    }
    if (pairing.compatibility_score == null || pairing.compatibility_score < 70) {
      throw new Error("Only compatibility scores of 70% or higher can be approved");
    }

    if (data.decision === "approved") {
      const [consents, blocks, privacy] = await Promise.all([
        supabaseAdmin
          .from("member_consents")
          .select("user_id")
          .in("user_id", [pairing.user_a, pairing.user_b])
          .not("compatibility_processing_consent_at", "is", null)
          .is("compatibility_processing_withdrawn_at", null),
        supabaseAdmin
          .from("member_blocks")
          .select("blocker_user_id")
          .or(
            `and(blocker_user_id.eq.${pairing.user_a},blocked_user_id.eq.${pairing.user_b}),and(blocker_user_id.eq.${pairing.user_b},blocked_user_id.eq.${pairing.user_a})`,
          )
          .limit(1),
        supabaseAdmin
          .from("privacy_settings")
          .select("user_id")
          .in("user_id", [pairing.user_a, pairing.user_b])
          .eq("visibility", "discoverable"),
      ]);
      for (const result of [consents, blocks, privacy]) {
        if (result.error) throw new Error(result.error.message);
      }
      if ((consents.data ?? []).length !== 2 || (privacy.data ?? []).length !== 2) {
        throw new Error("Both profiles must remain discoverable with active compatibility consent");
      }
      if ((blocks.data ?? []).length > 0) throw new Error("This pairing is no longer available");
    }

    const nextStatus = data.decision === "approved" ? "member_review" : "declined";
    const { data: updated, error } = await supabaseAdmin
      .from("pairings")
      .update({
        status: nextStatus,
        decision_note: data.note?.trim() || null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.pairing_id)
      .eq("imam_id", account.imam_id)
      .eq("status", pairing.status)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("This pairing is not available for your review");
    if (nextStatus === "member_review") {
      const { error: notificationError } = await supabaseAdmin.from("notifications").insert(
        [pairing.user_a, pairing.user_b].map((userId) => ({
          user_id: userId,
          pairing_id: pairing.id,
          kind: "anonymous_profile_ready",
          title: "An anonymous introduction is ready",
          body: "An imam approved this compatibility result. Review the score and anonymous profile, then respond privately.",
        })),
      );
      if (notificationError) throw new Error(notificationError.message);
    }
    return { ok: true };
  });

const MeetupInput = z.object({
  pairing_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  venue: z.string().min(2).max(160),
  address: z.string().max(300).optional().nullable(),
  wali_required: z.boolean().default(true),
  note: z.string().max(2000).optional().nullable(),
});

export const proposeMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => MeetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, account } = await requireVerifiedImamAccount(context);
    const imamId = account.imam_id;
    const scheduledAt = new Date(data.scheduled_at);
    if (scheduledAt.getTime() <= Date.now()) throw new Error("Meeting time must be in the future");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("status,payment_a_status,payment_b_status")
      .eq("id", data.pairing_id)
      .eq("imam_id", imamId)
      .maybeSingle();
    if (
      !pairing ||
      !["ready_to_schedule", "scheduled"].includes(pairing.status) ||
      pairing.payment_a_status !== "paid" ||
      pairing.payment_b_status !== "paid"
    ) {
      throw new Error("Both members must pay before a meeting can be scheduled");
    }
    const [{ data: purchases }, { data: existingMeetups }] = await Promise.all([
      supabaseAdmin
        .from("meeting_package_purchases")
        .select("meeting_count")
        .eq("pairing_id", data.pairing_id)
        .eq("payment_status", "paid"),
      supabaseAdmin.from("meetups").select("id,status").eq("pairing_id", data.pairing_id),
    ]);
    if (!purchases || purchases.length < 2) {
      throw new Error("Both meeting package payments must be verified first");
    }
    const allowance = Math.min(...purchases.map((purchase) => purchase.meeting_count));
    const used = (existingMeetups ?? []).filter((meeting) => meeting.status !== "cancelled").length;
    if (used >= allowance) throw new Error("This match has used its paid meeting allowance");

    const { error } = await supabaseAdmin.from("meetups").insert({
      pairing_id: data.pairing_id,
      imam_id: imamId,
      scheduled_at: scheduledAt.toISOString(),
      venue: data.venue.trim(),
      address: data.address?.trim() || null,
      wali_required: data.wali_required,
      note: data.note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    const { error: pairingError } = await supabaseAdmin
      .from("pairings")
      .update({ status: "scheduled" })
      .eq("id", data.pairing_id)
      .eq("imam_id", imamId)
      .in("status", ["ready_to_schedule", "scheduled"]);
    if (pairingError) throw new Error(pairingError.message);
    return { ok: true };
  });

const CancelInput = z.object({ meetup_id: z.string().uuid() });

export const listMyImamReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await requireVerifiedImamAccount(context);
    const { data, error } = await supabaseAdmin
      .from("imam_referrals")
      .select("id,referred_name,referred_email,status,created_at,reviewed_at")
      .eq("referrer_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Your referrals could not load.");
    return data ?? [];
  });

export const submitImamReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(320),
        permission: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin, account } = await requireVerifiedImamAccount(context);
    const email = data.email.toLowerCase();
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("imam_referrals")
      .select("id")
      .eq("referrer_user_id", context.userId)
      .eq("referred_email", email)
      .in("status", ["pending", "approved", "invited", "redeeming"])
      .limit(1);
    if (lookupError) throw new Error("Referral could not be checked.");
    if (existing?.length) throw new Error("You already have an active referral for that email.");
    const { error } = await supabaseAdmin.from("imam_referrals").insert({
      referrer_user_id: context.userId,
      referrer_imam_id: account.imam_id,
      referred_name: data.name,
      referred_email: email,
      status: "pending",
    });
    if (error) throw new Error("Your referral was not saved. Please try again.");
    return { ok: true };
  });

export const cancelMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, account } = await requireVerifiedImamAccount(context);
    const { data: meetup } = await supabaseAdmin
      .from("meetups")
      .select("pairing_id")
      .eq("id", data.meetup_id)
      .maybeSingle();
    if (!meetup) throw new Error("Meeting not found");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("id")
      .eq("id", meetup.pairing_id)
      .eq("imam_id", account.imam_id)
      .maybeSingle();
    if (!pairing) throw new Error("Forbidden: assigned imam only");

    const { data: updated, error } = await supabaseAdmin
      .from("meetups")
      .update({ status: "cancelled" })
      .eq("id", data.meetup_id)
      .in("status", ["proposed", "confirmed"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Meeting could not be cancelled");
    const { count, error: countError } = await supabaseAdmin
      .from("meetups")
      .select("*", { count: "exact", head: true })
      .eq("pairing_id", meetup.pairing_id)
      .neq("status", "cancelled");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) === 0) {
      const { error: pairingError } = await supabaseAdmin
        .from("pairings")
        .update({ status: "ready_to_schedule" })
        .eq("id", meetup.pairing_id)
        .eq("imam_id", account.imam_id)
        .eq("status", "scheduled");
      if (pairingError) throw new Error(pairingError.message);
    }
    return { ok: true };
  });
