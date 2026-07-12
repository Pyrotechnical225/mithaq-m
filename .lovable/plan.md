### Goals

1. Gate the dashboard/matches behind a verified email, with a clear CTA when unverified.
2. Improve the `/auth/callback` page to act as a verification-status page (success / expired / invalid / already verified).
3. Add a **developer/admin login** with elevated privileges: browse all profiles, edit/delete them, create new ones, and download profile data (JSON/CSV).
4. Suggest additional features to consider next.

---

## 1. Email verification gating

- Update `src/routes/_authenticated/route.tsx` so that after `getUser()` succeeds, it also checks `user.email_confirmed_at`. If missing, redirect to a new `/verify-email` page (not `/auth`), preserving the intended destination.
- New route `src/routes/verify-email.tsx` (public, `ssr: false`):
  - Shows "Please verify your email" with the address on file.
  - Buttons: **Resend verification email** (calls `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: origin + '/auth/callback' } })`), **I've verified — refresh**, **Sign out**.
  - Small help text: check spam, link expires in 24h.
- `SiteHeader` shows a subtle "Verify email" pill when signed in but unverified.

## 2. Verification status page

Refactor `src/routes/auth.callback.tsx` into a clear status screen with three outcomes:

- **Success** → "Email verified ✓ Redirecting to your dashboard…" (auto-redirect after 1.5s).
- **Expired / invalid link** → explain why (expired, already used, malformed) and offer **Resend verification** + link back to `/auth`.
- **Already verified** → friendly message + **Go to dashboard**.

Map common Supabase error codes (`otp_expired`, `access_denied`, `invalid_request`) to plain-English explanations.

## 3. Developer / Admin login

### Database (migration)

- Create `app_role` enum (`admin`, `user`) and `public.user_roles` table (user_id, role, unique). Standard grants + RLS as in the user-roles knowledge.
- `has_role(_user_id uuid, _role app_role)` security-definer function.
- Add admin-scoped SELECT/UPDATE/DELETE/INSERT policies on `profiles`, `survey_answers`, `privacy_settings`, `matches`, `interests` using `has_role(auth.uid(), 'admin')`.
- Seed one admin role row for a user_id you provide (I'll ask which email).

### Server functions (`src/lib/admin.functions.ts`)

All wrapped with `requireSupabaseAuth` + `has_role` check (403 otherwise):

- `listAllProfiles({ search, page })` — joins `profiles`, `privacy_settings`, `survey_answers.completed`, and email from `auth.users` (via `supabaseAdmin`, loaded inside handler).
- `getProfileDetail(user_id)` — full profile + survey answers + privacy + matches + interests.
- `updateProfile(user_id, patch)` — edit display name, contact email, any profile fields.
- `updateSurveyAnswers(user_id, answers)` — overwrite a user's survey JSON.
- `updatePrivacy(user_id, patch)` — flip visibility, field masks.
- `createProfile({ email, password, display_name, answers? })` — uses `supabaseAdmin.auth.admin.createUser` (email auto-confirmed), then inserts profile/survey rows.
- `deleteProfile(user_id)` — `supabaseAdmin.auth.admin.deleteUser` (cascades to public rows).
- `exportProfile(user_id, format)` — returns JSON or CSV string of the profile + answers.
- `exportAllProfiles(format)` — bulk JSON/CSV download.

### Admin UI

- New pathless layout `src/routes/_authenticated/_admin/route.tsx` — gates on `has_role` server-side; non-admins see 403 with link home.
- Pages:
  - `/_admin/index.tsx` — dashboard: user count, completed surveys, discoverable count, recent signups, quick actions.
  - `/_admin/profiles.tsx` — searchable table of all profiles, per-row Edit / Delete / Download JSON / Download CSV, plus header "Export all" + "New profile" buttons.
  - `/_admin/profiles.$userId.tsx` — full profile editor: identity fields, survey answers form (using existing `survey-questions.ts`), privacy toggles, danger-zone delete.
  - `/_admin/new-profile.tsx` — create profile form (email, password, display name, optional pre-filled answers).
- Admin link surfaces in `SiteHeader` account menu only when `has_role(admin)`.

### "Dev login" clarification

There isn't a separate login screen — the same `/auth` page is used. There will be a specific login for the admin tools. What would be put in the email box will be "admin" and the password would be "Malik225@@2"

## 4. Suggestions for future features

- **In-app messaging** with wali cc'd, message templates, and auto-moderation.
- **Wali portal**: guardian gets a read-only view once mutual interest is accepted.
- **Verification badges**: photo ID, imam/masjid reference, employment.
- **Compatibility deep-dive**: side-by-side answer comparison with tafsir-style commentary from the AI.
- **Saved / hidden profiles**, daily match limits to encourage intentionality.
- **Video intro (short, modest)** with recording guidelines.
- **Halal date planner**: chaperoned meeting suggestions by city.
- **Community events & khutbah library** (extends the /community page).
- **Marriage prep courses** (fiqh of nikah, finance, conflict resolution) as gated content.
- **Push/email notifications** for new matches, interests, replies.
- **Report/block + admin moderation queue** (fits naturally under the new admin area).
- **Multi-language**: Arabic RTL, Urdu, French, Malay.
- **PWA / mobile install** with offline survey drafts.

---

## Technical notes

- Admin server functions load `supabaseAdmin` via `await import(...)` inside the handler (required in `.functions.ts`).
- All new tables/policies via a single migration, with GRANTs.
- CSV export built in-handler (no new deps).
- No changes to auto-generated files (`client.ts`, `types.ts`, etc.).

---

## Question before I build

Which email address should be granted the initial `admin` role? (I'll seed it in the migration so your first sign-in already has admin access.)