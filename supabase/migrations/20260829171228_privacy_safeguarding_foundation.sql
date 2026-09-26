-- Weeks 2-3: privacy, safeguarding, verified-imam, MFA and audit foundations.
-- Sensitive trust records are intentionally service-role only. Member access
-- is mediated by authenticated server functions that validate ownership.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.member_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  adult_confirmed_at timestamptz,
  privacy_notice_version text,
  privacy_notice_accepted_at timestamptz,
  compatibility_processing_consent_at timestamptz,
  compatibility_processing_withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_consents_privacy_version_valid CHECK (
    privacy_notice_version IS NULL
    OR length(btrim(privacy_notice_version)) BETWEEN 1 AND 40
  ),
  CONSTRAINT member_consents_privacy_acceptance_consistent CHECK (
    (privacy_notice_version IS NULL) = (privacy_notice_accepted_at IS NULL)
  ),
  CONSTRAINT member_consents_withdrawal_consistent CHECK (
    compatibility_processing_withdrawn_at IS NULL
    OR (
      compatibility_processing_consent_at IS NOT NULL
      AND compatibility_processing_withdrawn_at >= compatibility_processing_consent_at
    )
  )
);

ALTER TABLE public.member_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_consents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_consents TO service_role;
CREATE TRIGGER member_consents_updated_at
  BEFORE UPDATE ON public.member_consents
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

CREATE TABLE public.member_blocks (
  blocker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CONSTRAINT member_blocks_distinct_members CHECK (blocker_user_id <> blocked_user_id),
  CONSTRAINT member_blocks_reason_length CHECK (reason IS NULL OR length(reason) <= 500)
);

CREATE INDEX member_blocks_blocked_user_idx ON public.member_blocks(blocked_user_id);
ALTER TABLE public.member_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_blocks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.member_blocks TO service_role;

CREATE TABLE public.member_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pairing_id uuid REFERENCES public.pairings(id) ON DELETE SET NULL,
  category text NOT NULL,
  details text NOT NULL,
  status text NOT NULL DEFAULT 'submitted',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_reports_distinct_members CHECK (reporter_user_id <> reported_user_id),
  CONSTRAINT member_reports_category_valid CHECK (
    category IN ('harassment', 'safety', 'identity', 'inappropriate_content', 'other')
  ),
  CONSTRAINT member_reports_details_length CHECK (length(btrim(details)) BETWEEN 10 AND 2000),
  CONSTRAINT member_reports_status_valid CHECK (
    status IN ('submitted', 'reviewing', 'actioned', 'dismissed')
  )
);

CREATE INDEX member_reports_reporter_created_idx
  ON public.member_reports(reporter_user_id, created_at DESC);
CREATE INDEX member_reports_reported_status_idx
  ON public.member_reports(reported_user_id, status, created_at DESC);
CREATE INDEX member_reports_pairing_idx ON public.member_reports(pairing_id);
CREATE INDEX member_reports_reviewed_by_idx ON public.member_reports(reviewed_by);
ALTER TABLE public.member_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_reports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.member_reports TO service_role;
CREATE TRIGGER member_reports_updated_at
  BEFORE UPDATE ON public.member_reports
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- Only reviewed, active imams may appear to members or operate an imam account.
ALTER TABLE public.imams
  ADD COLUMN verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT imams_verification_status_valid
    CHECK (verification_status IN ('pending', 'verified', 'suspended'));

UPDATE public.imams AS imam
SET verification_status = 'verified',
    verified_at = COALESCE(imam.verified_at, now())
WHERE EXISTS (
  SELECT 1
  FROM public.imam_accounts AS account
  WHERE account.imam_id = imam.id AND account.active
)
OR EXISTS (
  SELECT 1
  FROM public.imam_applications AS application
  WHERE application.imam_id = imam.id AND application.status = 'approved'
);

CREATE INDEX imams_verification_city_idx ON public.imams(verification_status, city);
CREATE INDEX imams_verified_by_idx ON public.imams(verified_by);

REVOKE ALL ON public.imams FROM authenticated;
GRANT SELECT (
  id, name, title, mosque, city, postcode, lat, lng, website, languages,
  verification_status, verified_at, created_at, updated_at
) ON public.imams TO authenticated;

CREATE OR REPLACE FUNCTION public.my_imam_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT account.imam_id
  FROM public.imam_accounts AS account
  JOIN public.imams AS imam ON imam.id = account.imam_id
  WHERE _user_id = (SELECT auth.uid())
    AND account.user_id = _user_id
    AND account.active
    AND imam.verification_status = 'verified'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_imam(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.imam_accounts AS account
      JOIN public.imams AS imam ON imam.id = account.imam_id
      WHERE account.user_id = _user_id
        AND account.active
        AND imam.verification_status = 'verified'
    )
$$;

REVOKE EXECUTE ON FUNCTION public.my_imam_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_imam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_imam_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_imam(uuid) TO authenticated, service_role;

-- This table existed in production before its schema was committed to the
-- migration history. Recreate the production shape for deterministic local and
-- staging rebuilds, while keeping access behind the validated server functions.
CREATE TABLE IF NOT EXISTS public.imam_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_imam_id uuid NOT NULL REFERENCES public.imams(id) ON DELETE CASCADE,
  referred_name text NOT NULL CHECK (char_length(referred_name) BETWEEN 2 AND 120),
  referred_email text NOT NULL CHECK (char_length(referred_email) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'invited', 'redeeming', 'completed')),
  admin_notes text,
  invitation_token_hash text UNIQUE,
  invitation_expires_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS imam_referrals_open_email_idx
  ON public.imam_referrals(lower(referred_email))
  WHERE status IN ('pending', 'approved', 'invited', 'redeeming');
CREATE INDEX IF NOT EXISTS imam_referrals_referrer_idx
  ON public.imam_referrals(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS imam_referrals_referrer_imam_idx
  ON public.imam_referrals(referrer_imam_id);
CREATE INDEX IF NOT EXISTS imam_referrals_reviewed_by_idx
  ON public.imam_referrals(reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS imam_referrals_status_idx
  ON public.imam_referrals(status, created_at DESC);
ALTER TABLE public.imam_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imam_referrals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.imam_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imam_referrals TO service_role;
DROP TRIGGER IF EXISTS imam_referrals_updated_at ON public.imam_referrals;
CREATE TRIGGER imam_referrals_updated_at
  BEFORE UPDATE ON public.imam_referrals
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- The application service may append audit events, but cannot rewrite history.
-- Earlier production work created this table outside the checked-in migration
-- history. Define the same shape here so a fresh local/staging database can be
-- rebuilt deterministically. IF NOT EXISTS keeps the migration safe for an
-- environment that already has the table.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.reject_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'admin audit history is append-only';
END;
$$;

REVOKE ALL ON FUNCTION private.reject_admin_audit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION private.reject_admin_audit_mutation();

REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_log FROM service_role;
GRANT SELECT, INSERT ON public.admin_audit_log TO service_role;
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_created_idx
  ON public.admin_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_created_idx
  ON public.admin_audit_log(target_type, target_id, created_at DESC);
