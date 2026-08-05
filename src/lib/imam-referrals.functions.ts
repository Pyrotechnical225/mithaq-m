import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const ReferralInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(320),
});

export const createImamReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ReferralInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: account, error: accountError } = await context.supabase
      .from("imam_accounts")
      .select("imam_id")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (accountError || !account) throw new Error("Only active imams can make referrals");

    const { error } = await context.supabase.from("imam_referrals").insert({
      referrer_user_id: context.userId,
      referrer_imam_id: account.imam_id,
      referred_name: data.name,
      referred_email: data.email,
    });
    if (error?.code === "23505") {
      throw new Error("This email already has an open referral");
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyImamReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("imam_referrals")
      .select(
        "id,referred_name,referred_email,status,admin_notes,created_at,reviewed_at,completed_at",
      )
      .eq("referrer_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function assertAdmin(context: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listAllImamReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("imam_referrals")
      .select(
        "id,referrer_imam_id,referred_name,referred_email,status,admin_notes,created_at,reviewed_at,invitation_expires_at,completed_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const imamIds = Array.from(new Set((data ?? []).map((row) => row.referrer_imam_id)));
    const { data: imams } = imamIds.length
      ? await supabaseAdmin.from("imams").select("id,name,mosque,city").in("id", imamIds)
      : { data: [] };
    const imamById = new Map((imams ?? []).map((imam) => [imam.id, imam]));
    return (data ?? []).map((row) => ({
      ...row,
      referrer: imamById.get(row.referrer_imam_id) ?? null,
    }));
  });

const ReviewReferralInput = z.object({
  referral_id: z.string().uuid(),
  decision: z.enum(["approved", "declined"]),
  admin_notes: z.string().trim().max(2000).optional().nullable(),
});

export const reviewImamReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ReviewReferralInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: referral } = await supabaseAdmin
      .from("imam_referrals")
      .select("id,status")
      .eq("id", data.referral_id)
      .maybeSingle();
    if (!referral) throw new Error("Referral not found");
    if (!["pending", "approved", "invited"].includes(referral.status)) {
      throw new Error("This referral can no longer be changed");
    }

    if (data.decision === "declined") {
      const { error } = await supabaseAdmin
        .from("imam_referrals")
        .update({
          status: "declined",
          admin_notes: data.admin_notes || null,
          invitation_token_hash: null,
          invitation_expires_at: null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.referral_id);
      if (error) throw new Error(error.message);
      return { ok: true as const, invitation_url: null };
    }

    const token = createToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("imam_referrals")
      .update({
        status: "invited",
        admin_notes: data.admin_notes || null,
        invitation_token_hash: tokenHash,
        invitation_expires_at: expiresAt,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.referral_id);
    if (error) throw new Error(error.message);

    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    if (!request?.url) throw new Error("Could not create the invitation address");
    return {
      ok: true as const,
      invitation_url: `${new URL(request.url).origin}/imam-invite/${token}`,
      expires_at: expiresAt,
    };
  });

const TokenInput = z.object({ token: z.string().length(64) });

export const getImamInvitation = createServerFn({ method: "GET" })
  .validator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256(data.token);
    const { data: referral } = await supabaseAdmin
      .from("imam_referrals")
      .select("referred_name,referred_email,status,invitation_expires_at")
      .eq("invitation_token_hash", hash)
      .maybeSingle();
    if (
      !referral ||
      referral.status !== "invited" ||
      !referral.invitation_expires_at ||
      new Date(referral.invitation_expires_at).getTime() <= Date.now()
    ) {
      return { valid: false as const };
    }
    return {
      valid: true as const,
      name: referral.referred_name,
      email: referral.referred_email,
      expires_at: referral.invitation_expires_at,
    };
  });

const CompleteInvitationInput = TokenInput.extend({
  password: z.string().min(8).max(128),
  mosque: z.string().trim().max(160).optional().nullable(),
  title: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  postcode: z.string().trim().max(20).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  languages: z.array(z.string().trim().min(1).max(40)).max(10),
  credentials: z.string().trim().max(2000).optional().nullable(),
});

export const completeImamInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => CompleteInvitationInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256(data.token);
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("imam_referrals")
      .update({ status: "redeeming" })
      .eq("invitation_token_hash", hash)
      .eq("status", "invited")
      .gt("invitation_expires_at", new Date().toISOString())
      .select("id,referred_name,referred_email")
      .maybeSingle();
    if (claimError || !claimed)
      throw new Error("This invitation is invalid, expired, or already used");

    let createdUserId: string | null = null;
    let createdImamId: string | null = null;
    try {
      const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: claimed.referred_email,
        password: data.password,
        email_confirm: true,
        user_metadata: { display_name: claimed.referred_name },
      });
      if (userError || !created.user) {
        if (userError?.message.toLowerCase().includes("already")) {
          throw new Error("An account already uses this email. Contact the Mithaq administrator.");
        }
        throw new Error(userError?.message ?? "Could not create the account");
      }
      createdUserId = created.user.id;

      const { findUkCity } = await import("./uk-cities");
      const knownCity = findUkCity(data.city);
      const { data: imam, error: imamError } = await supabaseAdmin
        .from("imams")
        .insert({
          name: claimed.referred_name,
          title: data.title || "Imam",
          mosque: data.mosque || null,
          city: data.city,
          postcode: data.postcode || null,
          phone: data.phone || null,
          email: claimed.referred_email,
          languages: data.languages,
          lat: knownCity?.lat ?? null,
          lng: knownCity?.lng ?? null,
        })
        .select("id")
        .single();
      if (imamError) throw new Error(imamError.message);
      createdImamId = imam.id;

      const { error: accountError } = await supabaseAdmin.from("imam_accounts").insert({
        user_id: createdUserId,
        imam_id: imam.id,
        radius_km: 40,
        active: true,
      });
      if (accountError) throw new Error(accountError.message);

      await supabaseAdmin.from("imam_applications").insert({
        user_id: createdUserId,
        imam_id: imam.id,
        name: claimed.referred_name,
        mosque: data.mosque || null,
        city: data.city,
        postcode: data.postcode || null,
        languages: data.languages,
        phone: data.phone || null,
        email: claimed.referred_email,
        credentials: data.credentials || null,
        message: "Created through an approved imam referral.",
        status: "approved",
        reviewed_at: new Date().toISOString(),
      });

      await supabaseAdmin
        .from("imam_referrals")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          invitation_token_hash: null,
        })
        .eq("id", claimed.id)
        .eq("status", "redeeming");
      return { ok: true as const };
    } catch (cause) {
      if (createdUserId) {
        await supabaseAdmin.from("imam_applications").delete().eq("user_id", createdUserId);
      }
      if (createdUserId) await supabaseAdmin.auth.admin.deleteUser(createdUserId);
      if (createdImamId) await supabaseAdmin.from("imams").delete().eq("id", createdImamId);
      await supabaseAdmin
        .from("imam_referrals")
        .update({ status: "invited" })
        .eq("id", claimed.id)
        .eq("status", "redeeming");
      throw cause;
    }
  });
