---
name: Portal Manager + Candidate Portal
description: Internal /jobs/:jobId/portal manager (4 tabs) and public /candidate/:token candidate progress portal
type: feature
---
## Internal Portal Manager
Route `/jobs/:jobId/portal` → `src/pages/PortalManager.tsx`. Reached via [Open Portal] on the job detail
page (`ClientPortalLinkSection`) once a client portal exists. Tabs: Manage, Preview: Client,
Preview: Candidate, Settings.
- Manage: link status, copy client link, candidate list (stage, CV status, Client Ready Notes status,
  feedback count, [Push to portal] → creates candidate token), stage prep/details editor, scheduling,
  portal notes thread (client-visible).
- Previews render the real portals inline: `<ClientPortal tokenOverride previewEmail>` (skips email gate)
  and `<CandidatePortal tokenOverride>`.
- Settings: per-job candidate email toggles `client_portals.notify_candidate_on_interview` /
  `notify_candidate_on_reject` (both default FALSE), sync note, regenerate client link.

## Candidate Portal
Public route `/candidate/:token` → `src/pages/CandidatePortal.tsx`, data via `candidate-portal` edge
function (verify_jwt=false, service role). Table `candidate_portals` (candidate_job_id unique,
access_token). Candidate sees ONLY: first name, job title/location, job spec, simplified progress
(Application submitted → First/Second/Final interview → Offer), prep + interview details for stages
already reached, and scheduling once an interview stage is reached. NEVER feedback, notes, client
identity opinions, other candidates. Withdrawn → neutral "recruiter will be in touch" state.

## Sync
No re-push needed: job spec and CV URLs are read live. `jobs_sync_portal_spec` trigger stamps
`client_portals.job_spec_synced_at` when a job description changes (displayed in Manage).
