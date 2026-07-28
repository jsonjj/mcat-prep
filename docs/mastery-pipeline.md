# MCAT Mastery Pipeline — Implementation Plan & Producer Input Contract

> **Status:** Implementation in progress on branch `cursor/mastery-tracking-system-b8df`.
> This document is the single source of truth for the mastery _engine_ and, critically, the
> **input contract** every other system (lessons, question bank, diagnostic, CARS, recall) must
> satisfy so it can feed the mastery pipeline. Sections marked **[SIGN-OFF]** contain proposals for
> the owner to confirm.
>
> Source spec: `MCAT_MASTERY_PLAN.md` (BKT/IRT/Mastery-Learning hybrid), reconciled with the
> existing app per the recorded Q&A.

---

## 0. TL;DR

- Mastery is a **probability `P(L)` per unit**, updated by **Bayesian Knowledge Tracing (BKT)**;
  **IRT** turns item difficulty into the BKT _slip_; **Mastery Learning** sets the `P(L) ≥ 0.95`
  cut. A **forgetting** layer decays `P(L)`; a **prerequisite** layer reinforces 1-hop
  prerequisites on correct answers. **CARS** is a separate **IRT ability `V`**.
- **`P(L)` replaces the evidence-ladder rungs** as the definition of "mastered" (owner decision).
  Evidence records are still logged, but the _number_ shown to the learner comes from `P(L)`.
- **Fail-closed:** only **independent** attempts (A0, no content-bearing hint, not a diagnostic
  retry, not post-reveal) move `P(L)`. Assisted/revealed/guessed work never mints mastery.
- Runs **server-side**; per-user values persist in **new Postgres tables**. The client displays.
- Grain: **KC** (stored, hidden), **7 skills** (Skills page bars), **CARS** (3 sub-skills + overall
  readiness). The **lesson** grain on the Progress brain is a **derived rollup of member-KC `P(L)`**,
  not its own BKT state — see §5.2 and
  [`docs/lesson-evidence-mastery-contract.md`](./lesson-evidence-mastery-contract.md) §9.
- The diagnostic **seeds** initial values only (asymmetric, capped ≤ 0.4). It never awards mastery.
- **FSRS stays with the separate Recall/flashcards feature.** Mastery decay is BKT-based.

---

## 1. Locked decisions (owner Q&A)

| #                     | Decision                                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mastery definition    | `P(L) ≥ 0.95` **replaces** the evidence-ladder rungs                                                                                                                                                                                                                                                                  |
| What moves `P(L)`     | **Only independent** attempts; up on correct, **down on wrong**; assisted/revealed = "instruction" (may set _Learning_, never moves the number)                                                                                                                                                                       |
| KC cardinality        | **Single primary KC** per item                                                                                                                                                                                                                                                                                        |
| Display               | **7 skills** on Skills page (7 percentage bars; the 15 clusters are removed), **per-lesson** on Progress (brain nodes), KC stored but hidden. **Continuous percentages**, not discrete states                                                                                                                         |
| Direct update grains  | Exactly two: the **primary KC** (`primaryKcId`) and the **primary reasoning operation** (`reasoningOperation`). Lessons have no BKT state of their own                                                                                                                                                                |
| Lesson grain          | **Derived rollup** of required member-KC `P(L)`: arithmetic mean displayed; `mastered` only when every required KC clears `0.95`; review-due when any previously practiced required KC is due; a missing KC state contributes the `0.20` prior and blocks mastery; a missing/empty lesson→KC mapping **fails closed** |
| Skill set             | The **7 reasoning operations** (IDENTIFY / PREDICT / EXPLAIN / RELATE / QUANTIFY / DESIGN / EVIDENCE), all displayed, no merge                                                                                                                                                                                        |
| Forgetting            | BKT half-life governs concept/KC/skill/lesson decay; **FSRS** stays for the separate Recall feature                                                                                                                                                                                                                   |
| Daily decay           | **Lazy** (`P(L)·2^(−daysElapsed/H)` on read/update); no cron                                                                                                                                                                                                                                                          |
| Review line           | Due when `P(L)` decays **below 0.90**                                                                                                                                                                                                                                                                                 |
| Diagnostic → mastery  | **Seed only** (asymmetric, cap ≤ 0.4), never mints mastery                                                                                                                                                                                                                                                            |
| Engine location       | **Server-side**; new Postgres tables; both the deployed learner-api and the in-process authority-core run the same pure engine                                                                                                                                                                                        |
| Item difficulty `b`   | `question_stats` table; `b = 0` until > 20 attempts, **DOK cold-start** before that                                                                                                                                                                                                                                   |
| Prereq graph          | Build now, `w = 0.5`; 1-hop V3 edges; inert until the graph is loaded                                                                                                                                                                                                                                                 |
| BKT formulas          | Implemented **exactly as written** (learning nudge on every independent answer)                                                                                                                                                                                                                                       |
| CARS Duel → skills    | Position→FOC, Argument→RWT, Application→RBT                                                                                                                                                                                                                                                                           |
| CARS readiness source | **Both** PotD (K=0.3) and Duel (K=0.08) update the same `V`; overall readiness = mean; on-track `V ≥ 1.7`                                                                                                                                                                                                             |
| Recall shim           | **Replace** the client-side cluster-FSRS demo with a mastery-driven due-review surface                                                                                                                                                                                                                                |

---

## 2. The engine (implemented in `@mcat/policies`, `mastery-bkt / provisional-v1`)

Pure modules: `irt.ts`, `bkt.ts`, `forgetting.ts`, `prerequisite.ts`, `cars.ts`, `mastery-seed.ts`,
`mastery-attempt.ts`.

- **Difficulty / slip** (`irt.ts`): `b = ln((1-p)/p)` once > 20 attempts, else `coldStartB(dok)`
  (`1:-1.0, 2:-0.3, 3:+0.4, 4:+1.0`). `slip = S_m / (1 + e^(m-b))`.
- **BKT** (`bkt.ts`): the exact RIGHT/WRONG posterior + learning nudge `+ (1-P(L))·T`; mastered at
  `P(L) ≥ 0.95`. Only **independent** attempts reach this (enforced by the authority).
- **Forgetting** (`forgetting.ts`): lazy `currentPL`; `stepMemory` decays → BKT → doubles `H` on a
  successful due review (decayed `P(L) < 0.90`) or resets to 7 on failure.
- **Prerequisite** (`prerequisite.ts`): `H_A *= 1+w`, `P(L)_A += (1-P(L)_A)·(w·T)` on a correct
  answer (1-hop only; inert until the V3 edges are loaded).
- **CARS** (`cars.ts`): `V = V + K·(R − σ(V−b))`; rubric→R; overall = mean of FOC/RWT/RBT.
- **Seeding** (`mastery-seed.ts`): asymmetric/capped prior from a diagnostic read.
- **Composition** (`mastery-attempt.ts`): `applyMasteryAttempt` runs the KC/skill/lesson chains +
  prereqs for one independent attempt; shared by both authorities.

Constants: `P(L)_0=0.2, T=0.15, G=0.25, m=1.7, S_m=0.10, threshold=0.95, review line=0.90, H_0=7,
w=0.5, V_0=0, K=0.3/0.08, CARS readiness=1.7, seed cap=0.4`.

> **Lesson-chain boundary.** The `lesson` member of `MasteryUnitStates` in `mastery-attempt.ts` (and
> the direct-BKT reading of `LessonMasteryView.pL`) is **legacy and excluded from the V3 lesson
> seam**. No V3 lesson observation targets it: a qualified observation updates exactly two grains,
> `primaryKcId` and `reasoningOperation`. V3 lesson-grain values are the derived rollup in §5.2. The
> formulas, constants, and shipped code above are unchanged.

---

## 3. Data model (per-user storage)

`database/migrations/0007_mastery.sql`:

- `question_stats(question_id, attempts, correct, updated_at)` — population difficulty for `b` (no
  FK to `questions`: the current study loop scores against the in-memory synthetic bank).
- `mastery_kc / mastery_skill / mastery_lesson (learner_id, key, p_l, half_life_days,
last_practiced_at, last_due_review_at, updated_at)` — `p_l` as-of `last_practiced_at`. V3 lesson
  observations write only `mastery_kc` and `mastery_skill`; `mastery_lesson` is legacy storage for
  the pre-seam lesson chain and is not the source of a V3 lesson-grain value (§5.2.1).
- `cars_ability (learner_id, cars_skill, v, updated_at)`.

Persistence repos in `@mcat/persistence-postgres` (`mastery-repository.ts`,
`question-stats-repository.ts`) accept a structural `Queryable` so they run against a `Pool` (reads)
or the authority transaction client (writes). The migration Lambda grants the learner-API role
`select, insert, update` on these tables.

Contracts (`@mcat/contracts/mastery.ts`): `MasterySeed`, `SkillMasteryView`, `LessonMasteryView`,
`CarsReadinessView` (all percentages), plus `GET /v1/progress/{skills,lessons,cars}`.

---

## 4. Where it runs / data flow

- **In-process** (`@mcat/authority-core`, local dev + tests): `LearnerState.mastery` holds the maps;
  the study loop's first independent answer calls `updateMasteryForAttempt`; reads
  (`getMasterySkills/getMasteryLessons/getCarsReadiness`) apply lazy decay. A dev-only adapter maps
  the synthetic bank (op tag → 7-op, `internal_skill_ids[0]` → KC, `difficulty` → DOK).
- **Deployed** (`learner-api`, Postgres): the attempt path already flows through
  `authority.submitAttempt`, so mastery updates run inside the command transaction and persist in the
  `learner_streams.state_json` projection (which round-trips `LearnerState.mastery`). Reads
  (`GET /v1/progress/{skills,lessons,cars}`) rebuild the Authority from the projection and apply lazy
  decay. The dedicated `mastery_*` / `cars_ability` tables are a **queryable projection target** for a
  future independent consumer (they are provisioned + granted but not yet on the read path);
  `question_stats` is populated once a real bank + calibrated difficulty are wired.
- **Client** (`@mcat/client-core` `AuthorityPort` + `HttpAuthorityClient`, in-process client, and the
  dev Vite authority server): 3 read methods + `useMasterySkills/useMasteryLessons/useCarsReadiness`
  hooks in learner-web.

### 4.1 The ordinal evidence tier no longer leaves the authority

Capability is `P(L)` and nothing else. The evidence warrant is published as **reason codes**, never as
a rank a consumer could threshold.

The ordinal `base` tier has been removed from `MasteryMapEntry` and `SessionSummary`. It was the only
field a consumer could compare along, and every consumer that read it eventually did — the deleted
`countGlowing` ranked it, `getWrapped` ranked it, and the session badge ordered its wording by it. That
is three rival mastery scales grown from one published integer, which is exactly the two-authorities
contradiction the seam exists to prevent. Reason codes carry the same warrant with no axis to compare
along.

- The learner-facing badge now selects on warrant **reason codes**.
- `WrappedView.skillsGlowing` is a capability claim and so comes from BKT: it counts skills where
  `getMasterySkills(...).mastered` holds.
- The ordinal tier survives only behind the private `Authority.skillWarrants`, for planner and coverage
  use. Ordinals are legitimate there because the planner genuinely compares them; the tier stops at the
  package boundary.

One caveat the owner should decide on: the three `*_SATISFIED` reason codes map one-to-one onto the top
tiers, so the ordinal is **losslessly recoverable** from the published `reasons`. Removing the rank from
the wire did not remove the information — see the seam contract §15.3.

### 4.1.1 `reviewDue` is BKT decay; `refreshNeeded` is warrant staleness

These published under **one** field name, `refreshNeeded`, across four view types until they were split.
One name for two authorities' answers is this pipeline's founding error in miniature.

| Field           | Question                                | Authority        | Published on                                                         |
| --------------- | --------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `reviewDue`     | _Is the memory due?_                    | BKT capability   | `SkillMasteryView`, `LessonMasteryView`, the lesson rollup, KC views |
| `refreshNeeded` | _Is the warrant stale or contradicted?_ | Evidence warrant | `MasteryMapEntry`, `SessionSummary`                                  |

There is **no alias**, deliberately: a consumer must name the question it is asking. `refreshNeeded` can
be true while `P(L)` is high, and false while `P(L)` is low — they are not two views of one signal.

**The planner MUST consume them separately.** `reviewDue` schedules a review of a memory;
`refreshNeeded` schedules the acquisition of missing or stale warrant. A single "needs attention"
boolean built from either one silently answers the other question wrongly. §5.5's due-review contract is
about `reviewDue` only.

### 4.1.2 The warrant now covers lesson grains at all

Worth stating plainly because it invalidates any earlier reading of this document's planner sections: the
warrant enumeration used to cover only the synthetic skill-graph ids, while lesson evidence is keyed on
`V3-KC-*`. **No lesson KC had a warrant.** Recipe slots, gaps, freshness, and reason codes were being
computed for a set of ids the lesson seam never writes, and every test passed, because an absent warrant
is indistinguishable from "no evidence yet".

The grains are now the **union** of the skill graph, every `skillId` holding an evidence record, and the
required KCs of every practiced lesson. The third source is what lets an **unstarted** KC report its
gaps, which is what a planner needs — it must know what is missing before any evidence exists. A grain
whose cluster resolves nowhere **throws** `UnresolvedWarrantGrainError` rather than being filtered out,
because silent omission is what hid the original failure.

Concretely: `V3-KC-452593` now reports `INDEPENDENT_EVIDENCE_SATISFIED` plus six named gaps where it
previously returned `undefined`. **Any planner work that assumed lesson warrant signals existed was
building on nothing**; they exist now.

### 4.2 Verifying the lesson → mastery connection by hand

`GET /v1/debug/learner-state` in `services/local-authority` is the **supported** way to check by hand
that a lesson response reached mastery. It returns each KC's `P(L)` (stored and lazily decayed), the
seven reasoning operations' `P(L)`, the derived lesson rollup (with rejection codes when it is
unavailable rather than a misleading `0`), the evidence records, the accepted event count, and the
applied-observation count and sequence high-water mark.

It is a pure projection with no I/O or clock read, and its evidence view is an explicit field
**allowlist**, so nothing answer-bearing can leak and a field added to `EvidenceRecord` tomorrow cannot
ride along. Assume its output ends up in a log.

Three independent guards must all pass: the process opted in (`MCAT_LOCAL_DEBUG_STATE` set to `1` or
`true`), the peer is loopback (an exact-address allowlist, not a range test), and the request carries no
`Origin` header — which refuses to produce a response for a web page at all, rather than relying on
CORS to hide one. Its absence from the deployed lambda is asserted three independent ways in
`tests/architecture/lesson-mastery-integration.test.ts`.

---

## 5. Producer Input Contract (what each system MUST emit)

> **Lesson producers: read the seam contract first.** > [`docs/lesson-evidence-mastery-contract.md`](./lesson-evidence-mastery-contract.md) is the
> normative producer contract for any V3 lesson feeding this pipeline. It defines
> `LessonItemBinding` (author-time metadata), `LessonRuntimeResponseFacts` (runtime facts),
> `AcceptedLessonObservation` (server acceptance), evidence-mode routing, the two-gate BKT
> qualification, and `QualifiedBktObservation` — the only lesson-side input this engine accepts. Its
> names are frozen by the Gate A registry (`.superpowers/sdd/field-lock.md`). §5.2 below is a summary;
> where they differ, the contract governs.

### 5.1 Question-bank items (v7)

`id`, single `primary_kc_id`, `lesson_id`, **`reasoning_operation`** (1 of 7 — NEW tag), `dok_level`,
`family_id`, `section`, `primary_skill`; CARS items use `primary_skill ∈ {CARS_FOC/RWT/RBT}`;
`correct_answer` + `explanations` stay server-only.

### 5.2 Lessons & study runtime (attempt event contract)

The non-lesson study loop keeps emitting the flat attempt event: `questionId, primary_kc_id,
lesson_id, reasoning_operation, dok_level, family_id, section, assistanceLevel, contentBearingHint,
isDiagnosticRetry, revealed, correct (server-decided), elapsedMs, conditions
{timed,passage,protected,mixed}, changeDimensions[]`. The engine derives `independent` and only then
moves `P(L)`.

**V3 lessons use the seam contract instead**, in three separated stages:

1. The lesson runner emits **facts only** (`LessonRuntimeResponseFacts`): `questionId`,
   `itemBindingId`, `bindingVersion`, `attemptIndex`, `isRetry`, `isDiagnosticRetry`, `response`,
   `omitted`, `elapsedMs`, `answerChanges`, `assistanceLevel`, `contentBearingHintUsed`,
   `revealUsed`, `mixedAdministration`, `passageAdministration`, `timedAdministration`, `occurredAt`.
   It never emits `correct`, `independent`, an evidence status, or a `P(L)`. `response` is a
   discriminated union, not an MCQ choice: `MULTIPLE_CHOICE` carries `chosenChoiceId: string | null`,
   and `CONSTRUCTED` carries a multi-field record keyed by the author's `response_field_id` values.
   The three administration flags describe how the attempt was **actually run** and each defaults to
   `false`; a declared evidence mode must never set one. `occurredAt` is the runner's claim, not a
   clock — see §5.2.2.
2. The server accepts the response into an `AcceptedLessonObservation` (server-decided `outcome` and
   `scoringValid`, plus the immutable measurable `LessonItemBinding` snapshot) and routes evidence.
   Non-measurable exposition — a worked example — produces no observation, no evidence, and no BKT
   input at all.
3. BKT qualification runs two gates and, only if both pass, emits a `QualifiedBktObservation` — the
   only lesson-side input the engine accepts.

**One notion of eligibility: the RESOLVED evidence kind.** A lesson observation reaches BKT only when
the evidence kind this attempt actually resolved to is **not** in `CONTEXTUAL_ONLY_KINDS` — **and** the
runtime response qualifies (`attemptIndex === 1`, `assistanceLevel === 'A0'`, no content-bearing hint,
no reveal, no retry, `scoringValid === true`).

The kind is derived **once**, before qualification; BKT gates on it; the `EvidenceRecord` reads the same
value. `hasEligibleEvidenceMode` does **not** gate BKT — it only requires that a binding declaring an
allowlisted mode supply a `reasoningOperation`, and it selects which frozen code names a refusal.

This replaced a defect worth remembering, because the shape recurs: qualification consulted the
**declared** mode set while the kind was resolved **separately** with administration gating, and the
call site never compared them. Two derivations of one fact, free to disagree — 42 of 78 unordered
two-mode declarations qualified while resolving to contextual-only evidence with every condition true,
and all four administration-gated modes qualified when the runner honestly reported the condition false.
It reached `P(L) = 0.99999`, `mastered: true`, on zero mastery-eligible records. **If you are reconciling
two computations of the same fact, the reconciliation is the defect** — delete one.

The declared allowlist (`INDEPENDENT`, `TRANSFER`, `DELAYED`, `MIXED`, `PASSAGE`, `TIMED`, `PROTECTED`)
still governs the authoring rule, and it is deliberately **not** expressed as "any mode other than
`INSTRUCTIONAL`". That negation was the shipped rule once, and with thirteen enum members it made twelve
eligible — including `INSTRUCTIONAL_EXIT`, `DIAGNOSTIC`, `ENTRY`, `REPAIR_CONFIRMATION`, and
`REHEARSAL_ONLY`, all of which route to contextual-only evidence. The allowlist gives two properties a
denylist cannot: a mode added to the enum tomorrow is ineligible until someone deliberately allows it,
and an unrecognized mode is ineligible by default. Do not reintroduce a negation.

There is no default-allow and no inference. An unauthored mode set defaults to `['INSTRUCTIONAL']`,
resolves to `instruction`, and is rejected with `INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED` (frozen name;
read it as "no eligible mode declared"). A real permission that this attempt did not exercise — a
`TIMED` binding on an untimed attempt — is rejected with `RESOLVED_EVIDENCE_KIND_CONTEXTUAL_ONLY`, a
runtime cause rather than an authoring one. An eligible binding without a `reasoningOperation` is
rejected with `ELIGIBLE_BINDING_MISSING_REASONING_OPERATION`. Every rejection code is recorded for
audit; the observation still produces evidence, it just does not move `P(L)`.

**Only the assistance level the learner TOOK bears on independence.** The binding's
`authoredAssistanceAffordances` records what help the item _offered_ — an open, author-defined list —
and is never read by the independence check. This was a live defect: the authored `assistance_state`
reached the seam as the runtime's `assistanceLevel`, so a string in a lesson script decided
independence and moved a `P(L)` from `0.20` to `0.5717`. An authored `A0`–`A3` value is now rewritten
on the way in so it cannot be read back as an assistance level.

**Consequence today: no real lesson response is independent.** The runtime can observe whether support
was requested and whether the answer was revealed, but not a **graded** assistance level, so
`assistanceLevelTaken` fail-closes to `A3` on every response. Every `EvidenceRecord.independent` from a
lesson is therefore `false` and every qualification carries `ASSISTANCE_NOT_A0`. The BKT path itself is
proven: an end-to-end test moves `P(L)` on both grains for each of the seven eligible modes. Unlocking
real lesson responses requires teaching the runtime to measure help actually displayed and taken, at or
before commit — see the seam contract §3.3.

**A declared mode never mints an administration condition.** `mixed`, `passage`, and `timed` in
`EvidenceRecord.conditions` come from the runner's administration facts, and `protected` comes from the
server scoring resolution. A binding that merely _declares_ `TIMED` on an untimed attempt is classified
`instruction`, not `timed`; otherwise a declaration would fill the timed recipe slot without a timed
administration ever happening.

**Omission qualifies.** An omitted answer is a scored outcome, not a scoring failure: with
`scoringValid === true` it still produces evidence and, if the gates pass, a `QualifiedBktObservation`
with `correct: false`. `SERVER_SCORING_INVALID` means one thing only — no `serverItemVersion`
resolved — and it is the only condition that suppresses the evidence record as well.

A `QualifiedBktObservation` carries `primaryKcId`, `reasoningOperation`, `correct`, and an optional
`dokLevel`. It has no `lessonId`, `pL`, `mastered`, `masteryThreshold`, `evidenceStatus`, `kind`, or
`independent` field. `secondaryKcMappings` is never a target. Lesson-sourced `EvidenceRecord`s take a
caller-resolved `cluster` (via `LESSON_TO_CLUSTER`) and **omit** `operation`, which is the
`OperationTag` authoring-analysis axis rather than the mastery axis.

**Current state.** No lesson artifact on disk authors `candidateEvidenceModes`, so all 115 bindings
across the three real lessons take the `['INSTRUCTIONAL']` default — legacy `evidence_eligibility`
labels, `INSTRUCTIONAL_EXIT_ONLY` included, normalize to the same value. No V3 lesson moves `P(L)` at
all; they produce instructional evidence only. That is the intended end state, not a partial
integration, and it now fails closed for **two** independent reasons: no eligible mode is declared
(Gate 1) and no response can be independent (Gate 2, the `A3` fail-close above). Fixing either alone
still moves no `P(L)`.

### 5.2.2 The clocks a policy reads are server-owned

A runner-reported `occurredAt` is a runtime fact, not a clock. Two authorities were driven by it until
July 2026, and both were exploitable: 120 observations stamped `2999-01-01` produced permanent mastery
(decay never elapsed), and one backdated **correct** observation dropped a mastered KC from `1.0` to
`9.7e-11` via lazy decay across the invented gap. Forward-dating buys mastery; back-dating destroys it.
Both are the client writing a mastery claim.

- **Decay clock (BKT).** `boundDecayClock` clamps on three sides: a **ceiling** at the Authority's own
  clock; a **grain floor** at the newest `lastPracticedAt` among the grains the observation actually
  writes, so no grain rewinds (prerequisites count only on a correct answer, since only then are they
  written), itself capped at `serverNow` so a stored future timestamp cannot become a permanent floor;
  and a **server floor** at `serverNow - BKT_OBSERVATION_PAST_SKEW_TOLERANCE_MS`. A claim more than
  `BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS` (`300_000`, five minutes) ahead is **refused** with
  `OBSERVATION_TIMESTAMP_IN_FUTURE` rather than clamped, so the bad claim leaves a signal.
- **Why the past needs its own floor.** The grain floor is `null` on a grain's **first** write, and the
  clamp degenerated exactly there: an arbitrarily backdated claim became the decay baseline
  (`currentPL = 5.4e-104`), making `P(L)` arrival-order dependent — 0.1497 against 0.8624 for identical
  evidence. The past tolerance equals the future one (symmetry is asserted), but a too-old claim is
  **clamped, not refused**: a delayed submission is ordinary and refusing it would discard real
  evidence. Order-dependence is therefore **bounded, not eliminated** — residual measured at 9.163e-5,
  asserted under 1e-3, capped by the decay across the window. The warrant timestamp is bounded
  separately and keeps the honest time, so freshness, delay, and retention are unaffected; only the
  memory baseline moves.
- **Freshness clock (evidence).** `EvidenceRecord.occurredAt` is a branded `ServerBoundedTimestamp`
  whose only producer is `boundOccurredAtToServerTime`, bounded by the server's `acceptedAt`. The brand
  makes this structural: a raw runner claim does not typecheck. A **negative** age means untrustworthy,
  not new, so it yields `isFresh: false` — it still counts toward the achieved-ever tier, which is not
  time-derived, and the mismatch surfaces as `EVIDENCE_STALE`.
- **Audit.** A `bkt_observation_applied` event retains `reportedOccurredAt` (verbatim),
  `appliedOccurredAt`, `clockAdjustment`, `outOfOrder`, and `observationSequence`, so the clamp never
  destroys the evidence that a client misreported. `sequence` is a high-water mark used for
  **detection, not enforcement**: an out-of-order arrival is recorded and still applied, because
  discarding a legitimately delayed observation would lose real evidence.
- **Ordering.** BKT application runs **before** evidence is written, so a refused observation leaves no
  evidence record at all. That is different from merely failing to qualify, which still records
  evidence.
- **Accepted with no action.** `lastDueReviewAt` stays uncapped: it is audit-only and no policy reads
  it. If one ever does, it must be bounded first.

### 5.2.1 Lesson summaries are KC-derived

Lessons declare their `lesson_id` + ordered required KC set; that mapping is the _only_ lesson input
to mastery. A lesson-grain number is computed on read from its required member KCs, never stored as
its own BKT state:

- **displayed value** — arithmetic mean of the current (lazily decayed) `P(L)` of every required
  member KC;
- **`mastered`** — `true` only when **every** required KC satisfies `isMastered(pL)` (`P(L) >= 0.95`);
- **`reviewDue`** — `true` when **any** previously practiced required KC has decayed below the review
  line (`0.90`); a never-practiced KC is not due. This is BKT decay, not the warrant's `refreshNeeded`
  (§4.1.1);
- **missing KC state** — contributes the `0.20` prior to the mean and blocks `mastered`;
- **missing or empty lesson→KC mapping** — **fails closed**: emit no lesson-grain value at all, never
  `0` and never a vacuous "mastered".

The mean is a display value. It MUST NOT be compared against the `0.95` threshold to decide
`mastered`, so a lesson can legitimately show a high percentage and still be `mastered: false`.
Lesson delivery, checkpoint, and repair state is a separate axis: completing a lesson never sets or
implies mastery.

### 5.3 Diagnostic

At completion emit a `MasterySeed` (per-KC priors via cluster read, per-operation priors, CARS
`V_0`) — seeds only, capped ≤ 0.4, never mastery. **[SIGN-OFF]** requires adding an operation-grain
aggregation to the diagnostic output.

### 5.4 CARS — Passage of the Day + Duel

**CARS Duel (WIRED).** At reflection the sparring partner grades the student's arguments on the rubric
(Position / Argument / Application, 0–3 each — omit criteria not exercised); `parseDuelRubric`
(`@mcat/ai-gateway`) reads the scores and the client sends them on `POST /v1/hooks/cars-duel` as
`{ rubric }`. The authority maps **Position→FOC, Argument→RWT, Application→RBT** and nudges each
sub-skill's ability with `R = score/3` at the low formative weight `K = 0.08`
(`authority.recordCarsDuel(state, rubric)`). With no rubric (AI off, or nothing scored) the duel
still logs contextual evidence but does not move ability.

**Passage of the Day (HOOK READY; content pending).** The mechanism exists —
`authority.recordCarsPassage(state, carsSkill, correct)` updates the sub-skill ability at the full
measurement weight `K = 0.3`. To finish wiring PotD you (or another agent) must: (1) serve a real
CARS passage item — the bank is currently synthetic BB1, so there is no CARS content yet; (2) resolve
its sub-skill from `primary_skill` (`CARS_FOC/RWT/RBT` → `resolveCarsSkill`); and (3) on answer, call
`recordCarsPassage` (add a thin command/endpoint, or branch the practice-attempt path when the item
is a CARS item). Because PotD is a real measurement (`R = 1/0`) it is what actually drives readiness;
the Duel only nudges it.

### 5.5 Recall (mastery due-review) — contract for the future Recall system

The Recall screen is **not built in this pass** (the owner will build it). It plugs into the mastery
pipeline as **both a consumer and a producer**. To fit the pipeline it must:

**CONSUME — what "due" means.** A unit is due when its lazily-decayed `P(L)` has fallen below the
review line (`REVIEW_LINE = 0.90`, exported from `@mcat/policies`). Read current values from the
pipeline (the read views already apply lazy decay, so `pL` is current):

- 7 skills: `GET /v1/progress/skills` (`AuthorityPort.getMasterySkills`) → filter `pL < 0.90`.
- lessons: `GET /v1/progress/lessons` (`AuthorityPort.getMasteryLessons`) → filter `pL < 0.90`. For
  V3 lessons this view is the KC-derived rollup of §5.2.1, so "due" means at least one previously
  practiced required KC is due; the actionable due unit is the KC, not the lesson.
- KC-grain due lists: KC `P(L)` is **stored but not yet exposed**. If Recall needs a per-KC due list,
  add a `getMasteryKc` read (a `GET /v1/progress/kc` endpoint + `Authority` method) — the storage
  (`mastery_kc`) already exists.

Sort most-decayed first (lowest `pL`). A unit that has never been practiced (no entry / `pL` at the
0.2 prior) is **not** "due" — only decayed, previously-built units are.

**PRODUCE — how a review counts.** When the learner practices a due item, the answer MUST flow
through the **same independent-attempt path** as the study loop (`authority.submitAttempt` →
`POST /v1/attempts`), carrying the full §5.2 attempt contract with `assistanceLevel: 'A0'`, no
content-bearing hint, not a diagnostic retry, not revealed. That single path is what (a) runs the BKT
update and (b) **doubles the half-life** on a successful due review — the engine's `stepMemory`
detects the due review automatically because the pre-practice decayed `P(L) < 0.90`. Recall MUST NOT
compute or write mastery itself.

**Session net.** If Recall practices several items for one concept in a session, pass the session's
net correctness so one mid-session miss doesn't reset the half-life (the engine accepts a
`dueReviewNetCorrect` override on `stepMemory` / `applyMasteryAttempt`; wire it through if Recall
batches).

**Boundary.** The separate Anki-style flashcards/FSRS feature owns user _facts_ and never writes
mastery; this concept/skill due-review lane is the one that feeds `P(L)`. The old client-side
cluster-FSRS shim (`apps/learner-web/src/app/recall-schedule.ts`) is the thing the future Recall
system replaces; until then it stays as a demo (and is the only remaining `@mcat/content` import in
`learner-web`).

---

## 6. The 7 skills + tag mapping **[SIGN-OFF]**

Add a normalized `reasoning_operation` enum to the v7 schema + `questions` table, seeded from
existing tags (SME may override):

```
SIRS1 → IDENTIFY ; SIRS3 → DESIGN ; SIRS4 → EVIDENCE ; MATH-ENABLING → QUANTIFY
SIRS2 → disambiguate via construct.reasoning_operation_id keywords:
        predict|outcome|forward → PREDICT ; explain|mechanism|why|backward → EXPLAIN
        relate|compare|map|role → RELATE ; select|apply formula|calculat|comput|quantif → QUANTIFY
CARS_FOC / CARS_RWT / CARS_RBT → the separate CARS IRT track (not a science op)
```

---

## 7. Open decisions still needing sign-off

1. **Diagnostic → seed mapping** (§5.3): approve the asymmetric-capped formula + adding an
   operation-grain aggregation to the diagnostic.
2. **7-op tag mapping** (§6): approve the SIRS→op table + SIRS2 keyword disambiguation.
3. **DOK → `b` cold-start** table values.
4. **Due-review "session"** definition (per continue-session vs 4 AM day boundary).
5. **Governed change**: update `docs/governance/authority-boundaries.md` + architecture tests so
   `P(L)` (independent-only) is the mastery definition in place of the evidence rungs.
6. **Governed rename owed**: `LessonMasteryView.pL` → `meanMemberPL`. The field is an arithmetic mean of
   member-KC `P(L)`, not a probability of anything, and the current name invites the one operation
   §5.2.1 forbids — comparing it against `0.95` to decide `mastered`. It is a Gate A exported symbol, so
   it needs a governed revision rather than a rename in passing.
7. **Coarsening the `*_SATISFIED` reason codes** (§4.1: the ordinal tier is losslessly recoverable from
   the published codes). Trades learner-facing specificity for making the rank unreconstructable.
8. **Learner-facing copy**: "Needs refresh" is currently rendered from `reviewDue` on the Skills page and
   from `refreshNeeded` on the warrant surfaces. The fields are correctly distinct (§4.1.1); the shared
   wording has not been re-adjudicated.

---

## 8. What we are intentionally NOT doing

FSRS flashcards feature (separate), numeric score prediction (still gated), calibrated IRT (`b` is
uncalibrated/DOK cold-start; manifest stays `provisional`), FC(10)+op(7) diagnostic re-grain (using
the 15-cluster read + a new op aggregation), skill-merge logic (all 7 shown), multi-KC attribution,
and evidence-log removal (evidence still powers independence + audit).
