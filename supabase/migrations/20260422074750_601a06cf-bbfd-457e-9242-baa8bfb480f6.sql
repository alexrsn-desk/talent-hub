ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS summary text;