
CREATE TABLE public.screening_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  sections JSONB NOT NULL DEFAULT '[
    {"key":"why_suitable","name":"Why suitable for this role","enabled":true,"format":"paragraphs","length":"standard","required":true},
    {"key":"key_strengths","name":"Key strengths for this role","enabled":true,"format":"bullets","length":"standard","required":true},
    {"key":"interest_level","name":"Interest level assessment","enabled":true,"format":"sentence","length":"brief","required":true},
    {"key":"concerns","name":"Concerns and risks","enabled":true,"format":"paragraphs","length":"brief","required":true},
    {"key":"practical_details","name":"Salary and practical details","enabled":true,"format":"free","length":"brief","required":false},
    {"key":"cultural_fit","name":"Cultural fit notes","enabled":false,"format":"paragraphs","length":"brief","required":false},
    {"key":"relevant_experience","name":"Previous relevant experience","enabled":false,"format":"paragraphs","length":"standard","required":false},
    {"key":"candidate_words","name":"Candidate''s own words","enabled":false,"format":"bullets","length":"brief","required":false}
  ]'::jsonb,
  tone TEXT NOT NULL DEFAULT 'direct',
  pov TEXT NOT NULL DEFAULT 'first_person',
  length TEXT NOT NULL DEFAULT 'standard',
  examples TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.screening_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own screening preferences"
  ON public.screening_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own screening preferences"
  ON public.screening_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own screening preferences"
  ON public.screening_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own screening preferences"
  ON public.screening_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_screening_preferences_updated_at
  BEFORE UPDATE ON public.screening_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
