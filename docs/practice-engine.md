# Practice engine (adaptive test-out)

**Status:** implemented. Server-authoritative — Practice **writes mastery**.
**Selection policy:** `practice-selection / provisional-v1`
([`packages/policies/src/practice-selection.ts`](../packages/policies/src/practice-selection.ts)),
registered in `ACTIVE_POLICY_MANIFESTS`.
**Orchestration + mastery writes:** [`packages/authority-core/src/practice.ts`](../packages/authority-core/src/practice.ts)
and the `getPracticeQueue` / `submitPracticeAttempt` methods on
[`Authority`](../packages/authority-core/src/authority.ts).
This document mirrors those files; if they disagree, the code wins.

Practice is the count-based **test-out** loop: given a count `X`, the engine
scores eligible **already-taught, prereq-met** specs
(`KC × skill × DOK × difficulty-band`, **science AND CARS in one unified list**)
from the learner's mastery state, orders them, pulls **one FRESH matching item
per spec** from the real Postgres v7 bank, delivers them in the native
learning-mode UI, and writes results back through the **existing** mastery
engine. `P(L)` is the mastery signal — Practice does **not** gate on the
MASTERY_RUBRIC checklist.

## The evidence rule (test-out)

- **First attempt scores.** A learner's first, unassisted answer is genuine
  independent evidence, so it moves `P(L)` — up on correct, down on wrong —
  through the same `mastery-bkt` engine the study loop uses (`applyMasteryAttempt`
  for science; `carsUpdate` at the measurement weight `CARS_K_POTD = 0.3` for
  CARS). There is no assistance ladder in Practice; every first answer is A0.
- **Retry is learning-only.** After a miss the UI runs diagnose → one retry →
  reveal, but the retry never touches `P(L)`.
- On a miss, the KC×skill is queued for a **repair** (a fresh rep of the same
  KC×skill, no misconception tags), and every served item is recorded as
  **exposure** so the queue keeps serving unseen items.

Practice writes only the `P(L)` mastery signal (the KC / 7-skill / lesson BKT
grains and the CARS IRT ability). It deliberately does **not** append
evidence-ladder `EvidenceRecord`s: those carry the 8-template `OperationTag` +
a strict 15-cluster tag that the 2,000+ real v7 items don't cleanly provide, and
`P(L)` — not the ladder — is the decided mastery signal.

## Selection policy (`practice-selection / provisional-v1`)

Pure, DOM-free, and fully unit-tested
([`practice-selection.test.ts`](../packages/policies/src/practice-selection.test.ts)).
The authority builds a `PracticeSnapshot` (mastery + coverage, all numbers
pre-computed — the engine has no clock and no I/O), then:

1. **`priorityScore()`** — `weakness × exam_weight × trainability × urgency +
   explore_bonus + coverage_bonus − recency_penalty`, where
   `weakness = 1 − (0.6·P(L)_kc + 0.4·P(L)_skill)` and
   `urgency = 1 + λ·overdue` (`λ = 1.0`, overdue clamped to 30 days).
   Ineligible (untaught or prereq-blocked) units score 0. CARS units use
   `carsPriorityScore()` (weakness from the IRT ability).
2. **`allocateSlots()`** — splits `X` across emergent buckets
   (science ↔ CARS by relative priority mass; within science, capped **repair**,
   a small **probe** fraction, the rest **train**). Always sums to `X`.
3. **`difficultyBandFor()`** — a `b`-space band around the learner's ability θ:
   **train** aims ~80% (easier, below θ), **probe** ~55% (≈ θ), **repair** ~85%
   (easiest). Width `w` is fixed.
4. **`selectSpecs()`** — greedy per bucket (repairs from recent misses, probes by
   uncertainty, train by priority, CARS by weakness); de-dups at the
   `KC × skill` grain.
5. **`orderSpecs()`** — interleaves for a good session: prerequisite-before-
   dependent, no same-KC back-to-back, CARS distributed.

Every coefficient is a **provisional default** behind `PRACTICE_SELECTION_CONFIG`
and the `PRACTICE_SELECTION_MANIFEST` (`provisional_active`), to be refit from
data. Exam weights are provisional (equal per section, split across clusters).

## Item retrieval and the bank seam

`Authority` never imports pg. It depends on a `PracticeBankPort`
([`packages/authority-core/src/practice.ts`](../packages/authority-core/src/practice.ts)):

- `listUnits` — distinct `KC × skill` (and CARS sub-skill) candidates with a
  representative DOK and item counts.
- `findItems(query, { excludeIds, limit })` — fresh learner-safe items for a spec,
  ranked by **|b − band centre|** then least-battle-tested; excludes recently-seen
  ids and held-out items.
- `getAnswer` — server-only answer + rationales (post-submit only).
- `questionStats` / `recordAttempt` — population stats that calibrate IRT `b`.
- `recentlySeenIds` / `recordExposure` — per-learner freshness.
- `recentMisses` / `queueRepair` — the repair queue.

Two implementations:

- **`PostgresPracticeBankPort`**
  ([`services/persistence-postgres/src/practice-exposure-repository.ts`](../services/persistence-postgres/src/practice-exposure-repository.ts))
  reads the real v7 corpus via the learner-safe seam
  (`findPracticeItems` joins `question_stats` for `b`; DOK cold-start otherwise)
  and owns the `practice_exposure` / `practice_repair` tables
  ([`database/migrations/0009_practice.sql`](../database/migrations/0009_practice.sql)).
  Difficulty from stats + DOK cold-start; held-out via `status`.
- **`SyntheticPracticeBankPort`** — an in-memory fallback over the synthetic bank,
  used in dev when `DATABASE_URL` is unset and in deterministic tests.

**Graceful degradation:** retrieval ranks by band proximity (band → DOK
cold-start) and, when a spec's pool is empty, that spec is skipped (the queue is
simply shorter) rather than serving a stale or off-target item.

## Server surfaces

- `GET /v1/practice/queue/{x}` (+ optional `/{focus}`) → `PracticeQueueView`.
  Path-parameterized because the authority edge rejects query strings.
- `POST /v1/practice/attempts/adaptive` → `PracticeAttemptResult`.
  **Namespaced** so it never collides with the single-item Passage-of-the-Day
  `POST /v1/practice/attempts`.

Both run server-authoritatively today: the **deployed** learner-api
(`services/lambdas/learner-api`) injects the Postgres port; the **in-process dev
authority** (`services/local-authority` + `apps/learner-web/server/authority-api.ts`)
injects a Postgres port built from `DATABASE_URL`, falling back to synthetic when
it is unset. Guests are supported (per-user via the bootstrap `learnerId`).

The queue DTO (`PracticeQueueItem` / `PracticeQuestion`) is learner-safe **by
construction** — a strict schema with no field that can hold an answer key or
rationale. Answer material appears only in `PracticeAttemptResult`, after submit.

## What is deferred

- Today's-Path **minutes → X** wiring (documented in
  [`docs/practice-today-contract.md`](./practice-today-contract.md); the caller is
  `getPracticeQueue(X)` count-based for now).
- A per-learner **"taught / prereq-met"** gate over the whole corpus. Real v7
  items are currently treated as available (taught, prereqs met); the synthetic
  path still honors the skill-graph prerequisites for reinforcement.
- Refitting the provisional coefficients and calibrating item difficulty from
  accumulated `question_stats`.
