import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BrandName } from "@/components/BrandName";
import { EmailNotificationSettings } from "@/components/EmailNotificationSettings";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, getMyPrivacy, updateMyPrivacy } from "@/lib/privacy.functions";
import {
  exportMyData,
  getMyTrustSettings,
  listMyBlocks,
  unblockMember,
  withdrawCompatibilityConsent,
} from "@/lib/trust.functions";

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
  const fetchTrust = useServerFn(getMyTrustSettings);
  const fetchBlocks = useServerFn(listMyBlocks);
  const exportData = useServerFn(exportMyData);
  const withdrawConsent = useServerFn(withdrawCompatibilityConsent);
  const unblock = useServerFn(unblockMember);
  const [p, setP] = useState<Privacy | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [trust, setTrust] = useState<Awaited<ReturnType<typeof getMyTrustSettings>> | null>(null);
  const [blocks, setBlocks] = useState<Awaited<ReturnType<typeof listMyBlocks>>>([]);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPrivacy(), fetchTrust(), fetchBlocks()])
      .then(([row, trustSettings, blockRows]) => {
        setP({
          visibility: row.visibility as Privacy["visibility"],
          show_location: row.show_location,
          show_occupation: row.show_occupation,
          show_free_text: row.show_free_text,
          reveal_contact_on_mutual: row.reveal_contact_on_mutual,
        });
        setTrust(trustSettings);
        setBlocks(blockRows);
      })
      .catch(() => setLoadError(true));
  }, [fetchBlocks, fetchPrivacy, fetchTrust]);

  const save = async (next: Privacy) => {
    if (saving) return;
    const previous = p;
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    setP(next);
    try {
      await update({ data: next });
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setP(previous);
      setSaveError("Your change was not saved. Please try again.");
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

  const downloadMyData = async () => {
    setAccountMessage("Preparing your private download…");
    try {
      const file = await exportData();
      const url = URL.createObjectURL(new Blob([file.body], { type: file.mime }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setAccountMessage("Your data download is ready.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Your data could not be exported");
    }
  };

  const withdraw = async () => {
    setAccountMessage(null);
    try {
      await withdrawConsent();
      setTrust(await fetchTrust());
      setAccountMessage("Compatibility processing consent was withdrawn for future scoring.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Consent could not be updated");
    }
  };

  const removeBlock = async (blockId: string) => {
    await unblock({ data: { block_id: blockId } });
    setBlocks(await fetchBlocks());
    setAccountMessage(
      "The member was unblocked. New contact still requires the normal Mithaq flow.",
    );
  };

  if (!p)
    return (
      <main
        id="main-content"
        className="mx-auto max-w-lg px-5 py-12 text-center text-muted-foreground"
      >
        <p role="status">
          {loadError
            ? "Settings could not load. Please refresh to try again."
            : "Loading your settings…"}
        </p>
        <Link
          to="/dashboard"
          className="mt-5 inline-flex min-h-11 items-center text-primary underline"
        >
          Back to dashboard
        </Link>
      </main>
    );

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

      <main
        id="main-content"
        className="member-settings mx-auto max-w-4xl space-y-6 px-4 py-7 sm:px-6 sm:py-10"
      >
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground">
          Privacy & settings
        </h1>
        <p className="text-sm text-muted-foreground">
          You control who can see your profile and what information is shared before you approve a
          match.
          {savedAt && <span className="ml-2 text-primary">Saved {savedAt}</span>}
        </p>

        <EmailNotificationSettings />
        {saveError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {saveError}
          </p>
        )}
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Profile visibility</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only <strong>Discoverable</strong> profiles appear in other people's matches.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(["discoverable", "paused", "hidden"] as const).map((v) => (
              <button
                key={v}
                disabled={saving}
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Consent & data rights</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Review recorded choices, download a copy of your Mithaq data, or stop future
                compatibility processing.
              </p>
            </div>
            <Link
              to="/privacy"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Read the privacy notice
            </Link>
          </div>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <dt className="font-medium text-foreground">18+ confirmation</dt>
              <dd className="mt-1 text-muted-foreground">
                {trust?.adult_confirmed_at
                  ? `Recorded ${new Date(trust.adult_confirmed_at).toLocaleDateString()}`
                  : "Not yet recorded"}
              </dd>
            </div>
            <div className="rounded-md border border-border p-4">
              <dt className="font-medium text-foreground">Privacy notice</dt>
              <dd className="mt-1 text-muted-foreground">
                {trust?.privacy_notice_accepted_at
                  ? `Version ${trust.privacy_notice_version} accepted ${new Date(trust.privacy_notice_accepted_at).toLocaleDateString()}`
                  : "Not yet accepted"}
              </dd>
            </div>
            <div className="rounded-md border border-border p-4 sm:col-span-2">
              <dt className="font-medium text-foreground">Compatibility processing</dt>
              <dd className="mt-1 text-muted-foreground">
                {trust?.active_compatibility_consent
                  ? `Active since ${new Date(trust.compatibility_processing_consent_at!).toLocaleDateString()}`
                  : trust?.compatibility_processing_withdrawn_at
                    ? `Withdrawn ${new Date(trust.compatibility_processing_withdrawn_at).toLocaleDateString()}`
                    : "Not yet recorded"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadMyData}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Download my data
            </button>
            {trust?.active_compatibility_consent ? (
              <button
                type="button"
                onClick={withdraw}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                Withdraw future compatibility consent
              </button>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Account security</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add an authenticator app. Multi-factor authentication is required for all admin
                access.
              </p>
            </div>
            <Link
              to="/security"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Open security
            </Link>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Blocked members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Blocked pairings are hidden and direct messaging stops. Safety reports remain available
            to authorised reviewers.
          </p>
          {blocks.length ? (
            <div className="mt-4 divide-y divide-border rounded-md border border-border">
              {blocks.map((row) => (
                <div
                  key={row.block_id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Blocked {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBlock(row.block_id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              You have not blocked anyone.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">What matches can see</h2>
          <div className="mt-4 space-y-3">
            <Toggle
              disabled={saving}
              label="Allow my city / country in anonymous match summaries"
              on={p.show_location}
              onChange={(v) => save({ ...p, show_location: v })}
            />
            <Toggle
              disabled={saving}
              label="Allow my occupation in anonymous match summaries"
              on={p.show_occupation}
              onChange={(v) => save({ ...p, show_occupation: v })}
            />
            <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
              Free-text answers are excluded from external AI scoring for every member, regardless
              of this saved legacy preference.
            </p>
            <Toggle
              disabled={saving}
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

        {accountMessage ? (
          <p
            className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground"
            role="status"
          >
            {accountMessage}
          </p>
        ) : null}

        <p className="text-center text-xs text-muted-foreground">{saving && "Saving…"}</p>
      </main>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
  disabled,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4 hover:bg-accent">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className="flex h-11 w-11 shrink-0 items-center rounded-md disabled:opacity-50"
      >
        <span
          className={`block h-6 w-11 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`block h-5 w-5 translate-y-0.5 rounded-full bg-background shadow transition-transform ${
              on ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
