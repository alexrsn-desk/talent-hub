# Claude connector
- [x] Complete consent loading/recovery/account switching and public sign-in callback with persistent return URLs.
- [x] Test consent decisions, provider failures and sign-in/sign-up return handling (23 tests; simulated approve/deny UI on desktop and mobile; real signed-in request safely rejected by local-origin policy).
- [x] Expand caller-scoped CRM tools: candidates, jobs, clients, pipeline, notes, tasks and launch context.
- [x] Add confirmed per-user candidate email and LinkedIn actions without bypassing agency/DNC safeguards.
- [x] Harden consent and sign-in return handling; activate OAuth.
- [x] Verify job creation/update/read-back in the UI, launch context, searches, consent error states, ten safeguard tests and the 19-tool manifest.
- [ ] Complete Claude approve/deny round-trip after app publication; requires publication and a real external authorization request. Local consent requests are rejected by the provider's trusted-origin policy.
- [ ] Verify actual email and LinkedIn delivery; requires connected provider accounts and user-approved recipients/content. No test messages were sent.
