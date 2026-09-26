-- Week 1 runtime hardening for the live Mithaq schema.
-- The live project predates some repository policy names, so this migration
-- deliberately handles both generations before recreating one secure policy set.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_see_pairing(_pairing_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (_user_id = (SELECT auth.uid()) OR auth.role() = 'service_role')
    AND EXISTS (
      SELECT 1
      FROM public.pairings p
      WHERE p.id = _pairing_id
        AND (
          p.user_a = _user_id
          OR p.user_b = _user_id
          OR EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = _user_id AND ur.role = 'admin'
          )
          OR p.imam_id = (
            SELECT ia.imam_id
            FROM public.imam_accounts ia
            WHERE ia.user_id = _user_id AND ia.active
            LIMIT 1
          )
        )
    )
$$;
REVOKE EXECUTE ON FUNCTION private.can_see_pairing(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_see_pairing(uuid, uuid) TO authenticated, service_role;

-- Keep public role helpers callable but scoped to the current authenticated user.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    )
$$;

CREATE OR REPLACE FUNCTION public.has_active_membership(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND (
      public.has_role(_user_id, 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.subscriptions
        WHERE user_id = _user_id
          AND status IN ('active', 'trialing', 'complimentary')
          AND (current_period_end IS NULL OR current_period_end > now())
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.my_imam_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT imam_id
  FROM public.imam_accounts
  WHERE _user_id = (SELECT auth.uid()) AND user_id = _user_id AND active
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
      SELECT 1 FROM public.imam_accounts WHERE user_id = _user_id AND active
    )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_membership(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_imam_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_imam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_imam_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_imam(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "meetups_edit" ON public.meetups;
DROP POLICY IF EXISTS "meetup participants select" ON public.meetups;
DROP POLICY IF EXISTS "assigned imam inserts meetup" ON public.meetups;
DROP POLICY IF EXISTS "participants update meetup" ON public.meetups;
DROP POLICY IF EXISTS "meetups_read" ON public.meetups;
CREATE POLICY "meetups_read" ON public.meetups
  FOR SELECT TO authenticated
  USING (private.can_see_pairing(pairing_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "messages_add" ON public.pairing_messages;
DROP POLICY IF EXISTS "pairing messages insert" ON public.pairing_messages;
DROP POLICY IF EXISTS "pairing messages select" ON public.pairing_messages;
DROP POLICY IF EXISTS "messages_read" ON public.pairing_messages;
CREATE POLICY "messages_read" ON public.pairing_messages
  FOR SELECT TO authenticated
  USING (private.can_see_pairing(pairing_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "assigned imam updates pairing" ON public.pairings;
DROP POLICY IF EXISTS "interests insert own" ON public.interests;
DROP POLICY IF EXISTS "interests update recipient" ON public.interests;
DROP POLICY IF EXISTS "interests_add" ON public.interests;
DROP POLICY IF EXISTS "interests_answer" ON public.interests;

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
REVOKE DELETE ON public.survey_answers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.matches FROM authenticated;
GRANT SELECT ON public.matches TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.interests FROM authenticated;
GRANT SELECT ON public.interests TO authenticated;
REVOKE UPDATE ON public.pairings FROM authenticated;
GRANT SELECT ON public.pairings TO authenticated;
REVOKE INSERT, UPDATE ON public.meetups FROM authenticated;
GRANT SELECT ON public.meetups TO authenticated;
REVOKE INSERT ON public.pairing_messages FROM authenticated;
GRANT SELECT ON public.pairing_messages TO authenticated;

REVOKE ALL ON public.imam_applications FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.imam_applications FROM authenticated;
GRANT SELECT ON public.imam_applications TO authenticated;
GRANT INSERT (name, mosque, city, postcode, languages, phone, email, credentials, message, user_id)
  ON public.imam_applications TO authenticated;
DROP POLICY IF EXISTS "anyone can apply anon" ON public.imam_applications;
DROP POLICY IF EXISTS "anyone can apply auth" ON public.imam_applications;
DROP POLICY IF EXISTS "imam_apps_add" ON public.imam_applications;
DROP POLICY IF EXISTS "imam_apps_edit" ON public.imam_applications;
DROP POLICY IF EXISTS "imam_apps_read" ON public.imam_applications;
DROP POLICY IF EXISTS "own imam application select" ON public.imam_applications;
DROP POLICY IF EXISTS "own imam application insert" ON public.imam_applications;
CREATE POLICY "own imam application select" ON public.imam_applications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "own imam application insert" ON public.imam_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND admin_notes IS NULL
    AND reviewed_at IS NULL
    AND imam_id IS NULL
  );

CREATE OR REPLACE FUNCTION public.mithaq_survey_is_complete(candidate jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_typeof(candidate) = 'object'
    AND (
      SELECT bool_and(COALESCE(length(btrim(candidate ->> question_id::text)), 0) > 0)
      FROM generate_series(1, 30) AS question_id
    )
    AND candidate ->> '2' IN ('Male', 'Female')
    AND CASE
      WHEN candidate ->> '1' ~ '^[0-9]{2,3}$'
        THEN (candidate ->> '1')::integer BETWEEN 18 AND 100
      ELSE false
    END,
    false
  )
$$;
REVOKE EXECUTE ON FUNCTION public.mithaq_survey_is_complete(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mithaq_survey_is_complete(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_completed_answers_valid') THEN
    ALTER TABLE public.survey_answers
      ADD CONSTRAINT survey_completed_answers_valid
      CHECK (NOT completed OR public.mithaq_survey_is_complete(answers)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interests_distinct_members') THEN
    ALTER TABLE public.interests
      ADD CONSTRAINT interests_distinct_members CHECK (from_user <> to_user) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interests_status_valid') THEN
    ALTER TABLE public.interests
      ADD CONSTRAINT interests_status_valid
      CHECK (status IN ('pending', 'accepted', 'declined')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pairing_messages_role_valid') THEN
    ALTER TABLE public.pairing_messages
      ADD CONSTRAINT pairing_messages_role_valid CHECK (sender_role IN ('member', 'imam')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetups_response_a_valid') THEN
    ALTER TABLE public.meetups
      ADD CONSTRAINT meetups_response_a_valid
      CHECK (response_a IN ('pending', 'accepted', 'declined')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetups_response_b_valid') THEN
    ALTER TABLE public.meetups
      ADD CONSTRAINT meetups_response_b_valid
      CHECK (response_b IN ('pending', 'accepted', 'declined')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetups_status_valid') THEN
    ALTER TABLE public.meetups
      ADD CONSTRAINT meetups_status_valid
      CHECK (status IN ('proposed', 'confirmed', 'declined', 'cancelled')) NOT VALID;
  END IF;
END
$$;

-- The helper is now private and unavailable through the public RPC endpoint.
DROP FUNCTION IF EXISTS public.can_see_pairing(uuid, uuid);
