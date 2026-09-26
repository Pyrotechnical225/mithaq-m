# Mithaq mobile redesign — review and remaining scope

Status: direction approved by the owner and implemented in the local application.
Not deployed. Authenticated UI checks use isolated fictional fixtures, not live
accounts. Production remains unchanged; complete authenticated release testing is
still required before describing the whole site as verified.

## Application changes now implemented

- Shared accessible mobile drawer for public, member and admin navigation, with
  scroll containment, focus management, 44px controls and closing on desktop resize.
- Compact phone headers, calmer homepage hierarchy/spacing, a two-column footer,
  readable guidance/privacy pages, keyboard-friendly sign-in and 16px phone inputs.
- Member journey uses a legible two-by-two phone progress tracker; the survey keeps
  progressive reveal, history, skipping and validation with improved mobile spacing.
- Privacy, membership, security, verification and imam-application layouts adjusted.
  Settings save failures now report the error and restore the previous choice.
- Admin member profiles have labelled phone records and an optional contained
  spreadsheet, preserving search, edit/export/delete actions and confirmations.
  Other wide admin tables remain contained scroll regions, not squeezed columns.
- Imam workspace has Matches, Meetings, Payments and Referring imams tabs, searchable
  records/spreadsheet view, expandable two-column member summaries, confirmation for
  review/cancellation, readable payment allowances and explicit attendance recording.
  Fixed the datetime-local value sent to the meeting server (now an ISO timestamp).
- Referral submission and MFA-protected administrator review use the existing
  referral table. They never automatically grant access or invite an account.
- Added email preference controls, private member check-ins and admin review screens.
  The new database workflows are prepared but have NOT been applied live.

This does NOT implement the separate proposed global best-match allocation and
reservation algorithm. Existing pairing status/consent/payment behavior remains;
the expanded view shows the existing approved member summary, not a new full-survey
comparison API. Those pending product changes must not be mistaken for completed
mobile layout work.

## Application verification in this iteration

- Public home/auth/nikah/privacy checked at 320, 360, 390, 430, 768 and 1440px.
  No document overflow or Vite error overlay on these 24 page/viewport combinations.
  Phone auth inputs measured 16px; visual checks retained desktop branding.
- Isolated real-component fixture at `tests/mobile-review` renders fictional data
  without Supabase credentials, email delivery or real match/payment writes.
- Verified four imam tabs, pair selection, two-column summaries, 46px tab targets,
  contained 760px spreadsheet at 320px, blank meeting validation, payment summaries,
  referral permission/submission, preference save feedback, check-in submission,
  member records, 900px spreadsheet containment and search/no-results behavior.
- Survey fixture: an age answer stayed above the next question; skipping the
  remaining 49 questions revealed all 50 with a review count of 49 at 320px without
  document overflow. Browser URL security policy then blocked further fixture
  inspection; the final required-field-highlight click was NOT verified this run.
- Production build, TypeScript and targeted lint checked. 41 offline tests passed,
  including actual Postgres migration execution, check-in ownership/due/replay
  restrictions and assigned-imam MFA/completion/audit rules.

Not established: physical iOS/Android keyboard behavior, screen-reader testing,
every admin route/state, real signed-in browser-to-database journeys, live SES,
complete schema rehearsal or release readiness. Do not claim the site is flawless.

## Review the first direction

- [Mobile imam workspace](https://p.superdesign.dev/draft/196388df-8558-4efb-810e-79df0b9f3ec7)
- [Project canvas](https://superdesign.dev/teams/29dce69f-9c99-45a7-a962-95c60ad12261/projects/7b7a10d4-7d26-4b78-afb3-36920a51f35f)
- Version 3, using the existing Mithaq header component; the desktop draft was preserved.

The direction retains Inter, ivory, deep green, restrained brass and familiar labels.
Phone layouts use generous touch controls, two-column section navigation, full-width
form fields and labelled records instead of squeezed desktop spreadsheet columns.
An optional spreadsheet view scrolls inside its own labelled region. Profile review
keeps both members' answers side by side, aligned by question, even at 320px.

The draft is fictional. No accept/decline, referral, email, payment or meeting action
in this prototype creates a live record. Real profile information was not uploaded.

## Prototype checks performed

- Rendered at 320px and 390px; document width matched viewport without sideways overflow.
- Reviewed Matches, Meetings, Payments and Referring imams.
- Selecting another pair displayed that pair's names, answers and score.
- Acceptance requires confirmation and updates both record and spreadsheet statuses;
  already-decided pairs disable repeat decisions. Desktop acceptance does not replace
  member consent, and mobile follows the same rule.
- Search filters both record and table rows; the table remains a contained scroller.
- Empty meeting scheduling fields do not show success.
- Referral name/email/permission validation and synthetic acknowledgement were checked.
- Read-only payment records distinguish paid and unpaid; package prices unchanged.

Corrected generated-prototype defects directly without another generation: stale
list/table statuses after decisions, table filtering, scheduling validation, accessible
table region and dynamic viewport/safe-area spacing.

These are limited prototype checks, not full Safari/iOS/Android or live-app coverage.
Meeting detail/family messaging/completion flows still need full design and implementation.

## Whole-site coverage checklist

| Area             | Existing routes / scope                                                                                                                    | Mobile acceptance criteria                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Public pages     | Home, community, halal relationships, mahr, nikah, wali, privacy                                                                           | Recognizable desktop branding, clear mobile menu, readable long text, no clipped footer links             |
| Sign-in/security | Auth, callback, email verification, security/MFA                                                                                           | Labelled 16px inputs, usable keyboard layout, readable errors, focus restored correctly                   |
| Survey           | Progressive survey                                                                                                                         | One question at a time, scroll-back history, skip/revisit, required-error highlighting and focus          |
| Member journey   | Dashboard, membership                                                                                                                      | Clear current step, anonymous match review, private response controls, meetings/packages, check-ins       |
| Settings         | Privacy/settings                                                                                                                           | Clear visibility/consent controls, notification opt-ins, save/error feedback, safe destructive actions    |
| Imam workspace   | Four tabs and imam application                                                                                                             | Mobile record/table switch, aligned profile comparison, payment gates, referrals, explicit completion     |
| Admin workspace  | Overview, profiles/details, compatibility, members spreadsheet, imams/applications, memberships, payments, audit, reports, pilot readiness | Compact navigation, filters above results, contained tables, readable details, safe MFA-protected actions |

Shared responsive shells and controls should be implemented first, then route-specific
layouts. Preserve the desktop presentation through responsive breakpoints, not a
separate product with inconsistent state or behavior.

Test 320, 360, 390, 430 and 768px plus desktop regression at 1440px. Include long names,
Arabic text, empty/loading/error states, on-screen keyboard, focus order, large text,
reduced motion, touch targets and contained table scroll. Real authenticated flows
require synthetic member/imam/admin accounts, with no unapproved emails or charges.

## Next gates

Rehearse both notification migrations against the complete schema in isolated
staging; verify real member/imam/admin sessions and error states. The existing private
Sites runtime currently has public Supabase configuration only, without the server
service-role configuration needed for privileged workflows. Do not describe a
public-page preview as a completed authenticated deployment. Production deployment
and public code publication require separate release approval.
