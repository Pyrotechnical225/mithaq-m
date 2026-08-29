import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/compatibility-status")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          { error: "Not found" },
          {
            status: 404,
            headers: { "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
