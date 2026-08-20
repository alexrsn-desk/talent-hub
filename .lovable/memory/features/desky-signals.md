---
name: Desky Signals (Phase 1, internal)
description: Relationship scoring, monitoring threshold, signals table, internal signal types, Signals dashboard and settings
type: feature
---

Phase 1 = internal signals only, no external data provider.

**Scoring** — `candidates.relationship_score` / `contacts.relationship_score` (+ `monitored`, `suggested_reengage_date`).
Weights live in `signal_score_settings.weights` (jsonb, editable in Settings → Signals): placed 30, client 30,
touchpoints(3+) 20, hiring_manager 20, revenue 20, replied 10, recent_contact(12m) 10, linkedin_only 2.
Computed by `desky_relationship_score()`; refreshed by triggers on notes, activity_events and placements
(never on page load).

**Monitoring** — `desky_signals_scan()` (RPC, auth.uid()) refreshes scores, then flags `monitored` using
greatest(top-% cutoff, monitor_min_score) — defaults top 20% / min 40. Dashboard line: "Desky is monitoring
your X most valuable relationships."

**Signals table** `public.signals` (person_id + person_type, company_id, signal_type, previous/new_value,
opportunity_score, reason_for_recommendation, suggested_action, status new|viewed|actioned|snoozed|dismissed).
Types: `going_cold` (180d, fires once per contact until a new touchpoint), `placement_anniversary`
(12 months, 30-day lookahead), `follow_up_due` (from `suggested_reengage_date` extracted by detect-signals),
`seniority_change` (DB trigger on job_title becoming senior).
opportunity_score = relationship_score × urgency (follow_up_due 1.4, going_cold 1.3, seniority 1.2, anniversary 1.0).

**UI** — `/signals` (sidebar → AI → Signals): greeting, count of new, monitoring line, High priority cards
(opportunity_score ≥ 60) with View/Contact/Dismiss, compact Other signals list. Signals also render inline on
candidate/contact timelines via `PersonSignalTimeline`. daily-focus may use the single highest-priority NEW
signal as a brief item under the existing aging rules.
