REVOKE EXECUTE ON FUNCTION public.portal_can_access_job(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.portal_can_access_candidate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_can_access_job(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_can_access_candidate(uuid) TO authenticated, service_role;