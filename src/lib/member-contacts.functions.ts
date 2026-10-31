import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ContactDetailsInput,
  contactConfirmationProblems,
  waliRequiredFor,
} from "./member-contacts";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

const CONTACT_COLUMNS =
  "contact_method,phone,email,best_times,wali_name,wali_relationship,wali_phone,meeting_formats,confirmed_at,updated_at";

function accountEmailFrom(claims: Record<string, unknown> | undefined) {
  return typeof claims?.email === "string" ? claims.email : null;
}

// The signed-in member's own contact details. Row-level security limits
// every read and write here to the member's own row.
export const getMyContactDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [contact, survey] = await Promise.all([
      context.supabase
        .from("member_contacts")
        .select(CONTACT_COLUMNS)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("survey_answers")
        .select("answers")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (contact.error && !MISSING_TABLE_CODES.has(contact.error.code ?? ""))
      throw new Error("Your contact details could not be loaded. Please try again.");
    return {
      // False until the member_contacts migration is applied; the form hides itself.
      available: !contact.error,
      details: contact.error ? null : (contact.data ?? null),
      waliRequired: waliRequiredFor(survey.data?.answers as Record<string, unknown> | undefined),
      accountEmail: accountEmailFrom(context.claims),
    };
  });

export const saveMyContactDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ContactDetailsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { confirm, ...details } = data;
    if (confirm) {
      const { data: survey } = await context.supabase
        .from("survey_answers")
        .select("answers")
        .eq("user_id", context.userId)
        .maybeSingle();
      const problems = contactConfirmationProblems(data, {
        waliRequired: waliRequiredFor(survey?.answers as Record<string, unknown> | undefined),
        accountEmail: accountEmailFrom(context.claims),
      });
      if (problems.length) throw new Error(problems.join(" "));
    }
    const { error } = await context.supabase.from("member_contacts").upsert(
      {
        user_id: context.userId,
        ...details,
        ...(confirm ? { confirmed_at: new Date().toISOString() } : {}),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (error.code === "23514")
        throw new Error("Please check your phone numbers and email address.");
      throw new Error("Your contact details could not be saved. Please try again.");
    }
    return { ok: true, confirmed: confirm };
  });
