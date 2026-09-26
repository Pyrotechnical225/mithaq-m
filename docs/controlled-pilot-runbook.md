# Mithaq controlled-pilot runbook

Use this runbook for a small, supervised cohort before any public launch. It does not authorize a production promotion, a real charge, or the use of real member data in testing.

## Owners

Assign one named person to each role before admitting pilot members:

- Product owner: decides whether the pilot pauses or continues.
- Safeguarding owner: reviews member reports and emergency concerns.
- Imam operations owner: assigns reviews and monitors meeting arrangements.
- Payment owner: monitors Stripe events, failed checkouts, refunds, and reconciliation.
- Technical owner: monitors deployments, runtime errors, Auth, and database health.

One person may hold more than one role, but every role must have a reachable owner and backup contact.

## Before the pilot

1. Open **Admin → Pilot readiness** with an MFA-verified admin session.
2. Resolve every blocker. Review every warning and record an explicit decision.
3. Confirm the preview commit and Supabase project are the intended pilot targets.
4. Use Stripe test mode. Confirm the restricted key and webhook signing secret belong to the same Stripe test account.
5. Enable Supabase leaked-password protection if the project plan supports it.
6. Confirm at least one verified, active imam has completed MFA and can open the imam workspace.
7. Confirm the privacy notice, safeguarding route, support contact, refund policy, and incident contacts are ready for the pilot cohort.
8. Do not promote a preview to public Vercel production without explicit owner approval.

## Required rehearsal

Use fictional test accounts and Stripe test payment methods only.

| Flow                              | Expected result                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Create account and verify email   | Member reaches the dashboard with no unauthorized-token message.                                            |
| Survey skips and required answers | Optional questions can be skipped; submission highlights required unanswered questions.                     |
| Privacy consent                   | Compatibility processing requires current, explicit consent and discoverable status.                        |
| Suitable score                    | A score of 70% or more enters a private imam review queue.                                                  |
| Imam review                       | Only an assigned, verified, MFA-authenticated imam can approve or decline.                                  |
| Anonymous introduction            | Names, contact details, and Auth UUIDs remain hidden from both members.                                     |
| Independent responses             | One acceptance does not reveal the other member's response; mutual acceptance opens packages.               |
| Concurrent package clicks         | One member/pairing has no more than one live Checkout Session.                                              |
| Stripe test payment               | Amount, currency, Session state, pairing state, responses, and block state are validated before fulfilment. |
| Webhook replay                    | A duplicate event is processed at most once; a failed event remains visible and can be retried.             |
| Meeting scheduling                | Scheduling opens only after both test payments and respects the smaller shared allowance.                   |
| Block/report                      | Blocking closes unsafe interaction; a report appears in the MFA-protected safety queue.                     |

Record the date, preview URL, commit, testers, result, and evidence for each rehearsal. Do not place passwords, TOTP secrets, API keys, raw access tokens, or full member exports in evidence.

## Daily pilot routine

- Review **Admin → Pilot readiness**, **Payments**, **Safety reports**, and the introduction queue.
- Investigate every failed webhook or inconsistent payment state before arranging a meeting.
- Review open reports before admitting more pilot members.
- Check Vercel runtime errors and Supabase Auth/database logs.
- Keep the cohort small enough for the named owners to review every introduction and report promptly.

## Pause conditions

Pause new invitations and payment attempts when any of these occur:

- member identity or contact details appear before mutual acceptance;
- an unverified or non-MFA imam can access private member data;
- payment is fulfilled with an incorrect amount, currency, member, package, or pairing state;
- a webhook failure cannot be reconciled;
- a safeguarding report cannot be reviewed promptly;
- repeated authentication failures or unauthorized-token messages appear;
- a suspected secret, token, or personal-data exposure occurs.

## Incident response

1. Stop admitting new pilot members and stop starting new payments.
2. Preserve logs and event references without copying secrets or unnecessary personal data.
3. Record the affected deployment, time window, routes, and known accounts.
4. Rotate exposed credentials immediately and review provider access logs.
5. For payment incidents, reconcile the Stripe test/live mode, Session, PaymentIntent, amount, and Mithaq purchase row before any refund or retry.
6. For privacy or safeguarding incidents, notify the named owner and follow the organisation's legal and safeguarding process.
7. Deploy a fix to a protected preview, repeat the full affected flow, then obtain explicit approval before promotion.

## Rollback

- Keep the last known-good Vercel production deployment unchanged while preview verification is incomplete.
- If a promoted release regresses, pause pilot activity and use Vercel's deployment history to restore the last approved production deployment.
- Database migrations in this roadmap are additive. Do not drop payment, audit, consent, report, or event ledgers as a rollback shortcut.
- Prefer a forward fix for schema problems. Any data correction must be scoped, reviewed, auditable, and backed up first.

## Pilot completion

The pilot can move to a broader rollout only when:

- every automated blocker is clear;
- all required rehearsals pass on the release candidate;
- open payment discrepancies and safeguarding reports are resolved;
- the product, safeguarding, imam, payment, and technical owners approve;
- production environment variables and provider modes have been checked independently;
- public-production promotion is explicitly authorized.
