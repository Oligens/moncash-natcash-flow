CREATE TABLE public.apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  api_key TEXT NOT NULL UNIQUE DEFAULT ('sk_live_' || replace(gen_random_uuid()::text, '-', '')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_id UUID NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_phone TEXT,
  account_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'moncash',
  plan_type TEXT NOT NULL DEFAULT 'monthly',
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE public.sms_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_content TEXT NOT NULL,
  sender_phone TEXT,
  amount_detected NUMERIC(12,2),
  matched_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_app ON public.subscriptions(app_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.apps TO authenticated;
GRANT ALL ON public.apps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
GRANT SELECT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;

ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read apps" ON public.apps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert apps" ON public.apps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update apps" ON public.apps FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete apps" ON public.apps FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can read subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can update subscriptions" ON public.subscriptions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can read sms logs" ON public.sms_logs FOR SELECT TO authenticated USING (true);

INSERT INTO public.apps (id, name, slug, api_key) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Store HT', 'demo-store-ht', 'sk_live_demo0000000000000000000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'Kreyol Notes', 'kreyol-notes', 'sk_live_demo0000000000000000000000000002');

INSERT INTO public.subscriptions (app_id, user_id, user_phone, account_name, provider, plan_type, amount, status, created_at, expires_at) VALUES
  ('11111111-1111-1111-1111-111111111111','user_001','50937112233','Jean Baptiste','moncash','monthly',250,'active', now() - interval '20 days', now() + interval '10 days'),
  ('11111111-1111-1111-1111-111111111111','user_002','50934556677','Marie Claire Pierre','natcash','yearly',2500,'active', now() - interval '50 days', now() + interval '315 days'),
  ('11111111-1111-1111-1111-111111111111','user_003','50931122334','Wideline Joseph','moncash','monthly',250,'pending', now() - interval '1 day', NULL),
  ('11111111-1111-1111-1111-111111111111','user_004','50938899001','Ricardo Louis','moncash','monthly',250,'active', now() - interval '5 days', now() + interval '25 days'),
  ('22222222-2222-2222-2222-222222222222','user_101','50936677889','Nadege Saint-Fleur','natcash','monthly',250,'active', now() - interval '3 days', now() + interval '27 days'),
  ('22222222-2222-2222-2222-222222222222','user_102','50933344556','Frantz Dorvil','moncash','yearly',2500,'pending', now() - interval '2 hours', NULL);