# Authority boundaries

These boundaries are enforced by architecture tests, code review, and the content compiler's allowlists. They are non-negotiable.

| Actor | May control | Must not control |
|---|---|---|
| Server policy (AWS / local-authority) | Answer keys, protected scoring, accepted events, plan generation, FSRS state, mastery transitions, progress derivation | Unreviewed scientific truth; undisclosed policy changes |
| Client (browser) | Presentation, interaction state, local cache, offline queue, accessibility preferences, optimistic acknowledgement | Correctness, answer keys, mastery, protected scoring, final conflict resolution |
| AI (later, gated) | Draft candidates, bounded explanations, probes, authoring assistance | Canonical science, answer-key changes, autonomous publication, score guarantees, mastery awards |
| Human reviewer | Approve, correct, version, or retire content and policy | Rewrite historical learner events; bypass audit records |
| Learner | Test date, target, availability, notification windows, optional confidence, skips, postponements | Correctness, evidence definitions, protected assessment keys |

## Protected-content rule

Answer keys, per-choice rationales (before authorized reveal), calibration parameters, exposure data, and full protected-form inventories are **server/admin-only**. They must never appear in:

- learner client bundles or source maps
- prerendered public HTML or public manifests
- IndexedDB, Cache Storage, or service-worker caches
- analytics events
- ordinary application logs

The content compiler builds three artifact classes from an allowlist (not a denylist): `learner-safe`, `authorized-delivery` (unseen stems/choices for an assigned task only), and `server/admin-only`. `tools/scanners/protected-field-scan.mjs` runs in CI against build output.

## Deterministic invariants (property-tested in `@mcat/policies`)

- No mastery from assisted, revealed, repeated, simulation, Ghost, confidence, or FSRS-rating events.
- Adding valid positive evidence never lowers a base mastery state (only time, contradiction, correction, or policy version can).
- Adding a failure never advances state.
- One passage/item family cannot repeatedly satisfy an independent-family minimum.
- Unscheduled learners never enter near-test mode or receive an `Exam-Ready Now` label.
- Numeric score prediction stays disabled unless every product- and learner-level gate is satisfied.
- Replaying the same accepted events under the same policy versions reproduces identical state.

## Mastery signal — `P(L)` (mastery-bkt / provisional-v1)

The learner-facing mastery number is the Bayesian Knowledge Tracing probability `P(L)` per unit
(KC / the 7 reasoning skills / lesson), with a separate IRT ability for CARS; `P(L) >= 0.95` is the
"mastered" gate. This remains **evidence-based and fail-closed**: only **independent** attempts (A0,
no content-bearing hint, not a diagnostic retry, not post-reveal) move `P(L)`, so every invariant
above continues to hold (no mastery from assisted/revealed/repeated/simulation/Ghost/FSRS work). The
diagnostic only **seeds** initial priors (asymmetric, capped <= 0.4) and never awards mastery. Item
difficulty is uncalibrated (DOK cold-start) and all constants are provisional; the `mastery-bkt`
policy version is stamped on every consequential decision. See `docs/mastery-pipeline.md`.
