
-- Table to persist field + tag suggestions extracted from call transcripts
CREATE TABLE public.call_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL,
  candidate_id uuid,
  kind text NOT NULL,                  -- 'field' or 'tag'
  field_name text,                     -- for kind='field' (e.g. 'salary_current')
  tag_category text,                   -- for kind='tag'
  tag_label text,                      -- for kind='tag'
  detected_value text,                 -- raw detected value as string
  confidence text NOT NULL DEFAULT 'medium',  -- 'high' | 'medium'
  source_quote text,
  status text NOT NULL DEFAULT 'pending',     -- 'pending' | 'accepted' | 'ignored'
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_insights_note ON public.call_insights(note_id);
CREATE INDEX idx_call_insights_status ON public.call_insights(status);

ALTER TABLE public.call_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on call_insights"
  ON public.call_insights FOR ALL
  USING (true) WITH CHECK (true);
