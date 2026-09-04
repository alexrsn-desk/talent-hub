# Desky Action Layer

One server-side, authenticated, validated set of CRM operations. Everything that
changes Desky data should eventually flow through it:

```
Desky UI      ─┐
Viktor        ─┤→  desky-actions edge function → action registry → Supabase (RLS) → tables
Claude / MCP  ─┤
CSV import    ─┘
```

## Entry point

`POST /functions/v1/desky-actions`

```json
{ "action": "search_candidates", "payload": { "location": "Manchester" }, "mode": "execute" }
```

- `mode: "execute"` (default) runs the action; `mode: "preview"` dry-runs it and returns
  the records it would affect (only for actions that define a preview).
- `{ "action": "list_actions" }` returns the machine-readable catalogue (name, kind, description) —
  this is what a future MCP server should build its tools from.
- Headers: caller's Supabase JWT in `Authorization`, plus optional `x-desky-client`
  (`ui`, `mcp`, `viktor`, …) which is recorded on every audit row.
- Responses: `{ "data": … }` on success, `{ "error": "message", "code": "…" }` on failure.
  Errors are sanitised — Postgres details are logged server-side only.

Frontend helper: `src/lib/desky-actions.ts` (`deskyAction`, `previewAction`, plus typed wrappers).

## Actions

| Area | Actions |
| --- | --- |
| Candidates | `get_candidate`, `search_candidates`, `create_candidate`, `update_candidate`, `add_note`, `get_notes`, `get_candidate_activity` |
| Contacts | `get_contact`, `search_contacts`, `create_contact`, `update_contact` |
| Companies | `get_company`, `search_companies`, `create_company`, `update_company` |
| Jobs | `get_job`, `search_jobs`, `get_open_jobs`, `get_candidates_for_job`, `get_pipeline_for_job`, `get_job_activity` |
| Applications | `get_application`, `add_candidate_to_job`, `remove_candidate_from_job`, `change_application_stage` |
| Recruitment | `create_submission`, `create_interview`, `create_placement` |
| Tasks / follow-ups | `create_task`, `update_task`, `complete_task`, `get_due_followups` |
| Activity | `create_activity`, `get_candidate_activity`, `get_job_activity` |
| Templates | `get_email_template`, `list_email_templates` |
| Job Launch | `run_job_launch` (prepare only — calls the existing Job Launch functions) |
| Approvals | `propose_action`, `list_proposals`, `approve_proposal`, `reject_proposal` |

`search_candidates` supports name, email, LinkedIn URL, current company, job title,
location, status, salary, tags, talent pool, contacted/not-contacted since and
follow-up due date.

Stages are never hard-coded: application actions read the job's own `job_stages`
rows and reject a stage that isn't configured for that job.

## Action kinds

- `read` — no writes.
- `write` — internal Desky changes (stage moves, records, notes). Reversible, audited.
- `external` — reserved for actions that contact a person (sending email, LinkedIn
  messages). None exist yet, deliberately: `run_job_launch` only drafts.

## Prepare → approve → execute

Agents should not act blind on bulk requests ("reject everyone at CV Sent except
Joe and Maria"):

1. `propose_action` validates the input, runs the action's `preview()` and stores a row in
   `action_proposals` with the affected records and a summary.
2. The user (or UI) reviews it via `list_proposals`.
3. `approve_proposal` executes it through the same handler and records the result.
4. `reject_proposal` discards it. Proposals expire after 24 hours.

## Security

- Every request must carry a valid user JWT; unauthenticated calls get `401`.
- Handlers use a Supabase client scoped to the caller's JWT, so existing RLS
  (`owner_user_id` + `can_access_owner`, which also covers manager→team access) decides
  visibility. No RLS policy was weakened, and no service-role key is used anywhere in
  the layer or exposed to the browser.
- All inputs are validated with zod (types, lengths, uuid/email/url/date formats).
- Every write appends to `activity_log` with `via: "action_layer"` and the calling client.
- DNC-flagged candidates and contacts are excluded from searches unless explicitly requested.

## Schema changes made for the layer (all additive)

- `notes.contact_id` — notes can attach to a contact.
- `todo_tasks`: `candidate_id`, `contact_id`, `client_id`, `job_id`, `reason`, `kind`,
  `status`, `source` — structured follow-ups reuse the existing task table
  ("Sarah asked us to come back in three months").
- `email_templates` — centrally managed approved templates (falls back to the
  recruiter's saved style templates).
- `action_proposals` — the approval queue described above.

## CSV imports

CSV/migration work should call `create_candidate` / `update_candidate` /
`create_contact` / `create_company` (or the same handlers server-side) so imports get the
same validation and audit trail. Source-specific columns (e.g. SourceWhale) map into these
canonical Desky fields — no per-vendor tables.

## Connecting MCP / Viktor later

The project already ships an MCP server (`src/lib/mcp`, deployed as the `mcp` function).
Next step is to replace its direct table queries with `desky-actions` calls, generating one
tool per catalogue entry (`list_actions` gives name, kind and description). Viktor and other
automations authenticate as a Desky user and post to the same endpoint — they never receive
database credentials.
