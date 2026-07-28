# Authority boundaries

These boundaries are enforced by architecture tests, code review, and the content compiler's allowlists. They are non-negotiable.

| Actor                                 | May control                                                                                                                                                                                                                                                                                                        | Must not control                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server policy (AWS / local-authority) | Answer keys, protected scoring, accepted events, plan generation, FSRS state, mastery transitions, progress derivation                                                                                                                                                                                             | Unreviewed scientific truth; undisclosed policy changes                                                                                                                                                    |
| Client (browser)                      | Presentation, interaction state, local cache, offline queue, accessibility preferences, optimistic acknowledgement                                                                                                                                                                                                 | Correctness, answer keys, mastery, protected scoring, final conflict resolution                                                                                                                            |
| Lesson author (V3 authoring)          | Item classification metadata on an immutable binding: `primary_kc_id`, `reasoning_operation`, `dok_level`, `semantic_family_id`, `activity_role`, `representation_id`, `changed_dimensions`, `candidate_evidence_modes`, offered assistance affordances, reviewed policy/lineage metadata, learner-safe references | `independent`, any `P(L)`, mastery threshold or status, decay/half-life, evidence status or rank, correctness, protected scoring, the assistance a learner actually took, whether a response moves mastery |
| Lesson runner (runtime)               | Emitting observed response facts: attempt index, retry flags, the response payload (multiple-choice or constructed), omission, elapsed time, answer changes, the assistance level actually taken, hint/reveal usage, occurrence time                                                                               | Correctness, independence, evidence kind, mastery writes, scoring                                                                                                                                          |
| AI (later, gated)                     | Draft candidates, bounded explanations, probes, authoring assistance                                                                                                                                                                                                                                               | Canonical science, answer-key changes, autonomous publication, score guarantees, mastery awards                                                                                                            |
| Human reviewer                        | Approve, correct, version, or retire content and policy                                                                                                                                                                                                                                                            | Rewrite historical learner events; bypass audit records                                                                                                                                                    |
| Learner                               | Test date, target, availability, notification windows, optional confidence, skips, postponements                                                                                                                                                                                                                   | Correctness, evidence definitions, protected assessment keys                                                                                                                                               |

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

## Lesson-side seam — authored facts in, derived meaning out

`docs/lesson-evidence-mastery-contract.md` is the governed boundary between lesson authoring and the
evidence/mastery systems. Two rules make the actor table above enforceable rather than advisory:

- **Authority split.** BKT owns capability estimation (`P(L)`, decay, review-due, the learner-facing
  percentage, the `0.95` cut). The evidence system owns the warrant (independence, family diversity,
  transfer, delayed/retention, mixed/passage/timed/protected conditions, freshness, recipe gaps,
  audit reasons). The evidence system must **not** independently answer "is the learner mastered?".
- **Structural, not procedural, enforcement.** A lesson binding has no field for `independent`,
  `P(L)`, a mastery threshold, decay, or an evidence status, and the compiled shape is closed with no
  generic passthrough, so an author cannot write one. Mastery moves only when the immutable binding
  declares an evidence mode other than `INSTRUCTIONAL` **and** the runtime response independently
  qualifies (first attempt, A0 actually taken, no content-bearing hint, no reveal, no retry, valid
  server scoring). What help an item _offered_ is a separate, open authoring field that never bears
  on independence. Lessons have no mastery state of their own; a lesson-grain value is a derived
  rollup of its required member KCs.
