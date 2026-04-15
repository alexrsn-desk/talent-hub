# Project Memory

## Core
Recruitment CRM for solo tech/digital recruiter. Dark theme, minimal UI.
Primary #3B82F6 (blue), bg #111318. Inter body, JetBrains Mono mono.
Lovable Cloud backend. No auth — open RLS policies (solo user).
All interactive elements must be reusable components that work identically everywhere.
Dashboard lists: compact expandable rows only. No cards, no nested boxes. 40-44px collapsed.
Use first_name only in AI messages. Display full name in UI.

## Memories
- [DB schema](mem://features/db-schema) — clients, jobs, candidates, candidate_jobs, notes tables
- [Universal components](mem://preferences/universal-components) — all interactive elements must work identically across all surfaces
- [Dashboard lists](mem://preferences/dashboard-lists) — compact expandable row pattern for all dashboard sections
- [Name fields](mem://preferences/name-fields) — first_name/last_name split, first name only in AI output
