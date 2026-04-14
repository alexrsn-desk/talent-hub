---
name: Client Portal
description: Token-based client portal with magic links, candidate review, interview feedback, AI summaries
type: feature
---
- Portal at /portal?token=... — no Supabase auth, token-based via portal-auth edge function
- Tables: client_portal_access, candidate_summaries, client_feedback, notifications
- Clients can review candidates (interested/not_suitable/maybe) and leave interview feedback (rating 1-5, strengths, concerns, decision)
- AI candidate summaries via generate-candidate-summary edge function (Lovable AI, gemini-2.5-flash)
- Notifications table stores in-app alerts for recruiter when client leaves feedback
- Portal access toggleable per client from client detail view
- Magic link tokens expire after 30 days
