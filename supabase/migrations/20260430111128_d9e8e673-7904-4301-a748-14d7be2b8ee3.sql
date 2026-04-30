
-- ============================================================================
-- OFFER MANAGEMENT
-- ============================================================================
-- offers: one row per candidate_job at Offer stage (auto-created by trigger)
-- offer_milestones: timeline events (resignation handed in, counter offer, etc)
-- counter_offers: structured counter offer record + AI strategy
-- ============================================================================

-- offers ---------------------------------------------------------------------
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  job_id UUID NOT NULL,
  candidate_job_id UUID NOT NULL,

  -- Offer details
  offer_type TEXT NOT NULL DEFAULT 'verbal', -- verbal | written
  salary_offered INTEGER,
  salary_currency TEXT NOT NULL DEFAULT 'GBP',
  start_date_proposed DATE,
  notice_period_weeks INTEGER,
  earliest_start_date DATE, -- computed
  benefits_notes TEXT,
  conditions TEXT[], -- ['References','Background check','Medical','Other','None']
  conditions_other TEXT,

  -- Snapshots (don't break if records change)
  candidate_name_snapshot TEXT,
  client_name_snapshot TEXT,
  job_title_snapshot TEXT,
  candidate_expectation_snapshot INTEGER,

  -- Risk assessment (AI generated)
  counter_offer_risk TEXT, -- low | medium | high
  counter_offer_reasons TEXT,
  acceptance_risk TEXT,
  acceptance_reasons TEXT,
  start_date_risk TEXT,
  start_date_reasons TEXT,
  overall_risk TEXT,
  risk_assessed_at TIMESTAMPTZ,

  -- Tracking timeline (dates)
  verbal_offer_date DATE DEFAULT CURRENT_DATE,
  written_offer_date DATE,
  acceptance_deadline DATE,
  candidate_decision TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  decision_logged_at TIMESTAMPTZ,
  resignation_planned_date DATE,
  resignation_handed_in_date DATE,
  counter_offer_received_date DATE,
  resignation_accepted_date DATE,
  start_date_confirmed DATE,

  -- Final start checklist
  pre_start_candidate_called BOOLEAN NOT NULL DEFAULT false,
  pre_start_client_called BOOLEAN NOT NULL DEFAULT false,
  pre_start_candidate_briefed BOOLEAN NOT NULL DEFAULT false,
  pre_start_placement_ready BOOLEAN NOT NULL DEFAULT false,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'awaiting_acceptance',
  -- awaiting_acceptance | accepted | resigned | counter_offered |
  -- counter_offer_lost | starting_soon | placement_complete | withdrawn

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offers_owner ON public.offers(owner_user_id);
CREATE INDEX idx_offers_candidate_job ON public.offers(candidate_job_id);
CREATE INDEX idx_offers_status ON public.offers(status);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access offers"
ON public.offers FOR ALL
TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- offer_milestones -----------------------------------------------------------
CREATE TABLE public.offer_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL,
  -- verbal_offer | written_offer | acceptance_deadline | acceptance |
  -- resignation_planned | resignation_handed_in | counter_offer |
  -- resignation_accepted | start_date_confirmed | weekly_checkin | custom
  milestone_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_offer_milestones_offer ON public.offer_milestones(offer_id);

ALTER TABLE public.offer_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access offer_milestones"
ON public.offer_milestones FOR ALL
TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

-- counter_offers -------------------------------------------------------------
CREATE TABLE public.counter_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  amount_offered INTEGER,
  other_changes TEXT,
  candidate_reaction TEXT, -- leaning_accept | undecided | leaning_decline | declined
  outcome TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  ai_strategy TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_counter_offers_offer ON public.counter_offers(offer_id);

ALTER TABLE public.counter_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access counter_offers"
ON public.counter_offers FOR ALL
TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER trg_counter_offers_updated_at
  BEFORE UPDATE ON public.counter_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Trigger: auto-create an offer record when stage moves to 'Offer'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.candidate_jobs_auto_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_job RECORD;
  v_cand RECORD;
  v_notice_weeks INTEGER;
  v_earliest DATE;
BEGIN
  IF NEW.stage <> 'Offer' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.stage = 'Offer' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.offers WHERE candidate_job_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_owner := COALESCE(NEW.owner_user_id, (SELECT owner_user_id FROM public.jobs WHERE id = NEW.job_id));
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  SELECT j.*, c.company_name AS client_company_name
    INTO v_job
  FROM public.jobs j
  LEFT JOIN public.clients c ON c.id = j.client_id
  WHERE j.id = NEW.job_id;

  SELECT * INTO v_cand FROM public.candidates WHERE id = NEW.candidate_id;

  -- Guess notice period in weeks from candidates.notice_period text
  v_notice_weeks := NULL;
  IF v_cand.notice_period IS NOT NULL THEN
    IF v_cand.notice_period ~* 'immediate|none|0' THEN v_notice_weeks := 0;
    ELSIF v_cand.notice_period ~* '1\s*week' THEN v_notice_weeks := 1;
    ELSIF v_cand.notice_period ~* '2\s*week' THEN v_notice_weeks := 2;
    ELSIF v_cand.notice_period ~* '4\s*week|1\s*month' THEN v_notice_weeks := 4;
    ELSIF v_cand.notice_period ~* '6\s*week' THEN v_notice_weeks := 6;
    ELSIF v_cand.notice_period ~* '8\s*week|2\s*month' THEN v_notice_weeks := 8;
    ELSIF v_cand.notice_period ~* '12\s*week|3\s*month' THEN v_notice_weeks := 12;
    END IF;
  END IF;

  IF v_notice_weeks IS NOT NULL THEN
    v_earliest := CURRENT_DATE + (v_notice_weeks || ' weeks')::interval;
  END IF;

  INSERT INTO public.offers (
    owner_user_id, candidate_id, job_id, candidate_job_id,
    candidate_name_snapshot, client_name_snapshot, job_title_snapshot,
    candidate_expectation_snapshot, notice_period_weeks, earliest_start_date,
    salary_offered
  ) VALUES (
    v_owner, NEW.candidate_id, NEW.job_id, NEW.id,
    v_cand.name, v_job.client_company_name, v_job.title,
    v_cand.salary_expectation, v_notice_weeks, v_earliest,
    v_cand.salary_expectation
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_candidate_jobs_auto_offer
  AFTER INSERT OR UPDATE OF stage ON public.candidate_jobs
  FOR EACH ROW EXECUTE FUNCTION public.candidate_jobs_auto_offer();

-- ============================================================================
-- Trigger: keep computed fields fresh on offers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.offers_compute_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Earliest start = today (or verbal offer date) + notice period
  IF NEW.notice_period_weeks IS NOT NULL THEN
    NEW.earliest_start_date := COALESCE(NEW.verbal_offer_date, CURRENT_DATE)
                               + (NEW.notice_period_weeks || ' weeks')::interval;
  END IF;

  -- Auto-derive status from explicit lifecycle flags
  IF NEW.candidate_decision = 'declined' THEN
    NEW.status := 'withdrawn';
  ELSIF NEW.pre_start_placement_ready THEN
    NEW.status := 'placement_complete';
  ELSIF NEW.start_date_confirmed IS NOT NULL THEN
    NEW.status := 'starting_soon';
  ELSIF NEW.resignation_handed_in_date IS NOT NULL THEN
    NEW.status := 'resigned';
  ELSIF NEW.counter_offer_received_date IS NOT NULL AND NEW.candidate_decision <> 'accepted' THEN
    NEW.status := 'counter_offered';
  ELSIF NEW.candidate_decision = 'accepted' THEN
    NEW.status := 'accepted';
  ELSE
    NEW.status := 'awaiting_acceptance';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_offers_compute_fields
  BEFORE INSERT OR UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offers_compute_fields();
