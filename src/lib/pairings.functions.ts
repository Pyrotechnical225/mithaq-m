import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertWithinRateLimit } from "./rate-limit.server";
import { meetingPairingIsPayable } from "./payment-invariants";
import { isPairingVisibleToMembers } from "./pairing-visibility";

// Legacy compatibility endpoint. New pairings are created directly by the
// private scoring process before any member sees the anonymous introduction.
export const syncMyPairings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ created: 0 }));

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id,kind,title,body,read_at,created_at,pairing_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const MarkNotificationInput = z.object({ notification_id: z.string().uuid() });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => MarkNotificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notification_id)
      .eq("user_id", context.userId)
      .is("read_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, changed: !!updated };
  });

// Pairings visible to the signed-in member, with imam + meetup info.
export const listMyPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairings, error: pairingsError } = await supabaseAdmin
      .from("pairings")
      .select(
        "id,user_a,user_b,imam_id,status,decision_note,decided_at,created_at,compatibility_score,compatibility_summary,member_a_response,member_b_response,payment_a_status,payment_b_status,meeting_preference_a,meeting_preference_b",
      )
      .or(`user_a.eq.${uid},user_b.eq.${uid}`)
      .order("created_at", { ascending: false });
    if (pairingsError) throw new Error(pairingsError.message);
    if (!pairings || pairings.length === 0) return [];

    const { data: blockRows } = await supabaseAdmin
      .from("member_blocks")
      .select("blocker_user_id,blocked_user_id")
      .or(`blocker_user_id.eq.${uid},blocked_user_id.eq.${uid}`);
    const blockedUsers = new Set(
      (blockRows ?? []).map((row) =>
        row.blocker_user_id === uid ? row.blocked_user_id : row.blocker_user_id,
      ),
    );
    const visiblePairings = pairings.filter((pairing) => {
      const otherId = pairing.user_a === uid ? pairing.user_b : pairing.user_a;
      return !blockedUsers.has(otherId) && isPairingVisibleToMembers(pairing);
    });
    if (visiblePairings.length === 0) return [];

    const { data: meetups } = await supabaseAdmin
      .from("meetups")
      .select(
        "id, pairing_id, scheduled_at, venue, address, wali_required, note, status, response_a, response_b",
      )
      .in(
        "pairing_id",
        visiblePairings.map((pairing) => pairing.id),
      )
      .order("scheduled_at", { ascending: true });

    const imamIds = Array.from(
      new Set(visiblePairings.map((p) => p.imam_id).filter((x): x is string => !!x)),
    );
    const otherIds = visiblePairings.map((p) => (p.user_a === uid ? p.user_b : p.user_a));
    const [
      { data: imams },
      { data: profs },
      { data: surveys },
      { data: privacy },
      { data: purchases },
    ] = await Promise.all([
      imamIds.length
        ? supabaseAdmin.from("imams").select("id, name, title, mosque, city").in("id", imamIds)
        : Promise.resolve({ data: [] as never[] }),
      supabaseAdmin.from("profiles").select("id,uk_city").in("id", otherIds),
      supabaseAdmin.from("survey_answers").select("user_id,answers").in("user_id", otherIds),
      supabaseAdmin
        .from("privacy_settings")
        .select("user_id,show_location,show_occupation")
        .in("user_id", otherIds),
      supabaseAdmin
        .from("meeting_package_purchases")
        .select("pairing_id,user_id,package_id,meeting_count,amount_pence,payment_status")
        .in(
          "pairing_id",
          visiblePairings.map((pairing) => pairing.id),
        )
        .eq("payment_status", "paid"),
    ]);
    const imamMap = new Map((imams ?? []).map((i) => [i.id, i]));
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const surveyMap = new Map(
      (surveys ?? []).map((survey) => [
        survey.user_id,
        (survey.answers ?? {}) as Record<string, string>,
      ]),
    );
    const privacyMap = new Map((privacy ?? []).map((setting) => [setting.user_id, setting]));

    return visiblePairings.map((p) => {
      const { user_a: userA, user_b: userB, ...anonymousPairing } = p;
      const otherId = userA === uid ? userB : userA;
      const answers = surveyMap.get(otherId) ?? {};
      const settings = privacyMap.get(otherId);
      const pairingPurchases = (purchases ?? []).filter((row) => row.pairing_id === p.id);
      const mine = pairingPurchases.find((row) => row.user_id === uid) ?? null;
      const theirs = pairingPurchases.find((row) => row.user_id === otherId) ?? null;
      return {
        ...anonymousPairing,
        i_am: userA === uid ? ("a" as const) : ("b" as const),
        other: {
          reference: `MTH-${p.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          age: answers["1"] ?? null,
          uk_city:
            settings?.show_location === false ? null : (profMap.get(otherId)?.uk_city ?? null),
          ethnicity: answers["5"] ?? null,
          marital_status: answers["6"] ?? null,
          children: answers["7"] ?? null,
          education: answers["8"] ?? null,
          occupation_field: settings?.show_occupation === false ? null : (answers["9"] ?? null),
          madhab: answers["10"] ?? null,
          practice_level: answers["11"] ?? null,
          prayer: answers["12"] ?? null,
          marriage_timeline: answers["19"] ?? null,
          wali_involvement: answers["20"] ?? null,
          languages: answers["27"] ?? null,
          relocation: answers["4"] ?? null,
        },
        imam: p.imam_id ? (imamMap.get(p.imam_id) ?? null) : null,
        meeting_package: mine,
        shared_meeting_allowance:
          mine && theirs ? Math.min(mine.meeting_count, theirs.meeting_count) : null,
        meetups: (meetups ?? []).filter((m) => m.pairing_id === p.id),
      };
    });
  });

const PairingResponseInput = z.object({ pairing_id: z.string().uuid(), accept: z.boolean() });

export const respondToPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => PairingResponseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("respond_to_introduction", {
      _pairing_id: data.pairing_id,
      _accept: data.accept,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; status: string };
  });

const MeetingCheckoutInput = z.object({
  pairing_id: z.string().uuid(),
  package_id: z.enum(["single", "three", "five"]),
});

export const startMeetingPackageCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => MeetingCheckoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select(
        "user_a,user_b,status,member_a_response,member_b_response,payment_a_status,payment_b_status",
      )
      .eq("id", data.pairing_id)
      .maybeSingle();
    if (!pairing || ![pairing.user_a, pairing.user_b].includes(context.userId)) {
      throw new Error("Meeting package is not available for this pairing");
    }
    const otherUserId = pairing.user_a === context.userId ? pairing.user_b : pairing.user_a;
    const { data: activeBlock } = await supabaseAdmin
      .from("member_blocks")
      .select("blocker_user_id")
      .or(
        `and(blocker_user_id.eq.${context.userId},blocked_user_id.eq.${otherUserId}),and(blocker_user_id.eq.${otherUserId},blocked_user_id.eq.${context.userId})`,
      )
      .limit(1)
      .maybeSingle();
    if (activeBlock) throw new Error("Meeting packages are unavailable for a blocked pairing");
    const bothAccepted = meetingPairingIsPayable(pairing);
    if (!bothAccepted) {
      throw new Error("Both members must accept privately before payment");
    }
    const side = pairing.user_a === context.userId ? "a" : "b";
    const myPaymentStatus = side === "a" ? pairing.payment_a_status : pairing.payment_b_status;
    if (myPaymentStatus === "paid") {
      throw new Error("You have already paid for this pairing");
    }
    if (myPaymentStatus !== "due") {
      throw new Error("This meeting package is not currently due");
    }

    const { MEETING_PACKAGES } = await import("./meeting-packages");
    const selected = MEETING_PACKAGES[data.package_id];
    const { createMeetingPackageCheckout, retrieveCheckoutSession } =
      await import("./membership.server");

    // Reserve exactly one live Checkout Session per member and pairing. If a
    // prior session is still open, return it instead of creating a second bill.
    let attemptId: string | null = null;
    for (let pass = 0; pass < 2 && !attemptId; pass += 1) {
      const { data: reserved, error: reserveError } = await supabaseAdmin
        .from("meeting_checkout_attempts")
        .insert({
          pairing_id: data.pairing_id,
          user_id: context.userId,
          package_id: selected.id,
          meeting_count: selected.meetings,
          amount_pence: selected.amountPence,
          currency: "gbp",
          status: "creating",
        })
        .select("id")
        .single();
      if (!reserveError) {
        attemptId = reserved.id;
        break;
      }
      if (reserveError.code !== "23505") {
        throw new Error("Secure checkout could not be reserved");
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("meeting_checkout_attempts")
        .select("id,status,stripe_session_id,created_at")
        .eq("pairing_id", data.pairing_id)
        .eq("user_id", context.userId)
        .in("status", ["creating", "open"])
        .maybeSingle();
      if (existingError) throw new Error("Secure checkout state could not be checked");
      if (!existing) continue;

      if (existing.status === "open" && existing.stripe_session_id) {
        let session: Record<string, unknown>;
        try {
          session = (await retrieveCheckoutSession(existing.stripe_session_id)) as Record<
            string,
            unknown
          >;
        } catch {
          throw new Error("Your existing secure checkout could not be opened. Please try later.");
        }
        if (session.status === "open" && typeof session.url === "string") {
          return { id: existing.stripe_session_id, url: session.url };
        }
        if (session.status === "complete") {
          // The member already paid this session (e.g. closed the tab before
          // returning). Record that payment instead of opening a second bill.
          const { syncMeetingPackagePaymentFromSession } = await import("./membership.server");
          const synced = await syncMeetingPackagePaymentFromSession(
            existing.stripe_session_id,
            context.userId,
          );
          throw new Error(
            synced.ok
              ? "Your payment has already been received. Please refresh the page."
              : "Your earlier payment is still being confirmed. Please refresh in a minute before paying again.",
          );
        }
        await supabaseAdmin
          .from("meeting_checkout_attempts")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("status", "open");
        continue;
      }

      const ageMs = Date.now() - new Date(existing.created_at).getTime();
      if (ageMs < 2 * 60 * 1000) {
        throw new Error("Secure checkout is already being prepared. Please try again shortly.");
      }
      await supabaseAdmin
        .from("meeting_checkout_attempts")
        .update({
          status: "failed",
          last_error: "Checkout creation timed out",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("status", "creating");
    }

    if (!attemptId) throw new Error("Secure checkout could not be reserved");

    try {
      const session = await createMeetingPackageCheckout({
        attemptId,
        pairingId: data.pairing_id,
        packageId: data.package_id,
        userId: context.userId,
        email: (context.claims as { email?: string } | undefined)?.email ?? null,
        origin: (await import("./request-origin.server")).getRequestOrigin(),
      });
      const { error: attemptError } = await supabaseAdmin
        .from("meeting_checkout_attempts")
        .update({
          stripe_session_id: session.id,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", attemptId)
        .eq("status", "creating");
      if (attemptError) throw new Error("Secure checkout could not be recorded");
      return session;
    } catch {
      await supabaseAdmin
        .from("meeting_checkout_attempts")
        .update({
          status: "failed",
          last_error: "Stripe checkout could not be created",
          updated_at: new Date().toISOString(),
        })
        .eq("id", attemptId)
        .eq("status", "creating");
      throw new Error("Secure checkout could not be started. Please try again shortly.");
    }
  });

const ConfirmMeetingPaymentInput = z.object({
  session_id: z
    .string()
    .max(200)
    // Stripe Checkout Session ids only; this value is placed in a Stripe API path.
    .regex(/^cs_(?:test|live)_[A-Za-z0-9]+$/, "Invalid checkout session"),
});

export const confirmMeetingPackagePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ConfirmMeetingPaymentInput.parse(input))
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
  .validator((input: unknown) => RespondMeetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meetup, error } = await supabaseAdmin
      .from("meetups")
      .select("id, pairing_id, response_a, response_b, status")
      .eq("id", data.meetup_id)
      .maybeSingle();
    if (error || !meetup) throw new Error("Meeting not found");

    const { data: pairing } = await supabaseAdmin
      .from("pairings")
      .select("user_a, user_b, status")
      .eq("id", meetup.pairing_id)
      .maybeSingle();
    if (!pairing) throw new Error("Pairing not found");
    if (pairing.user_a !== context.userId && pairing.user_b !== context.userId) {
      throw new Error("Forbidden: only a participant can respond to this meeting");
    }
    // Members answer a proposed meeting once. Without this a member could
    // revive a cancelled meeting or flip their answer repeatedly, which also
    // re-sent notification emails every time.
    const mySide = pairing.user_a === context.userId ? "a" : "b";
    const myResponse = mySide === "a" ? meetup.response_a : meetup.response_b;
    if (
      meetup.status !== "proposed" ||
      myResponse !== "pending" ||
      !["ready_to_schedule", "scheduled"].includes(pairing.status)
    ) {
      throw new Error("This meeting is no longer awaiting your response");
    }

    const otherUserId = pairing.user_a === context.userId ? pairing.user_b : pairing.user_a;
    const { data: activeBlock, error: blockError } = await supabaseAdmin
      .from("member_blocks")
      .select("blocker_user_id")
      .or(
        `and(blocker_user_id.eq.${context.userId},blocked_user_id.eq.${otherUserId}),and(blocker_user_id.eq.${otherUserId},blocked_user_id.eq.${context.userId})`,
      )
      .limit(1)
      .maybeSingle();
    if (blockError) throw new Error(blockError.message);
    if (activeBlock) throw new Error("Meeting responses are unavailable for a blocked pairing");

    const side = mySide;
    const value = data.accept ? "accepted" : "declined";
    const responseA = side === "a" ? value : meetup.response_a;
    const responseB = side === "b" ? value : meetup.response_b;
    const status =
      responseA === "declined" || responseB === "declined"
        ? "declined"
        : responseA === "accepted" && responseB === "accepted"
          ? "confirmed"
          : "proposed";

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("meetups")
      .update({ response_a: responseA, response_b: responseB, status })
      .eq("id", data.meetup_id)
      .eq("status", "proposed")
      .eq(side === "a" ? "response_a" : "response_b", "pending")
      .select("id")
      .maybeSingle();
    if (updErr) throw new Error(updErr.message);
    if (!updated) throw new Error("This meeting is no longer awaiting your response");
    return { ok: true, status };
  });

// -----------------------------------------------------------------------------
// Shared thread between the imam and the two families.
// -----------------------------------------------------------------------------
const ThreadInput = z.object({ pairing_id: z.string().uuid() });

export const listPairingMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ThreadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: pairing, error: pairingError }, { data: imamAccount, error: accountError }] =
      await Promise.all([
        supabaseAdmin
          .from("pairings")
          .select("user_a,user_b,imam_id,status")
          .eq("id", data.pairing_id)
          .maybeSingle(),
        supabaseAdmin
          .from("imam_accounts")
          .select("imam_id,active")
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
    if (pairingError) throw new Error(pairingError.message);
    if (accountError) throw new Error(accountError.message);
    if (!pairing) throw new Error("Pairing not found");

    const isMember = [pairing.user_a, pairing.user_b].includes(context.userId);
    let isAssignedImam = false;
    if (imamAccount?.active === true && imamAccount.imam_id === pairing.imam_id) {
      const { data: verifiedImam, error: imamError } = await supabaseAdmin
        .from("imams")
        .select("id")
        .eq("id", imamAccount.imam_id)
        .eq("verification_status", "verified")
        .maybeSingle();
      if (imamError) throw new Error(imamError.message);
      isAssignedImam = !!verifiedImam;
    }
    if (!isMember && !isAssignedImam) throw new Error("Forbidden: pairing participants only");
    if (isAssignedImam && context.claims?.aal !== "aal2") {
      throw new Error("Multi-factor authentication is required for imam messages");
    }
    if (
      ![
        "awaiting_payment",
        "payment_pending",
        "ready_to_schedule",
        "scheduled",
        "completed",
      ].includes(pairing.status)
    ) {
      throw new Error("Messages open only after both members accept");
    }

    if (isMember) {
      const otherUserId = pairing.user_a === context.userId ? pairing.user_b : pairing.user_a;
      const { data: activeBlock, error: blockError } = await supabaseAdmin
        .from("member_blocks")
        .select("blocker_user_id")
        .or(
          `and(blocker_user_id.eq.${context.userId},blocked_user_id.eq.${otherUserId}),and(blocker_user_id.eq.${otherUserId},blocked_user_id.eq.${context.userId})`,
        )
        .limit(1)
        .maybeSingle();
      if (blockError) throw new Error(blockError.message);
      if (activeBlock) throw new Error("Messages are unavailable for a blocked pairing");
    }

    const { data: rows, error } = await supabaseAdmin
      .from("pairing_messages")
      .select("id, sender_id, sender_role, body, created_at")
      .eq("pairing_id", data.pairing_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(({ sender_id: senderId, ...message }) => ({
      ...message,
      mine: senderId === context.userId,
    }));
  });

const PostMessageInput = z.object({
  pairing_id: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export const postPairingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => PostMessageInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: pairing }, { data: imamAccount }] = await Promise.all([
      supabaseAdmin
        .from("pairings")
        .select("user_a,user_b,imam_id,status")
        .eq("id", data.pairing_id)
        .maybeSingle(),
      supabaseAdmin
        .from("imam_accounts")
        .select("imam_id,active")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (!pairing) throw new Error("Pairing not found");
    const isMember = [pairing.user_a, pairing.user_b].includes(context.userId);
    let isAssignedImam = false;
    if (imamAccount?.active === true && imamAccount.imam_id === pairing.imam_id) {
      const { data: verifiedImam, error: imamError } = await supabaseAdmin
        .from("imams")
        .select("id")
        .eq("id", imamAccount.imam_id)
        .eq("verification_status", "verified")
        .maybeSingle();
      if (imamError) throw new Error(imamError.message);
      isAssignedImam = !!verifiedImam;
    }
    if (!isMember && !isAssignedImam) throw new Error("Forbidden: pairing participants only");
    if (isAssignedImam && context.claims?.aal !== "aal2") {
      throw new Error("Multi-factor authentication is required for imam messages");
    }
    await assertWithinRateLimit(supabaseAdmin, {
      table: "pairing_messages",
      userColumn: "sender_id",
      userId: context.userId,
      windowMinutes: 10,
      max: 20,
      message: "You are sending messages very quickly. Please wait a few minutes.",
    });
    if (
      ![
        "awaiting_payment",
        "payment_pending",
        "ready_to_schedule",
        "scheduled",
        "completed",
      ].includes(pairing.status)
    ) {
      throw new Error("Messages open only after both members accept");
    }

    if (isMember) {
      const otherUserId = pairing.user_a === context.userId ? pairing.user_b : pairing.user_a;
      const { data: activeBlock } = await supabaseAdmin
        .from("member_blocks")
        .select("blocker_user_id")
        .or(
          `and(blocker_user_id.eq.${context.userId},blocked_user_id.eq.${otherUserId}),and(blocker_user_id.eq.${otherUserId},blocked_user_id.eq.${context.userId})`,
        )
        .limit(1)
        .maybeSingle();
      if (activeBlock) throw new Error("Messages are unavailable for a blocked pairing");
    }

    const { error } = await supabaseAdmin.from("pairing_messages").insert({
      pairing_id: data.pairing_id,
      sender_id: context.userId,
      sender_role: isAssignedImam ? "imam" : "member",
      body: data.body.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
