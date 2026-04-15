
-- Predefined tag definitions
CREATE TABLE public.tag_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(category, label)
);

ALTER TABLE public.tag_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on tag_definitions" ON public.tag_definitions FOR ALL USING (true) WITH CHECK (true);

-- Candidate tags
CREATE TABLE public.candidate_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  tag_definition_id uuid NOT NULL REFERENCES public.tag_definitions(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  confidence text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, tag_definition_id)
);

ALTER TABLE public.candidate_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on candidate_tags" ON public.candidate_tags FOR ALL USING (true) WITH CHECK (true);

-- Job tags
CREATE TABLE public.job_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tag_definition_id uuid NOT NULL REFERENCES public.tag_definitions(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(job_id, tag_definition_id)
);

ALTER TABLE public.job_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on job_tags" ON public.job_tags FOR ALL USING (true) WITH CHECK (true);

-- Seed predefined tags
INSERT INTO public.tag_definitions (category, label, position) VALUES
-- Sector Preference
('sector_preference', 'Fintech', 1),
('sector_preference', 'SaaS', 2),
('sector_preference', 'E-commerce', 3),
('sector_preference', 'HealthTech', 4),
('sector_preference', 'EdTech', 5),
('sector_preference', 'PropTech', 6),
('sector_preference', 'DeepTech', 7),
('sector_preference', 'Cybersecurity', 8),
('sector_preference', 'AI/ML', 9),
('sector_preference', 'Gaming', 10),
('sector_preference', 'Agency', 11),
('sector_preference', 'Consulting', 12),
('sector_preference', 'Enterprise Software', 13),
('sector_preference', 'Consumer Tech', 14),
('sector_preference', 'CleanTech', 15),
('sector_preference', 'Open to any', 16),
-- Business Model
('business_model', 'B2B', 1),
('business_model', 'B2C', 2),
('business_model', 'B2B2C', 3),
('business_model', 'Marketplace', 4),
-- Company Stage
('company_stage', 'Pre-seed/Seed', 1),
('company_stage', 'Series A', 2),
('company_stage', 'Series B', 3),
('company_stage', 'Series C+', 4),
('company_stage', 'PE-backed', 5),
('company_stage', 'Public Company', 6),
('company_stage', 'Enterprise', 7),
('company_stage', 'Open to any', 8),
-- Work Preference
('work_preference', 'Remote', 1),
('work_preference', 'Hybrid', 2),
('work_preference', 'Office-based', 3),
('work_preference', 'London only', 4),
('work_preference', 'UK Wide', 5),
('work_preference', 'Open to relocation', 6),
('work_preference', 'No relocation', 7),
-- Seniority Target
('seniority_target', 'Junior', 1),
('seniority_target', 'Mid-level', 2),
('seniority_target', 'Senior', 3),
('seniority_target', 'Lead', 4),
('seniority_target', 'Head of', 5),
('seniority_target', 'Director', 6),
('seniority_target', 'VP', 7),
('seniority_target', 'C-Suite', 8),
-- Motivations
('motivations', 'Salary', 1),
('motivations', 'Career progression', 2),
('motivations', 'Better tech stack', 3),
('motivations', 'Remote/flexibility', 4),
('motivations', 'Culture', 5),
('motivations', 'Product quality', 6),
('motivations', 'Company stage', 7),
('motivations', 'Management', 8),
('motivations', 'Stability', 9),
('motivations', 'Equity', 10),
-- Deal Breakers
('deal_breakers', 'No full remote', 1),
('deal_breakers', 'No contract only', 2),
('deal_breakers', 'No B2C', 3),
('deal_breakers', 'No large corp', 4),
('deal_breakers', 'No startup', 5),
('deal_breakers', 'No relocation required', 6);
