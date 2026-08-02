# Threat model (initial)

Scope: browser learner app, admin console, local/AWS authority, content pipeline.

## Assets

- Supabase identities, learner sessions, federation links, push subscriptions.
- Learner data: goals, attempts, timing, confidence, free-text reasoning, error records, accessibility preferences, self-reported scores.
- Protected content: question families, stimuli, keys, rationales (pre-reveal), calibration/exposure data, provenance.
- Integrity-critical derived state: evidence, plans, mastery, review state, content/policy versions.
- Secrets: AWS credentials, signing/VAPID secrets, provider keys, audit records.

## Principal threats & controls

| Threat                                    | Control                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-learner access (IDOR/BOLA)          | Ownership checks after auth on every resource; opaque IDs; horizontal + vertical negative tests                                                                     |
| Session theft / unsafe auto-link          | Session keyed to app-owned `learner_id`; the identity attaches via `linked_identities (provider, provider_subject)`; no email-match auto-merge                      |
| Account enumeration via credential routes | Credentials never reach this API, so it has no enumeration surface; Supabase answers sign-up and recovery identically for known and unknown addresses               |
| Forged or replayed access token           | `/v1/auth/session` verifies ES256 against a pinned JWKS with `iss`, `aud`, and `exp` enforced; HS256 and `alg: none` are refused, closing algorithm confusion       |
| Supabase token theft from the browser     | The token is spent once at the exchange and never persisted; `persistSession: false` keeps it out of localStorage, so only the `HttpOnly` cookie survives a page    |
| Credential-route CSRF                     | Stateless double-submit: the signed-out bootstrap issues a `__Host-mcat_csrf` cookie the client must echo in the header; origin is verified as for session routes   |
| Answer-key / bank scraping                | Authorized-delivery only; no static public bank; server-only keys; bundle/log/analytics scanners; exposure monitoring                                               |
| Offline event tampering / replay          | Client UUID + idempotency key; server sequence; duplicate-safe reconciliation; content-version pinning                                                              |
| Protected content leakage                 | Allowlist compiler; `protected-field-scan` over build output, caches, HTML, source maps; connectivity required for protected assessments                            |
| Malformed content import                  | Layered validation; parser limits; atomic publication; synthetic-fixture rejection                                                                                  |
| Analytics overcollection                  | Schema-enforced allowlist; server rejects unknown fields; denylist/canary scans                                                                                     |
| AI prompt injection / leakage (later)     | Bounded gateway; grounded prompts; structured output; deterministic fallback; providers off until evaluated                                                         |
| Secret exposure                           | Secrets Manager only in prod; never in bundle, storage, env-in-git, logs, or analytics                                                                              |

## Non-bypassable rules

- Protected data never reaches the client except as authorized, task-scoped delivery.
- The service worker must never cache `/auth`, `/v1`, protected S3, or arbitrary API responses.
- Supabase is the credential store only; it never holds learner data. Its access token is verified
  and discarded at `/v1/auth/session`, so no Supabase access or refresh token is retained anywhere
  in the client and there is no token broker.
- Token verification is offline against a pinned public key set. The verifier must never fall back
  to fetching a key it does not already hold, and must never accept a symmetric algorithm: with a
  public key as the shared secret, HS256 would let anyone mint a token for any learner.
- The session transport is the opaque, rotating `__Host-mcat_session` cookie. It is stored only as
  a SHA-256 hash, rotates on every resolve, and carries no claims — reading it discloses nothing.
- Learner routes require `principal.kind === 'linked'`. Bootstrap does not create a learner, so an
  unauthenticated caller has no learner to act on rather than a weakly-held one.

This is a living document; a full penetration test is a Phase 11 gate.
