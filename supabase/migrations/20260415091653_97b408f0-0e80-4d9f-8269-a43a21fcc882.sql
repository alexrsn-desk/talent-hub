
-- Add first_name / last_name to candidates
ALTER TABLE public.candidates ADD COLUMN first_name text;
ALTER TABLE public.candidates ADD COLUMN last_name text;

-- Backfill from existing name column
UPDATE public.candidates
SET first_name = split_part(name, ' ', 1),
    last_name = CASE
      WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
      ELSE NULL
    END;

-- Add first_name / last_name to contacts
ALTER TABLE public.contacts ADD COLUMN first_name text;
ALTER TABLE public.contacts ADD COLUMN last_name text;

-- Backfill contacts
UPDATE public.contacts
SET first_name = split_part(name, ' ', 1),
    last_name = CASE
      WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
      ELSE NULL
    END;
