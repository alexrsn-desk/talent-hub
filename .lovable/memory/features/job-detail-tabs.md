---
name: Job detail tabbed workspace
description: Five-tab job detail layout (Pipeline, Details, Job Launch, Portal, History & Notes) and its shared header
type: feature
---
The job detail view (`JobFullView` in `src/pages/Jobs.tsx`) is a tabbed workspace, not a long scroll page.

Shared header above all tabs: job title (large), client name linked to the client record, status badge,
and a compact facts line — salary range · location · X of Y filled (Y = `jobs.headcount`, X = candidates at Placed).
Action buttons (Intake Call Companion, Compare & Submit, Close Job, delete) sit in the header row.

Tabs, in order, Pipeline default:
1. Pipeline — `JobPipelineBoard` + placement score panel + `CandidateMatching`
2. Details — `JobDetailsTab`: Role, Fee, Job spec, Briefing context (launch_hook, ideal_candidate_line, similar_titles, key_skills, additional_context — single source of truth), Tags
3. Job Launch — `JobLaunchTab`: not-launched empty state, or launch summary from `job_launches` + `LaunchStatusSection`
4. Portal — `PortalLaunchSection`
5. History & Notes — `NotesSection` composer/notes, then `JobActivityTimeline`

Never render the same section in two tabs. `jobs.headcount` (int, default 1) holds required headcount.
