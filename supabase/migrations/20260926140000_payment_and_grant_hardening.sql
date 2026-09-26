-- 1. When both members' payments are recorded, the pairing is ready to
--    schedule. Each payment is applied independently (webhook or browser
--    confirmation), so two concurrent payments could each see "other side not
--    paid yet" and leave the pairing stuck at payment_pending. Deciding the
--    status from the row being written removes that race.
create or replace function private.pairings_ready_when_both_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_a_status = 'paid'
     and new.payment_b_status = 'paid'
     and new.status in ('awaiting_payment', 'payment_pending') then
    new.status := 'ready_to_schedule';
  end if;
  return new;
end;
$$;

drop trigger if exists pairings_ready_when_both_paid on public.pairings;
create trigger pairings_ready_when_both_paid
  before update of payment_a_status, payment_b_status, status on public.pairings
  for each row execute function private.pairings_ready_when_both_paid();

-- 2. Logged-out visitors never use imam referrals; row-level security already
--    denied them, this removes the unused table privileges as well.
revoke all on table public.imam_referrals from anon;
