---
name: Pipeline stages
description: Canonical 8-stage candidate pipeline and the withdrawn/rejected flag replacing the Rejected stage
type: feature
---
## Canonical stages (candidate_jobs.stage)
AI Suggested → Shortlist → Sent CV → First Stage → Second Stage → Final Stage → Offer → Placed

Removed stages: Longlist, Contact, Screening, Submitted, Client Review, First/Second Interview, Rejected.
Longlist was migrated to Shortlist; Submitted/Client Review → Sent CV; First/Second Interview → First/Second Stage.

## Rejected / withdrawn
Not a stage. It's a flag on candidate_jobs: `withdrawn` (bool), `withdrawn_reason`, `withdrawn_at`.
Withdrawn rows keep the stage they were at (for reporting), are hidden from the Kanban board by default,
and surface via the "Show rejected/withdrawn" toggle. Cards can be reinstated inline.

## Rules
- Cannot move to Sent CV before Shortlist; cannot move to Offer before an interview stage.
- Withdrawn candidates cannot be dragged until reinstated.
- AI Suggested column keeps its compact inbox treatment and all ai_suggested* attribution fields.
