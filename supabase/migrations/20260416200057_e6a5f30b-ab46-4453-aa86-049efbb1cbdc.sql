-- Add notice_period to candidates for pre-fill
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS notice_period text;

-- Screening notes table — one per candidate-job relationship
CREATE TABLE public.screening_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_job_id uuid NOT NULL UNIQUE,
  why_suitable text,
  key_strengths text,
  interest_level text,
  salary_confirmed integer,
  availability_confirmed text,
  notice_period_confirmed text,
  concerns text,
  questions_answered text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.screening_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on screening_notes"
ON public.screening_notes
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_screening_notes_updated_at
BEFORE UPDATE ON public.screening_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_screening_notes_candidate_job ON public.screening_notes(candidate_job_id);