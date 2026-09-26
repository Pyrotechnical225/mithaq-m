import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAdmin, assertAdminMfa } from "@/lib/admin-authorization";

// Admin: every imam application.
export const listImamApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: apps }, { data: accounts }] = await Promise.all([
      supabaseAdmin.from("imam_applications").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("imam_accounts").select("user_id, imam_id, radius_km, active"),
    ]);
    const accountByUser = new Map((accounts ?? []).map((a) => [a.user_id, a]));
    return (apps ?? []).map((a) => ({
      ...a,
      account: a.user_id ? (accountByUser.get(a.user_id) ?? null) : null,
    }));
  });

const ReviewInput = z.object({
  application_id: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  admin_notes: z.string().max(2000).optional().nullable(),
  radius_km: z.number().int().min(5).max(300).default(40),
  imam_id: z.string().uuid().optional().nullable(),
});

// Admin: approve (creates the imam directory entry + grants dashboard access) or decline.
export const reviewImamApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ReviewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: appErr } = await supabaseAdmin
      .from("imam_applications")
      .select("*")
      .eq("id", data.application_id)
      .maybeSingle();
    if (appErr || !app) throw new Error("Application not found");

    if (data.decision === "declined") {
      await supabaseAdmin
        .from("imam_applications")
        .update({
          status: "declined",
          admin_notes: data.admin_notes ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", app.id);
      if (app.user_id) {
        await supabaseAdmin
          .from("imam_accounts")
          .update({ active: false })
          .eq("user_id", app.user_id);
      }
      const { writeAdminAudit } = await import("@/lib/admin-audit.server");
      await writeAdminAudit(supabaseAdmin, {
        actorUserId: context.userId,
        action: "imam_application.declined",
        targetType: "imam_application",
        targetId: app.id,
      });
      return { ok: true, imam_id: null };
    }

    // Approve: reuse a chosen directory entry or create one from the application.
    let imamId = data.imam_id ?? app.imam_id ?? null;
    if (!imamId) {
      const { findUkCity } = await import("./uk-cities");
      const known = findUkCity(app.city);
      const { data: created, error: createErr } = await supabaseAdmin
        .from("imams")
        .insert({
          name: app.name,
          title: "Imam",
          mosque: app.mosque,
          city: app.city,
          postcode: app.postcode,
          lat: known?.lat ?? null,
          lng: known?.lng ?? null,
          phone: app.phone,
          email: app.email,
          languages: app.languages ?? [],
          verification_status: "verified",
          verified_at: new Date().toISOString(),
          verified_by: context.userId,
        })
        .select("id")
        .single();
      if (createErr) throw new Error(createErr.message);
      imamId = created.id;
    } else {
      const { error: verifyError } = await supabaseAdmin
        .from("imams")
        .update({
          verification_status: "verified",
          verified_at: new Date().toISOString(),
          verified_by: context.userId,
        })
        .eq("id", imamId);
      if (verifyError) throw new Error(verifyError.message);
    }

    if (app.user_id) {
      const { error: acctErr } = await supabaseAdmin.from("imam_accounts").upsert(
        {
          user_id: app.user_id,
          imam_id: imamId,
          radius_km: data.radius_km,
          active: true,
        },
        { onConflict: "user_id" },
      );
      if (acctErr) throw new Error(acctErr.message);
    }

    await supabaseAdmin
      .from("imam_applications")
      .update({
        status: "approved",
        admin_notes: data.admin_notes ?? null,
        reviewed_at: new Date().toISOString(),
        imam_id: imamId,
      })
      .eq("id", app.id);

    const { writeAdminAudit } = await import("@/lib/admin-audit.server");
    await writeAdminAudit(supabaseAdmin, {
      actorUserId: context.userId,
      action: "imam_application.approved",
      targetType: "imam_application",
      targetId: app.id,
      details: { imam_id: imamId, radius_km: data.radius_km },
    });

    return { ok: true, imam_id: imamId };
  });

const ToggleInput = z.object({
  user_id: z.string().uuid(),
  active: z.boolean(),
  radius_km: z.number().int().min(5).max(300).optional(),
});

export const setImamAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ToggleInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.active) {
      const { data: account } = await supabaseAdmin
        .from("imam_accounts")
        .select("imam_id")
        .eq("user_id", data.user_id)
        .maybeSingle();
      const { data: imam } = account
        ? await supabaseAdmin
            .from("imams")
            .select("verification_status")
            .eq("id", account.imam_id)
            .maybeSingle()
        : { data: null };
      if (!account || imam?.verification_status !== "verified") {
        throw new Error("Verify this imam before activating dashboard access");
      }
    }
    const patch: { active: boolean; radius_km?: number } = { active: data.active };
    if (data.radius_km) patch.radius_km = data.radius_km;
    const { error } = await supabaseAdmin
      .from("imam_accounts")
      .update(patch)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    const { writeAdminAudit } = await import("@/lib/admin-audit.server");
    await writeAdminAudit(supabaseAdmin, {
      actorUserId: context.userId,
      action: data.active ? "imam_account.activated" : "imam_account.deactivated",
      targetType: "imam_account",
      targetId: data.user_id,
      details: data.radius_km ? { radius_km: data.radius_km } : {},
    });
    return { ok: true };
  });

// Admin: every pairing in the system, with the imam handling it.
export const listAllPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: pairings }, { data: profs }, { data: imams }, { data: meetups }] =
      await Promise.all([
        supabaseAdmin
          .from("pairings")
          .select(
            "id,user_a,user_b,imam_id,status,created_at,compatibility_score,member_a_response,member_b_response,payment_a_status,payment_b_status",
          )
          .order("created_at", { ascending: false }),
        supabaseAdmin.from("profiles").select("id, display_name, uk_city"),
        supabaseAdmin.from("imams").select("id, name, city"),
        supabaseAdmin.from("meetups").select("id, pairing_id, scheduled_at, status"),
      ]);
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const imamMap = new Map((imams ?? []).map((i) => [i.id, i]));
    return (pairings ?? []).map((p) => ({
      ...p,
      a: profMap.get(p.user_a) ?? null,
      b: profMap.get(p.user_b) ?? null,
      imam: p.imam_id ? (imamMap.get(p.imam_id) ?? null) : null,
      meetups: (meetups ?? []).filter((m) => m.pairing_id === p.id),
    }));
  });

export const listAssignableImams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [
      { data: imams, error: imamError },
      { data: accounts, error: accountError },
      { data: pairings, error: pairingError },
    ] = await Promise.all([
      supabaseAdmin
        .from("imams")
        .select("id,name,mosque,city")
        .eq("verification_status", "verified")
        .order("city")
        .order("name"),
      supabaseAdmin.from("imam_accounts").select("user_id,imam_id").eq("active", true),
      supabaseAdmin
        .from("pairings")
        .select("imam_id,status")
        .not("imam_id", "is", null)
        .in("status", [
          "pending",
          "imam_review",
          "member_review",
          "awaiting_payment",
          "payment_pending",
          "ready_to_schedule",
          "scheduled",
        ]),
    ]);
    if (imamError) throw new Error(imamError.message);
    if (accountError) throw new Error(accountError.message);
    if (pairingError) throw new Error(pairingError.message);
    const activeIds = new Set((accounts ?? []).map((account) => account.imam_id));
    return (imams ?? [])
      .filter((imam) => activeIds.has(imam.id))
      .map((imam) => {
        const workload = (pairings ?? []).filter((pairing) => pairing.imam_id === imam.id);
        return {
          ...imam,
          active_pairings: workload.length,
          awaiting_review: workload.filter((pairing) =>
            ["pending", "imam_review"].includes(pairing.status),
          ).length,
          ready_to_schedule: workload.filter((pairing) => pairing.status === "ready_to_schedule")
            .length,
        };
      });
  });

const AssignPairingImamInput = z.object({
  pairing_id: z.string().uuid(),
  imam_id: z.string().uuid(),
});

export const assignPairingImam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AssignPairingImamInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: account }, { data: imam }, { data: pairing }] = await Promise.all([
      supabaseAdmin
        .from("imam_accounts")
        .select("user_id")
        .eq("imam_id", data.imam_id)
        .eq("active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("imams")
        .select("id")
        .eq("id", data.imam_id)
        .eq("verification_status", "verified")
        .maybeSingle(),
      supabaseAdmin.from("pairings").select("id,status").eq("id", data.pairing_id).maybeSingle(),
    ]);
    if (!account || !imam) throw new Error("Choose a verified imam with active dashboard access");
    if (!pairing || !["pending", "imam_review"].includes(pairing.status)) {
      throw new Error("Only pairings awaiting imam review can be assigned");
    }
    const { data: updated, error } = await supabaseAdmin
      .from("pairings")
      .update({ imam_id: data.imam_id, status: "imam_review" })
      .eq("id", data.pairing_id)
      .eq("status", pairing.status)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("The pairing changed before it could be assigned");
    const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
      user_id: account.user_id,
      pairing_id: data.pairing_id,
      kind: "imam_match_review",
      title: "Compatibility review assigned",
      body: "A suitable compatibility result has been assigned to your private review queue.",
    });
    if (notificationError) throw new Error(notificationError.message);
    const { writeAdminAudit } = await import("@/lib/admin-audit.server");
    await writeAdminAudit(supabaseAdmin, {
      actorUserId: context.userId,
      action: "pairing.imam_assigned",
      targetType: "pairing",
      targetId: data.pairing_id,
      details: { imam_id: data.imam_id },
    });
    return { ok: true };
  });
