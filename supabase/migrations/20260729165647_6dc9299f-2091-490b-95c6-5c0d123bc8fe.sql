-- 1. Restrict apps SELECT to admins
DROP POLICY IF EXISTS "Authenticated can read apps" ON public.apps;
CREATE POLICY "Admins can read apps" ON public.apps
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Restrict subscriptions SELECT to admins
DROP POLICY IF EXISTS "Authenticated can read subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can read subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Restrict sms_logs SELECT to admins
DROP POLICY IF EXISTS "Authenticated can read sms logs" ON public.sms_logs;
CREATE POLICY "Admins can read sms logs" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Explicitly deny subscription creation/deletion from client roles
REVOKE INSERT, DELETE ON public.subscriptions FROM authenticated;
REVOKE INSERT, DELETE ON public.subscriptions FROM anon;
REVOKE ALL ON public.sms_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.sms_logs FROM authenticated;
REVOKE ALL ON public.apps FROM anon;
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.sms_logs TO service_role;
GRANT ALL ON public.apps TO service_role;

CREATE POLICY "No client inserts on subscriptions" ON public.subscriptions
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);
CREATE POLICY "No client deletes on subscriptions" ON public.subscriptions
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- 5. has_role no longer runs with elevated privileges
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;