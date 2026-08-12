CREATE OR REPLACE FUNCTION public.jobs_sync_portal_spec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    UPDATE public.client_portals
    SET job_spec_synced_at = now()
    WHERE job_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_sync_portal_spec ON public.jobs;
CREATE TRIGGER trg_jobs_sync_portal_spec
AFTER UPDATE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_sync_portal_spec();