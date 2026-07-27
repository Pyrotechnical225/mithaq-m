
-- 1. imams table
CREATE TABLE public.imams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  mosque TEXT,
  city TEXT NOT NULL,
  postcode TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  phone TEXT,
  email TEXT,
  website TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.imams TO authenticated;
GRANT ALL ON public.imams TO service_role;

ALTER TABLE public.imams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read imams"
  ON public.imams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin manage imams"
  ON public.imams FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_imams_updated_at
  BEFORE UPDATE ON public.imams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. profile location fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS uk_city TEXT,
  ADD COLUMN IF NOT EXISTS uk_postcode TEXT,
  ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
