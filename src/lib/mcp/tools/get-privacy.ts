import { defineTool } from "@lovable.dev/mcp-js";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "get_privacy_settings",
  title: "Get privacy settings",
  description:
    "Return the signed-in user's MeetHaq privacy settings (visibility, field visibility).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("privacy_settings")
      .select("*")
      .eq("user_id", ctx.getUserId()!)
      .maybeSingle();
    if (error) return errResult(error.message);
    return jsonResult(data);
  },
});
