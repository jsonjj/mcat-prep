# Question Storage Plan — v7 inventory and fail-closed serving

**Status:** Serving boundary implemented; production content readiness is **zero until reviewed version records are materialized**.
**Date:** 2026-07-23

## What is implemented

- `packages/content/src/schema.ts` remains the permissive canonical v7 ingestion schema. Its `.passthrough()` behavior preserves unknown corpus fields but grants them no review or eligibility meaning.
- Migration `0006_question_bank.sql` remains unchanged. Its `questions` and `question_protected` rows are low-level imported inventory and legacy answer storage.
- Migration `0007_question_serving_eligibility.sql` adds immutable item/content/mapping/calibration/family/stimulus/testlet versions, normalized mappings and approvals, versioned protected answers, invalidations, deterministic receipts, family/local-dependence reservations, presentations, and exposures.
- `@mcat/contracts/question-serving` defines strict snake_case/UPPER_SNAKE_CASE authoring, selection, receipt, reservation, authorization, inventory, and cue-safe learner contracts. The protected answer contract has a separate server-only export.
- `@mcat/persistence-postgres` provides contextual eligible selection, deterministic HMAC ranking, atomic presentation authorization, append-only invalidation, and metadata-only authoring inventory APIs.
- Version-bound scoring is available only from `@mcat/persistence-postgres/server/question-scoring`.

The 2,108 schema-valid v7 rows are **inventory only**. They have no `question_serving_versions` or materialized approval records, so the production selector returns none of them. Schema validity, KC mapping, cluster rollup, family labels, DOK, or legacy status do not establish publication, originality, rights clearance, accessibility equivalence, certification, calibration, or evidence eligibility.

## Storage layers

1. `questions` — migration-0006 imported administrative inventory. It includes routing/family/DOK cues and is not a learner DTO.
2. `question_protected` — legacy unversioned protected material for inspection/backfill only.
3. `question_serving_versions` plus normalized mappings/approvals — exact immutable reviewed serving snapshots. Absence means ineligible.
4. `question_protected_versions` — server-only answers bound to `(question_id, item_version)`.
5. Selection request/receipt, reservation, presentation, exposure, and invalidation tables — authoritative serving audit state.
6. Object storage — rendered media. Learner snapshots carry only render-ready URL/alt/media type; generation specifications and manifest/source metadata remain private.

## Serving flow

1. A human-governed backfill/publication process creates an exact strict reviewed projection. It snapshots learner content, assigns immutable versions/hashes, resolves one primary construct, classifies required-secondary versus incidental mappings, reviews semantic families/local dependence, and materializes approval digests.
2. Selection filters by construct, activity role, evidence mode, representation/context, calibration requirement, exact content/policy cutoffs, publication gates, invalidation, and learner family/local-dependence freshness.
3. The authority deterministically ranks the eligible candidate set with a server secret. Requests have no seed, candidate/family IDs, sort, offset, or caller-controlled limit.
4. In one serializable transaction the authority stores the request and receipt, reserves fresh family/testlet or shared-stimulus identity, creates the presentation, and records exposure. Only after commit may the minimal learner view be returned.
5. Scoring uses presentation ID plus learner ID to join the exact immutable item version to `question_protected_versions`. Quarantine/invalidation makes scoring fail closed while retaining exposure.

Rehearsal reuse is explicit (`REHEARSAL_ONLY` / `REHEARSAL_REUSE`) and never becomes fresh evidence. An exposed family is permanently unavailable as fresh evidence.

## Administrative versus production APIs

- `getAdministrativeQuestion` / `listAdministrativeQuestions` and count methods read migration-0006 inventory. They must never be sent to learners or used as selectors. Deprecated `getLearnerSafeQuestion` / `listLearnerSafeQuestions` aliases remain only for compatibility.
- `authorizeQuestionPresentation` is the production boundary. Its learner view contains only presentation ID, stem, passage, choices, and render-ready assets.
- `getLegacyAdministrativeQuestionAnswer` is backfill/inspection-only. Production scoring uses `getVersionBoundProtectedAnswer` from the server-only subpath.
- Authoring inventory APIs report IDs/counts by canonical KC, activity role, eligibility gap, family overlap/local dependence, review/version gaps, and asset readiness. They never project answer values.

## Backfill requirement

Applying migration 0007 performs **no automatic backfill**. This is intentional and fail-closed. A future reviewed backfill must separately establish:

- immutable content/mapping/family and optional calibration versions plus hashes;
- exactly one reviewed primary construct, required-secondary/incidental mappings, and joint-scoring semantics;
- reviewed family decisions and stimulus/testlet local dependence;
- rights and model-processing rights, accessibility equivalence, certification/publication state, asset readiness, and source/report ledgers;
- all required reviewer approvals and an exact versioned protected answer.

Do not infer these decisions from permissive ingestion fields or bulk-mark the 2,108 rows ready. The rows have not been established here as calibrated, original, rights-cleared, accessible, certified, or production-ready.

## App integration boundary

The learner lesson/diagnostic application remains on the existing synthetic bank. This change intentionally does **not** wire real v7 rows into learner routes. A later authority integration must:

- generate authority-owned selection request IDs and keep the selection secret server-side;
- return only `learner_view`, never the authority-private authorization/receipt;
- submit answers by presentation ID, use the server-only version-bound scorer, and disposition rehearsal/invalidation correctly;
- preserve current synthetic behavior until governed reviewed versions exist.

## Local verification

The integration convention is `TEST_DATABASE_URL`; absent that variable, PostgreSQL suites skip. The repository harness defines a Postgres 17 service in `database/docker-compose.test.yml`.

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run scan:protected
TEST_DATABASE_URL=postgres://... pnpm --filter @mcat/persistence-postgres test:integration
```

All committed fixtures for this boundary are synthetic. Never use a protected corpus, answer archive, or live database credential in tests.
