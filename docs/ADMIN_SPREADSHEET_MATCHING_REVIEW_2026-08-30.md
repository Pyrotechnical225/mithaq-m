# Member spreadsheet and matching verification

Status: design ready for approval; application feature not implemented or deployed.
Stripe webhook work is explicitly deferred.

## Requested feature

Add `/admin/members` to the existing admin workspace, with two spreadsheet-style tables:

1. All saved accounts: identity, role, survey progress, privacy/consent eligibility,
   latest recorded activity, introduction count, completed meetings, upcoming meetings,
   payment status, and a per-row **View matches** button.
2. Potential matches for the selected member: candidate, age/city, eligibility,
   current fixed-rubric score, separately labelled saved AI/combined score with its
   date, and introduction status. Include below-70 comparisons for admin review;
   do not treat them as introduction-ready.

Search, filtering, sorting, pagination, keyboard access, and contained horizontal
scrolling are required. Viewing a row must not create pairings, send notifications,
change consent, or charge members. Admin role and MFA must be checked server-side.

Design preview uses fictional data only:
https://p.superdesign.dev/draft/d0d56d9d-70dd-4b23-8cc9-a5ea368ef371

## Checks completed

Baseline: commit `1881391`, branch `agent/sites-trust-improvements`.
Authenticated preview: `meethaq-1ivum8aup-m46-1241.vercel.app`.
Database: Supabase project `oxhpvawqmrdvkrlntswl`.

- The live member list contains 8 saved accounts and loads correctly.
- An example member's profile and current fixed-rubric comparison load correctly.
  The two displayed comparisons scored 87 and 82. No browser errors or warnings
  appeared during these checks.
- The compatibility audit loads 18 historical comparisons across 6 generations,
  latest generated 2026-08-05. None has a stored AI-review score. These legacy
  results are not evidence of a successful current OpenAI call or an outage.
- There are 0 members with active compatibility-processing consent and 0 meetings.
  No consent was changed and no real member answers were sent to an AI provider.
- 13 new automated matching checks pass, plus the 7 existing invariant checks
  (20 passing total). Tests use the real source and installed AI SDK with an
  in-memory database and simulated provider transport; they make no external calls.

Covered: symmetric/bounded rules, input normalization, free-text exclusions,
structured AI response parsing, `store: false` request setting, malformed/out-of-range
AI fallback, missing credentials, provider failure, required-answer and adult checks,
admin/MFA helpers, candidate privacy/consent/blocks/gender eligibility, 80/20 blending,
duplicate pairing avoidance, top-five output limit, and 70-point threshold.

Run explicitly (the existing package test command does not yet include the new file):

```sh
node --test tests/matching-verification.test.cjs tests/pilot-invariants.test.ts
```

## Issues and limits to address during implementation

1. **Completed-meeting recording is blocked by conflicting database constraints.**
   `meetups_status_check` permits `completed`; `meetups_status_valid` does not.
   Although the latter is NOT VALID for old records, it still restricts new/updated
   rows. Resolve this conflict and add a protected, auditable completion action.
   Never count a past booking or a purchased package as a completed meeting.
2. **The existing admin comparison is an audit, not an eligible-match list.**
   `getProfileCompatibilityScoresAdmin` excludes admin/imam accounts but does not
   filter privacy, consent, or blocks. Do not reuse its rows as actionable potential
   matches without eligibility checks and required-answer validation.
3. **Member matching does not apply the same admin/imam exclusion as the audit.**
   `generateMatches` filters consent/privacy/blocks and survey validity, but does
   not consult `user_roles` or `imam_accounts`. Align the rules before exposing a
   shared eligibility status. This is a source-review finding, not a live matching
   run with those accounts.
4. **All-user completeness needs pagination.** `listAllProfiles` fetches only the
   first 500 Auth users, and table queries lack explicit pagination. The new view
   must not silently omit accounts as membership grows.
5. **AI live verification remains outstanding.** The current connectivity helper
   is not connected to a server endpoint/UI. Add an admin-only, MFA-protected
   synthetic scoring self-test that uses deployment configuration, makes no
   member/pairing writes, reports the actual model and successful review vs fallback,
   and never exposes credentials. Verify it on the new preview.
6. **AI review scaling needs bounded batches.** The current generator puts the
   entire eligible pool in one request with a 1,500-token output budget. The top-five
   limit is applied only after that call. Avoid claiming reliable all-user AI
   coverage for large candidate pools until batching/completeness is tested.
7. **Score provenance matters.** Legacy saved scores can differ from the current
   fixed rubric. Never blend a current fixed score with an unrelated old AI review,
   or present an old result as newly computed. Store/display provenance explicitly.

## Change and release safety

Only a test file, this report, and design metadata/artifacts were added in this
review. No application code, database records/schema, hosted environment variables,
production deployment, or public GitHub branch was changed.

The four pre-existing generated MCP route modifications and `supabase/.temp/`
remain untouched. After design approval, implement and verify in a new preview;
production publishing remains a separate release decision.
