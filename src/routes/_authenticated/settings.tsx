import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, getMyPrivacy, updateMyPrivacy } from "@/lib/privacy.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [{ title: "Privacy & settings — Mithaq" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

type Privacy = {
  visibility: "discoverable" | "paused" | "hidden";
  show_location: boolean;
  show_occupation: boolean;
  show_free_text: boolean;
  reveal_contact_on_mutual: boolean;
};

function SettingsPage() {
  const navigate = useNavigate();
  const fetchPrivacy = useServerFn(getMyPrivacy);
  const update = useServerFn(updateMyPrivacy);
  const deleteAcct = useServerFn(deleteMyAccount);
  const [p, setP] = useState<Privacy | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrivacy().then((row) => {
      setP({
        visibility: row.visibility as Privacy["visibility"],
        show_location: row.show_location,
        show_occupation: row.show_occupation,
        show_free_text: row.show_free_text,
        reveal_contact_on_mutual: row.reveal_contact_on_mutual,
      });
    });
  }, [fetchPrivacy]);

  const save = async (next: Privacy) => {
    setSaving(true);
    setP(next);
    try {
      await update({ data: next });
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  };

  const wipe = async () => {
    setDeleteError(null);
    try {
      await deleteAcct();
      await supabase.auth.signOut();
      navigate({ to: "/" });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Account deletion could not start");
    }
  };

  if (!p) return <div className="p-16 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-[4.5rem] max-w-4xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <BrandName className="text-xl" />
            <span className="border-l border-border pl-3 font-arabic text-lg text-primary">
              ميثاق
            </span>
          </Link>
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Back to dashboard
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Privacy & settings
        </h1>
        <p className="text-sm text-muted-foreground">
          You control who can see your profile and what information is shared before you approve a
          match.
          {savedAt && <span className="ml-2 text-primary">Saved {savedAt}</span>}
        </p>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Profile visibility</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only <strong>Discoverable</strong> profiles appear in other people's matches.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(["discoverable", "paused", "hidden"] as const).map((v) => (
              <button
                key={v}
                onClick={() => save({ ...p, visibility: v })}
                className={`rounded-md border px-4 py-3 text-sm capitalize ${
                  p.visibility === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">What matches can see</h2>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Allow my city / country in anonymous match summaries"
              on={p.show_location}
              onChange={(v) => save({ ...p, show_location: v })}
            />
            <Toggle
              label="Allow my occupation in anonymous match summaries"
              on={p.show_occupation}
              onChange={(v) => save({ ...p, show_occupation: v })}
            />
            <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              Free-text answers are excluded from external AI scoring for every member, regardless
              of this saved legacy preference.
            </p>
            <Toggle
              label="Reveal my contact email after both sides accept (off keeps it private)"
              on={p.reveal_contact_on_mutual}
              onChange={(v) => save({ ...p, reveal_contact_on_mutual: v })}
            />
          </div>
        </section>

        <section className="rounded-lg border border-destructive/40 bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Delete my account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Removes your profile, all survey answers, matches, and interests permanently. This
            cannot be undone.
          </p>
          {confirming ? (
            <div className="mt-4 flex gap-3">
              <button
                onClick={wipe}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
              >
                Yes, delete everything
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="mt-4 rounded-md border border-destructive px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              Delete my account
            </button>
          )}
          {deleteError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          )}
        </section>

        <p className="text-center text-xs text-muted-foreground">{saving && "Saving…"}</p>
      </main>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4 hover:bg-accent">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
