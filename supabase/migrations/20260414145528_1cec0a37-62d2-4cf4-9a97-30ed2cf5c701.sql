ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS salary_current integer,
  ADD COLUMN IF NOT EXISTS availability text;