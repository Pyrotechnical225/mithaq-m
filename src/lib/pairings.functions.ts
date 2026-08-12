import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// -----------------------------------------------------------------------------
// Member side: turn accepted mutual interests into pairings and assign the
// nearest imam who has an active MeetHaq account.
// -----------------------------------------------------------------------------
export const syncMyPairings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
      .select("id, user_a, user_b, imam_id, status, decision_note, decided_at, created_at, payment_a_status, payment_b_status")
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
    const [{ data: imams }, { data: profs }, { data: purchases }] = await Promise.all([
      imamIds.length
        ? supabaseAdmin
            .from("imams")
            .select("id, name, title, mosque, city, email, phone")
            .in("id", imamIds)
        : Promise.resolve({ data: [] as never[] }),
      supabaseAdmin.from("profiles").select("id, display_name, uk_city").in("id", otherIds),
      supabaseAdmin
        .from("meeting_package_purchases")
        .select("pairing_id,user_id,package_id,meeting_count,amount_pence,payment_status")
        .in("pairing_id", pairings.map((pairing) => pairing.id))
        .eq("payment_status", "paid"),
    ]);
    const imamMap = new Map((imams ?? []).map((i) => [i.id, i]));
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

    return pairings.map((p) => {
      const otherId = p.user_a === uid ? p.user_b : p.user_a;
      const pairingPurchases = (purchases ?? []).filter((row) => row.pairing_id === p.id);
      const mine = pairingPurchases.find((row) => row.user_id === uid) ?? null;
      const theirs = pairingPurchases.find((row) => row.user_id === otherId) ?? null;
      return {
        ...p,
        i_am: p.user_a === uid ? ("a" as const) : ("b" as const),
        other: {
          id: otherId,
          display_name: profMap.get(otherId)?.display_name ?? null,
          uk_city: profMap.get(otherId)?.uk_city ?? null,
        },
        imam: p.imam_id ? (imamMap.get(p.imam_id) ?? null) : null,
        meeting_package: mine,
        shared_meeting_allowance:
          mine && theirs ? Math.min(mine.meeting_count, theirs.meeting_count) : null,
        meetups: (meetups ?? []).filter((m) => m.pairing_id === p.id),
      };
    });
  });

const MeetingCheckoutInput = z.object({
  pairing_id: z.string().uuid(),
  package_id: z.enum(["single", "three", "five"]),
  origin: z.string().url(),
});

export const startMeetingPackageCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MeetingCheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("user_a,user_b,status,payment_a_status,payment_b_status")
      .eq("id", data.pairing_id)
      .maybeSingle();
    if (!pairing || ![pairing.user_a, pairing.user_b].includes(context.userId)) {
      throw new Error("Meeting package is not available for this pairing");
    }
    const bothAccepted = ["approved", "awaiting_payment", "payment_pending"].includes(
      pairing.status,
    );
    if (!bothAccepted) {
      throw new Error("The imam must approve the pairing before payment");
    }
    const side = pairing.user_a === context.userId ? "a" : "b";
    if ((side === "a" ? pairing.payment_a_status : pairing.payment_b_status) === "paid") {
      throw new Error("You have already paid for this pairing");
    }
    if (pairing.status === "approved") {
      await supabaseAdmin
        .from("pairings")
        .update({
          status: "awaiting_payment",
          payment_a_status:
            pairing.payment_a_status === "not_due" ? "due" : pairing.payment_a_status,
          payment_b_status:
            pairing.payment_b_status === "not_due" ? "due" : pairing.payment_b_status,
        })
        .eq("id", data.pairing_id);
    }
    const { createMeetingPackageCheckout } = await import("./membership.server");
    return createMeetingPackageCheckout({
      pairingId: data.pairing_id,
      packageId: data.package_id,
      userId: context.userId,
      email: (context.claims as { email?: string } | undefined)?.email ?? null,
      origin: data.origin,
    });
  });

const ConfirmMeetingPaymentInput = z.object({ session_id: z.string().min(10).max(200) });

export const confirmMeetingPackagePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmMeetingPaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { syncMeetingPackagePaymentFromSession } = await import("./membership.server");
    return syncMeetingPackagePaymentFromSession(data.session_id, context.userId);
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
