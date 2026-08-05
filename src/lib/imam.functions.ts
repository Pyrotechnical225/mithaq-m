import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Does the signed-in user have an active imam account?
export const amIImam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isImam } = await context.supabase.rpc("is_imam", {
      _user_id: context.userId,
    });
    if (!isImam) return { isImam: false as const, imam: null };
    const { data: account } = await context.supabase
      .from("imam_accounts")
      .select("imam_id, radius_km, active")
      .eq("user_id", context.userId)
      .maybeSingle();
    let imam = null;
    if (account?.imam_id) {
      const { data } = await context.supabase
        .from("imams")
        .select("id, name, title, mosque, city, postcode, languages, lat, lng")
        .eq("id", account.imam_id)
        .maybeSingle();
      imam = data ?? null;
    }
    return { isImam: true as const, imam, radius_km: account?.radius_km ?? 40 };
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
  .inputValidator((input: unknown) => ApplyInput.parse(input))
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
    const { data: imamId } = await context.supabase.rpc("my_imam_id", {
      _user_id: context.userId,
    });
    if (!imamId) throw new Error("Forbidden: imam only");

    const { data: pairings, error } = await context.supabase
      .from("pairings")
      .select(
        "id, user_a, user_b, status, decision_note, decided_at, created_at, compatibility_score, compatibility_summary, member_a_response, member_b_response, payment_a_status, payment_b_status, meeting_preference_a, meeting_preference_b",
      )
      .eq("imam_id", imamId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!pairings || pairings.length === 0) return [];

    const { data: meetups } = await context.supabase
      .from("meetups")
      .select(
        "id, pairing_id, scheduled_at, venue, address, wali_required, note, status, response_a, response_b",
      )
      .order("scheduled_at", { ascending: true });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = Array.from(new Set(pairings.flatMap((p) => [p.user_a, p.user_b])));
    const [{ data: profs }, { data: surveys }, { data: imam }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, display_name, contact_email, uk_city, uk_postcode, location_lat, location_lng")
        .in("id", ids),
      supabaseAdmin.from("survey_answers").select("user_id, answers").in("user_id", ids),
      supabaseAdmin.from("imams").select("lat, lng").eq("id", imamId).maybeSingle(),
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
        id,
        display_name: p?.display_name ?? "Member",
        contact_email: p?.contact_email ?? null,
        uk_city: p?.uk_city ?? null,
        uk_postcode: p?.uk_postcode ?? null,
        distance_km: km,
        age: a["1"] ?? null,
        gender: a["2"] ?? null,
        residence: a["3"] ?? null,
        wali: a["20"] ?? null,
        ethnicity: a["5"] ?? null,
        marital_status: a["6"] ?? null,
        children: a["7"] ?? null,
        education: a["8"] ?? null,
        occupation: a["9"] ?? null,
        practice: a["11"] ?? null,
        timeline: a["19"] ?? null,
      };
    };

    return pairings.map((p) => ({
      ...p,
      member_a: summarise(p.user_a),
      member_b: summarise(p.user_b),
      meetups: (meetups ?? []).filter((m) => m.pairing_id === p.id),
    }));
  });

const DecideInput = z.object({
  pairing_id: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  note: z.string().max(2000).optional().nullable(),
});

export const decidePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DecideInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: imamId } = await context.supabase.rpc("my_imam_id", { _user_id: context.userId });
    if (!imamId) throw new Error("Forbidden: imam only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("user_a,user_b")
      .eq("id", data.pairing_id)
      .eq("imam_id", imamId)
      .maybeSingle();
    if (!pairing) throw new Error("Pairing not found");
    const nextStatus = data.decision === "approved" ? "member_review" : "declined";
    const { error } = await supabaseAdmin
      .from("pairings")
      .update({
        status: nextStatus,
        decision_note: data.note?.trim() || null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.pairing_id);
    if (error) throw new Error(error.message);
    if (data.decision === "approved") {
      await supabaseAdmin
        .from("notifications")
        .insert(
          [pairing.user_a, pairing.user_b].map((user_id) => ({
            user_id,
            pairing_id: data.pairing_id,
            kind: "anonymous_profile_ready",
            title: "An anonymous match is ready",
            body: "An imam has reviewed this potential match. Review the anonymous profile and respond privately.",
          })),
        );

      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id,contact_email")
        .in("id", [pairing.user_a, pairing.user_b]);
      const { sendMithaqEmail } = await import("./email.server");
      await Promise.allSettled(
        (members ?? [])
          .filter((member) => member.contact_email)
          .map((member) =>
            sendMithaqEmail({
              to: member.contact_email as string,
              subject: "A new anonymous introduction is ready | Mithaq",
              heading: "An imam has approved a new introduction",
              message:
                "A new anonymous profile is ready for you to review privately. Sign in to see the compatibility score and decide when you are ready.",
              ctaLabel: "Review introduction",
              idempotencyKey: `pairing/${data.pairing_id}/new-match/${member.id}`,
            }),
          ),
      );
    }
    return { ok: true };
  });

const MeetupInput = z.object({
  pairing_id: z.string().uuid(),
  scheduled_at: z.string().min(4),
  venue: z.string().min(2).max(160),
  address: z.string().max(300).optional().nullable(),
  wali_required: z.boolean().default(true),
  note: z.string().max(2000).optional().nullable(),
});

export const proposeMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MeetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: imamId } = await context.supabase.rpc("my_imam_id", {
      _user_id: context.userId,
    });
    if (!imamId) throw new Error("Forbidden: imam only");
    const { data: pairing } = await context.supabase
      .from("pairings")
      .select("status")
      .eq("id", data.pairing_id)
      .eq("imam_id", imamId)
      .maybeSingle();
    if (pairing?.status !== "ready_to_schedule")
      throw new Error("Both members must pay before a meeting can be scheduled");
    const { error } = await context.supabase.from("meetups").insert({
      pairing_id: data.pairing_id,
      imam_id: imamId,
      scheduled_at: new Date(data.scheduled_at).toISOString(),
      venue: data.venue.trim(),
      address: data.address?.trim() || null,
      wali_required: data.wali_required,
      note: data.note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CancelInput = z.object({ meetup_id: z.string().uuid() });

export const cancelMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meetups")
      .update({ status: "cancelled" })
      .eq("id", data.meetup_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
