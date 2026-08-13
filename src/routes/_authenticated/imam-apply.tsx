import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { applyAsImam, getMyImamApplication } from "@/lib/imam.functions";
import { UK_CITIES_FOR_UI } from "@/lib/imams.functions";

export const Route = createFileRoute("/_authenticated/imam-apply")({
  head: () => ({
    meta: [
      { title: "Apply as an imam — Mithaq" },
      {
        name: "description",
        content: "Imams can apply to review local pairings and arrange wali-attended meetings.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImamApply,
});

function ImamApply() {
  const apply = useServerFn(applyAsImam);
  const fetchApp = useServerFn(getMyImamApplication);

  const [existing, setExisting] = useState<Awaited<ReturnType<typeof getMyImamApplication>>>(null);
  const [form, setForm] = useState({
    name: "",
    mosque: "",
    city: "",
    postcode: "",
    languages: "",
    phone: "",
    email: "",
    credentials: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchApp()
      .then(setExisting)
      .catch(() => setExisting(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apply({
        data: {
          name: form.name,
          mosque: form.mosque || null,
          city: form.city,
          postcode: form.postcode || null,
          languages: form.languages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          phone: form.phone || null,
          email: form.email,
          credentials: form.credentials || null,
          message: form.message || null,
        },
      });
      setDone(true);
      setExisting(await fetchApp());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit application");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
        <h1 className="mt-6 text-3xl text-foreground">Apply as a Mithaq imam</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Approved imams get their own dashboard to review pairings local to them, approve or
          decline them, arrange wali-attended meetings and message both families. Our team reviews
          every application and will arrange a meeting with you before approval.
        </p>

        {existing && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm">
            <p className="font-medium text-foreground">
              Your application status: <span className="capitalize">{existing.status}</span>
            </p>
            {existing.admin_notes && (
              <p className="mt-1 text-muted-foreground">
                Note from Mithaq: {existing.admin_notes}
              </p>
            )}
            {existing.status === "approved" && (
              <Link
                to="/imam"
                className="mt-3 inline-block rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Open imam dashboard
              </Link>
            )}
          </div>
        )}

        {!done && (
          <form
            onSubmit={submit}
            className="mt-8 space-y-3 rounded-2xl border border-border bg-card p-6"
          >
            <Field label="Full name" value={form.name} onChange={set("name")} required />
            <Field label="Mosque / institution" value={form.mosque} onChange={set("mosque")} />
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">City</span>
              <select
                required
                value={form.city}
                onChange={set("city")}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {UK_CITIES_FOR_UI.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Postcode" value={form.postcode} onChange={set("postcode")} />
            <Field
              label="Languages (comma separated)"
              value={form.languages}
              onChange={set("languages")}
            />
            <Field label="Phone" value={form.phone} onChange={set("phone")} />
            <Field label="Email" type="email" value={form.email} onChange={set("email")} required />
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Qualifications / ijazah
              </span>
              <textarea
                value={form.credentials}
                onChange={set("credentials")}
                rows={3}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Anything else
              </span>
              <textarea
                value={form.message}
                onChange={set("message")}
                rows={3}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit application"}
            </button>
          </form>
        )}

        {done && (
          <p className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-sm text-foreground">
            Jazak Allah khayr — your application has been received. We’ll contact you to arrange a
            meeting before granting access.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
