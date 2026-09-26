-- Run the notification outbox worker without a paid Supabase branch or an
-- always-on application process. The job is intentionally inert until both
-- named Vault secrets are configured by an operator.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION mithaq_private.invoke_notification_email_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  worker_url text;
  worker_secret text;
BEGIN
  SELECT decrypted_secret
  INTO worker_url
  FROM vault.decrypted_secrets
  WHERE name = 'mithaq_notification_worker_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'mithaq_notification_cron_secret'
  LIMIT 1;

  -- Missing configuration keeps the scheduled job safe and silent.
  IF worker_url IS NULL OR worker_secret IS NULL THEN
    RETURN NULL;
  END IF;

  -- Do not allow a compromised or mistyped Vault URL to turn this job into
  -- an arbitrary outbound request. Custom-domain and current Vercel hosts are
  -- the only supported production destinations.
  IF worker_url !~ '^https://(www\.)?mithaq\.uk/api/internal/notification-emails$'
     AND worker_url <> 'https://meet-haq.vercel.app/api/internal/notification-emails' THEN
    RETURN NULL;
  END IF;

  IF pg_catalog.length(worker_secret) < 32 THEN
    RETURN NULL;
  END IF;

  RETURN net.http_post(
    url := worker_url,
    body := pg_catalog.jsonb_build_object('source', 'supabase_cron'),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    timeout_milliseconds := 10000
  );
END;
$$;

REVOKE ALL ON FUNCTION mithaq_private.invoke_notification_email_worker()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'mithaq-notification-email-dispatch'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'mithaq-notification-email-dispatch',
    '* * * * *',
    'SELECT mithaq_private.invoke_notification_email_worker();'
  );
END;
$$;
