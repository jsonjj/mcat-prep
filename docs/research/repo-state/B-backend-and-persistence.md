# Backend and persistence — repo state audit

Scope: authority kernel, services, persistence, contracts, migrations, deployment. Excludes React UI deep-dive and `@mcat/policies` algorithm internals.

---

## Request paths, dev vs deployed

### Local dev (default: no `DATABASE_URL`)

```
Browser (HttpAuthorityClient, VITE_AUTHORITY_BASE_URL=/)
  → Vite dev server middleware (apps/learner-web/server/authority-api-plugin.ts)
  → authority-api.ts
  → InProcessAuthorityClient (services/local-authority/src/in-process.ts)
  → Authority + in-memory snapshot store (single process, single learner)
```

Parallel paths on the same dev server:

| Surface | Path | Backend |
|---------|------|---------|
| Main authority | `/v1/*` | `authority-api.ts` → in-process |
| Bayesian diagnostic | `/api/diagnostic/*` | `diagnostic-api.ts` → `DiagnosticSessionStore` (in-memory Map) |
| Vector lesson (optional) | remote or `:8787` | `services/local-authority/src/http-server.ts` → `RepositoryLearnerKernel` + `InMemoryAuthorityRepository` |

**Practice bank selection** (`apps/learner-web/server/practice-bank-source.ts`):

1. `DATABASE_URL` set → `PostgresPracticeBankPort` (real corpus + optional Postgres tables)
2. Else gitignored pull at `content/question-bank/.local/db-pull/` → file port (in-memory exposure/repair)
3. Else → synthetic 7-question enzyme fixture (`loadSyntheticBank()`)

**What dev does NOT enforce** (silent behavioural gaps vs deployed):

- No CSRF verification (`authority-api.ts` accepts token but never checks)
- No stream-version / idempotency enforcement on commands
- No rate limiting
- No origin-verification header (`x-mcat-origin-verify`)
- Session is one global `snapshot` variable — not multi-learner, not durable across restarts
- Today's Path routes exist (`/v1/plan/today/path`, `/build`, `/activity`, `/profile/daily-budget`) but are **absent from deployed `routes.ts`**
- Vector lesson returns `UNAVAILABLE` / 503 from in-process dev authority; real lesson only on loopback HTTP harness
- Onboarding unlock: dev sets `onboardingComplete` from **plan confirmation**; deployed bootstrap uses `today !== null && session.kind !== 'locked'` (`handler.ts`)

### Deployed (Postgres + Lambda)

```
Browser → CloudFront (learner web) → API Gateway → mcat-dev-learner-api Lambda
  → createRepositoryLearnerApi (services/lambdas/learner-api/src/handler.ts)
  → RepositoryLearnerKernel (workflow.ts)
  → AuthorityKernel (goal/attempt via commands.ts) OR workflow-specific handlers
  → PostgresAuthorityRepository transaction:
       lock learner_streams → apply mutation → append accepted_events
       → overwrite learner_streams.state_json → append outbox
  → PostgresGuestSessionService (cookie session + CSRF hash)
  → PostgresPracticeBankPort (questions + exposure/repair/grants/attempt log)
```

**Critical split in deployed Lambda** (`services/lambdas/learner-api/src/lambda.ts`):

- **Study loop bank**: `new Authority(undefined, systemClock)` → defaults to **`loadSyntheticBank()`** (7-item enzyme fixture)
- **Adaptive practice bank**: `createPostgresPracticeBankPort(pool)` → **real v7 `questions` table**

So deployed Postgres persistence is real for learner state and practice, but the authored study sequence still scores against the synthetic in-memory bank unless the Lambda bank wiring is changed.

**Async path (provisioned, mostly noop today):**

```
outbox row → worker publishes to SQS FIFO → projection consumer
```

Projection handler `apply` is an **empty function** (`services/lambdas/workers/src/lambda.ts` lines 64–68): *"extension point for independently versioned mastery/planner projections in later phases."*

### Divergence summary

| Concern | Local in-process | Deployed Lambda |
|---------|------------------|-----------------|
| Durability | RAM until process exit | `learner_streams` + `accepted_events` |
| Study content | Synthetic bank (always, unless proxying to remote) | Synthetic bank (same default) |
| Practice content | Postgres / file pull / synthetic (tiered) | Postgres v7 corpus |
| Auth | None | Guest cookie + double-submit CSRF + origin verify |
| Today's Path | Full API | **Not routed** |
| Diagnostic | Separate in-memory store + `/api/diagnostic` | Built-in `/v1/diagnostic/next` on authority (synthetic bank) |
| Mastery P(L) storage | Inside projection JSON in RAM | Inside **`learner_streams.state_json.mastery`** (not `mastery_kc` tables) |

---

## Migration and schema inventory

PostgreSQL 17–compatible forward migrations in `database/migrations/`:

| # | File | Creates / changes |
|---|------|-------------------|
| 0001 | `authority.sql` | **Core learner model**: `learners`, `linked_identities`, `guest_sessions`, `consents`, `goals`, `learner_streams`, `accepted_events`, `attempt_results` (original envelope shape), `checkpoints`, `evidence_dispositions`, `mastery_projections`, `plan_projections`, `review_projections`, `error_projections`, `content_releases`, `content_objects`, `delivery_grants`, `publication_runs`, `review_attestations`, `outbox`, `inbox_deduplication`, `privacy_jobs`, `deletion_ledger`, `push_subscriptions`, `audit_log` |
| 0002 | `guest_session_csrf.sql` | `guest_sessions.csrf_token_hash`, rotation constraint, `api_rate_limits` |
| 0003 | `projection_deduplication.sql` | Unique index on `(consumer_name, learner_id, sequence)` for inbox |
| 0005 | `rate_limit_function_hardening.sql` | `prune_expired_api_rate_limits()` trigger on `api_rate_limits` |
| 0006 | `question_bank.sql` | `questions`, `question_protected` (v7 corpus) |
| 0007 | `mastery.sql` | `question_stats`, `mastery_kc`, `mastery_skill`, `mastery_lesson`, `cars_ability` |
| 0008 | `reasoning_operation.sql` | `questions.reasoning_operation` column + index |
| 0009 | `practice.sql` | `practice_exposure`, `practice_repair` |
| 0010 | `practice_attempt_log.sql` | Extends `attempt_results` (nullable FKs, `question_id`, `kc_id`, `chosen_choice_id`, `activity_type`, `first_attempt`, `occurred_at`, …) |
| 0011 | `study_attempt_log.sql` | Widens unique index to `(learner_id, activity_type, question_id)` for practice + study |
| 0012 | `study_attempt_kc_grain.sql` | **Data-only** cleanup: null invalid study `kc_id` values; no DDL |
| 0013 | `practice_attempt_grant.sql` | `practice_attempt_grant` (serve-then-score authorization) |

### Schema coherence

**Coherent and wired:**

- `learner_streams` + `accepted_events` + `outbox` — actively used by `PostgresAuthorityRepository`
- `guest_sessions` + `api_rate_limits` — used by learner API session + rate limiter
- `questions` / `question_protected` — used by `PostgresPracticeBankPort`
- `question_stats` — written on first practice attempts (`recordQuestionAttempt`)
- `practice_exposure`, `practice_repair`, `practice_attempt_grant`, extended `attempt_results` — used when migrations 0007–0013 present; in-memory fallback when absent

**Schema present, no application writes found:**

- `mastery_kc`, `mastery_skill`, `mastery_lesson`, `cars_ability` — `upsertMasteryUnit()` exists in `mastery-repository.ts` but **is never called** from runtime code; P(L) lives in projection JSON instead
- `mastery_projections`, `plan_projections`, `review_projections`, `error_projections` — only referenced in migration tests
- `checkpoints`, `delivery_grants`, `content_releases`, `content_objects`, `publication_runs`, `review_attestations`, `linked_identities`, `consents`, `push_subscriptions`, `privacy_jobs`, `deletion_ledger`, `audit_log` — no TypeScript repository usage found

**Contradictions / drift:**

- `types.ts` comment claims deployed mastery lives in dedicated Postgres tables; implementation stores `mastery` inside `learner_streams.state_json`
- 0001 `attempt_results` required `event_id` FK; 0010 drops FKs for practice/study direct writes — intentional, documented
- 0007 creates `mastery_lesson`; authority architecture **forbids** lesson-grain BKT writes (dropped on read in `views.ts`)
- Migration grants (`runtime.ts`) give learner-api INSERT on `mastery_*` tables that nothing inserts into

---

## What is append-only vs overwritten

### Append-only (durable audit / event log)

| Store | Contents |
|-------|----------|
| `accepted_events` | One row per accepted command: `event_type`, `payload`, `result`, monotonic `sequence`, idempotency key |
| `outbox` | Fan-out records (`topic: learner.command.accepted`); append-only, `published_at` updated on publish |
| `inbox_deduplication` | Consumer dedupe keys (append-only inserts) |
| `audit_log` | Defined in 0001; **no writer in repo** |

Inside **`learner_streams.state_json`** (snapshot overwritten each command, but internal arrays grow):

| Field | Semantics |
|-------|-----------|
| `events[]` | Full learner event history copied into projection; new events appended then whole JSON replaced |
| `evidence[]` | Append-only within snapshot; derived cache |
| `mastery.appliedObservationIds[]` | Append-only idempotency list for lesson BKT |
| BKT ledger events (`bkt_observation_applied`) | Appended to `events[]` |

### Overwritten in place (current-state)

| Store | Contents |
|-------|----------|
| `learner_streams.state_json` | **Entire blob** replaced on each successful command (optimistic sequence check) |
| `state.mastery.kc[id]`, `state.mastery.skill[op]`, `state.mastery.cars[skill]` | P(L) / IRT V updated in place inside JSON |
| `state.session`, `state.plan`, `state.diagnostic`, onboarding flags | Current-state fields inside JSON |
| `practice_exposure` | Upsert per `(learner_id, question_id)` — updates `seen_count`, `last_seen_at` |
| `practice_repair` | Insert open repair; `resolved_at` updated when cleared |
| `practice_attempt_grant` | Upsert per serve; `consumed_at` set on first scored answer |
| `question_stats` | Upsert aggregate counts |
| `attempt_results` | Insert with `ON CONFLICT DO NOTHING` — first-attempt rows immutable; no updates |
| `goals` | New goal supersedes prior (`superseded_at`) — table unused in current kernel path (goal lives in projection JSON) |

### Evaluation / reconstruction implications

- **Decision-time state IS partially reconstructable** from `accepted_events` payloads + prior sequence, but the **authoritative mastery snapshot at decision time** is only fully captured in the **overwritten** `state_json` at that sequence — there is no separate immutable mastery event stream in Postgres tables.
- Replaying from `accepted_events` alone would require re-running Authority logic; events in projection duplicate accepted_events but live inside the mutable snapshot container.
- `handleReset` replaces entire state while **keeping `learner_id`** — history in `accepted_events` remains unless separately purged.

---

## Mastery write paths

All P(L) mutations funnel through `Authority` private methods (`packages/authority-core/src/authority.ts`):

| Method | Trigger | Grains written | Evidence / ledger |
|--------|---------|----------------|-------------------|
| `updateMasteryForAttempt` | Study loop first answer (`submitAttempt`) | KC + 7-op skill via `stepDirectGrains` | `bkt_observation_applied` event, `source: synthetic_study` |
| `applyPracticeMastery` | Adaptive practice first attempt (`submitPracticeAttempt`) | KC + skill (+ CARS IRT on cars items) | Evidence record + BKT ledger |
| `applyQualifiedBktObservation` | Vector lesson response (`workflow.recordLessonResponse`) | KC + skill | BKT ledger with observation id dedupe |
| `applyMasterySeed` | Diagnostic completion seed | Initializes KC/skill priors (no decay clock) | No BKT ledger; corroboration gate |

**Persistence target:**

- **Dev in-process**: `state.mastery` in RAM snapshot
- **Deployed**: same structure serialized into `learner_streams.state_json` — **not** `mastery_kc` / `mastery_skill` tables

### Reachability from shipped UI

| Path | UI entry | Dev | Deployed |
|------|----------|-----|----------|
| Study attempts | `/v1/attempts` → `submitAttempt` | Yes | Yes (synthetic bank) |
| Adaptive practice | `practice-queries.ts` → `submitPracticeAttempt` → `/v1/practice/attempts/adaptive` | Yes | Yes (Postgres bank) |
| Passage-of-the-day check | `useCheckPractice` → `/v1/practice/attempts` | Yes | Yes (gated to `q-enz-passage-1` only via `syntheticPracticeAuthorizationPolicy`) |
| Mastery seed | `useApplyMasterySeed` after diagnostic | Yes | Yes |
| Vector lesson BKT | Vector lesson commands on loopback server / deployed lesson routes | Loopback only (8787) | Yes (if UI points at deployed API) |
| CARS duel | `useRecordCarsDuel` | Yes | Yes (CARS IRT `cars` grain, not BKT P(L) on science skills) |
| Today's Path | Builds plan | Yes | **No route** — no mastery writes from planner in prod |
| Direct `applyMasterySeed` hook | HTTP only | Yes (unauthenticated in dev) | Session + CSRF required |

**Not reachable / dead:**

- Postgres `mastery_kc` / `mastery_skill` upsert path (repository exists, zero callers)
- Worker projection consumer (noop `apply`)
- `mastery_projections` table from 0001

---

## Identity and auth

### Learner identification

- **`learner_id`**: UUID v4, assigned at guest creation (`PostgresAuthorityRepository.getOrCreateGuest` or `Authority.createGuest()`)
- **Session binding**: opaque cookie → SHA-256 hash → `guest_sessions.session_hash`
- **Principal**: `{ kind: 'guest', learnerId, sessionId }` — no Cognito / OAuth in learner API path today
- **`linked_identities` table**: schema only; no runtime linker found

### Auth mechanisms (deployed)

1. `POST /v1/bootstrap` — creates or rotates guest session; sets HttpOnly session + CSRF cookies
2. Session routes require valid session cookie
3. State-changing routes require matching CSRF header + cookie hash
4. All routes require `x-mcat-origin-verify` secret (CloudFront → API edge injection expected)
5. Rate limit per session + route in `api_rate_limits`

### Stability / recycling

- **`learner_id` is stable** for the life of a guest account; bootstrap rotates **session** tokens, not learner UUID
- **`DELETE /v1/account/progress`** resets projection state in place (`replacementState`) but **preserves `learner_id`**
- No code path reassigns an existing session hash to a different learner
- Legacy guest rows with `csrf_token_hash IS NULL` are treated invalid (`guest-session-service.ts`)

### Dev identity theatre

- Single shared in-memory learner for all browser tabs in `authority-api.ts`
- No cookies; CSRF token is cosmetic

---

## Deployment and observability state

### What is actually deployed

- **CDK app** (`infra/cdk/`) targets **dev only** — `staging` and `production` throw `EnvironmentNotProvisionedError` (`config/environments.ts`)
- AWS account `056956104102`, `us-east-1`, documented in runbook `docs/runbooks/aws-dev-deploy.md`
- Stacks: Foundation, Data (Aurora + RDS Proxy + secrets), Web (CloudFront), Api (Lambda + API Gateway + WAF), Identity, Async (outbox worker + SQS), Publication, Operations, Analytics
- **CI** (`.github/workflows/aws-backend-ci.yml`): verify, Postgres integration tests, CDK synth — does **not** deploy automatically
- Example prod-like URL in `.env.example`: `https://d2j72l2zhhn7o7.cloudfront.net` (learner web); API is separate API Gateway origin

### Observability

| Layer | Mechanism |
|-------|-----------|
| Learner API Lambda | Structured JSON logs to `/aws/lambda/mcat-dev-learner-api` — requestId, route, status, latencyMs, hashed learnerId (`handler.ts` finally block) |
| API Gateway | Access logs to `/aws/apigateway/mcat-dev-learner-api-access` |
| Workers | JSON logs for outbox publish + projection consume counts |
| Analytics stack | Kinesis Firehose → S3 analytics bucket + Glue/Athena — **first-party events pipeline provisioned**; wiring from learner actions not verified in this audit |
| Tracing | Lambda X-Ray active on learner API (`api-stack.ts`) |
| Error handling | `AuthorityKernelError` → typed HTTP codes; unknown errors → 503 retryable; no Sentry/Datadog SDK in learner-api |

### Production failure modes

- DB/secret misconfig → Lambda cold start throws; requests get 503
- Stream conflict → 409 with `currentStreamVersion`
- Projection worker failures → SQS batchItemFailures / DLQ (infra exists; consumer is noop)
- No application-level metrics dashboards in repo

---

## Data pipeline fragility

### How 2,108 questions reach the app

1. **Authoritative store**: Postgres `questions` + `question_protected` (migration 0006), seeded outside this audit's scope
2. **Deployed practice**: Lambda reads directly from Postgres via `findPracticeItems` / `getQuestionAnswer`
3. **Local dev without DATABASE_URL**:
   - Expected path: run `.tmp/db-pull.mjs` (referenced in `db-pull.ts`) → writes gitignored `content/question-bank/.local/db-pull/questions.json` + `protected.json`
   - `practice-bank-file.ts` and `diagnostic-bank.ts` consume that pull
4. **Fallback**: `loadSyntheticBank()` — 7 enzyme items

### Fragility

| Risk | Impact |
|------|--------|
| Gitignored db-pull | Fresh clone + CI have **no** real corpus for dev/diagnostic/practice-without-DB |
| No pull script in tracked glob | Onboarding docs reference `.tmp/db-pull.mjs` but script not found under repo root in audit — manual Postgres required |
| Three-tier bank selection | Developers may not notice console warning; practice "works" on 7 items then dead-ends |
| CI `verify` runs without `TEST_DATABASE_URL` for main verify | Unit tests pass on synthetic; integration tests separate job with Postgres 17 service |
| Study loop always synthetic | Even with DATABASE_URL in dev, **study** content does not switch to v7 corpus (only practice port does) |
| Deployed study vs practice split | Production study still synthetic while practice uses 2,108 items — inconsistent learner experience |
| `family_id` 1:1 with question_id | Documented in research; breaks family-based psychometric plans |

---

## Stubs, fallbacks, and things that look real but are not

| Location | What it looks like | Reality |
|----------|-------------------|---------|
| `authority-api.ts` + `InProcessAuthorityClient` | Full `/v1` API | In-memory single learner; no auth; CSRF theatre |
| `SyntheticPracticeBankPort` | Adaptive practice | In-memory exposure/repair/attempts; 7-item bank if no port injected |
| `PostgresPracticeBankPort` mem maps | Postgres practice | Falls back to in-memory exposure/repair/grants/attempts when migrations missing |
| `RepositoryLearnerKernel` without `practiceBank` | Practice queue + submit | Per-request empty synthetic port until hoisted fallback (fixed for grant continuity) |
| `syntheticPracticeAuthorizationPolicy` | Practice API security | Allows only `q-enz-passage-1` for `/v1/practice/attempts` |
| Deployed `Authority(undefined)` | Production study | **Synthetic enzyme bank**, not Postgres curriculum |
| Worker projection `apply: async () => {}` | Async projections | No-op consumer |
| `mastery_kc` / `mastery_skill` tables | Normalized mastery | Never written |
| `mastery_projections` et al. | CQRS read models | Never written |
| `DiagnosticSessionStore` | Production diagnostic | In-memory Map in dev server only; separate from authority diagnostic |
| Authority `/v1/diagnostic/next` on deployed API | Same diagnostic as landing | Uses **synthetic** bank via `Authority.diagnosticNext`, not Bayesian block engine |
| `getVectorLessonStatus` in in-process client | Lesson available | Hard-coded `UNAVAILABLE` |
| `local-authority/http-server.ts` | Full API | **Only vector lesson routes** + bootstrap; not general authority |
| `platform-web/state-store.ts` | Client persistence | localStorage with in-memory fallback (browser-only, not backend) |
| `applyMasterySeed` corroboration | Cryptographic diagnostic proof | Shape/producer-property check only — not proof diagnostic ran |
| Today's Path in contracts (`HTTP_API`) | Production feature | **Not in Lambda routes** — dev-only |
| `checkPractice` vs `submitPracticeAttempt` | Two practice paths | POTD uses check (no grant gate); adaptive uses submit (grant required in prod) |

---

## attempt_results — what is captured

Written by `recordPracticeAttempt` (`practice-attempt-repository.ts`) for **first attempts only** (`ON CONFLICT DO NOTHING`).

| Column | Practice | Study | Notes |
|--------|----------|-------|-------|
| `question_id` | Yes | Yes | Required for display |
| `kc_id` | From `questions.kc_id` | From item `kc_ids[0]` | Study fixed in 0012 writer |
| `skill` | Reasoning op | Reasoning op | |
| `cluster` | Yes | Yes | |
| `chosen_choice_id` | A–D or null | A–D or null | **Primary diagnostic value** |
| `is_correct` | Yes | Yes | |
| `first_attempt` | true | true | Partial unique index |
| `activity_type` | `practice` | `study` | |
| `occurred_at` | Authority clock | Authority clock | |
| `recorded_at` | Same as occurred_at live | Same | |
| `assistance_level` | `'A0'` | `'A0'` | |
| `eligible_for_mastery` | = first_attempt | = first_attempt | |
| `event_id`, `task_instance_id`, … | null for direct writes | null | Legacy 0001 columns unused |

**Not captured:** `elapsedMs`, response timing, hint usage (study captures in events JSON separately).

**Reads:** `listPracticeAttempts` → `Authority.getErrorLog` / mistake patterns via `practiceBank.listPracticeAttempts`. Original 0001 envelope-shaped rows: **zero inserts** historically.

**Captured but low use:** `item_family_id` populated but family field is singleton per research docs.

---

## Highest-leverage fixes in my area

Ranked by correctness / "is this real" impact. Effort = rough engineering hours for one familiar contributor.

| Rank | Fix | Effort | Benefit |
|------|-----|--------|---------|
| 1 | **Wire study loop to Postgres (or shared) bank in Lambda** — stop defaulting `Authority` to `loadSyntheticBank()` when `questions` exists | 8–16h | Deployed study and practice use same corpus; mastery/evidence align with content |
| 2 | **Expose Today's Path routes on learner-api** (`/plan/today/path`, `/build`, `/activity`, `/daily-budget`) or explicitly remove from client for prod builds | 4–8h | Stops silent 404/feature gap between dev and prod |
| 3 | **Document + automate db-pull** (track script, `pnpm db:pull`, CI smoke with TEST_DATABASE_URL seed) | 4–6h | Reproducible dev/CI; new engineers get 2,108 items not 7 |
| 4 | **Either write `mastery_*` tables from kernel or delete/grant-cleanup dead schema** — pick projection JSON **or** normalized tables, not both | 12–24h | Removes false confidence in SQL analytics; clarifies reconstruction story |
| 5 | **Implement projection worker `apply`** (mastery/plan/error projections) **or** stop emitting outbox until needed | 16–40h | Makes async path honest; enables rebuild from `accepted_events` |
| 6 | **Unify diagnostic**: one engine (Bayesian block vs authority diagnostic) and one persistence path | 24–40h | Single placement truth; mastery seed corroboration can bind to real session |
| 7 | **Dev authority parity**: optional Postgres backend for full `authority-api.ts` via env flag | 8–12h | Catch stream/CSRF/grant bugs before deploy |
| 8 | **Add timing columns to `attempt_results` or document reliance on `accepted_events.payload.elapsedMs`** | 4–8h | Evaluation plans needing decision-time latency |

---

## Secrets in repo (locations only — values not printed)

| Location | Notes |
|----------|-------|
| `.env.example`, `apps/learner-web/.env.example` | Placeholder `DATABASE_URL`, `AI_API_KEY` — templates only |
| `infra/cdk/config/environments.ts` | Dev budget email (not a secret) |
| `.github/workflows/aws-backend-ci.yml` | CI Postgres password `mcat_test` (ephemeral service only) |
| `services/lambdas/*/src/*.test.ts` | Fake ARNs/passwords for unit tests |
| AWS Secrets Manager | Real secrets at runtime: `/mcat/dev/database/learner-api`, rate-limit pepper, origin verification — referenced by ARN in CDK/Lambda env, not committed |

No production database passwords or live API keys found in tracked source files during this audit.
