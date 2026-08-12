ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS client_ready_notes text;
ALTER TABLE public.recruiter_profiles ADD COLUMN IF NOT EXISTS client_ready_notes_template text;