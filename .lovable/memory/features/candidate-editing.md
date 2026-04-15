---
name: Candidate editing patterns
description: Full inline edit on profile, quick edit side panel, three-dot context menu on all candidate appearances
type: feature
---
Candidate records are editable via three patterns:

1. **Full Edit** — Edit button on profile dialog. All fields become inline-editable. Save/Cancel at top and bottom. Changes logged to activity_log with old→new values.

2. **Quick Edit** — Side panel (Sheet) with status, employer, title, salary, availability, quick note. Available from three-dot menu anywhere.

3. **Click-to-edit** — Click any field value on profile (when not in edit mode) to edit just that field. Enter saves, Escape cancels.

4. **Three-dot context menu** (`CandidateContextMenu`) — appears on hover on candidate list rows, pipeline cards, priority candidates section. Options: Quick Edit, View Profile, Log Touchpoint, Flag as Priority, Remove.

Components:
- `src/components/CandidateDetail.tsx` — full edit profile
- `src/components/CandidateQuickEdit.tsx` — side panel quick edit
- `src/components/CandidateContextMenu.tsx` — reusable three-dot menu

All edits log field-level changes to activity_log with old/new values.
