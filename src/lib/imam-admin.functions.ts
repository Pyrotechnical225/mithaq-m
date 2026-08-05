import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Admin: every imam application.
export const listImamApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
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
        })
        .select("id")
        .single();
      if (createErr) throw new Error(createErr.message);
      imamId = created.id;
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
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { active: boolean; radius_km?: number } = { active: data.active };
    if (data.radius_km) patch.radius_km = data.radius_km;
    const { error } = await supabaseAdmin
      .from("imam_accounts")
      .update(patch)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: every pairing in the system, with the imam handling it.
export const listAllPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: pairings }, { data: profs }, { data: imams }, { data: meetups }] =
      await Promise.all([
        supabaseAdmin
          .from("pairings")
          .select("id, user_a, user_b, imam_id, status, created_at")
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
