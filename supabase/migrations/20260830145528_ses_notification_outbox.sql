-- Disabled-by-default delivery foundation. Applying this does NOT activate SES
-- or install a schedule. Existing notifications are deliberately not backfilled.
BEGIN;

CREATE SCHEMA IF NOT EXISTS mithaq_private;
REVOKE ALL ON SCHEMA mithaq_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mithaq_private TO service_role;

CREATE TABLE public.email_notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('matches','meetings','check_ins','payments','imam','admin')),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, category)
);
ALTER TABLE public.email_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY email_preferences_own_read ON public.email_notification_preferences FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY email_preferences_own_insert ON public.email_notification_preferences FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY email_preferences_own_update ON public.email_notification_preferences FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.email_notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_notification_preferences TO authenticated;
GRANT ALL ON public.email_notification_preferences TO service_role;

CREATE TABLE public.notification_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  pairing_id uuid REFERENCES public.pairings(id) ON DELETE CASCADE,
  meetup_id uuid REFERENCES public.meetups(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE CHECK (length(event_key) <= 240),
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 80),
  not_before timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','accepted','skipped','failed','unknown')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  claim_token uuid,
  claimed_at timestamptz,
  ses_message_id text,
  last_error_code text CHECK (length(last_error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > not_before)
);
CREATE INDEX notification_email_jobs_due_idx ON public.notification_email_jobs(not_before, created_at) WHERE status = 'queued';
CREATE INDEX notification_email_jobs_claim_idx ON public.notification_email_jobs(claimed_at) WHERE status = 'processing';
CREATE INDEX notification_email_jobs_user_idx ON public.notification_email_jobs(user_id);
CREATE INDEX notification_email_jobs_notification_idx ON public.notification_email_jobs(notification_id);
CREATE INDEX notification_email_jobs_pairing_idx ON public.notification_email_jobs(pairing_id);
CREATE INDEX notification_email_jobs_meetup_idx ON public.notification_email_jobs(meetup_id);
ALTER TABLE public.notification_email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_email_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_email_jobs TO service_role;

ALTER TABLE public.meetups ADD COLUMN completed_at timestamptz;
-- A legacy NOT VALID constraint still rejected new completed statuses.
ALTER TABLE public.meetups DROP CONSTRAINT IF EXISTS meetups_status_valid;
ALTER TABLE public.meetups ADD CONSTRAINT meetups_status_valid CHECK (status IN ('proposed','confirmed','completed','declined','cancelled')) NOT VALID;

CREATE TABLE public.meeting_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES public.meetups(id) ON DELETE CASCADE,
  pairing_id uuid NOT NULL REFERENCES public.pairings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  answered_at timestamptz,
  outcome text CHECK (outcome IN ('getting_to_know','moving_forward','not_continuing','support_requested')),
  note text CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(meetup_id,user_id)
);
CREATE INDEX meeting_check_ins_user_due_idx ON public.meeting_check_ins(user_id,due_at) WHERE answered_at IS NULL;
CREATE INDEX meeting_check_ins_pairing_idx ON public.meeting_check_ins(pairing_id);
ALTER TABLE public.meeting_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_check_ins FORCE ROW LEVEL SECURITY;
CREATE POLICY meeting_check_ins_own_read ON public.meeting_check_ins FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.meeting_check_ins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.meeting_check_ins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_check_ins TO service_role;

ALTER TABLE public.notification_email_jobs
  ADD COLUMN check_in_id uuid REFERENCES public.meeting_check_ins(id) ON DELETE CASCADE;
CREATE INDEX notification_email_jobs_check_in_idx ON public.notification_email_jobs(check_in_id)
  WHERE check_in_id IS NOT NULL;

CREATE FUNCTION mithaq_private.notification_to_email() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.kind NOT IN ('anonymous_profile_ready','mutual_acceptance','introduction_closed','introduction_unavailable','imam_match_review','imam_ready_to_schedule','meeting_proposed','meeting_confirmed','meeting_cancelled','meeting_payment_received','imam_referral_review','imam_referral_decision') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notification_email_jobs(user_id, notification_id, pairing_id, event_key, kind)
  VALUES(NEW.user_id, NEW.id, NEW.pairing_id, 'notification:' || NEW.id::text, NEW.kind)
  ON CONFLICT(event_key) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mithaq_private.notification_to_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notification_email_outbox AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION mithaq_private.notification_to_email();

CREATE FUNCTION mithaq_private.meeting_completion_time() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      RAISE EXCEPTION 'Record a confirmed meeting before marking it completed';
    END IF;
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'Completed meetings require an audited correction';
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF OLD.status <> 'confirmed' OR OLD.scheduled_at > now() OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
      RAISE EXCEPTION 'Only a confirmed meeting that has taken place can be completed';
    END IF;
    -- Anchor to the meeting date, even when an imam records attendance later.
    -- The status transition is the explicit confirmation that it took place.
    NEW.completed_at := OLD.scheduled_at;
  ELSIF NEW.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at := NULL;
  ELSE
    NEW.completed_at := OLD.completed_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mithaq_private.meeting_completion_time() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER meeting_record_completion BEFORE INSERT OR UPDATE ON public.meetups FOR EACH ROW EXECUTE FUNCTION mithaq_private.meeting_completion_time();

CREATE FUNCTION mithaq_private.meeting_email_events() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.pairings; recipient uuid; event_kind text; event_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO p FROM public.pairings WHERE id = NEW.pairing_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    event_kind := CASE WHEN NEW.status = 'proposed' THEN 'meeting_proposed' ELSE NULL END;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.venue IS DISTINCT FROM OLD.venue OR NEW.address IS DISTINCT FROM OLD.address THEN
    event_kind := CASE WHEN NEW.status = 'proposed' THEN 'meeting_proposed' WHEN NEW.status = 'confirmed' THEN 'meeting_confirmed' WHEN NEW.status IN ('cancelled','declined') THEN 'meeting_cancelled' ELSE NULL END;
    UPDATE public.notification_email_jobs SET status = 'skipped', last_error_code = 'meeting_changed', updated_at = now()
    WHERE meetup_id = NEW.id AND status = 'queued'
      AND (kind = 'meeting_reminder' OR (kind = 'meeting_followup' AND NEW.status <> 'completed'));
  ELSE RETURN NEW;
  END IF;
  FOREACH recipient IN ARRAY ARRAY[p.user_a,p.user_b] LOOP
    IF event_kind IS NOT NULL THEN
      INSERT INTO public.notification_email_jobs(user_id,pairing_id,meetup_id,event_key,kind)
      VALUES(recipient,p.id,NEW.id,'meeting:' || event_id::text || ':' || recipient::text,event_kind) ON CONFLICT(event_key) DO NOTHING;
    END IF;
    IF NEW.status = 'confirmed' AND NEW.scheduled_at > now() THEN
      INSERT INTO public.notification_email_jobs(user_id,pairing_id,meetup_id,event_key,kind,not_before,expires_at)
      VALUES(recipient,p.id,NEW.id,'reminder:' || event_id::text || ':' || recipient::text,'meeting_reminder',GREATEST(now(),NEW.scheduled_at - interval '24 hours'),NEW.scheduled_at) ON CONFLICT(event_key) DO NOTHING;
    END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
      INSERT INTO public.meeting_check_ins(meetup_id,pairing_id,user_id,due_at)
      VALUES(NEW.id,p.id,recipient,NEW.completed_at + interval '21 days') ON CONFLICT(meetup_id,user_id) DO NOTHING;
      INSERT INTO public.notification_email_jobs(user_id,pairing_id,meetup_id,event_key,kind,not_before,expires_at)
      VALUES(recipient,p.id,NEW.id,'check-in:' || NEW.id::text || ':' || recipient::text,'meeting_followup',NEW.completed_at + interval '21 days',NEW.completed_at + interval '28 days') ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notification_email_jobs(user_id,pairing_id,meetup_id,event_key,kind)
    SELECT a.user_id,p.id,NEW.id,'imam-meeting:' || event_id::text || ':' || a.user_id::text,'imam_meeting_update'
    FROM public.imam_accounts a JOIN public.imams i ON i.id = a.imam_id
    WHERE a.imam_id = p.imam_id AND a.active AND i.verification_status = 'verified'
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mithaq_private.meeting_email_events() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER meeting_notification_events AFTER INSERT OR UPDATE ON public.meetups FOR EACH ROW EXECUTE FUNCTION mithaq_private.meeting_email_events();

-- One bounded claim per worker call, atomic under concurrent requests. Never
-- retry expired processing claims: SES may already have accepted that message.
CREATE FUNCTION public.claim_notification_email(p_claim_token uuid) RETURNS SETOF public.notification_email_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_claim_token IS NULL THEN RAISE EXCEPTION 'Claim token is required'; END IF;
  UPDATE public.notification_email_jobs SET status = 'unknown', last_error_code = 'claim_expired', updated_at = now()
  WHERE status = 'processing' AND claimed_at < now() - interval '5 minutes';
  UPDATE public.notification_email_jobs SET status = 'skipped', last_error_code = 'expired', updated_at = now()
  WHERE status = 'queued' AND expires_at <= now();
  RETURN QUERY UPDATE public.notification_email_jobs j
  SET status = 'processing', claim_token = p_claim_token, claimed_at = now(), attempts = j.attempts + 1, updated_at = now()
  WHERE j.id = (SELECT q.id FROM public.notification_email_jobs q WHERE q.status = 'queued' AND q.not_before <= now() AND q.expires_at > now() AND q.attempts < 5 ORDER BY q.not_before,q.created_at,q.id LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_notification_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email(uuid) TO service_role;

CREATE FUNCTION mithaq_private.pairing_payment_emails() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.payment_a_status = 'paid' AND OLD.payment_a_status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind)
    VALUES(NEW.user_a,NEW.id,'payment:' || NEW.id::text || ':a','meeting_payment_received') ON CONFLICT(event_key) DO NOTHING;
  END IF;
  IF NEW.payment_b_status = 'paid' AND OLD.payment_b_status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind)
    VALUES(NEW.user_b,NEW.id,'payment:' || NEW.id::text || ':b','meeting_payment_received') ON CONFLICT(event_key) DO NOTHING;
  END IF;
  IF NEW.status = 'ready_to_schedule' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind)
    SELECT a.user_id,NEW.id,'ready:' || NEW.id::text || ':' || a.user_id::text,'imam_ready_to_schedule'
    FROM public.imam_accounts a JOIN public.imams i ON i.id = a.imam_id
    WHERE a.imam_id = NEW.imam_id AND a.active AND i.verification_status = 'verified'
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mithaq_private.pairing_payment_emails() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pairing_payment_email_events AFTER UPDATE ON public.pairings FOR EACH ROW EXECUTE FUNCTION mithaq_private.pairing_payment_emails();

CREATE FUNCTION mithaq_private.referral_email_events() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notification_email_jobs(user_id,event_key,kind)
    SELECT r.user_id,'referral-review:' || NEW.id::text || ':' || r.user_id::text,'imam_referral_review'
    FROM public.user_roles r WHERE r.role = 'admin' ON CONFLICT(event_key) DO NOTHING;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('approved','declined','invited') THEN
    INSERT INTO public.notification_email_jobs(user_id,event_key,kind)
    VALUES(NEW.referrer_user_id,'referral-decision:' || NEW.id::text,'imam_referral_decision') ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mithaq_private.referral_email_events() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER referral_notification_events AFTER INSERT OR UPDATE ON public.imam_referrals FOR EACH ROW EXECUTE FUNCTION mithaq_private.referral_email_events();

COMMIT;
