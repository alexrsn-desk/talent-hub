---
name: Client Portal (token board)
description: Public /portal/:token client review board — own theme, edge function, portal_ tables, visibility wall
type: feature
---
Route `/portal/:token` (public, no login) → `src/pages/ClientPortal.tsx`. All data goes through the
`client-portal` edge function (verify_jwt=false, service role) — the portal never queries tables via the
anon Supabase client.

## Visibility wall (non-negotiable)
Client sees only: candidate name, job_title headline, `candidates.client_ready_notes`, `cv_file_url`,
current stage, their own feedback/notes. Never internal notes, transcripts, assessments, Not Interested In,
salary or notice period. Only stages Sent CV, First Stage, Second Stage, Final Stage, Offer, Placed are
exposed — AI Suggested / Shortlist stay internal. Withdrawn rows appear in a virtual read-only "Rejected"
column at 75% opacity.

## Tables
`client_portals` (job_id, user_id, access_token), `portal_feedback`, `portal_notes`,
`portal_stage_content` (job_id+stage unique), `portal_scheduling` (job_id unique).
RLS: owner-only via `can_access_owner`; no anon grants.

## Behaviour
Stage moves write straight to `candidate_jobs` (real pipeline) and log `client_moved_stage` /
`client_feedback_received` to activity_log. Gate screen collects a client email into sessionStorage
(`portal_email_<token>`) — attribution only, the token gates access. Native HTML5 drag and drop, native selects.

## Theme
Portal has its OWN palette scoped to `.portal-root` in index.css (paper #FBFAF7 / surface #F5F3EF /
ink #111923 / primary #16212F / teal accent #1C9F81), Bricolage Grotesque headings + Inter Tight body
loaded via link tag in index.html. Use `.portal-panel` for every card. Do not apply the main Desky
lime theme inside the portal.

Recruiter side: `ClientPortalLinkSection` on the job detail page creates/copies/regenerates the link.
