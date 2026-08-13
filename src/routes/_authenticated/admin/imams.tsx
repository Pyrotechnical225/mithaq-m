import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  createImam,
  deleteImam,
  seedExampleImams,
  updateImam,
  ADMIN_UK_CITIES,
} from "@/lib/admin.functions";
import { listImams } from "@/lib/imams.functions";
import { useAsyncResource } from "@/lib/use-async-resource";
import { EmptyRow, ErrorState, TableSkeleton } from "@/components/admin/async-states";

export const Route = createFileRoute("/_authenticated/admin/imams")({
  head: () => ({ meta: [{ title: "Imams — Admin" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>): { add?: boolean } => ({
    add: search.add === true || search.add === "true" ? true : undefined,
  }),
  component: ImamsAdmin,
});

type Imam = Awaited<ReturnType<typeof listImams>>[number];

function ImamsAdmin() {
  const { add: addRequested } = Route.useSearch();
  const fetchAll = useServerFn(listImams);
  const doCreate = useServerFn(createImam);
  const doUpdate = useServerFn(updateImam);
  const doDelete = useServerFn(deleteImam);
  const doSeed = useServerFn(seedExampleImams);

  const {
    status,
    data: rows,
    error,
    retry,
    reload,
    refreshing,
  } = useAsyncResource<Imam[]>(fetchAll);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Imam | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const empty = {
    name: "",
    title: "Imam",
    mosque: "",
    city: ADMIN_UK_CITIES[0],
    postcode: "",
    phone: "",
    email: "",
    website: "",
    languages: "",
    notes: "",
  };
  const [form, setForm] = useState(empty);

  // Arriving from the overview's "+ Add imam" action puts the cursor in the
  // blank add form rather than dropping the admin at the top of the page.
  useEffect(() => {
    if (!addRequested || status !== "ready") return;
    setEditing(null);
    nameInputRef.current?.focus({ preventScroll: true });
    nameInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [addRequested, status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      mosque: form.mosque.trim() || null,
      city: form.city.trim(),
      postcode: form.postcode.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      languages: form.languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        await doUpdate({ data: { id: editing.id, ...payload } });
        setMsg("Updated.");
      } else {
        await doCreate({ data: payload });
        setMsg("Created.");
      }
      setForm(empty);
      setEditing(null);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  };

  const edit = (r: Imam) => {
    setEditing(r);
    setForm({
      name: r.name ?? "",
      title: r.title ?? "",
      mosque: r.mosque ?? "",
      city: r.city ?? ADMIN_UK_CITIES[0],
      postcode: r.postcode ?? "",
      phone: r.phone ?? "",
      email: r.email ?? "",
      website: r.website ?? "",
      languages: (r.languages ?? []).join(", "),
      notes: r.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (imam: Imam) => {
    if (
      !confirm(
        `Delete ${imam.name}${imam.mosque ? ` (${imam.mosque})` : ""} in ${imam.city}?\n\nThey will be removed from the public imam directory and from the member imam picker. This cannot be undone.`,
      )
    )
      return;
    try {
      await doDelete({ data: { id: imam.id } });
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not delete this imam");
    }
  };

  const seed = async () => {
    try {
      const r = await doSeed();
      setMsg(`Seeded ${r.inserted} example imam(s); ${r.skipped} already existed.`);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not seed example imams");
    }
  };

  if (status === "error") {
    return (
      <ErrorState
        title="The imam directory didn't load"
        message={error}
        onRetry={retry}
        retrying={refreshing}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl text-foreground">Imams directory</h1>
        <button
          onClick={seed}
          className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          Seed example imams
        </button>
      </div>

      <form
        onSubmit={submit}
        className="grid gap-3 rounded-2xl border border-border bg-card p-6 md:grid-cols-2"
      >
        <h2 className="md:col-span-2 text-sm uppercase tracking-widest text-muted-foreground">
          {editing ? `Editing ${editing.name}` : "Add a new imam"}
        </h2>
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          required
          inputRef={nameInputRef}
        />
        <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        <Field
          label="Mosque"
          value={form.mosque}
          onChange={(v) => setForm({ ...form, mosque: v })}
        />
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">City</span>
          <select
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            {ADMIN_UK_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Postcode"
          value={form.postcode}
          onChange={(v) => setForm({ ...form, postcode: v })}
        />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field
          label="Website"
          value={form.website}
          onChange={(v) => setForm({ ...form, website: v })}
        />
        <Field
          label="Languages (comma-separated)"
          value={form.languages}
          onChange={(v) => setForm({ ...form, languages: v })}
        />
        <label className="md:col-span-2 block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        {msg && <p className="md:col-span-2 text-sm text-muted-foreground">{msg}</p>}
        <div className="md:col-span-2 flex gap-2">
          <button className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            {editing ? "Save changes" : "Add imam"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
              className="rounded-full border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {status === "loading" || !rows ? (
        <TableSkeleton rows={5} columns={6} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Mosque</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Languages</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.title}</div>
                  </td>
                  <td className="px-4 py-3 text-foreground">{r.mosque ?? "—"}</td>
                  <td className="px-4 py-3 text-foreground">
                    {r.city}
                    {r.postcode ? `, ${r.postcode}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.phone && <div>{r.phone}</div>}
                    {r.email && <div>{r.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">{(r.languages ?? []).join(", ")}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => edit(r)}
                        className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(r)}
                        className="rounded-full border border-destructive/40 px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <EmptyRow
                  colSpan={6}
                  title="No imams in the directory yet"
                  message="Add one with the form above, or use “Seed example imams” to populate eight fictional imams across UK cities for testing."
                />
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        ref={inputRef}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
