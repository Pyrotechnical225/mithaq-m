ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_payment_status text,
  ADD COLUMN IF NOT EXISTS stripe_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_key
  ON public.subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.stripe_events TO service_role;

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read stripe events"
  ON public.stripe_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));