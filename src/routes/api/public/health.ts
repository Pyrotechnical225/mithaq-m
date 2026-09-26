import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            service: "mithaq",
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers },
        ),
      HEAD: async () => new Response(null, { status: 200, headers }),
    },
  },
});
