
## What you'll get

1. **Accounts** — email/password + Google sign-in via Lovable Cloud. A new "Sign in / Create account" button on the landing page; the survey and dashboard require an account.
2. **Private survey storage** — every answer is saved to your own row in the database. Row-Level Security guarantees no other user (and no logged-out visitor) can ever read your answers. You can return anytime to edit them.
3. **Privacy controls** on a Settings page:
   - Profile visibility: **Hidden** (no one can be matched with you), **Discoverable** (you appear in matches), **Paused**.
   - Show/hide specific fields to potential matches (city, occupation, photo of preferences, free-text answers, etc.).
   - Contact preference: only reveal contact info after you approve a match.
   - One-click **Delete my account and all my data**.
4. **AI-powered matches dashboard** (`/dashboard`, account-only) — after you complete the survey:
   - Lovable AI (Gemini) reads your answers + other discoverable profiles and returns a ranked list of the top compatible matches, each with a compatibility score, a short reasoning paragraph (deen alignment, life goals, dealbreakers), and any flags.
   - You can "Express interest" — the other person sees it in their dashboard and can accept, which reveals mutual contact.
   - Re-run matching anytime; results cached until you change answers.

## Tech (for reference)

- Lovable Cloud (Postgres + Auth). Tables: `profiles`, `survey_answers` (jsonb of the 50 answers), `privacy_settings`, `matches` (cached AI results), `interests` (mutual-interest handshake). All with strict RLS scoped to `auth.uid()`. `user_roles` table + `has_role()` for any future admin surface.
- Matching runs in a `createServerFn` calling Lovable AI Gateway (`google/gemini-2.5-flash`) with a structured JSON schema; the server strips other users' identity fields before sending to the model — only anonymized answer content is used for scoring.
- New routes: `/auth`, `/_authenticated/survey` (moves existing survey here, prefilled from DB), `/_authenticated/dashboard`, `/_authenticated/settings`. Landing page stays public.

## One decision I need from you

The current survey lives at `/survey` and anyone can open it. After this change it will require sign-in. Confirm that's what you want (recommended for privacy), or I can keep a public "preview" version that only saves once you create an account at the end.
