
-- Company Intelligence enrichment storage
CREATE TABLE public.company_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  official_name text,
  website text,
  linkedin_url text,
  headquarters text,
  year_founded integer,
  employee_count text,
  industry text,
  description text,
  funding_stage text,
  funding_amount text,
  funding_date text,
  funding_lead_investors text[],
  total_funding text,
  last_valuation text,
  revenue_range text,
  recent_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_job_postings jsonb NOT NULL DEFAULT '[]'::jsonb,
  tech_stack text[] DEFAULT '{}',
  enrichment_source text,
  last_enriched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

CREATE INDEX idx_company_intel_owner ON public.company_intel(owner_user_id);
CREATE INDEX idx_company_intel_client ON public.company_intel(client_id);

ALTER TABLE public.company_intel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or team can view company intel"
  ON public.company_intel FOR SELECT
  USING (public.can_access_owner(owner_user_id));

CREATE POLICY "Owner can insert company intel"
  ON public.company_intel FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owner can update company intel"
  ON public.company_intel FOR UPDATE
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Owner can delete company intel"
  ON public.company_intel FOR DELETE
  USING (auth.uid() = owner_user_id);

CREATE TRIGGER trg_company_intel_updated_at
  BEFORE UPDATE ON public.company_intel
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track enrichment usage per user per month for budget
CREATE TABLE public.enrichment_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  cost_pence integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrichment_usage_user_month ON public.enrichment_usage(user_id, created_at);

ALTER TABLE public.enrichment_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own enrichment usage"
  ON public.enrichment_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own enrichment usage"
  ON public.enrichment_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add monthly enrichment budget to recruiter_profiles
ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS enrichment_budget_pence integer NOT NULL DEFAULT 1000;
