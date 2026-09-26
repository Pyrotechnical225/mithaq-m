import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { UK_CITY_NAMES, findUkCity } from "@/lib/uk-cities";

// Public directory: verified imams only, with private contact/notes omitted.
export const listImams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("imams")
      .select(
        "id,name,title,mosque,city,postcode,lat,lng,website,languages,verification_status,verified_at,created_at,updated_at",
      )
      .eq("verification_status", "verified")
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
  .validator((input: unknown) => SaveLocationInput.parse(input))
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
