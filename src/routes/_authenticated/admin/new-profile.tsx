import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createProfileAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/new-profile")({
  head: () => ({
    meta: [{ title: "New profile — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: NewProfile,
});

function NewProfile() {
  const navigate = useNavigate();
  const doCreate = useServerFn(createProfileAdmin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { id } = await doCreate({ data: { email, password, display_name: displayName } });
      navigate({ to: "/admin/profiles/$userId", params: { userId: id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <Link to="/admin/profiles" className="text-xs text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <h1 className="mt-1 text-3xl text-foreground">Create a profile</h1>
        <p className="text-sm text-muted-foreground">The user's email will be auto-confirmed.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Display name
          </span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Temporary password
          </span>
          <input
            required
            minLength={8}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create profile"}
        </button>
      </form>
    </div>
  );
}
