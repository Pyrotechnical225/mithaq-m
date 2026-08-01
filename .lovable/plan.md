## Goal

1. Charge for access right after the survey is completed, before matches are shown.
2. Give approved imams their own dashboard to review local pairings, approve/decline, arrange meetups, and message families.

## Part 1 — Paywall (after survey, before matches)

Journey: sign up → verify email → 50-question survey → **paywall** → wali confirmation → matches + imam finder.

- Payments via Lovable's built-in Stripe integration (no Stripe account setup needed). I'll run the provider eligibility check first; Mithaq is a digital subscription service, so Stripe with tax handling is the expected fit.
- Two plans, created as products: **Monthly** and **Yearly** (yearly discounted). You give me the prices.
- New `/membership` page: plan comparison, what unlocking gives (AI matches, express interest, imam finder + meetup requests), checkout buttons, and current status/manage.
- Dashboard behaviour when unpaid: survey and location stay usable; the matches section and imam contact are replaced with a locked card explaining the benefit + "Unlock matches" button. Free users still see how many matches are waiting (count only, no profiles).
- Server-side enforcement: match generation, interest sending, and meetup requests all check active subscription server-side, not just hidden in the UI.
- Admin: can grant complimentary access to any member (useful for demo/test profiles), and see subscription status in the profiles table.

## Part 2 — Imam dashboard

Access model (as you described): imams apply, you meet them, then you approve and create their account.

- Public `/imams/apply` page: name, mosque, city, postcode, languages, phone/email, credentials/notes. Creates a pending application — no account yet.
- Admin gets an **Imam applications** page: review, add your meeting notes, then **Approve & create account** (creates a confirmed login, links it to an imam record, gives the imam role) or decline. You can also revoke access later.
- Approved imams sign in through the normal `/auth` page and are routed to `/imam` instead of the member dashboard.

Imam dashboard sections:
- **Local pairings awaiting review** — mutual-interest pairs where both parties are within a radius of the imam's city (distance shown in km), with the deen/values summary and wali contact.
- **Approve / decline** a pairing with a written reason; the decision and note become visible to both members and their walis on their dashboards.
- **Arrange a meetup** — propose date, time, venue (mosque/address), and a wali-attendance requirement; both members accept or decline from their dashboard. Status tracked: proposed → accepted → completed / cancelled.
- **Notes & messages** — a thread per pairing between the imam and the two families.
- Imams see only what they need: names, city, deen/values summary and wali contact for pairings assigned to their area — never the full private survey.

## Technical notes

- New tables: `subscriptions` (plan, status, period end, provider ids), `imam_applications`, `imam_profiles` link (imam user ↔ `imams` row), `pairings` (from/to user, imam, status, decision note), `meetups` (pairing, imam, datetime, venue, wali_required, status), `pairing_messages`. RLS on all: members see their own pairings/meetups, imams see rows assigned to them, admin sees everything, plus explicit grants.
- New role values added to `app_role` for `imam`; route gates: `_authenticated/imam/*` for imams, existing `_authenticated/admin/*` unchanged.
- Subscription checks live in server functions (`hasActiveMembership`) called by match generation, interest, and meetup endpoints. Stripe webhook handled on a public API route with signature verification.
- Proximity uses the existing `haversineKm` + UK city coordinates, with a configurable radius per imam (default 40 km).

## What I need from you

Monthly and yearly prices (e.g. £14.99/mo, £99/yr) — I can start with those as placeholders and you change them later.
