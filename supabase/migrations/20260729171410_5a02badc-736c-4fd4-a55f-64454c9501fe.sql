-- Helper: ownership
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS moncash_number text;
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS natcash_number text;
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS qr_image_url text;
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS sender_whitelist text[] NOT NULL DEFAULT ARRAY['MonCash','Digicel','Natcash','Natcom'];
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS amount_regex text NOT NULL DEFAULT '(?:HTG|Gdes?|Gourdes?)\s*([\d.,]+)|([\d.,]+)\s*(?:HTG|Gdes?|Gourdes?)';
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS name_regex text NOT NULL DEFAULT '(?:de|from|soti nan|par|sent by)\s+([A-Za-z\u00C0-\u00FF''\-]+(?:\s+[A-Za-z\u00C0-\u00FF''\-]+){0,3})';
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS reference_regex text NOT NULL DEFAULT '(?:Ref|Reference|Transaction ID|ID)\s*[:#]?\s*([A-Za-z0-9]{4,})';
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS strict_name_match boolean NOT NULL DEFAULT true;
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS relay_last_seen_at timestamptz;
ALTER TABLE public.apps ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS app_id uuid;
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unmatched';
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS reference text;

CREATE OR REPLACE FUNCTION public.owns_app(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.apps a WHERE a.id = _app_id AND a.owner_id = auth.uid())
$$;

-- Relay transfer logs
CREATE TABLE IF NOT EXISTS public.relay_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  raw_content text NOT NULL,
  sender text,
  status text NOT NULL DEFAULT 'success',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.relay_logs TO authenticated;
GRANT ALL ON public.relay_logs TO service_role;
ALTER TABLE public.relay_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and admins read relay logs" ON public.relay_logs FOR SELECT TO authenticated
  USING (public.owns_app(app_id) OR public.has_role(auth.uid(), 'admin'));

-- Global platform settings (single row)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name text NOT NULL DEFAULT 'Zaka',
  saas_monthly_price numeric NOT NULL DEFAULT 1500,
  saas_yearly_price numeric NOT NULL DEFAULT 15000,
  trial_days integer NOT NULL DEFAULT 14,
  support_email text NOT NULL DEFAULT 'support@zaka.ht',
  relay_apk_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read platform settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins update platform settings" ON public.platform_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.platform_settings (platform_name) SELECT 'Zaka'
  WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings);

-- SaaS invoices billed by the platform owner to developers
CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL,
  developer_email text,
  amount numeric NOT NULL,
  period text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_invoices TO authenticated;
GRANT ALL ON public.platform_invoices TO service_role;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Developers read own invoices" ON public.platform_invoices FOR SELECT TO authenticated
  USING (developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert invoices" ON public.platform_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update invoices" ON public.platform_invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rewrite apps policies for multi-tenant ownership
DROP POLICY IF EXISTS "Admins can read apps" ON public.apps;
DROP POLICY IF EXISTS "Admins can insert apps" ON public.apps;
DROP POLICY IF EXISTS "Admins can update apps" ON public.apps;
DROP POLICY IF EXISTS "Admins can delete apps" ON public.apps;
CREATE POLICY "Owners and admins read apps" ON public.apps FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Developers insert own apps" ON public.apps FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners and admins update apps" ON public.apps FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners and admins delete apps" ON public.apps FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can update subscriptions" ON public.subscriptions;
CREATE POLICY "Owners and admins read subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.owns_app(app_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners and admins update subscriptions" ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.owns_app(app_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_app(app_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read sms logs" ON public.sms_logs;
CREATE POLICY "Owners and admins read sms logs" ON public.sms_logs FOR SELECT TO authenticated
  USING ((app_id IS NOT NULL AND public.owns_app(app_id)) OR public.has_role(auth.uid(), 'admin'));