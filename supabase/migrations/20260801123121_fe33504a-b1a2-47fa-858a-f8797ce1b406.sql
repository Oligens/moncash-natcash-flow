-- 1. platform_settings: restrict full-row reads to admins
DROP POLICY IF EXISTS "Authenticated read platform settings" ON public.platform_settings;

CREATE POLICY "Admins read platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Non-sensitive subset exposed to signed-in developers
CREATE OR REPLACE FUNCTION public.get_platform_public_settings()
RETURNS TABLE (
  id uuid,
  platform_name text,
  saas_monthly_price numeric,
  saas_yearly_price numeric,
  trial_days integer,
  support_email text,
  relay_apk_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.platform_name, s.saas_monthly_price, s.saas_yearly_price,
         s.trial_days, s.support_email, s.relay_apk_url
  FROM public.platform_settings s
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_platform_public_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_public_settings() TO authenticated, service_role;

-- 2. relay_logs: explicit deny of client writes
REVOKE INSERT, UPDATE, DELETE ON public.relay_logs FROM anon, authenticated;
GRANT ALL ON public.relay_logs TO service_role;

CREATE POLICY "No client writes on relay logs (insert)"
ON public.relay_logs AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "No client writes on relay logs (update)"
ON public.relay_logs AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "No client writes on relay logs (delete)"
ON public.relay_logs AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 3. sms_logs: explicit deny of client writes
REVOKE INSERT, UPDATE, DELETE ON public.sms_logs FROM anon, authenticated;
GRANT ALL ON public.sms_logs TO service_role;

CREATE POLICY "No client writes on sms logs (insert)"
ON public.sms_logs AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "No client writes on sms logs (update)"
ON public.sms_logs AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "No client writes on sms logs (delete)"
ON public.sms_logs AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);