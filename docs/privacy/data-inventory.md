# Data inventory, consent & retention (initial)

Launch boundary: United States, adults 18+, free beta, no billing. Pseudonymous by default.

## Collected data

| Category | Examples | Basis | Notes |
|---|---|---|---|
| Identity | app `learner_id`, Cognito subject, email/provider (only when linked), sessions, device/push token | necessary for account + sync | No real name, school, or medical info required |
| Study inputs | test date, timezone, availability, target, notification prefs | optional (product function) | Defaults allow proceeding without a scheduled date |
| Learning evidence | attempts, timing, confidence, hints, typed reasoning, errors, repairs, reviews, plans, derived state | necessary for learning | Free text minimized; not sent to general analytics |
| External results | provider, date, official flag, section/total, conditions | optional | No question text collected |
| Accessibility | text size, contrast, reduced motion, accommodations | necessary for a11y | Functional preferences, not diagnoses |
| Analytics | allowlisted product/learning/content/reliability events | product improvement | Pseudonymous, minimized, schema-enforced |

## Consent (separate, versioned)

Free product access must not depend on optional research consent. Distinct opt-ins for: research use of official outcomes, research contact, voluntary fairness attributes, live AI processing, speech (and separately audio retention), and social/Ghost comparison.

## Retention (proposed defaults)

- Unlinked inactive guest: 180 days.
- Linked account: active + 24 months inactivity, then warning.
- Raw speech: **zero retention** default.
- Product/learning analytics: 13 months.
- Generated exports: 24 hours.
- App logs 90 days; security/admin audit 400 days.

## Rights

Self-service export (reauth required) and account deletion (revoke sessions/tokens/push; erase live data; remove analytics identity mapping; keep a minimal deletion ledger; reapply after any backup restore). Protected content and other users are excluded from exports.
