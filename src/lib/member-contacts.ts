import { z } from "zod";

// "How your imam can reach you": shared by the survey section, the
// post-payment confirmation card and the server functions.

export const CONTACT_METHODS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "Phone call" },
  { value: "text", label: "Text message" },
  { value: "email", label: "Email only" },
] as const;

export const BEST_TIMES = [
  { value: "mornings", label: "Mornings" },
  { value: "afternoons", label: "Afternoons" },
  { value: "evenings", label: "Evenings" },
  { value: "weekends", label: "Weekends" },
] as const;

export const WALI_RELATIONSHIPS = [
  { value: "father", label: "Father" },
  { value: "brother", label: "Brother" },
  { value: "uncle", label: "Uncle" },
  { value: "grandfather", label: "Grandfather" },
  { value: "son", label: "Son" },
  { value: "imam", label: "Imam or local wali" },
  { value: "other", label: "Other" },
] as const;

export const MEETING_FORMATS = [
  { value: "mosque", label: "At the mosque" },
  { value: "public", label: "A public place with my wali" },
  { value: "video", label: "A video call with my wali" },
] as const;

type Option = { value: string; label: string };
export function optionLabel(options: readonly Option[], value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ?? null;
}

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

/** Trims and collapses spaces. Returns null for an empty value. */
export function normalisePhone(value: string | null | undefined) {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

export function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return PHONE_PATTERN.test(value) && digits.length >= 7 && digits.length <= 15;
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed ? trimmed : null;
    });

const optionalPhone = z
  .string()
  .max(40)
  .nullish()
  .transform((value) => normalisePhone(value))
  .refine((value) => value === null || isValidPhone(value), {
    message: "Enter a valid phone number, for example 07700 900123.",
  });

export const ContactDetailsInput = z.object({
  contact_method: z.enum(["whatsapp", "call", "text", "email"]),
  phone: optionalPhone,
  email: optionalText(254).refine(
    (value) => value === null || z.string().email().safeParse(value).success,
    { message: "Enter a valid email address." },
  ),
  best_times: z.array(z.enum(["mornings", "afternoons", "evenings", "weekends"])).max(4),
  wali_name: optionalText(120),
  wali_relationship: z
    .enum(["father", "brother", "uncle", "grandfather", "son", "imam", "other"])
    .nullish()
    .transform((value) => value ?? null),
  wali_phone: optionalPhone,
  meeting_formats: z.array(z.enum(["mosque", "public", "video"])).max(3),
  /** True when the member confirms after payment; stricter checks apply. */
  confirm: z.boolean().default(false),
});
export type ContactDetailsInput = z.input<typeof ContactDetailsInput>;
export type ContactDetails = z.output<typeof ContactDetailsInput>;

/**
 * Problems that block confirming details after payment. The survey section
 * itself is optional, so these only apply when `confirm` is true.
 */
export function contactConfirmationProblems(
  details: ContactDetails,
  options: { waliRequired: boolean; accountEmail: string | null },
) {
  const problems: string[] = [];
  if (details.contact_method !== "email" && !details.phone)
    problems.push("Add a phone number, or choose email as your contact method.");
  if (details.contact_method === "email" && !details.email && !options.accountEmail)
    problems.push("Add an email address.");
  if (options.waliRequired) {
    if (!details.wali_name) problems.push("Add your wali's name.");
    if (!details.wali_phone) problems.push("Add your wali's phone number.");
  }
  if (details.meeting_formats.length === 0)
    problems.push("Choose at least one way you would be happy to meet.");
  return problems;
}

/** Sisters must give wali details (survey question 2 is gender). */
export function waliRequiredFor(answers: Record<string, unknown> | null | undefined) {
  return typeof answers?.["2"] === "string" && answers["2"].trim().toLowerCase() === "female";
}
