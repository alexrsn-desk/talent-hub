-- Add missing fields to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS location text;

-- Add fields to contacts for the restructure
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS personal_email text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS mobile_phone text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS direct_phone text;

-- Migrate existing client contact data into contacts table
-- Only for clients that have a contact_name and don't already have a matching contact
INSERT INTO public.contacts (client_id, name, first_name, last_name, job_title, email, phone, linkedin_url)
SELECT 
  c.id,
  c.contact_name,
  split_part(c.contact_name, ' ', 1),
  CASE WHEN position(' ' in c.contact_name) > 0 
    THEN substring(c.contact_name from position(' ' in c.contact_name) + 1)
    ELSE NULL 
  END,
  c.job_title,
  c.email,
  c.phone,
  c.linkedin_url
FROM public.clients c
WHERE c.contact_name IS NOT NULL 
  AND c.contact_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.contacts ct 
    WHERE ct.client_id = c.id AND ct.name = c.contact_name
  );