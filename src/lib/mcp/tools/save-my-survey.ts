import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

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
    const supabase = supabaseForUser(ctx);
    const { error } = await supabase.from("survey_answers").upsert({
      user_id: ctx.getUserId()!,
      answers,
      completed,
      updated_at: new Date().toISOString(),
    });
    if (error) return errResult(error.message);
    return jsonResult({ ok: true });
  },
});
