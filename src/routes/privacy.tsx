import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy notice — Mithaq" },
      {
        name: "description",
        content: "How Mithaq uses, protects, retains, exports, and deletes member information.",
      },
    ],
  }),
  component: PrivacyNotice,
});

const retentionRows = [
  ["Incomplete accounts", "12 months after the last account activity"],
  [
    "Compatibility results",
    "12 months after they are superseded, unless the account is deleted sooner",
  ],
  ["Introductions and family messages", "24 months after the introduction closes"],
  ["Safety reports and admin audit history", "Up to 6 years for safeguarding and accountability"],
  ["Payment and accounting records", "Up to 7 years where UK tax or accounting rules require it"],
  [
    "Deleted account backups",
    "Removed from active systems promptly and from backups within 30 additional days",
  ],
] as const;

function PrivacyNotice() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <section className="border-b border-border bg-card">
          <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Privacy notice · version {PRIVACY_NOTICE_VERSION}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">
              Your information stays part of a private process.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
              This notice explains what Mithaq collects, why it is used, who supports the service,
              and the controls available to every member.
            </p>
            <div className="mt-7 border-l-4 border-gold bg-gold/10 p-4 text-sm leading-6 text-foreground">
              Mithaq is currently operating as a controlled pilot for invited members. The privacy
              controls described here are active, and the formal controller contact details and
              retention wording remain subject to UK privacy-law review before wider public access.
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-4xl space-y-12 px-5 py-12 sm:px-6 sm:py-16">
          <NoticeSection title="What Mithaq collects">
            <ul className="list-disc space-y-2 pl-5">
              <li>Account identity, verified email, profile name, and security information.</li>
              <li>
                Survey answers about religious practice, values, family expectations, and goals.
              </li>
              <li>Privacy choices, consent timestamps, blocks, reports, and account visibility.</li>
              <li>
                Compatibility scores, introduction decisions, imam reviews, and family messages.
              </li>
              <li>
                Meeting-package and membership payment status; full card details stay with Stripe.
              </li>
              <li>Operational logs needed to diagnose errors and protect the service.</li>
            </ul>
          </NoticeSection>

          <NoticeSection title="Why the information is used">
            <p>
              Mithaq uses member data to operate private matchmaking, apply the fixed compatibility
              rubric, support human imam review, arrange family-involved meetings, provide safety
              controls, process payments, and meet legal obligations. Compatibility results support
              a decision; they do not make a final introduction automatically.
            </p>
          </NoticeSection>

          <NoticeSection title="Compatibility processing and AI review">
            <p>
              Compatibility scoring begins only after an adult member accepts this notice and gives
              explicit compatibility consent. The fixed Mithaq rubric remains the main score. When
              separately consented, anonymised multiple-choice answers may be sent to an AI service
              provider for a limited secondary review. Names, contact details, account IDs, and
              free-text answers are excluded, and the request asks the provider not to store model
              input.
            </p>
            <p>
              Consent can be withdrawn in Privacy & settings. Withdrawal stops future processing; it
              does not invalidate processing already completed before withdrawal.
            </p>
          </NoticeSection>

          <NoticeSection title="Service providers">
            <ul className="list-disc space-y-2 pl-5">
              <li>Supabase hosts the database and authentication service.</li>
              <li>
                Vercel hosts the web application, functions, analytics, and performance metrics.
              </li>
              <li>
                An AI service provider is used only for the consented, bounded compatibility review
                described above.
              </li>
              <li>Stripe processes payments after the relevant member and imam approvals.</li>
            </ul>
            <p>
              Provider agreements, international-transfer safeguards, and the subprocessor list are
              reviewed as part of Mithaq’s ongoing privacy governance.
            </p>
          </NoticeSection>

          <NoticeSection title="Retention schedule">
            <div className="space-y-3 sm:hidden">
              {retentionRows.map(([record, period]) => (
                <div key={record} className="rounded-md border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">{record}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{period}</p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto border-y border-border sm:block">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Record</th>
                    <th className="px-4 py-3">Target retention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {retentionRows.map(([record, period]) => (
                    <tr key={record}>
                      <th className="px-4 py-3 font-medium text-foreground">{record}</th>
                      <td className="px-4 py-3 text-muted-foreground">{period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm">
              These are controlled-pilot operational targets. Legal holds, safeguarding duties,
              chargeback evidence, or statutory rules may require a longer period, which must be
              documented.
            </p>
          </NoticeSection>

          <NoticeSection title="Your controls and rights">
            <p>
              Signed-in members can hide or pause a profile, limit anonymous fields, block a member,
              report a concern, download a structured copy of their data, withdraw future
              compatibility consent, and delete their account after a recent sign-in.
            </p>
            <p>
              UK data-protection rights can also include access, correction, erasure, restriction,
              objection, portability, and a review of significant automated processing. Mithaq’s
              formal controller contact and ICO complaint details will be published before the
              controlled pilot opens beyond invited members.
            </p>
            <Link
              to="/settings"
              className="inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Open my privacy controls
            </Link>
          </NoticeSection>

          <NoticeSection title="Security and safeguarding">
            <p>
              Sensitive trust records are not directly exposed to member clients. Administrator
              actions require multi-factor authentication and are recorded in append-only audit
              history. Imam access is limited to verified, active imam accounts. No online service
              can promise absolute security; suspected incidents should be reported through the
              signed-in safety controls while the public contact route is finalised.
            </p>
          </NoticeSection>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function NoticeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border pt-8 sm:grid-cols-[14rem_1fr] sm:gap-8">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="space-y-4 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}
