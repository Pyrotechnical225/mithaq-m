import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyEmailPreferences, saveMyEmailPreference } from "@/lib/member-notifications.functions";

const labels = {
  journey: [
    "Journey reminders",
    "A weekly reminder to continue an unfinished survey or privacy step, for up to eight weeks.",
  ],
  matches: ["Matches & introductions", "New introductions, mutual acceptance and journey updates."],
  meetings: [
    "Meeting arrangements",
    "Proposals, confirmations, changes and a reminder before a meeting.",
  ],
  check_ins: [
    "Three-week check-ins",
    "A private invitation and up to two weekly reminders after a completed meeting.",
  ],
  payments: ["Payment updates", "Confirmation when a meeting-package payment is verified."],
  imam: [
    "Imam & admin workspace",
    "Applications, assigned matches, scheduling and referrals, if your account has the relevant role.",
  ],
  admin: [
    "Administrator alerts",
    "Private support requests from members, if your account is an administrator.",
  ],
} as const;

export function EmailNotificationSettings() {
  const fetchPreferences = useServerFn(getMyEmailPreferences);
  const save = useServerFn(saveMyEmailPreference);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyEmailPreferences>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const load = () =>
    fetchPreferences()
      .then((next) => {
        setData(next);
        setFailed(false);
        setMessage("");
      })
      .catch(() => {
        setFailed(true);
        setMessage("Email preferences could not load. Please try again.");
      });
  useEffect(() => {
    void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  return (
    <section
      id="email-notifications"
      className="scroll-mt-24 rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <h2 className="text-lg font-semibold">Email notifications</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Choose updates sent to your verified sign-in email. Emails link to your private account,
        without profile details or messages. Everything is off until you choose it.
      </p>
      {!data && !failed && (
        <p className="mt-4 text-sm" role="status">
          Loading email preferences…
        </p>
      )}
      {data && (!data.available || !data.sendingEnabled) && (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {data.available
            ? "Email delivery is not active yet. You can save your choices now."
            : "Email notifications are being set up. No notifications are being sent."}
        </p>
      )}
      {data?.available && (
        <div className="mt-4 divide-y divide-border">
          {data.preferences.map(({ category, enabled }) => (
            <label key={category} className="flex cursor-pointer items-start gap-3 py-4">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
                onChange={async (event) => {
                  const next = event.target.checked;
                  setBusy(true);
                  setMessage("");
                  setFailed(false);
                  try {
                    await save({ data: { category, enabled: next } });
                    setData((current) =>
                      current
                        ? {
                            ...current,
                            preferences: current.preferences.map((row) =>
                              row.category === category ? { ...row, enabled: next } : row,
                            ),
                          }
                        : current,
                    );
                    setMessage("Email preference saved.");
                  } catch {
                    setFailed(true);
                    setMessage("Your choice was not saved. Please try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <span>
                <span className="block text-sm font-medium">{labels[category][0]}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {labels[category][1]}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-3 text-sm ${failed ? "text-destructive" : "text-primary"}`}
        >
          {message}
        </p>
      )}
      {failed && !data && (
        <button
          onClick={() => void load()}
          className="mt-3 rounded-md border border-border px-4 py-2 text-sm"
        >
          Try again
        </button>
      )}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Turn these off here at any time. Account verification and security emails are separate.
      </p>
    </section>
  );
}
