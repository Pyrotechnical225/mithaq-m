# Revised matching and imam workspace

Status: requirements/design preparation. Not implemented or deployed.
This supersedes the matching workflow in the earlier admin-spreadsheet proposal.
The requested member spreadsheet remains in scope and must display the new statuses.
Stripe webhook work stays deferred.

## Ownership

- Mithaq's matching engine selects pairs. Imams do not browse candidates and pick a pair.
- Admins operate and audit matching rounds. Do not introduce an unattended scheduled job
  or mutate existing live pairs merely to test the algorithm.
- The assigned verified imam reviews the proposed pair and accepts or declines it.
- Imam acceptance remains separate from each member's private acceptance and payment.

## Member matching status

| Event | Both members' matching status | Eligibility for another pairing |
| --- | --- | --- |
| Eligible, with no active reservation | Available | Yes |
| Matching engine reserves a pair | Matched | No |
| Assigned imam accepts the pair | Accepted match | No |
| Assigned imam declines the pair | Available | Yes, with other candidates |
| A member declines the introduction | Available | Yes, subject to current consent/privacy |

Availability is not the same as discoverability. A hidden, paused, underage, incomplete,
blocked, or non-consenting account must not become matchable just because its reservation
was released. Keep the existing separate privacy settings intact.

Completed meetings do not automatically end a relationship or return members to the pool.
An accepted pair remains reserved until explicitly ended. Preserve existing accepted/payment/
scheduling pairs when migrating; never reset every account to Available.

## Proposed selection rule

1. Load only adult members with valid completed surveys, current consent, discoverable
   profiles, and no active reservation. Exclude operational admin/imam accounts and
   blocked or previously declined pairs.
2. Obtain a successful AI compatibility review before automatic allocation. The current
   app's score is 80% fixed rules plus 20% AI; preserve that weighting unless the user
   explicitly changes it. A rules-only fallback must be labelled and must not silently
   count as a successful AI review for this automatic flow.
3. Rank eligible pairs by their reviewed compatibility score. Preserve the current
   70-point introduction threshold unless the user changes it.
4. Select the highest-scoring remaining pair; reserve both people; repeat for the
   remaining available pool. This is best-available, one-to-one allocation, not a claim
   that every person simultaneously receives their first choice or that the total pool
   score is mathematically optimal. Resolve ties deterministically, prioritising waiting
   time before a stable pair key.
5. Re-check consent, blocks, availability, and score freshness when committing each pair.
   Use one transaction and per-member unique reservations so concurrent rounds cannot
   match the same person twice. A failure reserving either person must roll back both.
6. Assign the pair to a verified imam using the existing assignment rules. If none is
   available, retain an explicit admin assignment queue rather than claiming delivery.

Store scoring version/model, survey-version fingerprints, scored time, decision history,
and reservation ownership. Batch AI reviews with bounded input/output and validate that
every scored candidate has exactly one usable result. Never mix old AI results with
new fixed scores. Declined pair history prevents an immediate rematch loop.

## Four imam tabs

### Matches

- Spreadsheet of assigned algorithm-selected pairs, not a candidate picker.
- Columns: pair reference, member A, member B, compatibility score, member matching status,
  review state, matched date, waiting time, and Review match action.
- Clicking Review match opens two profiles side by side, aligned by survey question.
  Show survey answers and score strengths/considerations needed for that assigned review.
  Do not expose the full member directory or unrelated profiles.
- Actions: Accept match and Decline match, with confirmation, decision note, pending/error
  states and an audit trail. A decision must atomically update the pair and both reservations.
- Accepted match means accepted by the imam, not consent on behalf of either member.

### Meetings

- Spreadsheet of proposed, confirmed, completed, declined and cancelled meetings for
  assigned pairs. Scheduling, wali requirements and paid package limits remain enforced.
- Record completion explicitly; do not infer it from a past date or purchased credits.
- Fix the conflicting `meetups` status constraints before adding completion actions.
- Keep family messaging available in the relevant match/meeting detail after mutual acceptance.

### Payments

- Payment and package status for members in the imam's assigned pairs only.
- Show each member's paid/unpaid state, selected package, shared allowance and remaining
  meetings. Missing data must not display as Paid.
- No card data, secret credentials, refund controls, payouts, or new revenue-sharing rules.
- Existing mutual acceptance and payment verification gates remain unchanged.

### Referring imams

Confirmed by the user: an imam submits another imam's information to the Mithaq administrator
for review and acceptance. This is not a match-transfer feature.

- Reuse the existing `imam_referrals` data model and preserve prior referral records.
- Form: referred imam's full name and email, matching the existing stored fields.
  Require confirmation that the referrer has permission to share the details.
- Submit for admin review; never automatically approve or grant a role from a referral.
- Show only that imam's own referrals in a spreadsheet with name, email, submitted date,
  review status and review date. Do not expose internal admin notes or invitation token hashes.
- Admin dashboard: a separate referrals review queue showing the submitted details and the
  referring imam, with Accept referral / Decline referral actions and an auditable decision.
- Keep acceptance, invitation/onboarding, and granting verified account access separate.
  Do not send invitation emails while generating or testing this design.

## Verification required before release

- Two simultaneous allocation rounds cannot reserve the same member.
- Highest eligible score, ties, no suitable candidates, existing reservations, stale scores,
  declined-pair history, inactive accounts, blocks and withdrawn consent are handled.
- Imam decline releases both members; acceptance keeps both reserved; repeated clicks are safe.
- Only the assigned active verified imam with MFA, or an explicitly authorised admin action,
  can access or decide a pair; alternate pair IDs and cross-imam requests are rejected.
- Member decline and privacy withdrawal do not strand or incorrectly release reservations.
- Real deployment AI smoke test uses synthetic profiles with no member writes.
- Four tabs, table controls, side-by-side layout, keyboard navigation and narrow-screen
  behaviour are browser-tested. Meeting and payment regression checks remain passing.

## Design/release gates

Prepare the revised imam layout in Superdesign with the confirmed referral-tab scope;
obtain design approval before application implementation. The previous admin draft remains
available as a visual reference, not as approval of this new workflow.

No production deploy or public GitHub push is authorised merely by design approval.
