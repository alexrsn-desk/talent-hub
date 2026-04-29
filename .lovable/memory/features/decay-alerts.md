---
name: Relationship Decay Alerts
description: Decay scoring + AI-generated contact reasons for clients/contacts; only surfaces with a genuine reason
type: feature
---
## Tables
- `decay_settings` — per-user thresholds (default key 21d / active 14d / bd 30d / general 60d), `enabled` toggle
- `decay_alerts` — one per (owner_user_id, entity_type, entity_id). Statuses: `pending|due|at_risk|critical|resolved|dismissed`. Stores `reason`, `reason_source` (matching_candidates|previous_context|market_intel|candidate_intel|bd_signal), `suggested_approach`, `channel_suggestion`, `snoozed_until`. Owner/manager RLS via `can_access_owner`.

## Edge functions
- `decay-scan` — scans current user's clients + contacts, computes decay, finds genuine reason (heuristics + AI fallback via Lovable AI gateway, vendor-neutral). Writes `pending` rows when no reason found; only flips to `due/at_risk/critical` when a reason is generated.
- `draft-decay-message` — drafts an opening message using the stored reason + approach. Vendor-neutral chat completions.

## Frontend
- `useDecayAlerts`, `useDecayAlertForEntity`, `useRunDecayScan`, `useSnoozeDecayAlert`, `useResolveDecayAlert`, `useDecaySettings`, `useSaveDecaySettings` in `src/hooks/use-decay.ts`
- `DecayAlertCard` — universal card with reason / approach / channel + Log touchpoint / Draft AI / snooze 1w/2w/1m
- `EntityDecayAlert` — per-entity slot rendered on Clients & Contacts detail views
- `DecayAlertsSection` — dashboard list, auto-runs scan once per session
- `DecaySettingsSection` — thresholds + manual rescan in Settings

## Coach
`recruitment-coach` ingests `decay_alerts` (only surfaced ones with reasons) and is told never to suggest contact based on day count alone — only when a surfaced reason exists, always leading with the reason.
