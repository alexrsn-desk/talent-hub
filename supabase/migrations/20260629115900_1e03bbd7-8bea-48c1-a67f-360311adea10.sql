
-- Backfill first_name / last_name from name where missing (split on first space)
UPDATE public.candidates
SET first_name = COALESCE(NULLIF(first_name, ''), split_part(name, ' ', 1)),
    last_name  = COALESCE(NULLIF(last_name,  ''),
                          CASE WHEN position(' ' in name) > 0
                               THEN substring(name from position(' ' in name) + 1)
                               ELSE '' END)
WHERE first_name IS NULL OR last_name IS NULL OR first_name = '' OR last_name IS NULL;

UPDATE public.candidates SET first_name = COALESCE(first_name, ''), last_name = COALESCE(last_name, '');

UPDATE public.contacts
SET first_name = COALESCE(NULLIF(first_name, ''), split_part(name, ' ', 1)),
    last_name  = COALESCE(NULLIF(last_name,  ''),
                          CASE WHEN position(' ' in name) > 0
                               THEN substring(name from position(' ' in name) + 1)
                               ELSE '' END)
WHERE first_name IS NULL OR last_name IS NULL OR first_name = '' OR last_name IS NULL;

UPDATE public.contacts SET first_name = COALESCE(first_name, ''), last_name = COALESCE(last_name, '');

-- Enforce NOT NULL on first_name; last_name may be empty string but not null
ALTER TABLE public.candidates ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE public.candidates ALTER COLUMN last_name  SET NOT NULL;
ALTER TABLE public.candidates ALTER COLUMN first_name SET DEFAULT '';
ALTER TABLE public.candidates ALTER COLUMN last_name  SET DEFAULT '';

ALTER TABLE public.contacts ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN last_name  SET NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN first_name SET DEFAULT '';
ALTER TABLE public.contacts ALTER COLUMN last_name  SET DEFAULT '';

-- Trigger: keep `name` in sync with first_name + last_name as the source of truth.
-- If caller provides only `name`, split it on the first space and populate first/last.
CREATE OR REPLACE FUNCTION public.sync_person_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  has_first boolean := COALESCE(NEW.first_name, '') <> '';
  has_last  boolean := COALESCE(NEW.last_name,  '') <> '';
  src_name  text;
  sp        int;
BEGIN
  IF NOT has_first AND NOT has_last AND COALESCE(NEW.name, '') <> '' THEN
    src_name := btrim(NEW.name);
    sp := position(' ' in src_name);
    IF sp > 0 THEN
      NEW.first_name := substring(src_name from 1 for sp - 1);
      NEW.last_name  := btrim(substring(src_name from sp + 1));
    ELSE
      NEW.first_name := src_name;
      NEW.last_name  := '';
    END IF;
  END IF;

  NEW.first_name := COALESCE(NEW.first_name, '');
  NEW.last_name  := COALESCE(NEW.last_name,  '');
  NEW.name := btrim(NEW.first_name || ' ' || NEW.last_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidates_sync_name ON public.candidates;
CREATE TRIGGER candidates_sync_name
BEFORE INSERT OR UPDATE ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.sync_person_name();

DROP TRIGGER IF EXISTS contacts_sync_name ON public.contacts;
CREATE TRIGGER contacts_sync_name
BEFORE INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.sync_person_name();

-- Helpful sort/search indexes
CREATE INDEX IF NOT EXISTS candidates_last_first_idx ON public.candidates (last_name, first_name);
CREATE INDEX IF NOT EXISTS contacts_last_first_idx   ON public.contacts   (last_name, first_name);
