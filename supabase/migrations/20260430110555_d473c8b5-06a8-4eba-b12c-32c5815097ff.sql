-- ============================================================
-- INTERVIEW MANAGEMENT
-- ============================================================

CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  job_id UUID NOT NULL,
  candidate_job_id UUID NOT NULL,
  stage TEXT NOT NULL DEFAULT 'First Interview', -- 'First Interview' | 'Second Interview'

  -- Details
  scheduled_at TIMESTAMPTZ,
  duration_mins INTEGER DEFAULT 45,
  format TEXT, -- 'In person' | 'Video call' | 'Phone'
  location TEXT,
  interviewers TEXT, -- free text e.g. "James Brown — Head of Eng, Sarah Collins — VP Eng"
  interview_type TEXT, -- Competency | Technical | Presentation | Informal chat | Case study | Panel
  prep_notes TEXT,
  recruiter_advice TEXT,

  -- Lifecycle timestamps
  details_captured_at TIMESTAMPTZ,
  confirmation_sent_at TIMESTAMPTZ,
  prep_sent_at TIMESTAMPTZ,
  day_before_reminder_sent_at TIMESTAMPTZ,
  morning_checkin_sent_at TIMESTAMPTZ,
  candidate_feedback_logged_at TIMESTAMPTZ,
  client_feedback_logged_at TIMESTAMPTZ,
  client_chase_sent_at TIMESTAMPTZ,
  feedback_chase_snoozed_until DATE,

  -- Outcome
  outcome TEXT, -- 'To 2nd interview' | 'Offer' | 'Rejected' | 'Withdrew' | NULL while pending

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interviews_candidate ON public.interviews(candidate_id);
CREATE INDEX idx_interviews_job ON public.interviews(job_id);
CREATE INDEX idx_interviews_candidate_job ON public.interviews(candidate_job_id);
CREATE INDEX idx_interviews_owner_scheduled ON public.interviews(owner_user_id, scheduled_at);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access interviews"
  ON public.interviews FOR ALL
  TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

CREATE TRIGGER trg_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- CANDIDATE FEEDBACK (post-interview)
-- ============================================================

CREATE TABLE public.interview_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'candidate', -- 'candidate' | 'client'
  how_it_went TEXT, -- 'Very well' | 'Well' | 'Mixed' | 'Poorly'
  key_points TEXT,
  still_interested TEXT, -- 'Yes — very' | 'Yes — somewhat' | 'Unsure' | 'No'
  counter_offer_risk TEXT, -- 'No change' | 'Increased concern' | 'Decreased concern'
  next_steps TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_feedback_interview ON public.interview_feedback(interview_id);

ALTER TABLE public.interview_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access interview_feedback"
  ON public.interview_feedback FOR ALL
  TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

-- ============================================================
-- INTERVIEW SETTINGS (per user)
-- ============================================================

CREATE TABLE public.interview_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  auto_send_confirmation BOOLEAN NOT NULL DEFAULT false, -- false = prompt
  auto_send_reminder BOOLEAN NOT NULL DEFAULT false,
  day_before_reminder_time TIME NOT NULL DEFAULT '09:00',
  morning_checkin_enabled BOOLEAN NOT NULL DEFAULT true,
  post_interview_delay_hours INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own interview settings"
  ON public.interview_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_interview_settings_updated_at
  BEFORE UPDATE ON public.interview_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- AUTO-CREATE INTERVIEW WHEN STAGE → First/Second Interview
-- ============================================================

CREATE OR REPLACE FUNCTION public.candidate_jobs_auto_interview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  IF NEW.stage NOT IN ('First Interview', 'Second Interview') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.stage = NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Only seed once per (candidate_job, stage)
  IF EXISTS (
    SELECT 1 FROM public.interviews
    WHERE candidate_job_id = NEW.id AND stage = NEW.stage
  ) THEN
    RETURN NEW;
  END IF;

  v_owner := COALESCE(NEW.owner_user_id, (SELECT owner_user_id FROM public.jobs WHERE id = NEW.job_id));
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.interviews (
    owner_user_id, candidate_id, job_id, candidate_job_id, stage,
    scheduled_at
  ) VALUES (
    v_owner, NEW.candidate_id, NEW.job_id, NEW.id, NEW.stage,
    NEW.interview_date
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_candidate_jobs_auto_interview
  AFTER INSERT OR UPDATE OF stage ON public.candidate_jobs
  FOR EACH ROW EXECUTE FUNCTION public.candidate_jobs_auto_interview();
