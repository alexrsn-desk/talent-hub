# Claude connector
- [x] Expand caller-scoped CRM tools: candidates, jobs, clients, pipeline, notes, tasks and launch context.
- [x] Add confirmed per-user candidate email and LinkedIn actions without bypassing agency/DNC safeguards.
- [x] Harden consent and sign-in return handling; activate OAuth.
- [x] Verify job creation/update/read-back in the UI, launch context, searches, consent error states, ten safeguard tests and the 19-tool manifest.
- [ ] Complete Claude approve/deny round-trip after app publication; requires publication and a real external authorization request. Local consent requests are rejected by the provider's trusted-origin policy.
- [ ] Verify actual email and LinkedIn delivery; requires connected provider accounts and user-approved recipients/content. No test messages were sent.
