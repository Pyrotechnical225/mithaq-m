-- Mithaq core schema. Applied to Supabase project oxhpvawqmrdvkrlntswl.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
do $$ begin create type public.app_role as enum ('admin','user'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
 id uuid primary key references auth.users on delete cascade, display_name text, contact_email text,
 location_lat float8, location_lng float8, uk_city text, uk_postcode text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.privacy_settings (
 user_id uuid primary key references auth.users on delete cascade,
 visibility text not null default 'hidden' check (visibility in ('hidden','paused','discoverable')),
 show_location boolean not null default true, show_occupation boolean not null default true,
 show_free_text boolean not null default false, reveal_contact_on_mutual boolean not null default true,
 updated_at timestamptz not null default now()
);
create table if not exists public.survey_answers (
 user_id uuid primary key references auth.users on delete cascade, answers jsonb not null default '{}',
 completed boolean not null default false, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.matches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 results jsonb not null default '{"matches":[]}', created_at timestamptz not null default now()
);
create table if not exists public.interests (
 id uuid primary key default gen_random_uuid(), from_user uuid not null references auth.users on delete cascade,
 to_user uuid not null references auth.users on delete cascade, status text not null default 'pending'
 check (status in ('pending','accepted','declined','withdrawn')), created_at timestamptz not null default now(),
 unique(from_user,to_user), check(from_user<>to_user)
);
create table if not exists public.imams (
 id uuid primary key default gen_random_uuid(), name text not null, title text, mosque text, city text not null,
 postcode text, lat float8, lng float8, phone text, email text, website text, languages text[] not null default '{}',
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.imam_applications (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users on delete set null,
 name text not null, email text not null, phone text, mosque text, city text not null, postcode text,
 languages text[] not null default '{}', credentials text, message text, status text not null default 'pending'
 check (status in ('pending','approved','declined')), admin_notes text, imam_id uuid references public.imams on delete set null,
 reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.imam_accounts (
 user_id uuid primary key references auth.users on delete cascade, imam_id uuid not null references public.imams on delete cascade,
 active boolean not null default true, radius_km int not null default 40 check(radius_km between 5 and 300),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.subscriptions (
 user_id uuid primary key references auth.users on delete cascade, status text not null default 'inactive',
 plan text not null default 'none', provider text, provider_customer_id text unique, provider_subscription_id text unique,
 current_period_end timestamptz, cancel_at_period_end boolean not null default false, last_payment_status text,
 stripe_updated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.stripe_events (id text primary key, type text not null, processed_at timestamptz not null default now());
create table if not exists public.pairings (
 id uuid primary key default gen_random_uuid(), user_a uuid not null references auth.users on delete cascade,
 user_b uuid not null references auth.users on delete cascade, imam_id uuid references public.imams on delete set null,
 status text not null default 'pending' check(status in ('pending','approved','declined','closed')),
 decision_note text, decided_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(user_a,user_b), check(user_a<user_b)
);
create table if not exists public.pairing_messages (
 id uuid primary key default gen_random_uuid(), pairing_id uuid not null references public.pairings on delete cascade,
 sender_id uuid not null references auth.users on delete cascade, sender_role text not null default 'member'
 check(sender_role in ('member','imam','admin')), body text not null check(char_length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create table if not exists public.meetups (
 id uuid primary key default gen_random_uuid(), pairing_id uuid not null references public.pairings on delete cascade,
 imam_id uuid references public.imams on delete set null, scheduled_at timestamptz not null, venue text not null,
 address text, note text, status text not null default 'proposed'
 check(status in ('proposed','confirmed','declined','cancelled','completed')),
 response_a text not null default 'pending' check(response_a in ('pending','accepted','declined')),
 response_b text not null default 'pending' check(response_b in ('pending','accepted','declined')),
 wali_required boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_roles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 role public.app_role not null, created_at timestamptz not null default now(), unique(user_id,role)
);
create table if not exists public.admin_audit_log (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users on delete set null,
 action text not null, target_type text not null, target_id text, details jsonb not null default '{}',
 created_at timestamptz not null default now()
);

create index if not exists matches_user_created_idx on public.matches(user_id,created_at desc);
create index if not exists interests_to_created_idx on public.interests(to_user,created_at desc);
create index if not exists pairings_a_idx on public.pairings(user_a,created_at desc);
create index if not exists pairings_b_idx on public.pairings(user_b,created_at desc);
create index if not exists pairings_imam_idx on public.pairings(imam_id,status);
create index if not exists messages_thread_idx on public.pairing_messages(pairing_id,created_at);
create index if not exists messages_sender_idx on public.pairing_messages(sender_id);
create index if not exists meetups_pairing_idx on public.meetups(pairing_id,scheduled_at);
create index if not exists meetups_imam_idx on public.meetups(imam_id);
create index if not exists imam_accounts_imam_idx on public.imam_accounts(imam_id);
create index if not exists imam_apps_imam_idx on public.imam_applications(imam_id);
create index if not exists imam_apps_user_idx on public.imam_applications(user_id);
create index if not exists admin_audit_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_actor_idx on public.admin_audit_log(actor_user_id);

create or replace function private.role_exists(_u uuid,_r public.app_role) returns boolean
 language sql stable security definer set search_path=public as
 $$ select exists(select 1 from public.user_roles where user_id=_u and role=_r) $$;
revoke all on function private.role_exists(uuid,public.app_role) from public,anon,authenticated;
create or replace function public.has_role(_user_id uuid,_role public.app_role) returns boolean
 language sql stable security invoker set search_path=public as
 $$ select (select auth.uid())=_user_id and exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.has_active_membership(_user_id uuid) returns boolean
 language sql stable security invoker set search_path=public as
 $$ select (select auth.uid())=_user_id and(public.has_role(_user_id,'admin') or exists(select 1 from public.subscriptions where user_id=_user_id and status in('active','trialing','complimentary') and(current_period_end is null or current_period_end>now()))) $$;
create or replace function public.is_imam(_user_id uuid) returns boolean language sql stable security invoker set search_path=public as
 $$ select (select auth.uid())=_user_id and exists(select 1 from public.imam_accounts where user_id=_user_id and active) $$;
create or replace function public.my_imam_id(_user_id uuid) returns uuid language sql stable security invoker set search_path=public as
 $$ select imam_id from public.imam_accounts where (select auth.uid())=_user_id and user_id=_user_id and active limit 1 $$;
create or replace function public.can_see_pairing(_pairing_id uuid,_user_id uuid) returns boolean
 language sql stable security definer set search_path=public,private as
 $$ select (select auth.uid())=_user_id and exists(select 1 from public.pairings p where p.id=_pairing_id and(p.user_a=_user_id or p.user_b=_user_id or private.role_exists(_user_id,'admin') or p.imam_id=(select imam_id from public.imam_accounts where user_id=_user_id and active limit 1))) $$;
revoke all on function public.has_role(uuid,public.app_role),public.has_active_membership(uuid),public.is_imam(uuid),public.my_imam_id(uuid),public.can_see_pairing(uuid,uuid) from public,anon;
grant execute on function public.has_role(uuid,public.app_role),public.has_active_membership(uuid),public.is_imam(uuid),public.my_imam_id(uuid),public.can_see_pairing(uuid,uuid) to authenticated,service_role;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name,contact_email) values(new.id,new.raw_user_meta_data->>'display_name',new.email) on conflict do nothing;
 insert into public.privacy_settings(user_id) values(new.id) on conflict do nothing;
 insert into public.subscriptions(user_id) values(new.id) on conflict do nothing;
 insert into public.user_roles(user_id,role) values(new.id,'user') on conflict do nothing;
 return new;
end $$;
revoke all on function private.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

do $$ declare t text; begin
 foreach t in array array['profiles','privacy_settings','survey_answers','matches','interests','imams','imam_applications','imam_accounts','subscriptions','stripe_events','pairings','pairing_messages','meetups','user_roles','admin_audit_log']
 loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;
create policy profiles_own on public.profiles for all to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy privacy_own on public.privacy_settings for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy surveys_own on public.survey_answers for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy matches_own on public.matches for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy interests_read on public.interests for select to authenticated using((select auth.uid()) in(from_user,to_user));
create policy interests_add on public.interests for insert to authenticated with check((select auth.uid())=from_user);
create policy interests_answer on public.interests for update to authenticated using((select auth.uid())=to_user) with check((select auth.uid())=to_user);
create policy imams_read on public.imams for select to authenticated using(true);
create policy imam_apps_read on public.imam_applications for select to authenticated using((select auth.uid())=user_id);
create policy imam_apps_add on public.imam_applications for insert to authenticated with check((select auth.uid())=user_id);
create policy imam_apps_edit on public.imam_applications for update to authenticated using((select auth.uid())=user_id and status='pending') with check((select auth.uid())=user_id and status='pending');
create policy imam_accounts_read on public.imam_accounts for select to authenticated using((select auth.uid())=user_id);
create policy subscriptions_read on public.subscriptions for select to authenticated using((select auth.uid())=user_id);
create policy user_roles_own_read on public.user_roles for select to authenticated using((select auth.uid())=user_id);
create policy pairings_read on public.pairings for select to authenticated using(public.can_see_pairing(id,(select auth.uid())));
create policy messages_read on public.pairing_messages for select to authenticated using(public.can_see_pairing(pairing_id,(select auth.uid())));
create policy messages_add on public.pairing_messages for insert to authenticated with check(sender_id=(select auth.uid()) and public.can_see_pairing(pairing_id,(select auth.uid())));
create policy meetups_read on public.meetups for select to authenticated using(public.can_see_pairing(pairing_id,(select auth.uid())));
create policy meetups_edit on public.meetups for update to authenticated using(public.can_see_pairing(pairing_id,(select auth.uid()))) with check(public.can_see_pairing(pairing_id,(select auth.uid())));
create policy stripe_events_client_deny on public.stripe_events for all to authenticated using(false) with check(false);
create policy audit_log_client_deny on public.admin_audit_log for all to authenticated using(false) with check(false);

revoke all on all tables in schema public from anon;
grant select,insert,update,delete on public.profiles,public.privacy_settings,public.survey_answers,public.matches,public.interests to authenticated;
grant select on public.imams,public.imam_accounts,public.subscriptions,public.user_roles,public.pairings,public.meetups to authenticated;
grant select,insert,update on public.imam_applications to authenticated;
grant select,insert on public.pairing_messages to authenticated;
grant update on public.meetups to authenticated;
revoke all on public.stripe_events,public.admin_audit_log from authenticated;
