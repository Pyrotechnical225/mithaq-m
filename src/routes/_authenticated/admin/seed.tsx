import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  deleteExampleUsers,
  seedExampleImams,
  seedExampleUsers,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/seed")({
  head: () => ({ meta: [{ title: "Seed data — Admin" }, { name: "robots", content: "noindex" }] }),
  component: SeedPage,
});

function SeedPage() {
  const doSeedImams = useServerFn(seedExampleImams);
  const doSeedUsers = useServerFn(seedExampleUsers);
  const doDeleteUsers = useServerFn(deleteExampleUsers);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} — ${m}`, ...l]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const r = await fn();
      push(`${label}: ${JSON.stringify(r)}`);
    } catch (e) {
      push(`${label} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-foreground">Seed & demo data</h1>
      <p className="text-sm text-muted-foreground">
        Populate the app with fictional example profiles and imams so you can test matching,
        the imam finder, and the admin flows without waiting for real users.
      </p>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg text-foreground">Example imams</h2>
          <p className="text-xs text-muted-foreground">
            Adds 8 fictional imams across major UK cities. Idempotent — running it twice is safe.
          </p>
        </div>
        <button disabled={busy} onClick={() => run("Seed imams", doSeedImams)}
          className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          Seed example imams
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-lg text-foreground">Example users</h2>
          <p className="text-xs text-muted-foreground">
            Creates 6 auto-confirmed users with full survey answers and UK locations. Their
            emails all end in <code>@mithaq.demo</code>. Default password: <code>Example123!</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => run("Seed users", doSeedUsers)}
            className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            Seed example users
          </button>
          <button disabled={busy} onClick={() => {
            if (!confirm("Delete every @mithaq.demo user? This cannot be undone.")) return;
            run("Delete example users", doDeleteUsers);
          }}
            className="rounded-full border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60">
            Delete all example users
          </button>
        </div>
      </section>

      {log.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground">Activity</h3>
          <ul className="mt-3 space-y-1 text-xs font-mono">
            {log.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
