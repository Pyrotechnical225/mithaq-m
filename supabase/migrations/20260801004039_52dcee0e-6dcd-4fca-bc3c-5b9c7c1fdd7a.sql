-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY,
  plan text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'inactive',
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription select" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin all subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.has_active_membership(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status IN ('active', 'trialing', 'complimentary')
      AND (current_period_end IS NULL OR current_period_end > now())
  )
$$;

-- ============ IMAM APPLICATIONS ============
CREATE TABLE public.imam_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mosque text,
  city text NOT NULL,
  postcode text,
  languages text[] NOT NULL DEFAULT '{}'::text[],
  phone text,
  email text NOT NULL,
  credentials text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_at timestamptz,
  imam_id uuid REFERENCES public.imams(id) ON DELETE SET NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.imam_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imam_applications TO authenticated;
GRANT ALL ON public.imam_applications TO service_role;
ALTER TABLE public.imam_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can apply anon" ON public.imam_applications
  FOR INSERT TO anon WITH CHECK (status = 'pending');
CREATE POLICY "anyone can apply auth" ON public.imam_applications
  FOR INSERT TO authenticated WITH CHECK (status = 'pending');
CREATE POLICY "admin all imam applications" ON public.imam_applications
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER imam_applications_updated_at BEFORE UPDATE ON public.imam_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ IMAM ACCOUNTS ============
CREATE TABLE public.imam_accounts (
  user_id uuid PRIMARY KEY,
  imam_id uuid NOT NULL REFERENCES public.imams(id) ON DELETE CASCADE,
  radius_km integer NOT NULL DEFAULT 40,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.imam_accounts TO authenticated;
GRANT ALL ON public.imam_accounts TO service_role;
ALTER TABLE public.imam_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own imam account select" ON public.imam_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admin all imam accounts" ON public.imam_accounts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER imam_accounts_updated_at BEFORE UPDATE ON public.imam_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.my_imam_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT imam_id FROM public.imam_accounts WHERE user_id = _user_id AND active
$$;

CREATE OR REPLACE FUNCTION public.is_imam(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.imam_accounts WHERE user_id = _user_id AND active)
$$;

-- ============ PAIRINGS ============
CREATE TABLE public.pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  imam_id uuid REFERENCES public.imams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'awaiting_review',
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pairings_unique_pair UNIQUE (user_a, user_b),
  CONSTRAINT pairings_distinct CHECK (user_a <> user_b)
);
GRANT SELECT, UPDATE ON public.pairings TO authenticated;
GRANT ALL ON public.pairings TO service_role;
ALTER TABLE public.pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pairing participants select" ON public.pairings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b OR imam_id = public.my_imam_id(auth.uid()));
CREATE POLICY "assigned imam updates pairing" ON public.pairings
  FOR UPDATE TO authenticated
  USING (imam_id = public.my_imam_id(auth.uid()))
  WITH CHECK (imam_id = public.my_imam_id(auth.uid()));
CREATE POLICY "admin all pairings" ON public.pairings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER pairings_updated_at BEFORE UPDATE ON public.pairings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_see_pairing(_user_id uuid, _pairing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pairings p
    WHERE p.id = _pairing_id
      AND (p.user_a = _user_id OR p.user_b = _user_id
           OR p.imam_id = public.my_imam_id(_user_id))
  )
$$;

-- ============ MEETUPS ============
CREATE TABLE public.meetups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id uuid NOT NULL REFERENCES public.pairings(id) ON DELETE CASCADE,
  imam_id uuid REFERENCES public.imams(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  venue text NOT NULL,
  address text,
  wali_required boolean NOT NULL DEFAULT true,
  note text,
  status text NOT NULL DEFAULT 'proposed',
  response_a text NOT NULL DEFAULT 'pending',
  response_b text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.meetups TO authenticated;
GRANT ALL ON public.meetups TO service_role;
ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meetup participants select" ON public.meetups
  FOR SELECT TO authenticated USING (public.can_see_pairing(auth.uid(), pairing_id));
CREATE POLICY "assigned imam inserts meetup" ON public.meetups
  FOR INSERT TO authenticated
  WITH CHECK (imam_id = public.my_imam_id(auth.uid()));
CREATE POLICY "participants update meetup" ON public.meetups
  FOR UPDATE TO authenticated
  USING (public.can_see_pairing(auth.uid(), pairing_id))
  WITH CHECK (public.can_see_pairing(auth.uid(), pairing_id));
CREATE POLICY "admin all meetups" ON public.meetups
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER meetups_updated_at BEFORE UPDATE ON public.meetups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PAIRING MESSAGES ============
CREATE TABLE public.pairing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id uuid NOT NULL REFERENCES public.pairings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL DEFAULT 'member',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pairing_messages TO authenticated;
GRANT ALL ON public.pairing_messages TO service_role;
ALTER TABLE public.pairing_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pairing messages select" ON public.pairing_messages
  FOR SELECT TO authenticated USING (public.can_see_pairing(auth.uid(), pairing_id));
CREATE POLICY "pairing messages insert" ON public.pairing_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.can_see_pairing(auth.uid(), pairing_id));
CREATE POLICY "admin all pairing messages" ON public.pairing_messages
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX pairings_imam_idx ON public.pairings(imam_id);
CREATE INDEX pairings_users_idx ON public.pairings(user_a, user_b);
CREATE INDEX meetups_pairing_idx ON public.meetups(pairing_id);
CREATE INDEX pairing_messages_pairing_idx ON public.pairing_messages(pairing_id, created_at);