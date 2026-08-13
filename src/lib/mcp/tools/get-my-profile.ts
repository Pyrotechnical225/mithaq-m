import { defineTool } from "@lovable.dev/mcp-js";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "get_my_profile",
  title: "Get my profile",
  description: "Return the signed-in Mithaq user's profile row (display name, contact email).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, contact_email, created_at")
      .eq("id", ctx.getUserId()!)
      .maybeSingle();
    if (error) return errResult(error.message);
    return jsonResult(data);
  },
});
