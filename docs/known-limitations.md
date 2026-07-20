# Known limitations & gated capabilities

This is an honest limitations statement. Several capabilities are intentionally **off** until evidence gates pass; that is compliant completion, not an unfinished feature.

## Feature-gated (disabled) until validated

- **Calibrated MD-CAT adaptive diagnostic** — runs as constrained *balanced* routing now; expected-information-gain selection activates only after item calibration, fit, exposure, and fairness gates.
- **Numeric score prediction** — hidden until both product-level validation and learner-level data gates pass. Only a categorical **Readiness Trend** is shown before then.
- **`Exam-Ready Now` label** — a separate, time-bound, validated readiness classification; not shown before validation.
- **Normative / cohort Ghost** — only past-self Ghost is enabled; normative comparisons require trustworthy, consented aggregate data.
- **Live AI & speech** — deterministic authored behavior only; providers activate after a locked evaluation and safety review.

## Externally gated (require humans / accounts)

- **AWS deployment** — CDK is authored and `synth`-checkable but not deployed; requires an AWS org, accounts, credentials, and an operations `GO`. Local dev uses `services/local-authority`.
- **Production content bank** — the app ships content-independent; a complete, original, independently-reviewed, calibrated bank is a parallel human-led program.
- **Legal/trademark/AAMC-affiliation review**, privacy-counsel review, and IRB/research governance.
- **Native iOS (Expo) and downloadable desktop (Tauri)** — Phases 13–14, after signed web finalization.

## Environmental notes

Built in a sandbox with workspace-only writes; see ADR 0002 for pnpm/cache accommodations. These do not affect the product in a provisioned environment.
