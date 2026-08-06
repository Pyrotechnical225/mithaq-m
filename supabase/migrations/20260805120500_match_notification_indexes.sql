drop index if exists public.pairings_unique_members_idx;
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_pairing_idx
  on public.notifications(pairing_id);
