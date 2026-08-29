import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { UK_CITY_NAMES, findUkCity } from "@/lib/uk-cities";

// List all imams. Any signed-in user may read (RLS allows SELECT to authenticated).
export const listImams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("imams")
      .select("*")
      .order("city", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Fetch the current user's stored location.
export const getMyLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("uk_city, uk_postcode, location_lat, location_lng")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { uk_city: null, uk_postcode: null, location_lat: null, location_lng: null };
  });

const SaveLocationInput = z.object({
  uk_city: z.string().max(80).nullable().optional(),
  uk_postcode: z.string().max(20).nullable().optional(),
});

export const saveMyLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveLocationInput.parse(input))
  .handler(async ({ data, context }) => {
    const city = data.uk_city?.trim() || null;
    const postcode = data.uk_postcode?.trim() || null;
    const known = findUkCity(city);
    const patch = {
      id: context.userId,
      uk_city: city,
      uk_postcode: postcode,
      location_lat: known?.lat ?? null,
      location_lng: known?.lng ?? null,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").upsert(patch, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true, matched_city: known?.name ?? null };
  });

export const UK_CITIES_FOR_UI = UK_CITY_NAMES;
