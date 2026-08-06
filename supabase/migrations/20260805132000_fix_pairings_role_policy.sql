drop policy if exists pairings_read on public.pairings;
create policy pairings_read on public.pairings for select to authenticated using (
  public.has_role((select auth.uid()), 'admin')
  or imam_id = (
    select imam_id from public.imam_accounts
    where user_id=(select auth.uid()) and active
    limit 1
  )
  or (
    (select auth.uid()) in (user_a,user_b)
    and status in (
      'member_review','awaiting_payment','payment_pending',
      'ready_to_schedule','scheduled','completed'
    )
  )
);
