import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listAdminAuditLog } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [{ title: "Audit history — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminAudit,
});

function AdminAudit() {
  const fetchAudit = useServerFn(listAdminAuditLog);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAdminAuditLog>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAudit()
      .then(setRows)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Audit history could not load"),
      );
  }, [fetchAudit]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Security</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Admin audit history</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          High-impact administrator actions are appended here. Application roles can add events but
          cannot update, delete, or truncate earlier history.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(rows ?? []).map((row) => (
              <tr key={row.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{row.action}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div>{row.target_type}</div>
                  <div className="mt-1 font-mono text-[11px]">{row.target_id ?? "—"}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {row.actor_user_id ?? "deleted account"}
                </td>
                <td className="max-w-sm px-4 py-3">
                  <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {JSON.stringify(row.details, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
            {rows?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No audited actions have been recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
