import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { deleteProfileAdmin, exportProfilesAdmin, listAllProfiles } from "@/lib/admin.functions";
import { useAsyncResource } from "@/lib/use-async-resource";
import {
  EmptyRow,
  ErrorState,
  PageHeadingSkeleton,
  TableSkeleton,
} from "@/components/admin/async-states";

export const Route = createFileRoute("/_authenticated/admin/profiles")({
  head: () => ({ meta: [{ title: "Profiles — Admin" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): { export?: boolean } => ({
    export: search.export === true || search.export === "true" ? true : undefined,
  }),
  component: ProfilesList,
});

type Row = Awaited<ReturnType<typeof listAllProfiles>>[number];

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ProfilesList() {
  const { export: exportRequested } = Route.useSearch();
  const fetchAll = useServerFn(listAllProfiles);
  const doExport = useServerFn(exportProfilesAdmin);
  const doDelete = useServerFn(deleteProfileAdmin);

  const {
    status,
    data: rows,
    error,
    retry,
    reload,
    refreshing,
  } = useAsyncResource<Row[]>(fetchAll);
  const [q, setQ] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Arriving from the overview's "Export JSON / CSV" action puts the export
  // controls on screen and highlights them, so the label matches what happens.
  useEffect(() => {
    if (!exportRequested || status !== "ready") return;
    exportRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [exportRequested, status]);

  const exportOne = async (id: string, format: "json" | "csv") => {
    setActionError(null);
    try {
      const r = await doExport({ data: { format, user_id: id } });
      download(r.filename, r.mime, r.body);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Export failed");
    }
  };
  const exportAll = async (format: "json" | "csv") => {
    setActionError(null);
    try {
      const r = await doExport({ data: { format } });
      download(r.filename, r.mime, r.body);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Export failed");
    }
  };
  const remove = async (id: string, label: string) => {
    if (
      !confirm(
        `Permanently delete ${label}?\n\nThis removes their auth account, survey answers, privacy settings, matches and interests. It cannot be undone.`,
      )
    )
      return;
    setActionError(null);
    try {
      await doDelete({ data: { user_id: id } });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not delete this profile");
    }
  };

  if (status === "error") {
    return (
      <ErrorState
        title="Profiles didn't load"
        message={error}
        onRetry={retry}
        retrying={refreshing}
      />
    );
  }

  if (status === "loading" || !rows) {
    return (
      <div className="space-y-6">
        <PageHeadingSkeleton />
        <TableSkeleton rows={8} columns={8} />
      </div>
    );
  }

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (r.display_name ?? "").toLowerCase().includes(s) ||
      (r.contact_email ?? "").toLowerCase().includes(s) ||
      (r.auth_email ?? "").toLowerCase().includes(s) ||
      r.id.includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl text-foreground">Profiles</h1>
        <div
          ref={exportRef}
          className={
            exportRequested
              ? "flex gap-2 rounded-full p-1 ring-2 ring-primary ring-offset-2 ring-offset-background"
              : "flex gap-2"
          }
        >
          <button
            onClick={() => exportAll("json")}
            className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Export all JSON
          </button>
          <button
            onClick={() => exportAll("csv")}
            className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Export all CSV
          </button>
          <Link
            to="/admin/new-profile"
            className="rounded-full bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
          >
            + New profile
          </Link>
        </div>
      </div>

      {exportRequested ? (
        <p className="text-sm text-muted-foreground">
          Choose a format above to export every profile, or use the per-row JSON / CSV buttons for a
          single member.
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email, or id…"
        className="w-full max-w-md rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:border-primary"
      />

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Survey</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-accent/40">
                <td className="px-4 py-3 text-foreground">
                  {r.display_name ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {r.auth_email ?? r.contact_email ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={r.survey_completed ? "text-primary" : "text-muted-foreground"}>
                    {r.survey_completed ? "Completed" : "In progress"}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground">{r.visibility}</td>
                <td className="px-4 py-3">{r.email_confirmed ? "✓" : "—"}</td>
                <td className="px-4 py-3 text-xs">{r.roles.join(", ") || "user"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      to="/admin/profiles/$userId"
                      params={{ userId: r.id }}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => exportOne(r.id, "json")}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => exportOne(r.id, "csv")}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() =>
                        remove(r.id, r.display_name || r.auth_email || r.contact_email || r.id)
                      }
                      className="rounded-full border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 &&
              (rows.length === 0 ? (
                <EmptyRow
                  colSpan={8}
                  title="No profiles yet"
                  message="Create one with “+ New profile”, or seed the example members from the Seed data page."
                />
              ) : (
                <EmptyRow
                  colSpan={8}
                  title="Nothing matches that search"
                  message="Clear the search box to see all profiles again."
                />
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
