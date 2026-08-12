DO $$
DECLARE v_uid uuid := 'b609e4fe-6c6a-4c3c-9592-90046edb566c';
        v_job uuid; v_c1 uuid; v_c2 uuid;
BEGIN
  INSERT INTO public.portal_jobs (owner_user_id, title, client_name)
  VALUES (v_uid, 'Senior Frontend Engineer (Portal Demo)', 'Northwind Digital')
  RETURNING id INTO v_job;

  INSERT INTO public.portal_client_portals (job_id) VALUES (v_job);

  INSERT INTO public.portal_candidates (job_id, name, email, stage)
  VALUES (v_job, 'Alex Morgan', 'alex@example.com', 'Application Submitted')
  RETURNING id INTO v_c1;

  INSERT INTO public.portal_candidates (job_id, name, email, stage)
  VALUES (v_job, 'Priya Shah', 'priya@example.com', 'First Interview')
  RETURNING id INTO v_c2;

  INSERT INTO public.portal_candidate_portals (candidate_id) VALUES (v_c1), (v_c2);

  INSERT INTO public.portal_job_stage_content (job_id, stage, prep_content, interview_details)
  VALUES (v_job, 'First Interview',
    'Expect a 45 minute conversation focused on React architecture. Bring one example of a component library you shaped.',
    'Video call with Sam Lee, Head of Engineering. 45 minutes.');
END $$;