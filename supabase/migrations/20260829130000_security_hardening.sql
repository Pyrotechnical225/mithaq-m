-- Mithaq security hardening.
-- Keep sensitive state changes behind authenticated server functions using the
-- service role, and narrow direct Data API access to the fields members own.

-- Security-definer helpers may only answer questions about the current member.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_active_membership(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = _user_id
        AND status IN ('active', 'trialing', 'complimentary')
        AND (current_period_end IS NULL OR current_period_end > now())
    )
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_membership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_imam_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT imam_id
  FROM public.imam_accounts
  WHERE (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND user_id = _user_id
    AND active
$$;
REVOKE EXECUTE ON FUNCTION public.my_imam_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_imam_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_imam(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1 FROM public.imam_accounts
      WHERE user_id = _user_id AND active
    )
$$;
REVOKE EXECUTE ON FUNCTION public.is_imam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_imam(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_see_pairing(_user_id uuid, _pairing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (_user_id = auth.uid() OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.pairings p
      WHERE p.id = _pairing_id
        AND (
          p.user_a = _user_id
          OR p.user_b = _user_id
          OR p.imam_id = public.my_imam_id(_user_id)
        )
    )
$$;
REVOKE EXECUTE ON FUNCTION public.can_see_pairing(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_pairing(uuid, uuid) TO authenticated, service_role;

-- A completed survey must contain a valid value for every required question.
CREATE OR REPLACE FUNCTION public.mithaq_survey_is_complete(candidate jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(candidate) = 'object'
    AND (
      SELECT bool_and(coalesce(length(btrim(candidate ->> question_id::text)), 0) > 0)
      FROM generate_series(1, 30) AS question_id
    )
    AND candidate ->> '2' IN ('Male', 'Female')
    AND CASE
      WHEN candidate ->> '1' ~ '^[0-9]{2,3}$'
        THEN (candidate ->> '1')::integer BETWEEN 18 AND 100
      ELSE false
    END
$$;
REVOKE EXECUTE ON FUNCTION public.mithaq_survey_is_complete(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mithaq_survey_is_complete(jsonb) TO authenticated, service_role;

ALTER TABLE public.survey_answers
  ADD CONSTRAINT survey_completed_answers_valid
  CHECK (NOT completed OR public.mithaq_survey_is_complete(answers)) NOT VALID;

-- Profile changes go through authenticated server functions. In particular,
-- contact_email remains the verified Auth email written by the signup trigger
-- or an administrator.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

REVOKE DELETE ON public.survey_answers FROM authenticated;

-- Match, handshake, review, scheduling and message mutations are now performed
-- only by server functions after explicit row-level authorization checks.
REVOKE INSERT, UPDATE, DELETE ON public.matches FROM authenticated;
GRANT SELECT ON public.matches TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.interests FROM authenticated;
GRANT SELECT ON public.interests TO authenticated;
DROP POLICY IF EXISTS "interests insert own" ON public.interests;
DROP POLICY IF EXISTS "interests update recipient" ON public.interests;
ALTER TABLE public.interests
  ADD CONSTRAINT interests_distinct_members CHECK (from_user <> to_user) NOT VALID;

REVOKE UPDATE ON public.pairings FROM authenticated;
GRANT SELECT ON public.pairings TO authenticated;
DROP POLICY IF EXISTS "assigned imam updates pairing" ON public.pairings;

REVOKE INSERT, UPDATE ON public.meetups FROM authenticated;
GRANT SELECT ON public.meetups TO authenticated;
DROP POLICY IF EXISTS "assigned imam inserts meetup" ON public.meetups;
DROP POLICY IF EXISTS "participants update meetup" ON public.meetups;

REVOKE INSERT ON public.pairing_messages FROM authenticated;
GRANT SELECT ON public.pairing_messages TO authenticated;
DROP POLICY IF EXISTS "pairing messages insert" ON public.pairing_messages;
ALTER TABLE public.pairing_messages
  ADD CONSTRAINT pairing_messages_role_valid CHECK (sender_role IN ('member', 'imam')) NOT VALID;

-- Authenticated imam applications are owned by their submitter. Anonymous
-- inserts and applicant writes to review/admin columns are removed.
REVOKE ALL ON public.imam_applications FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.imam_applications FROM authenticated;
GRANT SELECT ON public.imam_applications TO authenticated;
GRANT INSERT (name, mosque, city, postcode, languages, phone, email, credentials, message, user_id)
  ON public.imam_applications TO authenticated;
DROP POLICY IF EXISTS "anyone can apply anon" ON public.imam_applications;
DROP POLICY IF EXISTS "anyone can apply auth" ON public.imam_applications;
DROP POLICY IF EXISTS "own imam application select" ON public.imam_applications;
CREATE POLICY "own imam application select" ON public.imam_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own imam application insert" ON public.imam_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND admin_notes IS NULL
    AND reviewed_at IS NULL
    AND imam_id IS NULL
  );

-- Validate new state without making deployment depend on repairing historic
-- rows in the same transaction. Existing rows can be remediated then validated.
ALTER TABLE public.interests
  ADD CONSTRAINT interests_status_valid CHECK (status IN ('pending', 'accepted', 'declined')) NOT VALID;
ALTER TABLE public.meetups
  ADD CONSTRAINT meetups_response_a_valid CHECK (response_a IN ('pending', 'accepted', 'declined')) NOT VALID,
  ADD CONSTRAINT meetups_response_b_valid CHECK (response_b IN ('pending', 'accepted', 'declined')) NOT VALID,
  ADD CONSTRAINT meetups_status_valid CHECK (status IN ('proposed', 'confirmed', 'declined', 'cancelled')) NOT VALID;
