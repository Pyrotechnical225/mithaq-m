import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "express_interest",
  title: "Express interest",
  description:
    "Express interest in another Mithaq user by their user id (uuid). Creates or refreshes a pending interest from the signed-in user.",
  inputSchema: {
    to_user: z.string().uuid().describe("Recipient user id (uuid)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ to_user }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { error } = await supabase.from("interests").upsert(
      { from_user: ctx.getUserId()!, to_user, status: "pending" },
      { onConflict: "from_user,to_user" },
    );
    if (error) return errResult(error.message);
    return jsonResult({ ok: true });
  },
});
