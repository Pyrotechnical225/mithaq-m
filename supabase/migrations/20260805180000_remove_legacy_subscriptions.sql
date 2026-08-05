-- The member journey now charges only a one-off introduction fee. Deploy the
-- compatible application code before applying this migration.
set lock_timeout = '5s';

drop function if exists public.has_active_membership(uuid);
drop table if exists public.subscriptions;
