BEGIN;

ALTER TABLE public.meeting_check_ins ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.meeting_check_ins ADD COLUMN reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX meeting_check_ins_review_idx ON public.meeting_check_ins(answered_at) WHERE answered_at IS NOT NULL AND reviewed_at IS NULL;
CREATE INDEX meeting_check_ins_reviewer_idx ON public.meeting_check_ins(reviewed_by) WHERE reviewed_by IS NOT NULL;

-- A support request is intentionally generic in email. Administrators must sign
-- in with MFA to see the member or note. Each administrator receives one job.
CREATE FUNCTION mithaq_private.check_in_support_email_events() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.answered_at IS NOT NULL AND OLD.answered_at IS NULL
     AND NEW.outcome = 'support_requested' THEN
    INSERT INTO public.notification_email_jobs(user_id,check_in_id,event_key,kind)
    SELECT r.user_id,NEW.id,'check-in-support:' || NEW.id::text || ':' || r.user_id::text,
           'member_support_requested'
    FROM public.user_roles r
    WHERE r.role = 'admin'
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mithaq_private.check_in_support_email_events() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER check_in_support_notification
AFTER UPDATE OF answered_at,outcome ON public.meeting_check_ins
FOR EACH ROW EXECUTE FUNCTION mithaq_private.check_in_support_email_events();

-- Answers are private to the member and authorised administrators, never the
-- other member or the assigned imam. The caller cannot choose a user ID.
CREATE FUNCTION public.answer_meeting_check_in(p_id uuid, p_outcome text, p_note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE changed uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('getting_to_know','moving_forward','not_continuing','support_requested')
    OR length(p_note) > 1000 THEN RAISE EXCEPTION 'Invalid check-in response'; END IF;
  UPDATE public.meeting_check_ins c
    SET outcome=p_outcome, note=nullif(btrim(p_note),''), answered_at=now()
    WHERE c.id=p_id AND c.user_id=auth.uid() AND c.due_at<=now() AND c.answered_at IS NULL
      AND EXISTS(SELECT 1 FROM public.meetups m WHERE m.id=c.meetup_id AND m.pairing_id=c.pairing_id AND m.status='completed')
    RETURNING c.id INTO changed;
  IF changed IS NULL THEN RAISE EXCEPTION 'Check-in is not available or was already answered'; END IF;
  UPDATE public.notification_email_jobs SET status='skipped',last_error_code='check_in_answered',updated_at=now()
    WHERE meetup_id=(SELECT meetup_id FROM public.meeting_check_ins WHERE id=changed)
      AND user_id=auth.uid() AND kind='meeting_followup' AND status='queued';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.answer_meeting_check_in(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.answer_meeting_check_in(uuid,text,text) TO authenticated;

-- Ownership, current verified assignment and MFA are checked in the same
-- transaction as attendance, audit and the outbox/check-in triggers.
CREATE FUNCTION public.complete_assigned_meeting(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE meeting public.meetups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'Verified MFA session required';
  END IF;
  SELECT m.* INTO meeting FROM public.meetups m
    JOIN public.pairings p ON p.id=m.pairing_id
    JOIN public.imam_accounts a ON a.imam_id=p.imam_id AND a.user_id=auth.uid() AND a.active
    JOIN public.imams i ON i.id=a.imam_id AND i.verification_status='verified'
    WHERE m.id=p_id AND p.status IN ('scheduled','ready_to_schedule','completed')
    FOR UPDATE OF m,p FOR SHARE OF a,i;
  IF meeting.id IS NULL THEN RAISE EXCEPTION 'Assigned verified imam only'; END IF;
  IF meeting.status <> 'confirmed' OR meeting.scheduled_at > now() THEN
    RAISE EXCEPTION 'Only a confirmed past meeting can be completed';
  END IF;
  UPDATE public.meetups SET status='completed' WHERE id=meeting.id;
  INSERT INTO public.admin_audit_log(actor_user_id,action,target_type,target_id,details)
    VALUES(auth.uid(),'meeting_completed','meetup',meeting.id::text,jsonb_build_object('pairing_id',meeting.pairing_id));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_assigned_meeting(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_assigned_meeting(uuid) TO authenticated;

COMMIT;
