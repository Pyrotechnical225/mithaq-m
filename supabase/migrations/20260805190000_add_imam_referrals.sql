create table if not exists public.imam_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referrer_imam_id uuid not null references public.imams(id) on delete cascade,
  referred_name text not null check (char_length(referred_name) between 2 and 120),
  referred_email text not null check (char_length(referred_email) between 3 and 320),
  status text not null default 'pending'
    check (status in ('pending','approved','declined','invited','redeeming','completed')),
  admin_notes text,
  invitation_token_hash text unique,
  invitation_expires_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists imam_referrals_referrer_idx
  on public.imam_referrals(referrer_user_id, created_at desc);
create index if not exists imam_referrals_status_idx
  on public.imam_referrals(status, created_at desc);
create unique index if not exists imam_referrals_open_email_idx
  on public.imam_referrals(lower(referred_email))
  where status in ('pending','approved','invited','redeeming');

alter table public.imam_referrals enable row level security;

drop policy if exists imam_referrals_own_read on public.imam_referrals;
create policy imam_referrals_own_read
  on public.imam_referrals for select to authenticated
  using ((select auth.uid()) = referrer_user_id);

drop policy if exists imam_referrals_own_add on public.imam_referrals;
create policy imam_referrals_own_add
  on public.imam_referrals for insert to authenticated
  with check (
    (select auth.uid()) = referrer_user_id
    and exists (
      select 1 from public.imam_accounts account
      where account.user_id = (select auth.uid())
        and account.imam_id = referrer_imam_id
        and account.active
    )
  );

grant select, insert on public.imam_referrals to authenticated;
grant all on public.imam_referrals to service_role;
