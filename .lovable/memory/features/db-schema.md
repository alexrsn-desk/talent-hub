---
name: Database schema
description: Core CRM tables — clients, jobs, candidates, candidate_jobs, notes, activity_log with statuses and linking
type: feature
---
## Tables
- **clients** — company_name, contact_name, job_title, email, phone, linkedin_url, sector, status, last_activity_date, next_action, next_action_due_date
- **jobs** — title, client_id (FK→clients), location, salary_min, salary_max, job_type (Perm/Contract), status (Open/On Hold/Filled/Cancelled), fee_type, fee_value, date_opened
- **candidates** — name, job_title, current_employer, location, email, phone, linkedin_url, status, source, salary_current, availability
- **candidate_jobs** — candidate_id (FK→candidates), job_id (FK→jobs), stage, interview_date
- **contacts** — client_id (FK→clients), name, job_title, email, phone, linkedin_url
- **notes** — candidate_id, client_id, job_id, content, activity_type, outcome, follow_up_date, duration, transcript
- **weekly_summaries** — user_id, week_start, week_end, summary (JSONB)
- **interview_slots** — candidate_job_id, start_time, end_time, status (available/confirmed), selected_by_client
- **activity_log** — user_id, action_type, candidate_id, client_id, job_id, candidate_job_id, metadata (JSONB), created_at. Append-only (no update/delete policies).
- **notifications** — user_id, type, title, message, read, data (JSONB)
- **recruiter_profiles** — user_id, display_name, agency_name, agency_logo_url, brand_color, onboarding fields
- **client_portal_access** — client_id, magic_link_token, token_expires_at, enabled, last_accessed_at
- **client_feedback** — candidate_job_id, client_id, status, reason, rating, strengths, concerns, decision, feedback_type
- **candidate_summaries** — candidate_job_id, ai_summary, manual_summary

## Pipeline Stages (ATS)
Longlist → Shortlist → Submitted → Client Review → First Interview → Second Interview → Offer → Placed / Rejected

## Activity Log Action Types
candidate_created, candidate_updated, candidate_deleted, client_created, client_updated, client_deleted, job_created, job_updated, job_deleted, candidate_job_linked, candidate_job_unlinked, stage_change, note_created, touchpoint_logged, contact_created, contact_deleted, interview_scheduled, cv_sent, bd_contact_made, portal_link_generated, client_feedback_received
