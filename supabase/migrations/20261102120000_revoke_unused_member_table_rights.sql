-- Signed-in members never need TRUNCATE, TRIGGER or REFERENCES on app tables.
-- TRUNCATE in particular ignores row-level security, so remove it everywhere.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, trigger, references on table public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
