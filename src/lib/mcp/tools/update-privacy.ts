import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "update_privacy_settings",
  title: "Update privacy settings",
  description: "Update the signed-in user's Mithaq privacy settings.",
  inputSchema: {
    visibility: z.enum(["discoverable", "paused", "hidden"]),
    show_location: z.boolean(),
    show_occupation: z.boolean(),
    show_free_text: z.boolean(),
    reveal_contact_on_mutual: z.boolean(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const { error } = await supabase.from("privacy_settings").upsert({
      user_id: ctx.getUserId(),
      ...input,
      updated_at: new Date().toISOString(),
    });
    if (error) return errResult(error.message);
    return jsonResult({ ok: true });
  },
});
