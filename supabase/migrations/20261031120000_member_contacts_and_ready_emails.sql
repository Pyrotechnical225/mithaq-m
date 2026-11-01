-- Private contact details a member gives so their assigned imam can arrange
-- a meeting. Kept apart from survey_answers so it is never sent to AI scoring
-- and never appears in another member's view. Only the member can read or
-- change their own row; the server reads it for the assigned imam once both
-- members have paid (see listImamPairings).
create table public.member_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact_method text not null default 'email'
    check (contact_method in ('whatsapp', 'call', 'text', 'email')),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  best_times text[] not null default '{}'::text[]
    check (best_times <@ array['mornings', 'afternoons', 'evenings', 'weekends']::text[]),
  wali_name text check (wali_name is null or char_length(wali_name) between 1 and 120),
  wali_relationship text check (
    wali_relationship is null
    or wali_relationship in ('father', 'brother', 'uncle', 'grandfather', 'son', 'imam', 'other')
  ),
  wali_phone text check (wali_phone is null or wali_phone ~ '^\+?[0-9 ()-]{7,20}$'),
  meeting_formats text[] not null default '{}'::text[]
    check (meeting_formats <@ array['mosque', 'public', 'video']::text[]),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_contacts enable row level security;
alter table public.member_contacts force row level security;

revoke all on table public.member_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.member_contacts to authenticated;
grant all on table public.member_contacts to service_role;

create policy "member_contacts_select_own" on public.member_contacts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "member_contacts_insert_own" on public.member_contacts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "member_contacts_update_own" on public.member_contacts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "member_contacts_delete_own" on public.member_contacts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- The production database uses private.touch_updated_at(); databases built
-- from these migration files use public.update_updated_at_column().
do $$
begin
  if to_regprocedure('private.touch_updated_at()') is not null then
    execute 'create trigger member_contacts_touch before update on public.member_contacts
      for each row execute function private.touch_updated_at()';
  else
    execute 'create trigger member_contacts_updated_at before update on public.member_contacts
      for each row execute function public.update_updated_at_column()';
  end if;
end $$;

-- When both members have paid, also tell each member that their imam will
-- be in touch, alongside the existing imam email. Only where the email
-- outbox is installed (it is not on the production database yet).
do $outer$
begin
  if to_regclass('public.notification_email_jobs') is null
     or to_regnamespace('mithaq_private') is null then
    return;
  end if;
  execute $sql$
create or replace function mithaq_private.pairing_payment_emails() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.payment_a_status = 'paid' and old.payment_a_status is distinct from 'paid' then
    insert into public.notification_email_jobs(user_id, pairing_id, event_key, kind)
    values (new.user_a, new.id, 'payment:' || new.id::text || ':a', 'meeting_payment_received')
    on conflict (event_key) do nothing;
  end if;
  if new.payment_b_status = 'paid' and old.payment_b_status is distinct from 'paid' then
    insert into public.notification_email_jobs(user_id, pairing_id, event_key, kind)
    values (new.user_b, new.id, 'payment:' || new.id::text || ':b', 'meeting_payment_received')
    on conflict (event_key) do nothing;
  end if;
  if new.status = 'ready_to_schedule' and old.status is distinct from new.status then
    insert into public.notification_email_jobs(user_id, pairing_id, event_key, kind)
    select a.user_id, new.id, 'ready:' || new.id::text || ':' || a.user_id::text, 'imam_ready_to_schedule'
    from public.imam_accounts a
    join public.imams i on i.id = a.imam_id
    where a.imam_id = new.imam_id and a.active and i.verification_status = 'verified'
    on conflict (event_key) do nothing;

    insert into public.notification_email_jobs(user_id, pairing_id, event_key, kind)
    values
      (new.user_a, new.id, 'member-ready:' || new.id::text || ':a', 'member_ready_to_schedule'),
      (new.user_b, new.id, 'member-ready:' || new.id::text || ':b', 'member_ready_to_schedule')
    on conflict (event_key) do nothing;
  end if;
  return new;
end $$;
  $sql$;
  execute 'revoke all on function mithaq_private.pairing_payment_emails() from public, anon, authenticated';
end $outer$;
