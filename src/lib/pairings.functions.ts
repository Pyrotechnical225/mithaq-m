import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id,kind,title,body,read_at,created_at,pairing_id")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// -----------------------------------------------------------------------------
// Member side: turn accepted mutual interests into pairings and assign the
// nearest imam who has an active Mithaq account.
// -----------------------------------------------------------------------------
export const syncMyPairings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Legacy mutual interests are still converted, but new AI-led pairings are
    // created directly by the private matching process.
    const uid = context.userId;
    const { data: accepted } = await context.supabase
      .from("interests")
      .select("from_user, to_user, status")
      .eq("status", "accepted");

    const pairs = (accepted ?? [])
      .filter((i) => i.from_user === uid || i.to_user === uid)
      .map((i) => {
        const [a, b] = [i.from_user, i.to_user].sort();
        return { user_a: a, user_b: b };
      });
    if (pairs.length === 0) return { created: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { haversineKm } = await import("./geo");

    const [{ data: imamAccounts }, { data: imams }] = await Promise.all([
      supabaseAdmin.from("imam_accounts").select("imam_id, radius_km, active").eq("active", true),
      supabaseAdmin.from("imams").select("id, lat, lng, city"),
    ]);
    const imamById = new Map((imams ?? []).map((i) => [i.id, i]));

    let created = 0;
    for (const pair of pairs) {
      const { data: existing } = await supabaseAdmin
        .from("pairings")
        .select("id, imam_id")
        .eq("user_a", pair.user_a)
        .eq("user_b", pair.user_b)
        .maybeSingle();

      // Choose an imam near the midpoint of the two members' locations.
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, location_lat, location_lng")
        .in("id", [pair.user_a, pair.user_b]);
      const pts = (profs ?? []).filter((p) => p.location_lat != null && p.location_lng != null);
      let imamId: string | null = existing?.imam_id ?? null;
      if (!imamId && pts.length > 0) {
        const midLat = pts.reduce((s, p) => s + (p.location_lat as number), 0) / pts.length;
        const midLng = pts.reduce((s, p) => s + (p.location_lng as number), 0) / pts.length;
        let best: { id: string; km: number } | null = null;
        for (const acct of imamAccounts ?? []) {
          const im = imamById.get(acct.imam_id);
          if (!im?.lat || !im?.lng) continue;
          const km = haversineKm(midLat, midLng, im.lat, im.lng);
          if (km > (acct.radius_km ?? 40) * 2) continue;
          if (!best || km < best.km) best = { id: im.id, km };
        }
        imamId = best?.id ?? null;
      }

      if (existing) {
        if (!existing.imam_id && imamId) {
          await supabaseAdmin.from("pairings").update({ imam_id: imamId }).eq("id", existing.id);
        }
      } else {
        const { error } = await supabaseAdmin
          .from("pairings")
          .insert({ user_a: pair.user_a, user_b: pair.user_b, imam_id: imamId });
        if (!error) created += 1;
      }
    }
    return { created };
  });

// Pairings visible to the signed-in member, with imam + meetup info.
export const listMyPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { data: pairings } = await context.supabase
      .from("pairings")
      .select(
        "id, user_a, user_b, imam_id, status, decision_note, decided_at, created_at, compatibility_score, member_a_response, member_b_response, payment_a_status, payment_b_status, meeting_preference_a, meeting_preference_b",
      )
      .order("created_at", { ascending: false });
    if (!pairings || pairings.length === 0) return [];

    const { data: meetups } = await context.supabase
      .from("meetups")
      .select(
        "id, pairing_id, scheduled_at, venue, address, wali_required, note, status, response_a, response_b",
      )
      .order("scheduled_at", { ascending: true });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const imamIds = Array.from(
      new Set(pairings.map((p) => p.imam_id).filter((x): x is string => !!x)),
    );
    const otherIds = pairings.map((p) => (p.user_a === uid ? p.user_b : p.user_a));
    const [{ data: imams }, { data: profs }, { data: surveys }] = await Promise.all([
      imamIds.length
        ? supabaseAdmin
            .from("imams")
            .select("id, name, title, mosque, city, email, phone")
            .in("id", imamIds)
        : Promise.resolve({ data: [] as never[] }),
      supabaseAdmin.from("profiles").select("id, uk_city").in("id", otherIds),
      supabaseAdmin.from("survey_answers").select("user_id,answers").in("user_id", otherIds),
    ]);
    const imamMap = new Map((imams ?? []).map((i) => [i.id, i]));
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const surveyMap = new Map(
      (surveys ?? []).map((s) => [s.user_id, (s.answers ?? {}) as Record<string, string>]),
    );

    return pairings.map((p) => {
      const otherId = p.user_a === uid ? p.user_b : p.user_a;
      return {
        ...p,
        // Member RLS exposes pairings only after imam approval. Keep an
        // application-level status guard as an additional privacy boundary.
        compatibility_score: [
          "member_review",
          "awaiting_payment",
          "payment_pending",
          "ready_to_schedule",
          "scheduled",
          "completed",
        ].includes(p.status)
          ? p.compatibility_score
          : null,
        i_am: p.user_a === uid ? ("a" as const) : ("b" as const),
        other: {
          id: otherId,
          reference: `MTH-${otherId.slice(0, 6).toUpperCase()}`,
          uk_city: profMap.get(otherId)?.uk_city ?? null,
          age: surveyMap.get(otherId)?.["1"] ?? null,
          ethnicity: surveyMap.get(otherId)?.["5"] ?? null,
          marital_status: surveyMap.get(otherId)?.["6"] ?? null,
          children: surveyMap.get(otherId)?.["7"] ?? null,
          education: surveyMap.get(otherId)?.["8"] ?? null,
          occupation_field: surveyMap.get(otherId)?.["9"] ?? null,
          practice_level: surveyMap.get(otherId)?.["11"] ?? null,
          languages: surveyMap.get(otherId)?.["27"] ?? null,
          marriage_timeline: surveyMap.get(otherId)?.["19"] ?? null,
          relocation: surveyMap.get(otherId)?.["4"] ?? null,
        },
        imam: p.imam_id ? (imamMap.get(p.imam_id) ?? null) : null,
        meetups: (meetups ?? []).filter((m) => m.pairing_id === p.id),
      };
    });
  });

const PairingResponseInput = z.object({ pairing_id: z.string().uuid(), accept: z.boolean() });

export const respondToPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PairingResponseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("id,user_a,user_b,status,member_a_response,member_b_response")
      .eq("id", data.pairing_id)
      .maybeSingle();
    if (
      !pairing ||
      ![pairing.user_a, pairing.user_b].includes(context.userId) ||
      pairing.status !== "member_review"
    )
      throw new Error("This introduction is not awaiting your response");
    const side = pairing.user_a === context.userId ? "a" : "b";
    const value = data.accept ? "accepted" : "declined";
    const a = side === "a" ? value : pairing.member_a_response;
    const b = side === "b" ? value : pairing.member_b_response;
    const status =
      a === "declined" || b === "declined"
        ? "declined"
        : a === "accepted" && b === "accepted"
          ? "awaiting_payment"
          : "member_review";
    await supabaseAdmin
      .from("pairings")
      .update({
        [side === "a" ? "member_a_response" : "member_b_response"]: value,
        status,
        ...(status === "awaiting_payment"
          ? { payment_a_status: "due", payment_b_status: "due" }
          : {}),
      })
      .eq("id", pairing.id);
    const recipients = status === "awaiting_payment" ? [pairing.user_a, pairing.user_b] : [];
    if (recipients.length)
      await supabaseAdmin.from("notifications").insert(
        recipients.map((user_id) => ({
          user_id,
          pairing_id: pairing.id,
          kind: "mutual_acceptance",
          title: "You both accepted",
          body: "Both members accepted the anonymous introduction. Pay the £39 introduction fee to continue.",
        })),
      );
    return { ok: true, status };
  });

const CheckoutInput = z.object({ pairing_id: z.string().uuid(), origin: z.string().url() });
export const startIntroductionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("user_a,user_b,status,payment_a_status,payment_b_status")
      .eq("id", data.pairing_id)
      .maybeSingle();
    if (
      !pairing ||
      ![pairing.user_a, pairing.user_b].includes(context.userId) ||
      !["awaiting_payment", "payment_pending"].includes(pairing.status)
    )
      throw new Error("Payment is not available for this introduction");
    const side = pairing.user_a === context.userId ? "a" : "b";
    if ((side === "a" ? pairing.payment_a_status : pairing.payment_b_status) === "paid")
      throw new Error("You have already paid");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("provider_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { getOrCreateCustomer, createIntroductionCheckout } = await import("./membership.server");
    const customerId = await getOrCreateCustomer({
      userId: context.userId,
      email: (context.claims as { email?: string })?.email ?? null,
      storedCustomerId: sub?.provider_customer_id ?? null,
    });
    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        { user_id: context.userId, provider: "stripe", provider_customer_id: customerId },
        { onConflict: "user_id" },
      );
    return createIntroductionCheckout({
      pairingId: data.pairing_id,
      userId: context.userId,
      customerId,
      origin: data.origin,
    });
  });

const ConfirmPaymentInput = z.object({ session_id: z.string().min(10) });
export const confirmIntroductionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmPaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { syncIntroductionPaymentFromSession } = await import("./membership.server");
    return syncIntroductionPaymentFromSession(data.session_id, context.userId);
  });

const PreferenceInput = z.object({
  pairing_id: z.string().uuid(),
  preference: z.enum(["online", "face_to_face"]),
});
export const setMeetingPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreferenceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("user_a,user_b,payment_a_status,payment_b_status")
      .eq("id", data.pairing_id)
      .maybeSingle();
    if (!pairing || ![pairing.user_a, pairing.user_b].includes(context.userId))
      throw new Error("Introduction not found");
    const side = pairing.user_a === context.userId ? "a" : "b";
    if ((side === "a" ? pairing.payment_a_status : pairing.payment_b_status) !== "paid")
      throw new Error("Complete payment first");
    if (side === "a") {
      await supabaseAdmin
        .from("pairings")
        .update({ meeting_preference_a: data.preference })
        .eq("id", data.pairing_id);
    } else {
      await supabaseAdmin
        .from("pairings")
        .update({ meeting_preference_b: data.preference })
        .eq("id", data.pairing_id);
    }
    return { ok: true };
  });

const RespondMeetupInput = z.object({
  meetup_id: z.string().uuid(),
  accept: z.boolean(),
});

export const respondToMeetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RespondMeetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: meetup, error } = await context.supabase
      .from("meetups")
      .select("id, pairing_id, response_a, response_b, status")
      .eq("id", data.meetup_id)
      .maybeSingle();
    if (error || !meetup) throw new Error("Meeting not found");

    const { data: pairing } = await context.supabase
      .from("pairings")
      .select("user_a, user_b")
      .eq("id", meetup.pairing_id)
      .maybeSingle();
    if (!pairing) throw new Error("Pairing not found");

    const side = pairing.user_a === context.userId ? "a" : "b";
    const value = data.accept ? "accepted" : "declined";
    const responseA = side === "a" ? value : meetup.response_a;
    const responseB = side === "b" ? value : meetup.response_b;
    const status =
      responseA === "declined" || responseB === "declined"
        ? "declined"
        : responseA === "accepted" && responseB === "accepted"
          ? "confirmed"
          : "proposed";

    const { error: updErr } = await context.supabase
      .from("meetups")
      .update({ response_a: responseA, response_b: responseB, status })
      .eq("id", data.meetup_id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true, status };
  });

// -----------------------------------------------------------------------------
// Shared thread between the imam and the two families.
// -----------------------------------------------------------------------------
const ThreadInput = z.object({ pairing_id: z.string().uuid() });

export const listPairingMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ThreadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("pairing_messages")
      .select("id, sender_id, sender_role, body, created_at")
      .eq("pairing_id", data.pairing_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ ...r, mine: r.sender_id === context.userId }));
  });

const PostMessageInput = z.object({
  pairing_id: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export const postPairingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PostMessageInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isImam } = await context.supabase.rpc("is_imam", {
      _user_id: context.userId,
    });
    const { error } = await context.supabase.from("pairing_messages").insert({
      pairing_id: data.pairing_id,
      sender_id: context.userId,
      sender_role: isImam ? "imam" : "member",
      body: data.body.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
