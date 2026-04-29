# Project Memory

## Core
Recruitment CRM for solo tech/digital recruiter. Dark theme, minimal UI.
Primary #3B82F6 (blue), bg #111318. Inter body, JetBrains Mono mono.
Lovable Cloud backend. No auth — open RLS policies (solo user).
Dashboard lists: compact expandable rows only, no cards inside sections.
All interactive elements must work identically everywhere they appear.
Name fields: first_name/last_name separate, display full name, AI uses first name only.

## Memories
- [DB schema](mem://features/db-schema) — clients, jobs, candidates, candidate_jobs, notes tables
- [Client portal](mem://features/client-portal) — magic link auth, candidate review, interview scheduling
- [Onboarding](mem://features/onboarding) — multi-step recruiter profile setup
- [Dashboard lists](mem://preferences/dashboard-lists) — compact expandable row pattern for all dashboard sections
- [Universal components](mem://preferences/universal-components) — interactive elements work everywhere
- [Name fields](mem://preferences/name-fields) — first/last name conventions
- [Candidate editing](mem://features/candidate-editing) — full edit, quick edit panel, click-to-edit, three-dot context menu
- [Decay alerts](mem://features/decay-alerts) — relationship decay scan, contact-reason rules, AI draft, coach framing
