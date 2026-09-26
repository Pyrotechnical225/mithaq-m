import { createFileRoute } from "@tanstack/react-router";
import { notificationJobAuthorized } from "@/lib/notification-dispatch";

export const Route = createFileRoute("/api/internal/notification-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
        if (
          !(await notificationJobAuthorized(
            request.headers.get("authorization"),
            process.env.NOTIFICATION_CRON_SECRET,
          ))
        ) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
        }
        try {
          const { runNotificationEmailJob } =
            await import("@/lib/notification-email-worker.server");
          return new Response(JSON.stringify(await runNotificationEmailJob()), { headers });
        } catch {
          // Never emit AWS credentials, recipient addresses, or private message data.
          return new Response(JSON.stringify({ error: "Notification delivery is unavailable" }), {
            status: 503,
            headers,
          });
        }
      },
    },
  },
});
