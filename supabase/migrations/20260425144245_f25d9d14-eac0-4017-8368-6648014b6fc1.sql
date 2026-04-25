
-- Add entity_type/entity_id and contact_id to support contacts and clients in sequences
ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid,
  ADD COLUMN IF NOT EXISTS contact_id uuid;

CREATE INDEX IF NOT EXISTS idx_seq_enroll_entity ON public.sequence_enrollments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_seq_enroll_contact ON public.sequence_enrollments(contact_id);

-- Backfill entity_type for existing candidate-only rows
UPDATE public.sequence_enrollments
   SET entity_type = 'candidate', entity_id = candidate_id
 WHERE candidate_id IS NOT NULL AND entity_type IS NULL;

UPDATE public.sequence_enrollments
   SET entity_type = 'client', entity_id = client_id
 WHERE client_id IS NOT NULL AND entity_type IS NULL;

-- Seed the 6 prescribed personal templates (idempotent: delete then insert by name)
DELETE FROM public.sequence_templates WHERE name IN (
  'Warm Senior Contact',
  'BD Nurture',
  'Warm Candidate Re-engagement',
  'Post-Placement Client Nurture',
  'Lapsed Client Reconnect',
  'Post-Event Follow Up'
);

INSERT INTO public.sequence_templates (name, description, category, steps) VALUES
('Warm Senior Contact',
 'CPOs, CTOs, VPs, Founders met once or twice with BD potential.',
 'personal',
 '[
   {"step_number":1,"day_offset":7,"channel":"LinkedIn","message_prompt":"Connect with personalised note referencing how you met or what you discussed."},
   {"step_number":2,"day_offset":21,"channel":"Email","message_prompt":"Share something genuinely useful — market insight, relevant candidate availability, specific to them."},
   {"step_number":3,"day_offset":45,"channel":"Email","message_prompt":"Soft check in — reference something from their LinkedIn or company news."},
   {"step_number":4,"day_offset":90,"channel":"Phone","message_prompt":"By now they know your name. Proper conversation. See where things are heading."},
   {"step_number":5,"day_offset":180,"channel":"LinkedIn","message_prompt":"Keep warm. No agenda. Just staying visible."}
 ]'::jsonb),

('BD Nurture',
 'Prospects showing interest but not yet in hiring discussion.',
 'personal',
 '[
   {"step_number":1,"day_offset":1,"channel":"Email","message_prompt":"Personal check in."},
   {"step_number":2,"day_offset":7,"channel":"LinkedIn","message_prompt":"Engage with their content."},
   {"step_number":3,"day_offset":21,"channel":"Phone","message_prompt":"Proper catch up."},
   {"step_number":4,"day_offset":45,"channel":"Email","message_prompt":"Market update."}
 ]'::jsonb),

('Warm Candidate Re-engagement',
 'Strong candidates who said not now.',
 'personal',
 '[
   {"step_number":1,"day_offset":30,"channel":"LinkedIn","message_prompt":"Check in."},
   {"step_number":2,"day_offset":45,"channel":"Email","message_prompt":"Relevant role or market insight."},
   {"step_number":3,"day_offset":75,"channel":"Phone","message_prompt":"Catch up call."},
   {"step_number":4,"day_offset":120,"channel":"LinkedIn","message_prompt":"Keep warm."}
 ]'::jsonb),

('Post-Placement Client Nurture',
 'Clients after a successful placement.',
 'personal',
 '[
   {"step_number":1,"day_offset":30,"channel":"Email","message_prompt":"How is the new hire settling in?"},
   {"step_number":2,"day_offset":90,"channel":"LinkedIn","message_prompt":"Stay visible."},
   {"step_number":3,"day_offset":180,"channel":"Phone","message_prompt":"Relationship call."},
   {"step_number":4,"day_offset":270,"channel":"Email","message_prompt":"Market update."},
   {"step_number":5,"day_offset":365,"channel":"Phone","message_prompt":"Annual check in."}
 ]'::jsonb),

('Lapsed Client Reconnect',
 'Clients you placed with before but gone quiet.',
 'personal',
 '[
   {"step_number":1,"day_offset":1,"channel":"Email","message_prompt":"Genuine personal check in, no agenda."},
   {"step_number":2,"day_offset":7,"channel":"LinkedIn","message_prompt":"Engage with their content."},
   {"step_number":3,"day_offset":21,"channel":"Phone","message_prompt":"Proper catch up."},
   {"step_number":4,"day_offset":45,"channel":"Email","message_prompt":"Share something useful."}
 ]'::jsonb),

('Post-Event Follow Up',
 'People met at events or conferences.',
 'personal',
 '[
   {"step_number":1,"day_offset":1,"channel":"LinkedIn","message_prompt":"Connect with reference to the event."},
   {"step_number":2,"day_offset":7,"channel":"Email","message_prompt":"Good to meet, share something useful."},
   {"step_number":3,"day_offset":30,"channel":"Phone","message_prompt":"Proper follow up."}
 ]'::jsonb);
