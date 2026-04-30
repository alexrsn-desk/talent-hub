-- Placements table
CREATE TABLE public.placements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  client_id UUID,
  job_id UUID,
  candidate_job_id UUID,
  candidate_name_snapshot TEXT,
  client_name_snapshot TEXT,
  job_title_snapshot TEXT,
  offer_accepted_date DATE,
  start_date DATE,
  salary_placed_at INTEGER,
  fee_type TEXT NOT NULL DEFAULT 'Percentage',
  fee_percentage NUMERIC,
  fee_amount NUMERIC,
  invoice_date DATE,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  invoice_due_date DATE,
  guarantee_weeks INTEGER NOT NULL DEFAULT 12,
  guarantee_expiry_date DATE,
  invoice_raised BOOLEAN NOT NULL DEFAULT false,
  invoice_raised_at TIMESTAMP WITH TIME ZONE,
  invoice_paid BOOLEAN NOT NULL DEFAULT false,
  invoice_paid_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pre_start', -- pre_start, active, guaranteed, at_risk, fallen_through
  source TEXT, -- ai_suggested, manual, inbound
  notes TEXT,
  fall_through_reason TEXT,
  fall_through_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_placements_owner ON public.placements(owner_user_id);
CREATE INDEX idx_placements_candidate ON public.placements(candidate_id);
CREATE INDEX idx_placements_client ON public.placements(client_id);
CREATE INDEX idx_placements_status ON public.placements(status);
CREATE INDEX idx_placements_start_date ON public.placements(start_date);

ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access placements"
ON public.placements FOR ALL TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER trg_placements_updated_at
BEFORE UPDATE ON public.placements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Placement check-ins table
CREATE TABLE public.placement_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  placement_id UUID NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  checkin_type TEXT NOT NULL, -- week_1, week_4, week_8, probation_review, guarantee_expiry, custom
  due_date DATE NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  concern_flagged BOOLEAN NOT NULL DEFAULT false,
  concern_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_placement_checkins_placement ON public.placement_checkins(placement_id);
CREATE INDEX idx_placement_checkins_owner ON public.placement_checkins(owner_user_id);
CREATE INDEX idx_placement_checkins_due ON public.placement_checkins(due_date) WHERE completed = false;

ALTER TABLE public.placement_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access placement_checkins"
ON public.placement_checkins FOR ALL TO authenticated
USING (public.can_access_owner(owner_user_id))
WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER trg_placement_checkins_updated_at
BEFORE UPDATE ON public.placement_checkins
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: compute derived dates on placement insert/update
CREATE OR REPLACE FUNCTION public.placements_compute_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Invoice date defaults to start date
  IF NEW.invoice_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.invoice_date := NEW.start_date;
  END IF;

  -- Invoice due date = invoice_date + payment_terms_days
  IF NEW.invoice_date IS NOT NULL THEN
    NEW.invoice_due_date := NEW.invoice_date + (COALESCE(NEW.payment_terms_days, 30) || ' days')::interval;
  END IF;

  -- Guarantee expiry = start_date + guarantee_weeks
  IF NEW.start_date IS NOT NULL THEN
    NEW.guarantee_expiry_date := NEW.start_date + (COALESCE(NEW.guarantee_weeks, 12) || ' weeks')::interval;
  END IF;

  -- Fee amount auto-calc when percentage
  IF NEW.fee_type = 'Percentage'
     AND NEW.fee_percentage IS NOT NULL
     AND NEW.salary_placed_at IS NOT NULL
     AND (NEW.fee_amount IS NULL OR (TG_OP = 'UPDATE' AND OLD.fee_amount IS NOT DISTINCT FROM NEW.fee_amount AND (OLD.salary_placed_at IS DISTINCT FROM NEW.salary_placed_at OR OLD.fee_percentage IS DISTINCT FROM NEW.fee_percentage)))
  THEN
    NEW.fee_amount := ROUND(NEW.salary_placed_at * NEW.fee_percentage / 100.0);
  END IF;

  -- Auto status from dates (only if not in a terminal/manual state)
  IF NEW.status NOT IN ('fallen_through', 'at_risk') THEN
    IF NEW.start_date IS NOT NULL AND NEW.start_date > CURRENT_DATE THEN
      NEW.status := 'pre_start';
    ELSIF NEW.guarantee_expiry_date IS NOT NULL AND NEW.guarantee_expiry_date < CURRENT_DATE THEN
      NEW.status := 'guaranteed';
    ELSIF NEW.start_date IS NOT NULL AND NEW.start_date <= CURRENT_DATE THEN
      NEW.status := 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_placements_compute_dates
BEFORE INSERT OR UPDATE ON public.placements
FOR EACH ROW EXECUTE FUNCTION public.placements_compute_dates();

-- Function: when placement created with start_date, generate check-ins
CREATE OR REPLACE FUNCTION public.placements_generate_checkins()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only seed once per placement
  IF EXISTS (SELECT 1 FROM public.placement_checkins WHERE placement_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.placement_checkins (owner_user_id, placement_id, checkin_type, due_date) VALUES
    (NEW.owner_user_id, NEW.id, 'week_1', NEW.start_date + INTERVAL '4 days'),
    (NEW.owner_user_id, NEW.id, 'week_4', NEW.start_date + INTERVAL '28 days'),
    (NEW.owner_user_id, NEW.id, 'week_8', NEW.start_date + INTERVAL '56 days'),
    (NEW.owner_user_id, NEW.id, 'probation_review', NEW.start_date + INTERVAL '84 days'),
    (NEW.owner_user_id, NEW.id, 'guarantee_expiry', NEW.start_date + (COALESCE(NEW.guarantee_weeks, 12) || ' weeks')::interval - INTERVAL '14 days');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_placements_generate_checkins
AFTER INSERT ON public.placements
FOR EACH ROW EXECUTE FUNCTION public.placements_generate_checkins();

-- Function: when candidate_jobs.stage moves to 'Placed', auto-create placement
CREATE OR REPLACE FUNCTION public.candidate_jobs_auto_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_cand RECORD;
  v_fee_amount NUMERIC;
BEGIN
  IF NEW.stage <> 'Placed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.stage = 'Placed' THEN
    RETURN NEW;
  END IF;
  -- avoid duplicates
  IF EXISTS (SELECT 1 FROM public.placements WHERE candidate_job_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT j.*, c.company_name AS client_company_name
    INTO v_job
  FROM public.jobs j
  LEFT JOIN public.clients c ON c.id = j.client_id
  WHERE j.id = NEW.job_id;

  SELECT * INTO v_cand FROM public.candidates WHERE id = NEW.candidate_id;

  IF v_job.fee_type = 'Percentage' AND v_job.fee_value IS NOT NULL AND v_cand.salary_expectation IS NOT NULL THEN
    v_fee_amount := ROUND(v_cand.salary_expectation * v_job.fee_value / 100.0);
  ELSIF v_job.fee_type = 'Fixed' THEN
    v_fee_amount := v_job.fee_value;
  END IF;

  INSERT INTO public.placements (
    owner_user_id, candidate_id, client_id, job_id, candidate_job_id,
    candidate_name_snapshot, client_name_snapshot, job_title_snapshot,
    offer_accepted_date, salary_placed_at,
    fee_type, fee_percentage, fee_amount, source
  ) VALUES (
    COALESCE(NEW.owner_user_id, v_job.owner_user_id),
    NEW.candidate_id, v_job.client_id, NEW.job_id, NEW.id,
    v_cand.name, v_job.client_company_name, v_job.title,
    CURRENT_DATE, v_cand.salary_expectation,
    COALESCE(v_job.fee_type, 'Percentage'),
    CASE WHEN v_job.fee_type = 'Percentage' THEN v_job.fee_value ELSE NULL END,
    v_fee_amount,
    COALESCE(NEW.source, 'manual')
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_candidate_jobs_auto_placement
AFTER INSERT OR UPDATE OF stage ON public.candidate_jobs
FOR EACH ROW EXECUTE FUNCTION public.candidate_jobs_auto_placement();