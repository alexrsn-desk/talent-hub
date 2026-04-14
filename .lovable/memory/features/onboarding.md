---
name: Onboarding and profile
description: 5-step onboarding wizard saves recruiter preferences to recruiter_profiles, injected into AI coach system prompt
type: feature
---
- OnboardingFlow component: 5 steps (welcome, niches, market, location, style)
- Saves to recruiter_profiles table (niches, salary range, placement type, locations, BD approach, challenge)
- Settings page at /settings lets user update all onboarding answers
- recruiter_profiles data injected into recruitment-coach edge function as [RECRUITER PROFILE] context
- Profile auto-created on signup via database trigger
