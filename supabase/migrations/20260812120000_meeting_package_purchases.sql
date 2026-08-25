-- Paid meeting packages are recorded separately from the pairing so every
-- Stripe purchase remains auditable and allowances can be enforced server-side.
create table if not exists public.meeting_package_purchases (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null,
  meeting_count integer not null,
  amount_pence integer not null,
  currency text not null default 'gbp',
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  payment_status text not null default 'paid',
  created_at timestamptz not null default now(),
  paid_at timestamptz not null default now(),
  unique (pairing_id, user_id),
  unique (stripe_session_id),
  constraint meeting_package_purchases_package_check check (
    (package_id = 'single' and meeting_count = 1 and amount_pence = 5000)
    or (package_id = 'three' and meeting_count = 3 and amount_pence = 12000)
    or (package_id = 'five' and meeting_count = 5 and amount_pence = 17500)
  ),
  constraint meeting_package_purchases_currency_check check (currency = 'gbp'),
  constraint meeting_package_purchases_status_check check (
    payment_status in ('paid', 'refunded', 'partially_refunded')
  )
);

alter table public.pairings
  add column if not exists payment_a_status text not null default 'not_due',
  add column if not exists payment_b_status text not null default 'not_due',
  add column if not exists payment_session_a text,
  add column if not exists payment_session_b text;

create index if not exists meeting_package_purchases_pairing_idx
  on public.meeting_package_purchases(pairing_id);
create index if not exists meeting_package_purchases_user_idx
  on public.meeting_package_purchases(user_id);

alter table public.meeting_package_purchases enable row level security;

revoke all on public.meeting_package_purchases from anon;
revoke all on public.meeting_package_purchases from authenticated;
grant select on public.meeting_package_purchases to authenticated;
grant all on public.meeting_package_purchases to service_role;

drop policy if exists "Members can view their own meeting purchases"
  on public.meeting_package_purchases;
create policy "Members can view their own meeting purchases"
  on public.meeting_package_purchases
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
