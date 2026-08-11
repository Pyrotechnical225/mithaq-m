import { defineTool } from "@lovable.dev/mcp-js";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "get_my_survey",
  title: "Get my survey answers",
  description: "Return the signed-in user's MeetHaq survey answers and completion state.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("survey_answers")
      .select("answers, completed, updated_at")
      .eq("user_id", ctx.getUserId()!)
      .maybeSingle();
    if (error) return errResult(error.message);
    return jsonResult(data ?? { answers: {}, completed: false, updated_at: null });
  },
});
