import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NotificationDatabase } from "@/lib/notification-database.types";
import { assertAdmin, assertAdminMfa } from "@/lib/admin-authorization";

export const notificationCategories = [
  "journey",
  "matches",
  "meetings",
  "check_ins",
  "payments",
  "imam",
  "admin",
] as const;
export const checkInOutcomes = [
  "getting_to_know",
  "moving_forward",
  "not_continuing",
  "support_requested",
] as const;
const schemaMissing = (code?: string) =>
  code === "42P01" || code === "PGRST205" || code === "42703";

export const getMyEmailPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseClient<NotificationDatabase>;
    const { data, error } = await db
      .from("email_notification_preferences")
      .select("category,enabled")
      .eq("user_id", context.userId);
    if (error && !schemaMissing(error.code))
      throw new Error("Email preferences could not be loaded.");
    return {
      available: !error,
      sendingEnabled:
        process.env.EMAIL_NOTIFICATIONS_ENABLED === "true" &&
        process.env.EMAIL_DEPLOYMENT_SCOPE === "production" &&
        !["preview", "development"].includes(process.env.VERCEL_ENV ?? ""),
      preferences: notificationCategories.map((category) => ({
        category,
        enabled: data?.find((row) => row.category === category)?.enabled ?? false,
      })),
    };
  });

export const saveMyEmailPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ category: z.enum(notificationCategories), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient<NotificationDatabase>;
    const { error } = await db.from("email_notification_preferences").upsert(
      {
        user_id: context.userId,
        category: data.category,
        enabled: data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,category" },
    );
    if (error) throw new Error("Your email preference was not saved. Please try again.");
    return { ok: true };
  });

export const getMyCheckIns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as SupabaseClient<NotificationDatabase>;
    const { data, error } = await db
      .from("meeting_check_ins")
      .select("id,due_at,answered_at,outcome,note,created_at,reviewed_at")
      .eq("user_id", context.userId)
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: false })
      .limit(50);
    if (error && !schemaMissing(error.code))
      throw new Error("Check-ins could not be loaded. Please try again.");
    return { available: !error, items: data ?? [] };
  });

export const answerMyCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        outcome: z.enum(checkInOutcomes),
        note: z.string().trim().max(1000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient<NotificationDatabase>;
    const { error } = await db.rpc("answer_meeting_check_in", {
      p_id: data.id,
      p_outcome: data.outcome,
      p_note: data.note || null,
    });
    if (error)
      throw new Error(
        "This check-in could not be saved. Refresh to check whether it has already been answered.",
      );
    return { ok: true };
  });

export const completeAssignedMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ meetup_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase as unknown as SupabaseClient<NotificationDatabase>;
    const { error } = await db.rpc("complete_assigned_meeting", { p_id: data.meetup_id });
    if (error)
      throw new Error(
        "Attendance was not saved. A confirmed past meeting, current imam assignment and verified MFA are required.",
      );
    return { ok: true };
  });

export const listCheckInsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient<NotificationDatabase>;
    const { data, error } = await db
      .from("meeting_check_ins")
      .select("*")
      .not("answered_at", "is", null)
      .order("answered_at", { ascending: false })
      .limit(200);
    if (error && !schemaMissing(error.code))
      throw new Error("Check-in review could not be loaded.");
    return { available: !error, items: data ?? [] };
  });

export const reviewCheckInAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    assertAdminMfa(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient<NotificationDatabase>;
    const { data: row, error } = await db
      .from("meeting_check_ins")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: context.userId })
      .eq("id", data.id)
      .not("answered_at", "is", null)
      .is("reviewed_at", null)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("The check-in was not updated. Refresh and try again.");
    return { ok: true };
  });
