import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  deleteProfileAdmin,
  getProfileCompatibilityScoresAdmin,
  getProfileDetail,
  updateProfileAdmin,
} from "@/lib/admin.functions";
import { questions } from "@/lib/survey-questions";

export const Route = createFileRoute("/_authenticated/admin/profiles/$userId")({
  head: () => ({
    meta: [{ title: "Edit profile — Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: EditProfile,
});

function EditProfile() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const fetchDetail = useServerFn(getProfileDetail);
  const fetchCompatibility = useServerFn(getProfileCompatibilityScoresAdmin);
  const doUpdate = useServerFn(updateProfileAdmin);
  const doDelete = useServerFn(deleteProfileAdmin);

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getProfileDetail>> | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [visibility, setVisibility] = useState<"hidden" | "discoverable" | "paused">("hidden");
  const [completed, setCompleted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [compatibility, setCompatibility] = useState<Awaited<
    ReturnType<typeof getProfileCompatibilityScoresAdmin>
  > | null>(null);
  const [compatibilityError, setCompatibilityError] = useState<string | null>(null);

  const load = async () => {
    setCompatibility(null);
    setCompatibilityError(null);
    const [detailResult, compatibilityResult] = await Promise.allSettled([
      fetchDetail({ data: { user_id: userId } }),
      fetchCompatibility({ data: { user_id: userId } }),
    ]);

    if (detailResult.status === "fulfilled") {
      const d = detailResult.value;
      setDetail(d);
      setDisplayName(d.profile?.display_name ?? "");
      setContactEmail(d.profile?.contact_email ?? "");
      setVisibility((d.privacy?.visibility as "hidden" | "discoverable" | "paused") ?? "hidden");
      setCompleted(!!d.survey?.completed);
      setAnswers((d.survey?.answers as Record<string, string>) ?? {});
    }
    if (compatibilityResult.status === "fulfilled") {
      setCompatibility(compatibilityResult.value);
    } else {
      setCompatibilityError(
        compatibilityResult.reason instanceof Error
          ? compatibilityResult.reason.message
          : "Unable to calculate compatibility scores",
      );
    }
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [userId]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await doUpdate({
        data: {
          user_id: userId,
          display_name: displayName,
          contact_email: contactEmail || undefined,
          visibility,
          completed,
          answers,
        },
      });
      await load();
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this profile? This cannot be undone.")) return;
    await doDelete({ data: { user_id: userId } });
    navigate({ to: "/admin/profiles" });
  };

  if (!detail) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <Link
            to="/admin/profiles"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← All profiles
          </Link>
          <h1 className="mt-1 text-3xl text-foreground">{displayName || "Untitled profile"}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.auth?.email} · joined{" "}
            {detail.auth?.created_at ? new Date(detail.auth.created_at).toLocaleDateString() : "—"}
            {detail.auth?.email_confirmed_at ? " · verified" : " · unverified"}
          </p>
        </div>
        <button
          onClick={remove}
          className="rounded-full border border-destructive/40 px-4 py-1.5 text-xs text-destructive hover:bg-destructive/10"
        >
          Delete profile
        </button>
      </div>

      {msg && <p className="text-sm text-primary">{msg}</p>}

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg text-foreground">Identity</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Display name
            </span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Contact email
            </span>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg text-foreground">Privacy</h2>
        <div className="flex flex-wrap gap-3">
          {(["hidden", "discoverable", "paused"] as const).map((v) => (
            <label
              key={v}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm ${visibility === v ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"}`}
            >
              <input
                type="radio"
                className="hidden"
                checked={visibility === v}
                onChange={() => setVisibility(v)}
              />
              {v}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="text-lg text-foreground">Compatibility with other members</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Admin audit view using the fixed Mithaq rubric. It includes every completed
            opposite-gender profile, even below 70%, and excludes admin and imam accounts.
          </p>
        </div>

        {compatibilityError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {compatibilityError}
          </div>
        ) : !compatibility ? (
          <p className="text-sm text-muted-foreground">Calculating compatibility scores…</p>
        ) : !compatibility.eligible ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            {compatibility.reason}
          </p>
        ) : compatibility.scores.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            No completed opposite-gender member surveys are available to compare.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {compatibility.scores.map((candidate) => (
              <Link
                key={candidate.user_id}
                to="/admin/profiles/$userId"
                params={{ userId: candidate.user_id }}
                className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 transition hover:border-primary/30 hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{candidate.display_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      candidate.age ? `Age ${candidate.age}` : null,
                      candidate.city,
                      candidate.gender,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                    candidate.score >= 70
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {candidate.score}%
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg text-foreground">Survey answers</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
            />
            Marked complete
          </label>
        </div>
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="rounded-xl border border-border p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {q.section} · Q{q.id} {q.required && <span className="text-destructive">*</span>}
              </p>
              <p className="mt-1 text-sm text-foreground">{q.question}</p>
              {q.type === "choice" ? (
                <select
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {q.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={q.type === "number" ? "number" : "text"}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
