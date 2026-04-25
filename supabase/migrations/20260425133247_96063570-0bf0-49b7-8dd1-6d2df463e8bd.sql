ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS reengage_date date;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS reengage_reason text;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS reengage_date date;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS reengage_reason text;