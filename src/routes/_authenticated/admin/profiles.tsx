import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { deleteProfileAdmin, exportProfilesAdmin, listAllProfiles } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/profiles")({
  head: () => ({ meta: [{ title: "Profiles — Admin" }, { name: "robots", content: "noindex" }] }),
  component: ProfilesRoute,
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

function ProfilesRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return pathname === "/admin/profiles" ? <ProfilesList /> : <Outlet />;
}

function ProfilesList() {
  const fetchAll = useServerFn(listAllProfiles);
  const doExport = useServerFn(exportProfilesAdmin);
  const doDelete = useServerFn(deleteProfileAdmin);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [tableView, setTableView] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError("");
    setRows(null);
    return fetchAll()
      .then(setRows)
      .catch((loadError) => {
        console.error("Profiles could not be loaded", loadError);
        setError("Profiles could not be loaded. Please try again.");
      });
  };
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  if (error) {
    return (
      <section className="rounded-3xl border border-destructive/30 bg-card p-7 text-center">
        <h1 className="text-2xl text-foreground">Profiles could not load</h1>
        <p className="mt-3 text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!rows) return <p className="text-sm text-muted-foreground">Loading profiles…</p>;

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

  const exportOne = async (id: string, format: "json" | "csv") => {
    const r = await doExport({ data: { format, user_id: id } });
    download(r.filename, r.mime, r.body);
  };
  const exportAll = async (format: "json" | "csv") => {
    const r = await doExport({ data: { format } });
    download(r.filename, r.mime, r.body);
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this profile permanently? This cannot be undone.")) return;
    await doDelete({ data: { user_id: id } });
    await load();
  };

  const runAction = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch {
      setActionError("The action could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Members</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
            Profiles
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => void runAction(() => exportAll("json"))}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
          >
            Export all JSON
          </button>
          <button
            disabled={busy}
            onClick={() => void runAction(() => exportAll("csv"))}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent"
          >
            Export all CSV
          </button>
          <Link
            to="/admin/new-profile"
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            + New profile
          </Link>
        </div>
      </div>

      <input
        aria-label="Search member profiles"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email, or id…"
        className="w-full max-w-md rounded-md border border-input bg-card px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
      />

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <p className="text-sm text-muted-foreground">{filtered.length} profiles</p>
        <button
          type="button"
          aria-pressed={tableView}
          onClick={() => setTableView(!tableView)}
          className="rounded-md border border-border px-3 text-sm"
        >
          {tableView ? "Show records" : "Show spreadsheet"}
        </button>
      </div>
      {!tableView && (
        <div className="space-y-3 sm:hidden">
          {filtered.map((r) => (
            <article key={r.id} className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-semibold">{r.display_name || "Unnamed profile"}</h2>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {r.auth_email ?? r.contact_email ?? "No email recorded"}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Survey", r.survey_completed ? "Completed" : "In progress"],
                  ["Visibility", r.visibility],
                  ["Email verified", r.email_confirmed ? "Yes" : "No"],
                  ["Role", r.roles.join(", ") || "Member"],
                  ["Joined", r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 capitalize">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-3 text-xs">
                <Link
                  to="/admin/profiles/$userId"
                  params={{ userId: r.id }}
                  className="flex items-center justify-center rounded-md border border-border"
                >
                  Edit
                </Link>
                <button
                  disabled={busy}
                  onClick={() => void runAction(() => exportOne(r.id, "json"))}
                  className="rounded-md border border-border"
                >
                  JSON
                </button>
                <button
                  disabled={busy}
                  onClick={() => void runAction(() => exportOne(r.id, "csv"))}
                  className="rounded-md border border-border"
                >
                  CSV
                </button>
                <button
                  disabled={busy}
                  onClick={() => void runAction(() => remove(r.id))}
                  className="rounded-md border border-destructive/30 text-destructive"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No profiles match your search.
            </p>
          )}
        </div>
      )}
      <div
        role="region"
        aria-label="Member profile spreadsheet; scroll horizontally for more columns"
        tabIndex={0}
        className={`${tableView ? "block" : "hidden sm:block"} overflow-x-auto rounded-lg border border-border bg-card`}
      >
        <table className="w-full min-w-[900px] text-sm">
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
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      Edit
                    </Link>
                    <button
                      disabled={busy}
                      onClick={() => void runAction(() => exportOne(r.id, "json"))}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      JSON
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void runAction(() => exportOne(r.id, "csv"))}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                    >
                      CSV
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void runAction(() => remove(r.id))}
                      className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No profiles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
