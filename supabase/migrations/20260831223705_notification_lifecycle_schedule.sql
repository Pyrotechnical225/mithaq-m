-- Generate bounded reminders once per day. Event keys and per-workflow caps
-- make this safe to rerun; the separate worker job dispatches at most one email
-- each minute and stays inert until its Vault secrets are present.
DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname = 'mithaq-notification-reminder-enqueue'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'mithaq-notification-reminder-enqueue',
    '15 8 * * *',
    'SELECT mithaq_private.enqueue_due_notification_reminders(now());'
  );
END;
$$;
