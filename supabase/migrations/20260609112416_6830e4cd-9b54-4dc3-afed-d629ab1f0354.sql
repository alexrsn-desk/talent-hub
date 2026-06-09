ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
UPDATE public.jobs SET status = 'Active' WHERE status = 'Open';
UPDATE public.jobs SET status = 'Closed' WHERE status = 'Cancelled';
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status = ANY (ARRAY['Active'::text,'On Hold'::text,'Filled'::text,'Closed'::text]));