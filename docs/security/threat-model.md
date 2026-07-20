# Threat model (initial)

Scope: browser learner app, admin console, local/AWS authority, content pipeline.

## Assets

- Cognito identities, guest sessions, federation links, push subscriptions.
- Learner data: goals, attempts, timing, confidence, free-text reasoning, error records, accessibility preferences, self-reported scores.
- Protected content: question families, stimuli, keys, rationales (pre-reveal), calibration/exposure data, provenance.
- Integrity-critical derived state: evidence, plans, mastery, review state, content/policy versions.
- Secrets: AWS credentials, signing/VAPID secrets, provider keys, audit records.

## Principal threats & controls

| Threat | Control |
|---|---|
| Cross-learner access (IDOR/BOLA) | Ownership checks after auth on every resource; opaque IDs; horizontal + vertical negative tests |
| Guest session theft / unsafe auto-link | Guest keyed to app-owned `learner_id`; linking requires authenticated session + explicit reauth; no email-match auto-merge |
| Answer-key / bank scraping | Authorized-delivery only; no static public bank; server-only keys; bundle/log/analytics scanners; exposure monitoring |
| Offline event tampering / replay | Client UUID + idempotency key; server sequence; duplicate-safe reconciliation; content-version pinning |
| Protected content leakage | Allowlist compiler; `protected-field-scan` over build output, caches, HTML, source maps; connectivity required for protected assessments |
| Malformed content import | Layered validation; parser limits; atomic publication; synthetic-fixture rejection |
| Analytics overcollection | Schema-enforced allowlist; server rejects unknown fields; denylist/canary scans |
| AI prompt injection / leakage (later) | Bounded gateway; grounded prompts; structured output; deterministic fallback; providers off until evaluated |
| Secret exposure | Secrets Manager only in prod; never in bundle, storage, env-in-git, logs, or analytics |

## Non-bypassable rules

- Protected data never reaches the client except as authorized, task-scoped delivery.
- The service worker must never cache `/auth`, `/v1`, protected S3, or arbitrary API responses.
- Tokens: refresh in `HttpOnly`/`Secure`/`SameSite` cookie via broker; short-lived access token in memory only.

This is a living document; a full penetration test is a Phase 11 gate.
