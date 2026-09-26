# Imam workspace design review — 30 August 2026

Status: design prototype ready for user approval. No application implementation,
database migration, public GitHub push or deployment was performed for this revamp.

## Review links

- Preview: https://p.superdesign.dev/draft/a70f3f15-3193-4fcb-a0fb-024ce1f24d53
- Canvas: https://superdesign.dev/teams/29dce69f-9c99-45a7-a962-95c60ad12261/projects/7b7a10d4-7d26-4b78-afb3-36920a51f35f
- Draft version: 3. Header component version: 2.
- Workflow requirements: `MATCHING_IMAM_REVAMP_SPEC_2026-08-30.md`.

## Confirmed referral meaning

An imam submits another imam's name and email. The Mithaq administrator receives
the referral in a review queue and can accept or decline it. This is not a
match-transfer feature. Submission never automatically grants an account or role.
Keep prior referral records; do not expose private admin notes or invitation tokens.

The older implementation is available in git commit `1a359c0`, including
`src/lib/imam-referrals.functions.ts`, `src/components/admin/ImamReferralQueue.tsx`
and `src/routes/_authenticated/imam/refer.tsx`. It is a reference, not code to
blindly restore: its admin MFA checks, private-note exposure, invitation redemption,
permission checks and concurrency behaviour require review before reuse.
Read-only schema inspection confirmed the existing `imam_referrals` table and
pending/approved/declined/invited/redeeming/completed status values. No referral
records or secrets were uploaded to the design service.

## Prototype coverage

- Four tabs: Matches, Meetings, Payments, Referring imams.
- Assigned-pair spreadsheet and row-specific side-by-side profile review.
- Fictional accept confirmation changes the sample to Accepted match; decline
  changes it to Available. Already-decided samples disable another decision.
- Search and its no-results state.
- Meeting details, scheduling form and allowance explanation; payment status is
  read-only and distinguishes unpaid members from paid members.
- Referral form validates name, email and permission before showing a prototype
  acknowledgement. The own-referrals table has review statuses and dates.
- Fixed rules, AI review and combined score are labelled separately.

## Checks actually performed

- Browser opened all four tabs and checked the corrected desktop layout.
- Verified selecting MTH-098 shows Sara/Bilal and the correct sample score, rather
  than retaining the first pair's details.
- Verified both sample acceptance and decline transitions through confirmation.
- Verified an empty referral is invalid and a completed synthetic referral shows
  an explicit no-live-submission acknowledgement.
- Verified scheduling allowance text and paid/unpaid table states.
- JavaScript syntax check and `git diff --check` passed.
- Existing matching/pilot tests: 20 passed using mocked AI responses.

These are prototype and existing-code checks, not proof of the new backend.
The actual allocation algorithm, transactional reservations, live AI connection,
admin referral decisions, cross-imam access boundaries, mobile layout and complete
meeting/payment regressions still require implementation/testing after approval.
Stripe webhook work remains deferred.

## Next gate

Ask the user to approve the four-tab design, or give specific refinements. The
earlier admin member spreadsheet remains in scope. Design approval does not by
itself authorize a new production deployment or public source-code publication.
