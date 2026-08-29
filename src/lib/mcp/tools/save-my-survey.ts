import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";
import { validateSurveyAnswers } from "@/lib/survey-validation";

export default defineTool({
  name: "save_my_survey",
  title: "Save my survey answers",
  description:
    "Upsert the signed-in user's Mithaq survey answers. Answers is a map of question id (string) to answer text. Set completed=true only after all required questions (1-30) are filled.",
  inputSchema: {
    answers: z.record(z.string(), z.string()).describe("Map of question id to answer text."),
    completed: z.boolean().describe("Whether the survey is fully completed."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ answers, completed }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    try {
      const validated = validateSurveyAnswers(answers, completed);
      const supabase = supabaseForUser(ctx);
      const { error } = await supabase.from("survey_answers").upsert({
        user_id: ctx.getUserId()!,
        answers: validated,
        completed,
        updated_at: new Date().toISOString(),
      });
      if (error) return errResult(error.message);
      return jsonResult({ ok: true });
    } catch (error) {
      return errResult(error instanceof Error ? error.message : "Survey answers are invalid");
    }
  },
});
