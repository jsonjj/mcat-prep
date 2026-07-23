# Known limitations & gated capabilities

This is an honest limitations statement. Several capabilities are intentionally **off** until evidence gates pass; that is compliant completion, not an unfinished feature.

## Feature-gated (disabled) until validated

- **Calibrated MD-CAT adaptive diagnostic** — runs as constrained _balanced_ routing now; expected-information-gain selection activates only after item calibration, fit, exposure, and fairness gates.
- **Numeric score prediction** — hidden until both product-level validation and learner-level data gates pass. Only a categorical **Readiness Trend** is shown before then.
- **`Exam-Ready Now` label** — a separate, time-bound, validated readiness classification; not shown before validation.
- **Normative / cohort Ghost** — only past-self Ghost is enabled; normative comparisons require trustworthy, consented aggregate data.
- **Live AI & speech** — deterministic authored behavior only; providers activate after a locked evaluation and safety review.

## Environment and release gates

- **AWS development is deployed; staging and production are not** — the development learner site and server-authoritative synthetic vertical run in account `056956104102`, `us-east-1`. This is not a production launch. Separate staging/production accounts, release approval, reviewed content, load/security/accessibility evidence, and operational ownership remain required.
- **Development-only AWS scope** — the private data plane, API, identity foundations, async processing, publication foundations, analytics, alarms, audit trail, budget, and learner CloudFront delivery are active. Admin publication, content activation, notification campaigns, live AI/speech, federation, QuickSight, governed research datasets, and cross-region disaster recovery remain disabled or unprovisioned.
- **Local browser authority** — `services/local-authority` is an in-process test/tooling adapter, not a standalone HTTP server. End-to-end learner testing currently uses the deployed CloudFront origin; production-shaped browser builds never receive protected scoring data.
- **Production content bank** — the loader's 2,108 schema-valid v7 rows remain administrative inventory only. Migration 0007 intentionally gives existing rows no serving-version or approval records, so all remain fail-closed/ineligible. No claim is made that they are original, rights-cleared, accessibility-reviewed, certified, calibrated, or production-ready.
- **Serving adapter not wired to learner routes** — the contextual selector, atomic exposure boundary, receipts, invalidation, and version-bound scorer exist, but the live lesson/diagnostic path remains on the synthetic bank. Activation requires governed metadata/answer-version materialization and a separate authority integration.
- **Calibration is contextual, not implied** — uncalibrated reviewed items may only be selected where the explicit request policy permits; operational/validated calibration requests require a calibration version and approval. Adaptive/score uses remain gated.
- **PostgreSQL integration convention** — question-serving concurrency and crash/retry suites run when `TEST_DATABASE_URL` is set and otherwise skip under the existing repository convention.
- **Legal/trademark/AAMC-affiliation review**, privacy-counsel review, and IRB/research governance.
- **Native iOS (Expo) and downloadable desktop (Tauri)** — Phases 13–14, after signed web finalization.

## Environmental notes

Built in a sandbox with workspace-only writes; see ADR 0002 for pnpm/cache accommodations. These do not affect the product in a provisioned environment.
