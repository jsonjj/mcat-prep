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
- **Production content bank** — the app ships content-independent; a complete, original, independently-reviewed, calibrated bank is a parallel human-led program.
- **V3 curriculum activation** — the frozen 114-lesson/422-KC authoring manifest, compiler-bound schema, deterministic run reducer, learner-safe DTO, split aggregate/run concurrency contract, reviewed-asset integrity contract, and reusable runner are present. No approved canonical lesson definitions or reviewed media manifests have been authored. The synthetic fixture is test-only, and production registry composition plus learner-API persistence/session wiring remain disabled until definitions pass every publication gate.
- **Legal/trademark/AAMC-affiliation review**, privacy-counsel review, and IRB/research governance.
- **Native iOS (Expo) and downloadable desktop (Tauri)** — Phases 13–14, after signed web finalization.

## Environmental notes

Built in a sandbox with workspace-only writes; see ADR 0002 for pnpm/cache accommodations. These do not affect the product in a provisioned environment.
