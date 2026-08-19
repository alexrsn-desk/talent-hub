---
name: Morning brief length + staleness
description: Daily brief hard cap of 3 prose lines and the 2-generation staleness rule for brief items
type: feature
---

Brief (`daily-focus` edge fn + `DashboardHeadline`):
- Hard cap: max 3 short prose lines — lead action (required), second action (only if distinct + urgent), optional positive note. Never more than 2 action items. No bullets/sections. `supporting_actions` is always empty.
- Everything else belongs in AI Actions, not the brief.

Staleness (`brief_item_history` table):
- Each brief-eligible signal has `item_key` + `fingerprint` (stage / last note / counts). Fingerprint change = situation changed → counter resets.
- A signal may appear in brief text for max 2 consecutive generations; on the 3rd it is `suppressed` and never re-worded into the brief.
- Suppressed items surface in AI Actions under source "Still Open" with framing "Still open — X days: did you action this?", sorted longest-open first. Dismissing sets `resolved_at`.
