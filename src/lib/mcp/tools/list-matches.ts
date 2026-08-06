import { defineTool } from "@lovable.dev/mcp-js";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "list_latest_matches",
  title: "List latest matches",
  description: "Return the signed-in user's most recent compatibility match results.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("matches")
      .select("id, results, created_at")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return errResult(error.message);
    return jsonResult(data);
  },
});
