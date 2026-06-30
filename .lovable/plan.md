## Job Launch Workflow

A 5-step guided wizard that turns a new job into a launched search in ~10 minutes. Warm → cold ordering throughout.

### Access points
1. **Post-create prompt** — `AddJobDialog` success toast becomes a small modal: "Job created. Ready to launch the search? [Launch search workflow →] [Do this later]".
2. **Job action bar** — `[Launch search]` button in `JobFullView` header (next to Compare & Submit).
3. **Coach / Biller's Workflow** — new trigger `ftb-launch` for jobs created >0 days ago with no launch record.

### Route
`/jobs/:jobId/launch` → `src/pages/JobLaunch.tsx` with top step tracker (① Brief ② Who You Know ③ Generate ④ Review ⑤ Launch). Draft state persisted in `localStorage` keyed by job id (matches Compare & Submit pattern).

### Data model (one migration)
- `jobs` — add `launch_hook text` (what makes role interesting), `ideal_candidate_line text`, `search_launched_at timestamptz`, `launch_summary jsonb`.
- `recruiter_profiles` — add `linkedin_post_template`, `personal_candidate_template`, `li_connection_template`, `campaign_outreach_template`, `client_confirmation_template` (all text). Reuse existing template-learning pattern from `submission_email_template` / `reactivation_email_template`.
- `job_launches` table — `id, owner_user_id, job_id, launched_at, known_count, li_count, post_text, campaign_subject, campaign_body, client_email_sent boolean, outputs jsonb`. RLS by owner + GRANTs.

### Edge functions (vendor-neutral via Lovable AI Gateway, default `google/gemini-2.5-flash` — works identically with Claude through the gateway; no Gemini-specific APIs)
1. `job-launch-match-candidates` — finds top matches from `candidates` table, groups into **Spoken to** (status Active/Passive) and **LI Connections** (status "LI Connection"). Returns match % + one-line reason.
2. `job-launch-generate` — single call returning all 5 outputs as strict JSON: `{ knownMessages[], liMessages[], linkedinPost, campaign: {subject, body}, clientEmail }`. Inputs: job + hook + ideal line + per-candidate context (notes excerpt, motivations, quick profile) + saved templates.
3. `job-launch-send` — handles sending known/LI messages via Outlook connector with natural spacing (30m / 2h / today), logs touchpoints, adds candidates to pipeline at `Contact` stage (no "Longlist" in current stage list — using Contact as the warm-touch stage), records `job_launches` row, sets `jobs.search_launched_at`, logs activity.

### UI components
- `src/pages/JobLaunch.tsx` — wizard shell + step tracker (clickable back to completed steps).
- `src/components/joblaunch/StepBrief.tsx` — shows job fields read-only, JD presence indicator, two new textareas (`launch_hook`, `ideal_candidate_line`). Persists to `jobs` table.
- `src/components/joblaunch/StepWhoYouKnow.tsx` — two grouped lists with checkboxes, green/blue indicators, search-to-add, move between groups.
- `src/components/joblaunch/StepGenerate.tsx` — loading state with rotating status lines while edge function runs.
- `src/components/joblaunch/StepReview.tsx` — 5 tabs (Known / LI / Post / Campaign / Client). Each message card: Edit (inline textarea) / Skip / Regenerate (per-item regen call). Character counts where relevant. Copy buttons (Sourcewhale/Interseller/plain/LinkedIn).
- `src/components/joblaunch/StepLaunch.tsx` — summary + per-output launch buttons + [Launch all] + email spacing selector.
- `src/components/PostJobCreatePrompt.tsx` — small modal triggered by `AddJobDialog`.

### Integrations
- `AddJobDialog.tsx` — after successful create, open `PostJobCreatePrompt` (passes job id).
- `Jobs.tsx` `JobFullView` — add `[Launch search]` button; show "Search launched: <date>" badge when `search_launched_at` set.
- `use-billers-workflow.ts` — add `ftb-launch` trigger (jobs Active with no `search_launched_at` and pipeline empty).
- `Coach` morning brief data source — include un-launched active jobs.
- `Settings.tsx` — add **My Templates** section with 5 editable textareas + first-use "paste your examples" capture.

### Template learning
On every Regenerate or Edit + Save in review step, store the edited final text on the user's `recruiter_profiles.*_template` field (only if user clicks "Save my style"). Same pattern already used by Compare & Submit / Reactivation.

### Technical notes
- All AI calls use Lovable AI Gateway with structured JSON output via plain `response_format: json_object` + schema in the prompt — no Gemini-specific tool calls or grounding.
- Touchpoint logging reuses `logActivity` + `notes` insert pattern already in `compare-submit-email`.
- Pipeline stage on send: `Contact` (closest existing stage to "Longlist"; documented stages are Contact → Screening → Shortlist → ...).
- Email spacing implemented client-side by staggering `job-launch-send` calls with `setTimeout`; server records each send individually.

### Out of scope (this iteration)
- Actual LinkedIn API posting — we only generate text + "Open LinkedIn" deep link + clipboard copy (no LinkedIn write API in current connectors).
- Sourcewhale/Interseller direct push — copy-to-clipboard only (matches existing pattern).
