import { defineTool } from "@lovable.dev/mcp-js";
import { errResult, jsonResult, supabaseForUser, unauthed } from "../supabase-user";

export default defineTool({
  name: "list_interests",
  title: "List interests",
  description: "List interests sent and received by the signed-in Mithaq user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthed();
    const supabase = supabaseForUser(ctx);
    const uid = ctx.getUserId()!;
    const [sent, received] = await Promise.all([
      supabase
        .from("interests")
        .select("id, to_user, status, created_at")
        .eq("from_user", uid)
        .order("created_at", { ascending: false }),
      supabase
        .from("interests")
        .select("id, from_user, status, created_at")
        .eq("to_user", uid)
        .order("created_at", { ascending: false }),
    ]);
    if (sent.error) return errResult(sent.error.message);
    if (received.error) return errResult(received.error.message);
    return jsonResult({ sent: sent.data ?? [], received: received.data ?? [] });
  },
});
