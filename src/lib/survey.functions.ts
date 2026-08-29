import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { validateSurveyAnswers } from "./survey-validation";

export const getMyAnswers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("survey_answers")
      .select("answers, completed, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { answers: {}, completed: false, updated_at: null };
  });

const SaveInput = z.object({
  answers: z.record(z.string(), z.string()),
  completed: z.boolean(),
});

export const saveMyAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const answers = validateSurveyAnswers(data.answers, data.completed);
    const { error } = await context.supabase.from("survey_answers").upsert({
      user_id: context.userId,
      answers,
      completed: data.completed,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
