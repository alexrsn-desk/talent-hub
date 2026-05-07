CREATE OR REPLACE FUNCTION public.clear_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_candidate_ids uuid[];
  v_client_ids uuid[];
  v_contact_ids uuid[];
  v_job_ids uuid[];
  v_cj_ids uuid[];
  v_note_ids uuid[];
  v_enrollment_ids uuid[];
  v_offer_ids uuid[];
  v_interview_ids uuid[];
  v_placement_ids uuid[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT array_agg(id) INTO v_candidate_ids FROM public.candidates WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_client_ids FROM public.clients WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_contact_ids FROM public.contacts WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_job_ids FROM public.jobs WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_cj_ids FROM public.candidate_jobs WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_note_ids FROM public.notes WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_offer_ids FROM public.offers WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_interview_ids FROM public.interviews WHERE owner_user_id = v_user;
  SELECT array_agg(id) INTO v_placement_ids FROM public.placements WHERE owner_user_id = v_user;

  SELECT array_agg(id) INTO v_enrollment_ids FROM public.sequence_enrollments
    WHERE (candidate_id = ANY(COALESCE(v_candidate_ids, ARRAY[]::uuid[])))
       OR (client_id = ANY(COALESCE(v_client_ids, ARRAY[]::uuid[])))
       OR (contact_id = ANY(COALESCE(v_contact_ids, ARRAY[]::uuid[])))
       OR (job_id = ANY(COALESCE(v_job_ids, ARRAY[]::uuid[])));

  -- Children of notes (signals/insights) — these tables have permissive RLS but we scope by note_id
  IF v_note_ids IS NOT NULL THEN
    DELETE FROM public.call_signals WHERE note_id = ANY(v_note_ids);
    DELETE FROM public.call_insights WHERE note_id = ANY(v_note_ids);
  END IF;

  -- Children of candidate_jobs
  IF v_cj_ids IS NOT NULL THEN
    DELETE FROM public.candidate_summaries WHERE candidate_job_id = ANY(v_cj_ids);
    DELETE FROM public.screening_notes WHERE candidate_job_id = ANY(v_cj_ids);
    DELETE FROM public.client_feedback WHERE candidate_job_id = ANY(v_cj_ids);
    DELETE FROM public.interview_slots WHERE candidate_job_id = ANY(v_cj_ids);
  END IF;

  -- Children of clients
  IF v_client_ids IS NOT NULL THEN
    DELETE FROM public.client_portal_access WHERE client_id = ANY(v_client_ids);
  END IF;

  -- Children of candidates / jobs (tags)
  IF v_candidate_ids IS NOT NULL THEN
    DELETE FROM public.candidate_tags WHERE candidate_id = ANY(v_candidate_ids);
  END IF;
  IF v_job_ids IS NOT NULL THEN
    DELETE FROM public.job_tags WHERE job_id = ANY(v_job_ids);
    DELETE FROM public.job_score_history WHERE job_id = ANY(v_job_ids);
  END IF;

  -- Sequence enrollments + step logs
  IF v_enrollment_ids IS NOT NULL THEN
    DELETE FROM public.sequence_step_logs WHERE enrollment_id = ANY(v_enrollment_ids);
    DELETE FROM public.sequence_enrollments WHERE id = ANY(v_enrollment_ids);
  END IF;

  -- Interview feedback + interviews
  IF v_interview_ids IS NOT NULL THEN
    DELETE FROM public.interview_feedback WHERE interview_id = ANY(v_interview_ids);
  END IF;
  DELETE FROM public.interviews WHERE owner_user_id = v_user;

  -- Offers + children
  IF v_offer_ids IS NOT NULL THEN
    DELETE FROM public.offer_milestones WHERE offer_id = ANY(v_offer_ids);
    DELETE FROM public.counter_offers WHERE offer_id = ANY(v_offer_ids);
  END IF;
  DELETE FROM public.offers WHERE owner_user_id = v_user;

  -- Placements + checkins
  IF v_placement_ids IS NOT NULL THEN
    DELETE FROM public.placement_checkins WHERE placement_id = ANY(v_placement_ids);
  END IF;
  DELETE FROM public.placements WHERE owner_user_id = v_user;

  -- Decay alerts
  DELETE FROM public.decay_alerts WHERE owner_user_id = v_user;

  -- Quick notes
  DELETE FROM public.quick_notes WHERE owner_user_id = v_user;

  -- Notes
  DELETE FROM public.notes WHERE owner_user_id = v_user;

  -- Activity log
  DELETE FROM public.activity_log WHERE user_id = v_user;

  -- Candidate-jobs
  DELETE FROM public.candidate_jobs WHERE owner_user_id = v_user;

  -- Top-level entities
  DELETE FROM public.contacts WHERE owner_user_id = v_user;
  DELETE FROM public.candidates WHERE owner_user_id = v_user;
  DELETE FROM public.jobs WHERE owner_user_id = v_user;
  DELETE FROM public.clients WHERE owner_user_id = v_user;

  RETURN jsonb_build_object('cleared', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_user_data() TO authenticated;