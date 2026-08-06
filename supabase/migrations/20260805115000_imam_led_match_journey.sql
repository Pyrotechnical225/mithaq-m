alter table public.pairings
  add column if not exists compatibility_score integer,
  add column if not exists compatibility_summary jsonb not null default '{}'::jsonb,
  add column if not exists member_a_response text not null default 'pending',
  add column if not exists member_b_response text not null default 'pending',
  add column if not exists payment_a_status text not null default 'not_due',
  add column if not exists payment_b_status text not null default 'not_due',
  add column if not exists payment_session_a text,
  add column if not exists payment_session_b text,
  add column if not exists meeting_preference_a text,
  add column if not exists meeting_preference_b text;

-- Replace the legacy pending/approved/declined/closed-only constraint with
-- every state used by the imam-led introduction journey.
alter table public.pairings drop constraint if exists pairings_status_check;
alter table public.pairings add constraint pairings_status_check
  check (status in (
    'pending', 'approved', 'closed',
    'imam_review', 'member_review', 'awaiting_payment', 'payment_pending',
    'ready_to_schedule', 'scheduled', 'completed', 'declined'
  ));

alter table public.pairings drop constraint if exists pairings_compatibility_score_check;
alter table public.pairings add constraint pairings_compatibility_score_check
  check (compatibility_score is null or compatibility_score between 70 and 100);
alter table public.pairings drop constraint if exists pairings_member_a_response_check;
alter table public.pairings add constraint pairings_member_a_response_check
  check (member_a_response in ('pending','accepted','declined'));
alter table public.pairings drop constraint if exists pairings_member_b_response_check;
alter table public.pairings add constraint pairings_member_b_response_check
  check (member_b_response in ('pending','accepted','declined'));
alter table public.pairings drop constraint if exists pairings_payment_a_status_check;
alter table public.pairings add constraint pairings_payment_a_status_check
  check (payment_a_status in ('not_due','due','pending','paid','failed','refunded'));
alter table public.pairings drop constraint if exists pairings_payment_b_status_check;
alter table public.pairings add constraint pairings_payment_b_status_check
  check (payment_b_status in ('not_due','due','pending','paid','failed','refunded'));
alter table public.pairings drop constraint if exists pairings_meeting_preference_a_check;
alter table public.pairings add constraint pairings_meeting_preference_a_check
  check (meeting_preference_a is null or meeting_preference_a in ('online','face_to_face'));
alter table public.pairings drop constraint if exists pairings_meeting_preference_b_check;
alter table public.pairings add constraint pairings_meeting_preference_b_check
  check (meeting_preference_b is null or meeting_preference_b in ('online','face_to_face'));

create unique index if not exists pairings_unique_members_idx on public.pairings(user_a,user_b);
create index if not exists pairings_imam_review_idx on public.pairings(imam_id,status,compatibility_score desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pairing_id uuid references public.pairings(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select,update on public.notifications to authenticated;

drop policy if exists pairings_read on public.pairings;
create policy pairings_read on public.pairings for select to authenticated using (
  private.role_exists((select auth.uid()), 'admin')
  or imam_id = (select imam_id from public.imam_accounts where user_id=(select auth.uid()) and active limit 1)
  or ((select auth.uid()) in (user_a,user_b) and status in ('member_review','awaiting_payment','payment_pending','ready_to_schedule','scheduled','completed'))
);
