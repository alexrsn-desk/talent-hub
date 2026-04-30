-- ─── Candidates: DNC + deletion fields ─────────────────────────────
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnc_reason text,
  ADD COLUMN IF NOT EXISTS dnc_reason_other text,
  ADD COLUMN IF NOT EXISTS dnc_channel text,
  ADD COLUMN IF NOT EXISTS dnc_notes text,
  ADD COLUMN IF NOT EXISTS dnc_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS dnc_set_by uuid,
  ADD COLUMN IF NOT EXISTS gdpr_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gdpr_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_candidates_do_not_contact ON public.candidates(do_not_contact) WHERE do_not_contact = true;
CREATE INDEX IF NOT EXISTS idx_candidates_gdpr_deleted ON public.candidates(gdpr_deleted) WHERE gdpr_deleted = true;

-- ─── Contacts: DNC + deletion fields ──────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dnc_reason text,
  ADD COLUMN IF NOT EXISTS dnc_reason_other text,
  ADD COLUMN IF NOT EXISTS dnc_channel text,
  ADD COLUMN IF NOT EXISTS dnc_notes text,
  ADD COLUMN IF NOT EXISTS dnc_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS dnc_set_by uuid,
  ADD COLUMN IF NOT EXISTS gdpr_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gdpr_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_do_not_contact ON public.contacts(do_not_contact) WHERE do_not_contact = true;
CREATE INDEX IF NOT EXISTS idx_contacts_gdpr_deleted ON public.contacts(gdpr_deleted) WHERE gdpr_deleted = true;

-- ─── Compliance audit log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  performed_by uuid,
  action text NOT NULL, -- dnc_enabled | dnc_disabled | gdpr_deleted | audit_kept | audit_archived | audit_deleted
  entity_type text NOT NULL, -- candidate | contact
  entity_id uuid NOT NULL,
  entity_name_snapshot text,
  reason text,
  reason_other text,
  channel text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or manager access compliance_log"
  ON public.compliance_log FOR ALL
  TO authenticated
  USING (public.can_access_owner(owner_user_id))
  WITH CHECK (public.can_access_owner(owner_user_id));

CREATE INDEX IF NOT EXISTS idx_compliance_log_owner ON public.compliance_log(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_log_entity ON public.compliance_log(entity_type, entity_id);

-- ─── 6-monthly GDPR audit cycle ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  records_reviewed integer NOT NULL DEFAULT 0,
  records_kept integer NOT NULL DEFAULT 0,
  records_archived integer NOT NULL DEFAULT 0,
  records_deleted integer NOT NULL DEFAULT 0,
  next_due_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '6 months')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own compliance audits"
  ON public.compliance_audits FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_compliance_audits_user ON public.compliance_audits(user_id, created_at DESC);