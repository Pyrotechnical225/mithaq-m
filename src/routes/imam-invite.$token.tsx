import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { completeImamInvitation, getImamInvitation } from "@/lib/imam-referrals.functions";

export const Route = createFileRoute("/imam-invite/$token")({
  head: () => ({
    meta: [
      { title: "Complete your imam account — Mithaq" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ImamInvitationPage,
});

function ImamInvitationPage() {
  const { token } = Route.useParams();
  const getInvitation = useServerFn(getImamInvitation);
  const completeInvitation = useServerFn(completeImamInvitation);
  const [invitation, setInvitation] = useState<Awaited<
    ReturnType<typeof getImamInvitation>
  > | null>(null);
  const [form, setForm] = useState({
    title: "Imam",
    mosque: "",
    city: "",
    postcode: "",
    phone: "",
    languages: "English",
    credentials: "",
    password: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getInvitation({ data: { token } })
      .then(setInvitation)
      .catch(() => setInvitation({ valid: false }));
  }, [getInvitation, token]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  if (invitation === null) {
    return <PageMessage title="Checking your invitation…" body="Please wait a moment." />;
  }
  if (!invitation.valid) {
    return (
      <PageMessage
        title="This invitation is no longer available"
        body="It may have expired or already been used. Please contact the Mithaq administrator for a new link."
      />
    );
  }
  if (completed) {
    return (
      <PageMessage
        title="Your imam account is ready"
        body="You can now sign in with the invited email address and the password you created."
        action={
          <Link
            to="/auth"
            className="rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground"
          >
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <Link to="/" className="font-display text-xl text-foreground">
          Mithaq
        </Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Approved imam invitation
        </p>
        <h1 className="mt-2 text-3xl text-foreground">Complete your imam account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcome, {invitation.name}. Confirm your professional information and create a secure
          password.
        </p>

        <form
          className="mt-8 grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            if (form.password !== form.confirmPassword) {
              setError("The passwords do not match");
              return;
            }
            setBusy(true);
            try {
              await completeInvitation({
                data: {
                  token,
                  password: form.password,
                  title: form.title,
                  mosque: form.mosque || null,
                  city: form.city,
                  postcode: form.postcode || null,
                  phone: form.phone || null,
                  languages: form.languages
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  credentials: form.credentials || null,
                },
              });
              setCompleted(true);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not create the account");
            } finally {
              setBusy(false);
            }
          }}
        >
          <ReadOnlyField label="Full name" value={invitation.name} />
          <ReadOnlyField label="Email address" value={invitation.email} />
          <Field
            label="Title"
            value={form.title}
            onChange={(value) => update("title", value)}
            maxLength={80}
          />
          <Field
            label="Mosque"
            value={form.mosque}
            onChange={(value) => update("mosque", value)}
            maxLength={160}
          />
          <Field
            label="City"
            value={form.city}
            onChange={(value) => update("city", value)}
            required
            maxLength={80}
          />
          <Field
            label="Postcode"
            value={form.postcode}
            onChange={(value) => update("postcode", value)}
            maxLength={20}
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(value) => update("phone", value)}
            type="tel"
            maxLength={40}
          />
          <Field
            label="Languages (comma-separated)"
            value={form.languages}
            onChange={(value) => update("languages", value)}
            required
          />
          <label className="text-sm text-foreground sm:col-span-2">
            Qualifications and experience
            <textarea
              rows={4}
              maxLength={2000}
              value={form.credentials}
              onChange={(event) => update("credentials", event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5"
            />
          </label>
          <Field
            label="Create password"
            value={form.password}
            onChange={(value) => update("password", value)}
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          <Field
            label="Confirm password"
            value={form.confirmPassword}
            onChange={(value) => update("confirmPassword", value)}
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <div className="sm:col-span-2">
            <button
              disabled={busy}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Creating account…" : "Create imam account"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="text-sm text-foreground">
      {label}
      <input
        {...props}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2.5"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-sm text-foreground">
      {label}
      <input
        readOnly
        value={value}
        className="mt-1.5 w-full rounded-xl border border-input bg-muted px-3 py-2.5 text-muted-foreground"
      />
    </label>
  );
}

function PageMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </main>
  );
}
