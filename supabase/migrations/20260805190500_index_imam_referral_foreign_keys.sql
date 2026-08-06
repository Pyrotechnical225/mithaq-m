create index if not exists imam_referrals_referrer_imam_idx
  on public.imam_referrals(referrer_imam_id);
create index if not exists imam_referrals_reviewed_by_idx
  on public.imam_referrals(reviewed_by)
  where reviewed_by is not null;
