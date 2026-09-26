-- A bounded, opt-in lifecycle for useful transactional reminders. No email is
-- sent by this migration: it only creates private outbox jobs. The worker still
-- rechecks the recipient, preference, role, assignment, consent and live state.
BEGIN;

ALTER TABLE public.email_notification_preferences
  DROP CONSTRAINT email_notification_preferences_category_check;
ALTER TABLE public.email_notification_preferences
  ADD CONSTRAINT email_notification_preferences_category_check
  CHECK (category IN ('journey','matches','meetings','check_ins','payments','imam','admin'));

ALTER TABLE public.notification_email_jobs
  ADD COLUMN referral_id uuid REFERENCES public.imam_referrals(id) ON DELETE CASCADE,
  ADD COLUMN imam_application_id uuid REFERENCES public.imam_applications(id) ON DELETE CASCADE;
CREATE INDEX notification_email_jobs_referral_idx
  ON public.notification_email_jobs(referral_id) WHERE referral_id IS NOT NULL;
CREATE INDEX notification_email_jobs_imam_application_idx
  ON public.notification_email_jobs(imam_application_id) WHERE imam_application_id IS NOT NULL;

CREATE OR REPLACE FUNCTION mithaq_private.referral_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notification_email_jobs(user_id,referral_id,event_key,kind)
    SELECT r.user_id,NEW.id,'referral-review:' || NEW.id::text || ':' || r.user_id::text,
           'imam_referral_review'
    FROM public.user_roles r
    WHERE r.role = 'admin'
    ON CONFLICT(event_key) DO NOTHING;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('approved','declined','invited') THEN
    INSERT INTO public.notification_email_jobs(user_id,referral_id,event_key,kind)
    VALUES(NEW.referrer_user_id,NEW.id,'referral-decision:' || NEW.id::text,
           'imam_referral_decision')
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION mithaq_private.imam_application_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notification_email_jobs(user_id,imam_application_id,event_key,kind)
      VALUES(NEW.user_id,NEW.id,'imam-application-received:' || NEW.id::text,
             'imam_application_received')
      ON CONFLICT(event_key) DO NOTHING;
    END IF;

    INSERT INTO public.notification_email_jobs(user_id,imam_application_id,event_key,kind)
    SELECT r.user_id,NEW.id,'imam-application-review:' || NEW.id::text || ':' || r.user_id::text,
           'imam_application_review'
    FROM public.user_roles r
    WHERE r.role = 'admin'
    ON CONFLICT(event_key) DO NOTHING;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('approved','declined')
        AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notification_email_jobs(user_id,imam_application_id,event_key,kind)
    VALUES(NEW.user_id,NEW.id,'imam-application-decision:' || NEW.id::text,
           'imam_application_decision')
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mithaq_private.imam_application_email_events()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER imam_application_notification_events
AFTER INSERT OR UPDATE ON public.imam_applications
FOR EACH ROW EXECUTE FUNCTION mithaq_private.imam_application_email_events();

CREATE FUNCTION mithaq_private.survey_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.completed AND (TG_OP = 'INSERT' OR NOT OLD.completed) THEN
    INSERT INTO public.notification_email_jobs(user_id,event_key,kind)
    VALUES(NEW.user_id,'survey-completed:' || NEW.user_id::text,'journey_survey_completed')
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mithaq_private.survey_email_events()
  FROM PUBLIC,anon,authenticated;
CREATE TRIGGER survey_notification_events
AFTER INSERT OR UPDATE OF completed ON public.survey_answers
FOR EACH ROW EXECUTE FUNCTION mithaq_private.survey_email_events();

CREATE FUNCTION mithaq_private.enqueue_due_notification_reminders(
  p_at timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  cycle text := pg_catalog.to_char(p_at AT TIME ZONE 'UTC', 'IYYY-IW');
  inserted integer := 0;
  queued integer := 0;
BEGIN
  -- Weekly journey nudge, capped at eight messages and suppressed while the
  -- member is paused or already has an active introduction.
  INSERT INTO public.notification_email_jobs(user_id,event_key,kind,not_before,expires_at)
  SELECT u.id,'journey-progress:' || u.id::text || ':' || cycle,
         'journey_progress_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM auth.users u
  JOIN public.email_notification_preferences pref
    ON pref.user_id=u.id AND pref.category='journey' AND pref.enabled
  LEFT JOIN public.survey_answers survey ON survey.user_id=u.id
  LEFT JOIN public.privacy_settings privacy ON privacy.user_id=u.id
  WHERE u.email_confirmed_at IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until <= p_at)
    AND (survey.user_id IS NULL OR NOT survey.completed
         OR privacy.user_id IS NULL OR privacy.visibility='hidden')
    AND (privacy.visibility IS NULL OR privacy.visibility <> 'paused')
    AND GREATEST(
      u.created_at,
      COALESCE(survey.updated_at,u.created_at),
      COALESCE(privacy.updated_at,u.created_at)
    ) <= p_at - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles role
      WHERE role.user_id=u.id AND role.role='admin'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.imam_accounts account
      WHERE account.user_id=u.id AND account.active
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pairings pair
      WHERE (pair.user_a=u.id OR pair.user_b=u.id)
        AND pair.status NOT IN ('closed','declined','completed')
    )
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=u.id AND previous.kind='journey_progress_reminder'
    ) < 8
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  -- A pending anonymous introduction gets no more than four weekly nudges.
  INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind,not_before,expires_at)
  SELECT candidate.user_id,pair.id,
         'introduction-response:' || pair.id::text || ':' || candidate.user_id::text || ':' || cycle,
         'introduction_response_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.pairings pair
  CROSS JOIN LATERAL (
    VALUES (pair.user_a,pair.member_a_response),(pair.user_b,pair.member_b_response)
  ) AS candidate(user_id,response)
  JOIN public.email_notification_preferences pref
    ON pref.user_id=candidate.user_id AND pref.category='matches' AND pref.enabled
  WHERE pair.status='member_review' AND candidate.response='pending'
    AND pair.created_at <= p_at - interval '3 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=candidate.user_id AND previous.pairing_id=pair.id
        AND previous.kind='introduction_response_reminder'
    ) < 4
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  -- Mutual acceptance is free; this reminds only the member whose own meeting
  -- package payment is still outstanding, at most four times.
  INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind,not_before,expires_at)
  SELECT candidate.user_id,pair.id,
         'meeting-package:' || pair.id::text || ':' || candidate.user_id::text || ':' || cycle,
         'meeting_package_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.pairings pair
  CROSS JOIN LATERAL (
    VALUES (pair.user_a,pair.payment_a_status),(pair.user_b,pair.payment_b_status)
  ) AS candidate(user_id,payment_status)
  JOIN public.email_notification_preferences pref
    ON pref.user_id=candidate.user_id AND pref.category='payments' AND pref.enabled
  WHERE pair.status IN ('awaiting_payment','payment_pending')
    AND pair.member_a_response='accepted' AND pair.member_b_response='accepted'
    AND candidate.payment_status <> 'paid'
    AND pair.updated_at <= p_at - interval '3 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=candidate.user_id AND previous.pairing_id=pair.id
        AND previous.kind='meeting_package_reminder'
    ) < 4
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  -- Proposed meeting arrangements awaiting a member response, capped at three.
  INSERT INTO public.notification_email_jobs(user_id,pairing_id,meetup_id,event_key,kind,not_before,expires_at)
  SELECT candidate.user_id,pair.id,meeting.id,
         'meeting-response:' || meeting.id::text || ':' || candidate.user_id::text || ':' || cycle,
         'meeting_response_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.meetups meeting
  JOIN public.pairings pair ON pair.id=meeting.pairing_id
  CROSS JOIN LATERAL (
    VALUES (pair.user_a,meeting.response_a),(pair.user_b,meeting.response_b)
  ) AS candidate(user_id,response)
  JOIN public.email_notification_preferences pref
    ON pref.user_id=candidate.user_id AND pref.category='meetings' AND pref.enabled
  WHERE meeting.status='proposed' AND meeting.scheduled_at > p_at
    AND candidate.response='pending' AND meeting.created_at <= p_at - interval '2 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=candidate.user_id AND previous.meetup_id=meeting.id
        AND previous.kind='meeting_response_reminder'
    ) < 3
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  -- One and two weeks after the initial three-week check-in, if still unanswered.
  INSERT INTO public.notification_email_jobs(
    user_id,pairing_id,meetup_id,check_in_id,event_key,kind,not_before,expires_at
  )
  SELECT check_in.user_id,check_in.pairing_id,check_in.meetup_id,check_in.id,
         'check-in-reminder:' || check_in.id::text || ':' || cycle,
         'meeting_check_in_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.meeting_check_ins check_in
  JOIN public.meetups meeting ON meeting.id=check_in.meetup_id AND meeting.status='completed'
  JOIN public.email_notification_preferences pref
    ON pref.user_id=check_in.user_id AND pref.category='check_ins' AND pref.enabled
  WHERE check_in.answered_at IS NULL
    AND check_in.due_at <= p_at - interval '7 days'
    AND p_at < check_in.due_at + interval '21 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.check_in_id=check_in.id AND previous.kind='meeting_check_in_reminder'
    ) < 2
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  -- Imam review and scheduling queues use bounded weekly reminders.
  INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind,not_before,expires_at)
  SELECT account.user_id,pair.id,
         'imam-review-reminder:' || pair.id::text || ':' || account.user_id::text || ':' || cycle,
         'imam_match_review_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.pairings pair
  JOIN public.imam_accounts account ON account.imam_id=pair.imam_id AND account.active
  JOIN public.imams imam ON imam.id=account.imam_id AND imam.verification_status='verified'
  JOIN public.email_notification_preferences pref
    ON pref.user_id=account.user_id AND pref.category='imam' AND pref.enabled
  WHERE pair.status IN ('pending','imam_review')
    AND pair.created_at <= p_at - interval '1 day'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=account.user_id AND previous.pairing_id=pair.id
        AND previous.kind='imam_match_review_reminder'
    ) < 4
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  INSERT INTO public.notification_email_jobs(user_id,pairing_id,event_key,kind,not_before,expires_at)
  SELECT account.user_id,pair.id,
         'imam-scheduling-reminder:' || pair.id::text || ':' || account.user_id::text || ':' || cycle,
         'imam_scheduling_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.pairings pair
  JOIN public.imam_accounts account ON account.imam_id=pair.imam_id AND account.active
  JOIN public.imams imam ON imam.id=account.imam_id AND imam.verification_status='verified'
  JOIN public.email_notification_preferences pref
    ON pref.user_id=account.user_id AND pref.category='imam' AND pref.enabled
  WHERE pair.status='ready_to_schedule'
    AND pair.updated_at <= p_at - interval '2 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=account.user_id AND previous.pairing_id=pair.id
        AND previous.kind='imam_scheduling_reminder'
    ) < 4
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  -- Unreviewed administrator queues are reminded weekly for up to four weeks.
  INSERT INTO public.notification_email_jobs(user_id,referral_id,event_key,kind,not_before,expires_at)
  SELECT role.user_id,referral.id,
         'admin-referral-reminder:' || referral.id::text || ':' || role.user_id::text || ':' || cycle,
         'admin_referral_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.imam_referrals referral
  JOIN public.user_roles role ON role.role='admin'
  JOIN public.email_notification_preferences pref
    ON pref.user_id=role.user_id AND pref.category='admin' AND pref.enabled
  WHERE referral.status='pending' AND referral.created_at <= p_at - interval '7 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=role.user_id AND previous.referral_id=referral.id
        AND previous.kind='admin_referral_reminder'
    ) < 4
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  INSERT INTO public.notification_email_jobs(
    user_id,imam_application_id,event_key,kind,not_before,expires_at
  )
  SELECT role.user_id,application.id,
         'admin-imam-application-reminder:' || application.id::text || ':' || role.user_id::text || ':' || cycle,
         'imam_application_review_reminder',p_at,p_at + interval '6 days 23 hours'
  FROM public.imam_applications application
  JOIN public.user_roles role ON role.role='admin'
  JOIN public.email_notification_preferences pref
    ON pref.user_id=role.user_id AND pref.category='admin' AND pref.enabled
  WHERE application.status='pending' AND application.created_at <= p_at - interval '7 days'
    AND (
      SELECT pg_catalog.count(*) FROM public.notification_email_jobs previous
      WHERE previous.user_id=role.user_id
        AND previous.imam_application_id=application.id
        AND previous.kind='imam_application_review_reminder'
    ) < 4
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT; queued := queued + inserted;

  RETURN queued;
END;
$$;

REVOKE ALL ON FUNCTION mithaq_private.enqueue_due_notification_reminders(timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
