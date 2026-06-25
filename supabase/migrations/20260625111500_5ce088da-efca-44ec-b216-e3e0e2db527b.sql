ALTER TABLE public.candidates RENAME COLUMN comments TO note;

COMMENT ON COLUMN public.candidates.note IS 'General purpose notes/call logs scraped from incoming integrations (e.g. SourceWhale/Vincere comments).';
