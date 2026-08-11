import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/compatibility-status")({
  server: {
    handlers: {
      GET: async () => {
        const { checkOpenAICompatibilityConnection } =
          await import("@/lib/openai-compatibility.server");
        const status = await checkOpenAICompatibilityConnection();

        return Response.json(status, {
          status: status.connected ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
