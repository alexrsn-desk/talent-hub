---
name: Database schema
description: Core CRM tables — clients, jobs, candidates, candidate_jobs, notes with statuses and linking
type: feature
---
## Tables
- **clients** — company_name, contact_name, job_title, email, phone, linkedin_url, sector, status, last_activity_date, next_action, next_action_due_date
- **jobs** — title, client_id (FK→clients), location, salary_min, salary_max, job_type (Perm/Contract), status (Open/On Hold/Filled/Cancelled), fee_type, fee_value, date_opened
- **candidates** — name, job_title, current_employer, location, email, phone, linkedin_url, status, source, salary_current, availability
- **candidate_jobs** — candidate_id (FK→candidates), job_id (FK→jobs), stage (Longlist/Shortlist/Submitted/Client Review/First Interview/Second Interview/Offer/Placed/Rejected)
- **contacts** — client_id (FK→clients), name, job_title, email, phone, linkedin_url
- **notes** — candidate_id, client_id, job_id, content, activity_type, outcome, follow_up_date

## Pipeline Stages (ATS)
Longlist → Shortlist → Submitted → Client Review → First Interview → Second Interview → Offer → Placed / Rejected
