# Authority boundaries

These boundaries are enforced by architecture tests, code review, and the content compiler's allowlists. They are non-negotiable.

**Which mechanism holds which boundary matters.** "Enforced by code review" is materially weaker than "enforced by an architecture test", and treating the two as equivalent has already cost this project a guard that was documented in a source comment and a README, believed by everyone, and did not exist. For the lesson seam, `docs/lesson-evidence-mastery-contract.md` §16 names each rule and says which of the two holds it. Do not infer from a boundary being written here that something checks it.

| Actor                                 | May control                                                                                                                                                                                                                                                                                                             | Must not control                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server policy (AWS / local-authority) | Answer keys, protected scoring, accepted events, plan generation, FSRS state, mastery transitions, progress derivation, **every clock a policy reads** (decay, freshness, review-due)                                                                                                                                   | Unreviewed scientific truth; undisclosed policy changes                                                                                                                                                    |
| Client (browser)                      | Presentation, interaction state, local cache, offline queue, accessibility preferences, optimistic acknowledgement                                                                                                                                                                                                      | Correctness, answer keys, mastery, protected scoring, final conflict resolution                                                                                                                            |
| Lesson author (V3 authoring)          | Item classification metadata on an immutable binding: `primary_kc_id`, `reasoning_operation`, `dok_level`, `semantic_family_id`, `activity_role`, `representation_id`, `changed_dimensions`, `candidate_evidence_modes`, offered assistance affordances, reviewed policy/lineage metadata, learner-safe references      | `independent`, any `P(L)`, mastery threshold or status, decay/half-life, evidence status or rank, correctness, protected scoring, the assistance a learner actually took, whether a response moves mastery |
| Lesson runner (runtime)               | Emitting observed response facts: attempt index, retry flags, the response payload (multiple-choice or constructed), omission, elapsed time, answer changes, the assistance level actually taken, hint/reveal usage, how the attempt was actually administered (mixed / passage / timed), a **claimed** occurrence time | Correctness, independence, evidence kind, mastery writes, scoring, **any clock a policy reads** (its reported time is bounded by the server before it becomes a decay or freshness clock)                  |
| AI (later, gated)                     | Draft candidates, bounded explanations, probes, authoring assistance                                                                                                                                                                                                                                                    | Canonical science, answer-key changes, autonomous publication, score guarantees, mastery awards                                                                                                            |
| Human reviewer                        | Approve, correct, version, or retire content and policy                                                                                                                                                                                                                                                                 | Rewrite historical learner events; bypass audit records                                                                                                                                                    |
| Learner                               | Test date, target, availability, notification windows, optional confidence, skips, postponements                                                                                                                                                                                                                        | Correctness, evidence definitions, protected assessment keys                                                                                                                                               |

## Protected-content rule

Answer keys, per-choice rationales (before authorized reveal), calibration parameters, exposure data, and full protected-form inventories are **server/admin-only**. They must never appear in:

- learner client bundles or source maps
- prerendered public HTML or public manifests
- IndexedDB, Cache Storage, or service-worker caches
- analytics events
- ordinary application logs

The content compiler builds three artifact classes from an allowlist (not a denylist): `learner-safe`, `authorized-delivery` (unseen stems/choices for an assigned task only), and `server/admin-only`. `tools/scanners/protected-field-scan.mjs` runs in CI against build output.

**Internal mastery state is not learner-facing either.** `GET /v1/debug/learner-state` in `services/local-authority` exposes KC and operation `P(L)`, the derived lesson rollup, and evidence records for hand verification (see `docs/mastery-pipeline.md` §4.2). It is a local operator tool, not a product surface: it requires an explicit process opt-in, a loopback peer, and the absence of an `Origin` header, and its evidence projection is an explicit field allowlist. It is never registered by the deployed lambda, which is asserted three independent ways in `tests/architecture/lesson-mastery-integration.test.ts`.

## Deterministic invariants (property-tested in `@mcat/policies`)

- No mastery from assisted, revealed, repeated, simulation, Ghost, confidence, or FSRS-rating events.
- Adding valid positive evidence never lowers a mastery state (only time, contradiction, correction, or policy version can).
- Adding a failure never advances state.
- One passage/item family cannot repeatedly satisfy an independent-family minimum.
- Unscheduled learners never enter near-test mode or receive an `Exam-Ready Now` label.
- Numeric score prediction stays disabled unless every product- and learner-level gate is satisfied.
- Replaying the same accepted events under the same policy versions reproduces identical state.

## Mastery signal — `P(L)` (mastery-bkt)

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
  generic passthrough, so an author cannot write one. Mastery moves only when the evidence kind the
  attempt **resolved to** could fill a mastery recipe slot **and** the runtime response independently
  qualifies (first attempt, A0 actually taken, no content-bearing hint, no reveal, no retry, valid
  server scoring). What help an item _offered_ is a separate, open authoring field that never bears on
  independence, and a declared mode never mints an administration condition (mixed / passage / timed /
  protected) that the runner or the scorer did not actually establish. Lessons have no mastery state
  of their own; a lesson-grain value is a derived rollup of its required member KCs.
- **One fact, one derivation.** Eligibility to move `P(L)` is computed **once**, from the resolved
  evidence kind, and the evidence record reads that same value. A declared evidence mode states what an
  item is _eligible to serve as_ and is never a finding about an attempt, so it must not gate mastery.
  Two derivations of one fact will diverge: when the declared set and the resolved kind were checked
  separately, `P(L)` reached `0.99999` and `mastered: true` on zero mastery-eligible evidence records
  with every recipe slot still open. The related authoring rule — a binding declaring a mode from the
  seven-member allowlist (`INDEPENDENT`, `TRANSFER`, `DELAYED`, `MIXED`, `PASSAGE`, `TIMED`,
  `PROTECTED`) must carry a `reasoning_operation` — is a completeness requirement on the artifact, not
  a mastery gate. That allowlist must never be written as "any mode other than `INSTRUCTIONAL`": the
  negation made twelve of thirteen modes eligible, including lesson exits and the diagnostic, which is
  why an allowlist is the governed form — an unrecognized or newly added mode is ineligible by default.
- **Authored contradictions are rejected, not resolved by precedence.** Where two authored keys state
  facts that cannot both hold, the artifact is refused with a frozen code. Letting key precedence pick a
  winner deletes the loser in silence, leaving a record that no longer describes the artifact — and
  reviewed prose must never overrule an explicit boolean, least of all toward the permissive answer.
- **Two authorities, two field names.** "Is the memory due?" (`reviewDue`, BKT) and "is the warrant
  stale?" (`refreshNeeded`, evidence) are different questions owned by different authorities. They must
  not share a field name or be aliased, and a consumer — the planner especially — must consume them
  separately. They published under one name until the split, which is how a single "needs attention"
  boolean would have answered one question while appearing to answer the other.
- **Server-owned clocks.** A runner-reported occurrence time is a fact, not a clock. It is bounded by
  the server before it can act as a BKT decay clock or an evidence freshness clock, and a claim
  implausibly ahead of the server clock is refused outright rather than silently clamped. The verbatim
  claim is retained in the audit ledger alongside the value actually applied, so the correction never
  destroys the evidence that a client misreported. Before this closed, a client-supplied timestamp
  could mint permanent mastery or wipe a mastered unit.
- **One published capability scale.** The learner sees `P(L)`. The evidence warrant is published as
  reason codes only; the ordinal evidence tier is not exported from the authority, because every
  consumer that could threshold it did, growing rival mastery scales from one published integer.
