import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "respond_to_interest",
  title: "Respond to interest",
  description: "Accept or decline a received interest by its id.",
  inputSchema: {
    interest_id: z.string().uuid(),
    accept: z.boolean(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ interest_id, accept }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { error } = await supabase
      .from("interests")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", interest_id)
      .eq("to_user", ctx.getUserId()!);
    if (error) return errResult(error.message);
    return jsonResult({ ok: true });
  },
});
