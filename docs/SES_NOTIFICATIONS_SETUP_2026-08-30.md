# Amazon SES notification foundation — 30 August 2026

## Release status

Updated 31 August 2026: local implementation with email delivery disabled. The
owner created `mithaq.uk` in SES and added the DNS records. Read-only checks now
confirm a verified domain, successful enabled 2048-bit DKIM, and enabled account
suppression for bounces and complaints in `eu-north-1`. The account is healthy but
still in sandbox, with 200 emails/day and 1 email/second. One owner-approved design
test was sent from the SES console and received successfully. No member email was sent,
no live Supabase migration or schedule was applied, and no production/private
deployment or public GitHub push was made. See `SES_EMAIL_LAUNCH_2026-08-31.md`.

Do not enable delivery yet. Settings controls, private check-in response/admin-review
screens, assigned-imam MFA attendance completion and referral review are implemented
locally. Staging migration checks, real authenticated testing and SES setup remain.
The separate global matching allocation/reservation algorithm remains unimplemented.

## Prepared notification coverage

| Recipient      | Event                                                                  | Delivery rule                                                               |
| -------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Member         | Introduction ready, mutual acceptance, introduction closed/unavailable | Generic update linking to the signed-in dashboard                           |
| Member         | Meeting proposed, confirmed, changed/cancelled                         | Current meeting status rechecked before sending                             |
| Member         | Upcoming confirmed meeting                                             | One reminder due 24 hours before; stale reminders cancelled on rescheduling |
| Member         | Verified meeting-package payment                                       | Verified paid state only, not an invoice or replacement for Stripe receipts |
| Member         | Three-week check-in                                                    | Explicitly completed meeting only; one email per member/meeting             |
| Imam           | Pair awaiting review                                                   | Active verified assigned imam only                                          |
| Imam           | Pair ready to schedule; meeting status update                          | Current assignment and scheduling state checked                             |
| Administrator  | New imam referral                                                      | Current admin role checked                                                  |
| Referring imam | Referral reviewed                                                      | Active verified imam account checked                                        |
| Administrator  | Member requested private support                                       | Current admin role; still unreviewed support request only                   |

Email categories are matches, meetings, check-ins, payments, imam/workspace and
administrator alerts.
All are opt-in, default false. There is no marketing email or private-message
content in email. Existing Supabase Auth verification/reset emails are unchanged.

### Three-week timing

- Merely passing the scheduled time does not count as attendance.
- A confirmed past meeting must be explicitly marked completed. Its confirmed
  scheduled time becomes `completed_at`; the delay is not extended if attendance
  is recorded a few days late. Completion and date changes cannot happen together.
- Each check-in is due 21 days later. Its email expires after another seven days.
- A later completed meeting for the same pair supersedes the older pending email.
- Cancelled, blocked, closed, no-longer-mutually-accepted, already-answered and
  not-yet-due check-ins are suppressed before sending.
- Legacy completed meetings are not automatically backfilled with guessed dates.
- A check-in never changes matching status or discloses one person's answer to the
  other member or imam. Only its owner and MFA-protected administrators can read it.
  Owners can submit once, after it is due. Administrators can mark it reviewed;
  this records review, not a promise that anyone has been contacted.

## Files and safeguards

- `notification-email-policy.ts`: fixed private text/HTML templates and allowed kinds.
- `ses-email.server.ts`: SES v2 transport, one recipient per message, no SDK retries.
- `notification-dispatch.ts`: bounded claim/send/result lifecycle.
- `notification-email-worker.server.ts`: recipient opt-in, verified Auth email,
  active account, role, assignment, blocks, meeting and current-state checks.
- `notification-database.types.ts`: local types for the unapplied migration.
- `/api/internal/notification-emails`: POST-only endpoint, exact separate Bearer
  secret of at least 32 characters; no arbitrary recipient/template supplied by callers.
- `20260830145528_ses_notification_outbox.sql`: private outbox, own-preferences RLS,
  own-check-in read RLS, transactional event triggers and atomic SKIP LOCKED claim.
- `20260830190000_notification_member_workflows.sql`: private answer RPC, atomic
  assigned-imam/MFA completion with audit record, and admin review metadata.
- `member-notifications.functions.ts`, `EmailNotificationSettings`, `MeetingCheckIns`
  and `/admin/check-ins`: ownership-safe controls, private responses and admin review.
- `/imam` referral tab and `/admin/referrals`: existing-table pending referrals and
  compare-and-set admin decisions. Approval does not grant account access.

No private names, survey answers, scores, family messages, addresses or email bodies
are stored in the queue. Recipient address comes from verified Supabase Auth, never
editable profile contact information. Every send checks SES suppression first.
Provider failure does not run inside the member's match/meeting transaction.

Database constraints can still reject invalid event writes. This migration needs a
staging rehearsal against the complete current schema before production approval.

`accepted` means SES returned a message ID, **not** that an inbox received the email.
Ambiguous network outcomes or expired processing claims become `unknown`; they are
never automatically resent. Safe pre-send failures and explicit throttling retry
with backoff, at most five claims and never beyond the event's expiry.

## Information needed from the owner

1. AWS account access through an authenticated AWS console/approved credential flow.
2. Sender selected: `no-reply@mithaq.uk`, verified domain `mithaq.uk`.
3. Monitored reply-to mailbox and the SES region already used, if any.
4. The verified owner test mailbox is ready for controlled tests. Do not use it
   as an operational alert address without separate approval.

Do not paste AWS access keys, passwords or session tokens into chat. Do not use an
AWS root access key. No AWS connector, CLI or local AWS credentials were available;
the signed-in browser can be used for setup once a sender identity is selected.

## AWS setup before activation

1. Verify the chosen sending identity in the selected SES region. Publish the
   exact domain/DKIM DNS records returned by AWS; review SPF/DMARC alignment and
   custom MAIL FROM only for the selected domain, preserving existing email records.
2. Check production access in that region. Sandbox accounts cannot send ordinary
   notifications to arbitrary unverified members. This worker refuses sandbox sends.
3. Enable account suppression for **BOUNCE** and **COMPLAINT**. Preserve suppression
   entries; never clear them to make a test pass. Configure feedback monitoring and
   operational alerts; SES account suppression is not a delivery-status webhook.
4. Provision server-only least-privilege credentials: `ses:SendEmail` restricted to
   the verified identity/from address; `ses:GetEmailIdentity` for the sender domain,
   `ses:GetAccount` and
   `ses:GetSuppressedDestination` with appropriate supported read resources. Prefer
   short-lived role credentials with a renewal mechanism where the host supports it.
   `docs/SES_IAM_POLICY.example.json` is an unapplied example; replace
   `AWS_ACCOUNT_ID` with the actual account ID only when provisioning. It grants no
   IAM, DNS, billing, recipient-list or suppression-editing permissions. The mailer
   now rechecks domain verification and successful DKIM before claiming any job.
5. Test with SES simulator/owner-approved verified test addresses using a separate
   test procedure. Do not weaken production guards or send to real members for QA.

Official references:

- [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Account suppression](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html)
- [SendEmail API](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html)

## Server configuration

`.env.example` contains names only. Set secrets in the selected host's secure
runtime configuration, not in git, browser variables, previews or logs.

| Variable                                     | Purpose                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| `EMAIL_NOTIFICATIONS_ENABLED`                | Keep `false` until all launch gates pass               |
| `EMAIL_DEPLOYMENT_SCOPE`                     | Must equal `production` for live delivery              |
| `AWS_REGION`                                 | Same region as the verified identity/production access |
| `AWS_ROLE_ARN`                               | SES-only IAM role assumed through Vercel OIDC           |
| `SES_FROM_EMAIL`                             | Verified bare mailbox, without display-name formatting |
| `SES_REPLY_TO_EMAIL`                         | Optional monitored reply-to mailbox                    |
| `PUBLIC_SITE_URL`                            | Trusted production HTTPS origin only                   |
| `NOTIFICATION_CRON_SECRET`                   | Separate random secret, at least 32 characters         |

The IAM trust policy is restricted to the `meethaq` production environment, and
the application exchanges Vercel's OIDC token for one-hour AWS credentials. No
long-lived AWS access key is stored. Vercel preview/development environments are
rejected even if enabled accidentally.
For other hosts, keep the explicit deployment scope and enable flag separated by
environment. None of these credentials may use a `VITE_` prefix.

## Remaining implementation and launch gates

- Verify the implemented `/settings#email-notifications`, `/dashboard#check-ins`,
  `/admin/check-ins` and assigned-imam attendance action against staged real accounts.
  No existing member is silently opted in; clients cannot choose a completion time.
- Verify referral submission and `/admin/referrals` decisions against staged accounts.
  The admin email now points to the referral review page.
- Decide retention for check-in notes and queue history; account exports now include
  own preferences and check-ins. Verify account deletion against staging; FK deletion
  already cascades, while audit records follow the existing immutable audit policy.
- Rehearse migration in isolated staging, regenerate schema types, run Supabase
  security/performance advisors, and test current match/meeting/payment paths.
- Perform live SES transport/feedback tests with synthetic records and the authorized
  test mailbox. Verify opt-out, bounce/complaint, delay, suppression, and unknown-result handling.
- Add an MFA-protected operational queue view and alert on `failed`/`unknown` jobs,
  authentication failure, backlog or account suppression problems.
- With release approval, configure a product scheduler to POST to the endpoint
  once per minute initially (one recipient per call). Use a secret manager/Vault
  reference for the Bearer token, never a plaintext SQL migration. No Codex reminder
  or local desktop process is a substitute for the production scheduler.
- Review pre-activation backlog, skipping obsolete jobs rather than unexpectedly
  notifying members about old events. Do not blindly backfill prior notifications.
- Activate only the approved production target, observe a controlled event, and
  record accepted-versus-delivered evidence. Disable delivery to stop sending;
  do not drop the queue/tables as a rollback.

## Verification performed

- 51 offline tests pass: existing matching/pilot regressions, actual migrations
  execution in in-memory PostgreSQL, private grants/RLS, trigger timing, atomic claim
  behavior, opt-outs, duplicate/ambiguous-send handling, recipient eligibility and
  current assignment/state checks. Tests sent no network email or live member writes.
- Build, TypeScript and targeted lint passed during development; repeat after edits.
- Static browser output did not include the SES credentials/configuration identifiers;
  provider code remains in server output.

Verified separately: one manual SES-console design test was received by the owner.
Not verified: the production app's SES SDK runtime, feedback setup,
live Supabase migrations, scheduler or a complete live email journey. New UI was
exercised with isolated fictional fixtures, not a real authenticated deployment.
Passing offline tests does not establish production readiness.
