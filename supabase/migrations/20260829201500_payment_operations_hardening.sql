-- Weeks 7-8: payment operations, replay visibility and checkout concurrency.

alter table public.stripe_events
  add column if not exists status text not null default 'processed',
  add column if not exists attempts integer not null default 1,
  add column if not exists last_attempt_at timestamptz not null default now(),
  add column if not exists last_error text;

alter table public.stripe_events
  alter column processed_at drop not null,
  alter column processed_at drop default;

alter table public.stripe_events
  drop constraint if exists stripe_events_status_check;
alter table public.stripe_events
  add constraint stripe_events_status_check
  check (status in ('processing', 'processed', 'failed'));

create index if not exists stripe_events_status_attempt_idx
  on public.stripe_events(status, last_attempt_at desc);

-- A member can have only one live Stripe Checkout Session for a pairing.
-- This prevents two tabs selecting different packages and paying twice before
-- the first webhook has time to update the pairing.
create table if not exists public.meeting_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null,
  meeting_count integer not null,
  amount_pence integer not null,
  currency text not null default 'gbp',
  stripe_session_id text unique,
  status text not null default 'creating',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint meeting_checkout_attempts_package_check check (
    (package_id = 'single' and meeting_count = 1 and amount_pence = 5000)
    or (package_id = 'three' and meeting_count = 3 and amount_pence = 12000)
    or (package_id = 'five' and meeting_count = 5 and amount_pence = 17500)
  ),
  constraint meeting_checkout_attempts_currency_check check (currency = 'gbp'),
  constraint meeting_checkout_attempts_status_check check (
    status in ('creating', 'open', 'paid', 'expired', 'failed')
  )
);

create unique index if not exists meeting_checkout_attempts_one_live_idx
  on public.meeting_checkout_attempts(pairing_id, user_id)
  where status in ('creating', 'open');
create index if not exists meeting_checkout_attempts_status_created_idx
  on public.meeting_checkout_attempts(status, created_at desc);

alter table public.meeting_checkout_attempts enable row level security;
revoke all on public.meeting_checkout_attempts from anon, authenticated;
grant all on public.meeting_checkout_attempts to service_role;

-- Payment operations are returned only through MFA-protected server functions.
drop policy if exists "admins can read stripe events" on public.stripe_events;
revoke all on public.stripe_events from anon, authenticated;
grant all on public.stripe_events to service_role;
