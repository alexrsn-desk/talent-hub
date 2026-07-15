
ALTER TABLE public.company_intel
  ADD COLUMN IF NOT EXISTS product_types TEXT,
  ADD COLUMN IF NOT EXISTS who_uses_products TEXT,
  ADD COLUMN IF NOT EXISTS internal_external TEXT,
  ADD COLUMN IF NOT EXISTS current_focus TEXT,
  ADD COLUMN IF NOT EXISTS design_approach TEXT,
  ADD COLUMN IF NOT EXISTS tech_context TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_confidence TEXT;
