# Mithaq email launch checkpoint — 31 August 2026

## Implemented in the project

- Twenty-nine privacy-safe notification templates cover the member journey,
  introductions, imam review, meetings, payments, three-week check-ins, imam
  applications, imam referrals and administrator support alerts. Every template
  has matching HTML and plain text.
- A responsive email shell matches the website's warm ivory, forest green and
  restrained brass palette. It uses a 600px desktop container, 16px narrow-screen
  gutter, 24px mobile content padding, a 27px mobile heading and a full-width
  54px action on mobile.
- Messages contain no member names, survey answers, compatibility scores, meeting
  locations, family messages, check-in answers, tracking pixels, remote fonts or
  user-provided HTML. Sensitive details remain behind the signed-in website.
- Seven product-notification preference groups are off by default. A user must opt
  in, and the worker rechecks the current email, role, assignment, consent, block,
  suspension, preference and workflow state immediately before sending.
- Event notifications create private outbox jobs. A daily database job creates
  only due, bounded reminders; a one-minute dispatcher invokes the private worker.
  Weekly journeys stop after eight reminders, while each time-sensitive workflow
  stops after two to four reminders.
- The free scheduler uses the existing Supabase project's `pg_cron`, `pg_net` and
  Vault. It does not require a paid Supabase branch or another always-on service.
  It remains inert until both named Vault secrets exist.
- Amazon SES uses a narrowly scoped Vercel OIDC role with temporary credentials.
  No AWS access key is stored in the application.

The complete notification matrix is in
`docs/AUTOMATED_EMAIL_CATALOGUE_2026-08-31.md`.

## Verified locally

- A full isolated Supabase stack replayed every migration from an empty database.
  Auth, RLS, the private outbox, triggers, Cron jobs, Vault-disabled behaviour and
  the reminder lifecycle were exercised without touching production.
- Database lint for `public`, `private` and `mithaq_private` reports no schema
  errors.
- The dispatcher and daily reminder Cron jobs exist with the expected schedules.
  With Vault secrets absent, the dispatcher returns `NULL` and creates no HTTP
  request. Member, anonymous and service roles cannot execute either private job.
- All 55 automated tests pass, including the real local Supabase integration,
  fixed matching invariants, email template/privacy rules, worker eligibility,
  retry safety, mocked SES transport, DKIM/account preflight and reminder caps.
- TypeScript, targeted ESLint and the production bundle pass. `npm audit` reports
  zero known package vulnerabilities.
- Browser checks passed for journey, introduction, imam-review and check-in emails
  at 320px and 640px. Each has no horizontal overflow, one heading, a 54px action,
  HTTPS-only Mithaq links, and no script, image, form or embedded frame.
- The full local gallery contains all 29 HTML and plain-text previews. It is a
  design aid and cannot send email.

These checks are not proof of Gmail, Outlook or Apple Mail rendering, and they do
not claim production delivery.

## Live services checked without changing them

- SES identity `mithaq.uk` was previously observed as verified with successful
  DKIM in Europe (Stockholm), and the owner received and approved one manually sent
  design test.
- A read-only SES account check on 31 August 2026 confirms the account is still
  healthy but in the Europe (Stockholm) sandbox, with a 200-email daily quota and
  one-email-per-second limit. Automated delivery must remain disabled until AWS
  grants production access.
- The connected production Supabase project currently stops at migration
  `20260829191643_payment_attempt_user_index`; none of the notification migrations
  have been applied there.
- Production security advisors currently report two pre-existing warnings: leaked
  password protection is disabled, and the intentionally member-callable
  `respond_to_introduction` RPC is a `SECURITY DEFINER` function. The four tables
  with RLS and no policies are intentionally deny-by-default. These findings are
  not introduced by the notification work and should be reviewed separately.
- The connected Vercel account exposes only the `meethaq` project. A project named
  `store-exquisuite` was not found, so nothing was deleted.

## Production activation sequence

Do not skip or reorder these controls:

1. Wait for SES production access and confirm account sending, domain DKIM,
   account-level bounce/complaint suppression and the final sender address.
2. Review and apply the five notification migrations in timestamp order.
3. Deploy the reviewed application with `EMAIL_NOTIFICATIONS_ENABLED=false`.
4. Set the production-only Vercel values from `.env.example`, including a random
   `NOTIFICATION_CRON_SECRET` of at least 32 characters. Never expose these as
   `VITE_*` variables.
5. Store the same secret in Supabase Vault as
   `mithaq_notification_cron_secret`, and store the exact canonical HTTPS worker
   URL as `mithaq_notification_worker_url`.
6. Confirm the database dispatcher reaches the worker but that the disabled flag
   still prevents claiming a queue job.
7. Opt in only the owner's verified test account, trigger one synthetic workflow,
   and verify the database state, SES message ID, inbox rendering, DKIM/DMARC
   headers and opt-out behaviour.
8. Review every queued production job, then explicitly enable
   `EMAIL_NOTIFICATIONS_ENABLED=true` only after the controlled test passes.

Automated production sending is currently disabled. This checkpoint does not send
email, mutate the production database, deploy the dirty worktree or publish a
commit.

References: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[Vault](https://supabase.com/docs/guides/database/vault),
[SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
