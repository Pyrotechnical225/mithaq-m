-- Weeks 4-6: restore the imam-led introduction lifecycle and keep raw member
-- identifiers behind authenticated server functions.

ALTER TABLE public.pairings
  ADD COLUMN IF NOT EXISTS compatibility_score integer,
  ADD COLUMN IF NOT EXISTS compatibility_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS member_a_response text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS member_b_response text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS meeting_preference_a text,
  ADD COLUMN IF NOT EXISTS meeting_preference_b text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pairings'::regclass AND conname = 'pairings_user_a_fkey'
  ) THEN
    ALTER TABLE public.pairings
      ADD CONSTRAINT pairings_user_a_fkey
      FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pairings'::regclass AND conname = 'pairings_user_b_fkey'
  ) THEN
    ALTER TABLE public.pairings
      ADD CONSTRAINT pairings_user_b_fkey
      FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

ALTER TABLE public.pairings DROP CONSTRAINT IF EXISTS pairings_status_check;
ALTER TABLE public.pairings
  ADD CONSTRAINT pairings_status_check CHECK (
    status IN (
      'pending', 'approved', 'closed', 'imam_review', 'member_review',
      'awaiting_payment', 'payment_pending', 'ready_to_schedule',
      'scheduled', 'completed', 'declined'
    )
  );

ALTER TABLE public.pairings DROP CONSTRAINT IF EXISTS pairings_compatibility_score_check;
ALTER TABLE public.pairings
  ADD CONSTRAINT pairings_compatibility_score_check
  CHECK (compatibility_score IS NULL OR compatibility_score BETWEEN 70 AND 100);

ALTER TABLE public.pairings DROP CONSTRAINT IF EXISTS pairings_member_a_response_check;
ALTER TABLE public.pairings
  ADD CONSTRAINT pairings_member_a_response_check
  CHECK (member_a_response IN ('pending', 'accepted', 'declined'));

ALTER TABLE public.pairings DROP CONSTRAINT IF EXISTS pairings_member_b_response_check;
ALTER TABLE public.pairings
  ADD CONSTRAINT pairings_member_b_response_check
  CHECK (member_b_response IN ('pending', 'accepted', 'declined'));

CREATE INDEX IF NOT EXISTS pairings_imam_review_idx
  ON public.pairings(imam_id, status, compatibility_score DESC);
CREATE INDEX IF NOT EXISTS pairings_member_a_status_idx
  ON public.pairings(user_a, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pairings_member_b_status_idx
  ON public.pairings(user_b, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pairing_id uuid REFERENCES public.pairings(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_length CHECK (length(btrim(kind)) BETWEEN 1 AND 80),
  CONSTRAINT notifications_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT notifications_body_length CHECK (length(btrim(body)) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_pairing_idx
  ON public.notifications(pairing_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_own_read ON public.notifications;
DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
CREATE POLICY notifications_own_read ON public.notifications
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;

-- Compatibility working data and legacy interest rows contain other member
-- identifiers. They are accessed through server functions, never directly by
-- a browser or MCP client.
ALTER TABLE public.matches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.interests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.interests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interests TO service_role;

-- Pairing rows also contain both Auth user ids. Member and imam pages use
-- server functions that return an intentionally anonymous projection.
REVOKE ALL ON public.pairings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.meetups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pairing_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pairings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetups TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pairing_messages TO service_role;

DROP POLICY IF EXISTS "pairing participants select" ON public.pairings;
DROP POLICY IF EXISTS "admin all pairings" ON public.pairings;
DROP POLICY IF EXISTS pairings_read ON public.pairings;
CREATE POLICY pairings_read ON public.pairings
  FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin')
    OR imam_id = public.my_imam_id((SELECT auth.uid()))
    OR (
      (SELECT auth.uid()) IN (user_a, user_b)
      AND (
        status IN (
          'member_review', 'awaiting_payment', 'payment_pending',
          'ready_to_schedule', 'scheduled', 'completed', 'approved', 'closed'
        )
        OR (
          status = 'declined'
          AND (member_a_response <> 'pending' OR member_b_response <> 'pending')
        )
      )
    )
  );

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
      FROM public.pairings AS pairing
      WHERE pairing.id = _pairing_id
        AND (
          EXISTS (
            SELECT 1 FROM public.user_roles AS role
            WHERE role.user_id = _user_id AND role.role = 'admin'
          )
          OR pairing.imam_id = (
            SELECT account.imam_id
            FROM public.imam_accounts AS account
            JOIN public.imams AS imam ON imam.id = account.imam_id
            WHERE account.user_id = _user_id
              AND account.active
              AND imam.verification_status = 'verified'
            LIMIT 1
          )
          OR (
            _user_id IN (pairing.user_a, pairing.user_b)
            AND (
              pairing.status IN (
                'member_review', 'awaiting_payment', 'payment_pending',
                'ready_to_schedule', 'scheduled', 'completed', 'approved', 'closed'
              )
              OR (
                pairing.status = 'declined'
                AND (
                  pairing.member_a_response <> 'pending'
                  OR pairing.member_b_response <> 'pending'
                )
              )
            )
          )
        )
    )
$$;
REVOKE EXECUTE ON FUNCTION private.can_see_pairing(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_see_pairing(uuid, uuid) TO authenticated, service_role;

-- The row lock makes simultaneous private responses safe: two acceptances
-- cannot leave a pairing stuck in member_review.
CREATE OR REPLACE FUNCTION public.respond_to_introduction(
  _pairing_id uuid,
  _accept boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  pairing_row public.pairings%ROWTYPE;
  response_value text := CASE WHEN _accept THEN 'accepted' ELSE 'declined' END;
  response_a text;
  response_b text;
  next_status text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO pairing_row
  FROM public.pairings
  WHERE id = _pairing_id
  FOR UPDATE;

  IF NOT FOUND
    OR caller_id NOT IN (pairing_row.user_a, pairing_row.user_b)
    OR pairing_row.status <> 'member_review'
  THEN
    RAISE EXCEPTION 'This introduction is not awaiting your response';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_blocks AS block
    WHERE (block.blocker_user_id = pairing_row.user_a AND block.blocked_user_id = pairing_row.user_b)
       OR (block.blocker_user_id = pairing_row.user_b AND block.blocked_user_id = pairing_row.user_a)
  ) THEN
    RAISE EXCEPTION 'This introduction is unavailable';
  END IF;

  IF (
    SELECT count(*)
    FROM public.member_consents AS consent
    WHERE consent.user_id IN (pairing_row.user_a, pairing_row.user_b)
      AND consent.compatibility_processing_consent_at IS NOT NULL
      AND consent.compatibility_processing_withdrawn_at IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Compatibility consent is no longer active for this introduction';
  END IF;

  response_a := CASE
    WHEN caller_id = pairing_row.user_a THEN response_value
    ELSE pairing_row.member_a_response
  END;
  response_b := CASE
    WHEN caller_id = pairing_row.user_b THEN response_value
    ELSE pairing_row.member_b_response
  END;

  next_status := CASE
    WHEN response_a = 'declined' OR response_b = 'declined' THEN 'declined'
    WHEN response_a = 'accepted' AND response_b = 'accepted' THEN 'awaiting_payment'
    ELSE 'member_review'
  END;

  UPDATE public.pairings
  SET member_a_response = response_a,
      member_b_response = response_b,
      status = next_status,
      payment_a_status = CASE WHEN next_status = 'awaiting_payment' THEN 'due' ELSE payment_a_status END,
      payment_b_status = CASE WHEN next_status = 'awaiting_payment' THEN 'due' ELSE payment_b_status END
  WHERE id = pairing_row.id;

  IF next_status = 'awaiting_payment' THEN
    INSERT INTO public.notifications(user_id, pairing_id, kind, title, body)
    VALUES
      (pairing_row.user_a, pairing_row.id, 'mutual_acceptance', 'You both accepted',
       'Both members accepted privately. Meeting package choices are now available.'),
      (pairing_row.user_b, pairing_row.id, 'mutual_acceptance', 'You both accepted',
       'Both members accepted privately. Meeting package choices are now available.');
  ELSIF next_status = 'declined' THEN
    INSERT INTO public.notifications(user_id, pairing_id, kind, title, body)
    VALUES
      (pairing_row.user_a, pairing_row.id, 'introduction_closed', 'Introduction closed',
       'This anonymous introduction will not move forward. Private responses are never attributed.'),
      (pairing_row.user_b, pairing_row.id, 'introduction_closed', 'Introduction closed',
       'This anonymous introduction will not move forward. Private responses are never attributed.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', next_status);
END
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_introduction(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_introduction(uuid, boolean)
  TO authenticated, service_role;
