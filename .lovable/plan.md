## 1. Admin credential change

- In `src/lib/admin.functions.ts`, change:
  - `ADMIN_EMAIL` → `admin@mithaq.com`
  - `ADMIN_PASSWORD` → `Malikmalik1@`
- `bootstrapAdmin` already updates password + email_confirm on every call, so the next sign-in as "admin" will migrate the existing admin record. Old `admin@mithaq.local` user will be left in place (harmless) — optionally deleted manually via the admin panel.
- The "type `admin` as email" shortcut on the sign-in page keeps working. Users can also sign in directly with `admin@mithaq.com` / `Malikmalik1@`.

## 2. UK location + imam finder on user dashboard

### Database (new migration)
- New `imams` table (public schema, admin-managed):
  - `id`, `name`, `title` (e.g. "Imam", "Sheikh"), `mosque`, `city`, `postcode`, `lat`, `lng`, `phone`, `email`, `website`, `languages` (text[]), `notes` (text), `created_at`
  - GRANT SELECT to `authenticated` and `anon`; GRANT ALL to `service_role`.
  - RLS: everyone authenticated can read; only admins can insert/update/delete (`has_role(auth.uid(),'admin')`).
- Extend `profiles` with `uk_city text`, `uk_postcode text`, `location_lat double precision`, `location_lng double precision` (nullable — no backfill needed).

### User-facing UI (`src/routes/_authenticated/dashboard.tsx`)
- New "Your location" card on the dashboard with:
  - UK city dropdown (curated list: London, Birmingham, Manchester, Leeds, Bradford, Luton, Leicester, Glasgow, Cardiff, Sheffield, Nottingham, Bristol, Newcastle, Liverpool, Edinburgh, Coventry, Blackburn, Oldham, Rochdale, Slough, Other).
  - Optional postcode input (free-text, UK format hint).
  - Save button → new `saveMyLocation` server fn that upserts city/postcode and, if the city matches the curated list, stores its known lat/lng.
- New "Imams near you" card:
  - Lists imams from the DB, sorted by great-circle distance to the user's saved coordinates (Haversine, computed client-side from the fetched imam list; falls back to alphabetical by city when the user has no location saved).
  - Each row: name, title, mosque, city + distance ("~ 4.2 mi"), phone/email/website links, languages badges.
  - "Filter by city" dropdown and a "Within X miles" slider (25 / 50 / 100 / any).

### Server functions (`src/lib/imams.functions.ts`, new file)
- `listImams` (authenticated) — returns all imams.
- `saveMyLocation` (authenticated) — validates city/postcode, upserts profile columns.
- `getMyLocation` (authenticated) — returns current stored location.
- Admin-only mutations (in `admin.functions.ts`): `createImam`, `updateImam`, `deleteImam`, `bulkSeedImams`, plus `bulkSeedExampleUsers`.

### Notes
- No external geocoding API; we ship a small hard-coded lat/lng table for the curated UK cities (kept in `src/lib/uk-cities.ts`). Imam lat/lng comes from what admins enter (either directly or auto-set from the imam's city when they pick from the same list).

## 3. Admin panel additions

New route `src/routes/_authenticated/admin/imams.tsx`:
- Table of imams (name, mosque, city, contact, edit / delete).
- "Add imam" inline form (name, title, mosque, city dropdown, postcode, lat/lng optional, phone, email, website, languages comma list, notes).
- "Seed example imams" button → inserts ~8 curated fictional imams across major UK cities (idempotent by name+city).

New route `src/routes/_authenticated/admin/seed.tsx` (or a section on the existing admin index):
- "Seed example users" button → creates ~6 example users with realistic display names + emails (`example1@mithaq.demo`, …), auto-confirmed, each with pre-filled survey answers, visibility = discoverable, and a UK city. Idempotent by email.
- "Delete all example accounts" button to reset the demo data (only touches users whose email ends in `@mithaq.demo`).

Sidebar: add "Imams" and "Seed data" links in `src/routes/_authenticated/admin/route.tsx`.

## Technical section

- Migration: creates `imams`, adds 4 columns to `profiles`, adds RLS + grants for `imams`.
- Distance math: Haversine helper in `src/lib/geo.ts`; miles conversion.
- Example imam seed data lives in `src/lib/example-imams.ts`; example user seed data in `src/lib/example-users.ts` (imports `SURVEY_QUESTIONS` to generate plausible answers).
- All admin mutations go through `assertAdmin(context)` in server fns; user-facing fns use `requireSupabaseAuth`.
- No changes to matching logic — location is informational for imam lookup only (can be layered into matching later if you want).

## Out of scope

- No live UK postcode → lat/lng geocoding (would need a paid API). We use city-level coordinates only; postcode is stored for display.
- No maps rendering (list view only). Say the word and I'll add a Google Maps view in a follow-up.
