---
name: Name field conventions
description: Store first_name/last_name separately, display full name, use first name in AI output
type: preference
---
Candidates and contacts store first_name and last_name as separate DB columns. The `name` column holds the combined full name for backward compatibility.

Display rules:
- Show full name (first + last) everywhere in the UI unless editing
- When editing, show separate first name and last name fields

AI rules:
- Use first name ONLY in all AI-generated messages, coach output, and signal detection
- Never use full name or formal addressing in AI output
