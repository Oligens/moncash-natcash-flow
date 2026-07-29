CREATE OR REPLACE FUNCTION public.owns_app(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.apps a WHERE a.id = _app_id AND a.owner_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.owns_app(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owns_app(uuid) TO authenticated;