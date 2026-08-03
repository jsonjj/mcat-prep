# Data inventory, consent & retention (initial)

Launch boundary: United States, adults 18+, free beta, no billing. Pseudonymous by default.

An account is required before any learning surface. "Pseudonymous" means the account holds an email
address and nothing else identifying: the app-owned `learner_id` is what every record is keyed to,
and no real name, school, or medical information is asked for or stored.

## Collected data

| Category          | Examples                                                                                             | Basis                           | Notes                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| Identity          | app `learner_id`, Supabase subject, email, provider link, sessions, device/push token                | necessary for account + sync    | Email lives in Supabase; the authority stores only the opaque provider subject       |
| Beta updates      | optional email, consent version, submission time, and capture source                                 | explicit communications consent | Stored separately from Snapshot responses; never required for the Snapshot or report |
| Study inputs      | test date, timezone, availability, target, notification prefs                                        | optional (product function)     | Defaults allow proceeding without a scheduled date                                   |
| Learning evidence | attempts, timing, confidence, hints, typed reasoning, errors, repairs, reviews, plans, derived state | necessary for learning          | Free text minimized; not sent to general analytics                                   |
| External results  | provider, date, official flag, section/total, conditions                                             | optional                        | No question text collected                                                           |
| Accessibility     | text size, contrast, reduced motion, accommodations                                                  | necessary for a11y              | Functional preferences, not diagnoses                                                |
| Analytics         | allowlisted product/learning/content/reliability events                                              | product improvement             | Pseudonymous, minimized, schema-enforced                                             |

## Consent (separate, versioned)

Free product access must not depend on optional research or communications consent. Distinct
opt-ins for: beta/product-testing updates, research use of official outcomes, research contact,
voluntary fairness attributes, live AI processing, speech (and separately audio retention), and
social/Ghost comparison.

## Retention (proposed defaults)

- Linked account: active + 24 months inactivity, then warning.
- Session rows: 30 days from last use, then expired and swept.
- Unconfirmed sign-up: retained by Supabase until it expires the unconfirmed user; no learner row exists here, because a learner is created only at the first successful token exchange
  until a first successful sign-in, so an abandoned sign-up leaves no learner data behind.
- Raw speech: **zero retention** default.
- Product/learning analytics: 13 months.
- Beta-update email: until unsubscribe or 90 days after the beta-update program closes.
- Generated exports: 24 hours.
- App logs 90 days; security/admin audit 400 days.

## Rights

Self-service export (reauth required) and account deletion (revoke sessions/tokens/push; erase live data; remove analytics identity mapping; keep a minimal deletion ledger; reapply after any backup restore). Protected content and other users are excluded from exports.
