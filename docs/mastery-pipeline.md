# MCAT Mastery Pipeline — Implementation Plan & Producer Input Contract

> **Status:** DRAFT for owner sign-off. **No code has been written.** This document is the
> single source of truth for the mastery *engine* and, critically, the **input contract** every
> other system (lessons, question bank, diagnostic, CARS, recall) must satisfy so it can feed the
> mastery pipeline. Sections marked **[SIGN-OFF]** contain proposals awaiting your approval.
>
> Source spec: `MCAT_MASTERY_PLAN.md` (BKT/IRT/Mastery-Learning hybrid). Reconciled with the
> existing app per the Q&A recorded in §2.

---

## 0. TL;DR

- Mastery becomes a **probability `P(L)` per unit**, updated by **Bayesian Knowledge Tracing (BKT)**;
  **IRT** turns item difficulty into the BKT *slip*; **Mastery Learning** sets the `P(L) ≥ 0.95`
  cut. A **forgetting** layer decays `P(L)` over time; a **prerequisite** layer reinforces
  1-hop prerequisites on correct answers. **CARS** is tracked separately as an **IRT ability `V`**.
- **`P(L)` replaces the existing evidence-ladder rungs** as the definition of "mastered"
  (owner decision). Evidence records are still logged, but the *state/number* shown to the learner
  comes from `P(L)`.
- **Fail-closed:** only **independent** attempts (A0, no content-bearing hint, not a diagnostic
  retry, not post-reveal) move `P(L)`. Assisted/guided/revealed/guessed work never mints mastery.
- Runs **server-side** in the authority; per-user values persist in **new Postgres tables**.
  The client only displays.
- Grain: **KC** (stored, hidden), **7 skills** (displayed as bars/brain), **lesson** (displayed on
  the brain/Progress), **CARS** (3 sub-skills + overall readiness).
- The diagnostic **seeds** initial values only (asymmetric, capped ≤ 0.4). It never awards mastery.
- **FSRS stays with the separate Recall/flashcards feature** (`MCAT_RECALL_FLASHCARDS_PLAN.md`).
  Mastery decay is BKT-based and independent.

---

## 1. What the mastery system is (in my words)

Every time a learner answers an item **on their own** (fully unassisted), we treat it as one noisy
observation of whether they truly know the underlying unit. We keep a running probability `P(L)` that
they've mastered that unit and nudge it up on a correct answer and down on a wrong one, using Bayes'
rule. How much a single answer moves the number depends on the item's **difficulty** (an easy item
missed is strong evidence of a gap; a hard item missed is weak evidence) — that difficulty enters the
math as the **slip** term via IRT. A unit is called **mastered** once `P(L)` crosses **0.95**.

Because memory fades, every unit also carries a **half-life `H`**: if it isn't practiced, `P(L)`
decays a little each day. Surviving a **spaced** review (practicing it *after* it had decayed past the
review line) **doubles** `H` (7 → 14 → 28 …); failing that review **resets** `H` to 7. Practicing a
concept also gives a small boost to its **direct prerequisites**, because using B exercises the A it
depends on.

We keep three parallel `P(L)` trackers per learner — one per **KC** (for picking the next question),
one per **skill** (7 reasoning operations, shown on the Skills page), and one per **lesson** (shown as
the brain on Progress). **CARS is different** — it's a durable skill, so we track an **ability score
`V`** with IRT (no BKT, no forgetting) and show a **readiness** meter.

---

## 2. Locked decisions (from owner Q&A)

| # | Decision | Owner answer |
|---|---|---|
| Mastery definition | `P(L) ≥ 0.95` **replaces** the evidence-ladder rungs | Q1 = replace |
| What moves `P(L)` | **Only independent** attempts (A0, no content hint, not retry, not reveal); up on correct, **down on wrong**; assisted/revealed = "instruction" (can set *Learning*, never moves the number) | N1 |
| KC cardinality | **Single primary KC** per item (`primary_kc_id`); ignore secondary/covered for mastery | Q3 |
| Grain — store | **KC** `P(L)` stored, **not displayed** | Q2 |
| Grain — display | **7 skills** on Skills page (remove the 15 clusters); **per-lesson** on Progress (brain) | Q2 |
| Skill set | The **7 reasoning operations** (IDENTIFY / PREDICT / EXPLAIN / RELATE / QUANTIFY / DESIGN / EVIDENCE) | Q4 |
| Skill distinctness | Display **all 7**, no merge logic | Q5 |
| Display style | **Continuous percentages**, not 4 discrete states; brain nodes driven by mastery; 7 bars + explore brain-themed; CARS readiness meter | N2 |
| Forgetting owner | **BKT half-life** governs concept/KC/skill/lesson decay; **FSRS** stays for the separate Recall/flashcards feature | Q6 |
| Daily decay | **Lazy** (compute `P(L)·2^(−daysElapsed/H)` on read/update); no cron | Q7 |
| Review line | Due when `P(L)` decays **below 0.90** | Q8 |
| Diagnostic → mastery | **Seed only** (asymmetric, cap ≤ 0.4), never mints mastery; mapping is a **[SIGN-OFF]** proposal (§4.7) | Q9, Q18 |
| Engine location | **Server-side** authority; **new Postgres per-user tables**; client displays | Q10 |
| Item difficulty `b` | New `question_stats` table; `b = 0` until > 20 attempts, **DOK cold-start** before that | Q11 |
| Prereq graph | Build now, `w = 0.5`; load **1-hop** V3 KC/lesson edges; inert until loaded | Q14 |
| BKT formulas | Implement **exactly as written** (learning nudge on every independent answer) | Q15 |
| CARS Duel → skills | Position→FOC, Argument→RWT, Application→RBT | Q12 |
| CARS readiness source | **Both** PotD and Duel edit readiness (mixed with different weights); mixing is a **[SIGN-OFF]** proposal (§4.6) | Q13 |
| Recall shim | **Replace** the client-side cluster-FSRS demo (`recall-schedule.ts`) with a mastery-driven due-review surface | N3 |
| Deliverables | Plan + this doc first (no code); update producers/pages **with approval before each change** | Q16 |
| Build scope | One coherent server-side engine + storage + display wiring, behind a provisional policy manifest | Q17 |

---

## 3. Architecture & data flow

The engine is **pure + server-side**, matching the authority-boundaries governance.

**Per independent attempt (write path), inside the existing single authority transaction:**

1. Authority scores the attempt (server-only key). Correctness is authoritative.
2. Update **population** `question_stats(question_id)`: `attempts += 1`, `correct += correct?1:0`.
3. Compute item difficulty `b` (from `question_stats`, or DOK cold-start) → slip `S`.
4. **Lazy-decay** each affected unit up to `now` (apply `P(L)·2^(−Δdays/H)`), then apply the **BKT
   update** to the item's **KC**, **skill**, and **lesson** chains.
5. Apply **forgetting/due-review** bookkeeping (double or reset `H` if this was a due review).
6. Apply **prerequisite reinforcement** to 1-hop prerequisites (correct answers only).
7. Persist the updated rows (KC/skill/lesson/CARS) in the same transaction (synchronous projection,
   like today's `learner_streams`). An `EvidenceRecord` is still appended (audit + independence).

**On read (display):** apply lazy decay to `now` for anything not practiced since its
`last_practiced_at`, then return percentages. No cron job.

**CARS attempts** (PotD / Duel) follow the same transaction but update the `cars_ability` rows via the
IRT update (no BKT, no decay).

---

## 4. The engine (exact spec I will implement)

New pure module set in `@mcat/policies` (versioned manifest `mastery-bkt / provisional-v1`):
`bkt.ts`, `irt.ts`, `forgetting.ts`, `cars.ts`, `mastery-seed.ts`.

### 4.1 What counts as an observation (fail-closed)

An attempt updates `P(L)` **iff** it is *independent*: `assistanceLevel === 'A0'` **and**
`!contentBearingHint` **and** `!isDiagnosticRetry` **and** `!revealed`. This reuses the existing
`independent` flag on `EvidenceRecord`/`scoring.ts`. Non-independent attempts may raise the display
state to **Learning** but never move `P(L)`. (This is how we keep "P(L) replaces the rungs" compliant
with the governance rule that assisted/revealed/guessed work never mints mastery.)

### 4.2 Per-question difficulty `b` (IRT) + cold-start

```
p = correct / attempts                      # population, from question_stats
b = ln((1 - p) / p)                          # only when attempts > 20
b = B_DOK[dok_level]                          # cold-start when attempts <= 20   [SIGN-OFF §12]
```

Proposed cold-start table `B_DOK` (easy → negative, hard → positive; tunable):
`{1: -1.0, 2: -0.3, 3: +0.4, 4: +1.0}` (dok 5–6, if present, clamp to +1.4). This mirrors how the
diagnostic already uses DOK as an uncalibrated difficulty proxy.

### 4.3 Slip and BKT update

```
# slip (difficulty-aware); m = 1.7, S_m = 0.10, G = 0.25 fixed
C = m - b ; D = 1 + e^C ; S = S_m / D

# RIGHT (independent correct)
A = P(L)*(1 - S) ; Bx = A + (1 - P(L))*G ; P(L) = A / Bx
P(L) = P(L) + (1 - P(L))*T                    # learning nudge, T = 0.15

# WRONG (independent incorrect)
A = P(L)*S ; Bx = A + (1 - P(L))*(1 - G) ; P(L) = A / Bx
P(L) = P(L) + (1 - P(L))*T                    # learning nudge (per spec, applied on wrong too)
```

Applied to the item's **KC**, **skill (1 of 7)**, and **lesson** chains — **three independent BKT
chains** (per plan §5: the lesson tracker is fed by every question in the lesson, not an average of
its KCs). Mastered when a chain's `P(L) ≥ 0.95`.

### 4.4 Forgetting (lazy) + due review

Each unit stores `p_l`, `half_life_days` (`H`, start `H_0 = 7`), `last_practiced_at`,
`last_due_review_at`.

```
# lazy decay to time t (only for days NOT practiced -> everything since last_practiced_at)
elapsedDays = days(t - last_practiced_at)
P(L)_now    = p_l * 2^(-elapsedDays / H)
```

A practice is a **due review** if the pre-practice decayed `P(L) < 0.90` (the review line). On a due
review, judge the **net result of that study session** on the concept:

```
net-correct  ->  H = H * 2          # successful spaced recall (7 -> 14 -> 28 ...)
net-wrong    ->  H = H_0 (= 7)       # memory wasn't stable; reset
```

"Session" = a study session (proposal: the same continue-session, else the 4 AM day boundary used by
Recall). **[SIGN-OFF §12]**

### 4.5 Prerequisite reinforcement (independent correct only)

For concept `B` answered independently-correct, for **each direct (1-hop) prerequisite `A`** (update
A's own `H` and `P(L)`; default edge weight `w = 0.5`):

```
H_A    = H_A * (1 + w)                       # -> H_A * 1.5
P(L)_A = P(L)_A + (1 - P(L)_A) * (w * T)     # -> + (1 - P(L)_A) * 0.075
```

Edges come from the **V3 registry** (KC→KC and lesson→lesson prerequisites). We load only direct
edges. Until the graph is loaded this step is inert (no-op), so nothing breaks.

### 4.6 CARS — IRT ability (both PotD + Duel edit readiness) **[SIGN-OFF]**

Three sub-skills `V_FOC`, `V_RWT`, `V_RBT` (start `V_0 = 0`). Update after each CARS response:

```
Q = 1 / (1 + e^(-(V - b)))                    # predicted chance correct
V = V + K * (R - Q)                            # ability update
```

- **Passage of the Day (measures):** `R = 1/0`, **`K = 0.3`**. Updates the sub-skill the item tests.
- **CARS Duel (trains, formative):** `R = rubric/… (0–1)` from the §6.5 rubric, **`K = 0.08`**.
  Rubric → sub-skill: **Position → FOC, Argument → RWT, Application → RBT**. Only exercised criteria
  update.

**Proposed mix:** both write to the *same* sub-skill `V`, so both influence readiness, but PotD
dominates (K 0.3 vs 0.08) — a Duel can nudge but never carry readiness. **Overall CARS readiness =
mean(V_FOC, V_RWT, V_RBT)** (alternative: `min`, more conservative). **On-track when overall `V ≥ 1.7`**
(top ≈ 2.5). CARS **never "completes"** (stays in daily rotation). UI: gauge for overall + 3 sub-skill
bars (see mockup, §8).

### 4.7 Diagnostic seeding (mapping) **[SIGN-OFF]**

The diagnostic outputs **per-cluster (15)** `ClusterSignal { gap∈[0,1], certainty∈[0,1],
classification }`. Proposed mapping to mastery seeds (seeds only; capped; never mastery):

- **KC priors:** each KC inherits its cluster's read (KC → owning lesson → cluster). From `strength =
  1 − gap`, `c = certainty`, start `0.2`:
  - weak (`strength < 0.5`): `P(L)_0 = 0.2 − (0.2 − 0.05)·(1 − strength·2 clamp)·c` → floor **0.05**
    (may go freely below 0.2).
  - strong (`strength > 0.5`): `P(L)_0 = 0.2 + (0.4 − 0.2)·(strength·2 − 1)·c` → cap **0.4**.
  - unresolved / unsampled / low certainty: leave **0.2**.
- **7-skill priors:** the current diagnostic has **no per-operation read**. Proposal: add an
  **operation-grain aggregation** to the diagnostic output (bucket scored responses by each item's
  `reasoning_operation`) → per-op `gap/certainty` → seed each skill's `P(L)_0` with the same
  asymmetric-capped rule. *(Requires the diagnostic to emit op-level reads — a producer change, §9.3.)*
- **CARS `V_0`:** from the CARS clusters (CA1/CA2) / CARS-tagged items bucketed by FOC/RWT/RBT:
  `V_0 = clamp(k·(0.5 − gap), −2, +0.5)` (asymmetric: weak lowers freely, strong raises modestly).

Handoff format — a `MasterySeed` DTO emitted at diagnostic completion and consumed once by the engine:

```jsonc
{
  "kcPriors":    { "V3-KC-534000": 0.12, ... },
  "skillPriors": { "IDENTIFY": 0.28, "PREDICT": 0.15, ... },   // 7 ops
  "carsAbility": { "FOC": -0.4, "RWT": 0.1, "RBT": -0.2 }
}
```

---

## 5. Grain & tracking

| Unit | Engine | Stored | Displayed | Purpose |
|---|---|---|---|---|
| **KC** (`primary_kc_id`) | BKT `P(L)` | ✅ | ❌ (hidden) | Selection ("next best question") |
| **Skill** (1 of 7 ops) | BKT `P(L)` | ✅ | ✅ Skills page | The 7 reasoning bars / brain |
| **Lesson** (`lesson_id`) | BKT `P(L)` | ✅ | ✅ Progress brain | Lesson mastered = lesson `P(L) ≥ 0.95` |
| **CARS** (FOC/RWT/RBT) | IRT `V` | ✅ | ✅ CARS readiness | Reading ability + readiness |

---

## 6. The 7 skills + tag mapping **[SIGN-OFF]**

The 7 reasoning operations (owner definitions): **IDENTIFY** (recognize/recall — AAMC Skill 1),
**PREDICT** (perturbation → effect, forward — SIRS2), **EXPLAIN** (observation → mechanism, backward —
SIRS2), **RELATE** (map entity↔role / compare — SIRS2), **QUANTIFY** (select + compute — SIRS2 on the
Skill 1/2 line), **DESIGN** (judge a method/study — AAMC Skill 3), **EVIDENCE** (what the data
licenses — AAMC Skill 4).

**Problem:** the corpus does **not** tag these. It has `primary_skill = SIRS1-4 / CARS_*` and a
**free-text** `construct.reasoning_operation_id` (e.g. `"predict outcome from principle/model"`,
`"select/apply formula"`). **Proposal:** add a normalized `reasoning_operation` enum to the v7 schema +
`questions` table, seeded deterministically (SME may override):

```
SIRS1                              -> IDENTIFY
SIRS3                              -> DESIGN
SIRS4                              -> EVIDENCE
SIRS2 -> disambiguate via construct.reasoning_operation_id keywords:
        predict|outcome|what happens|forward  -> PREDICT
        explain|mechanism|why|account for|backward -> EXPLAIN
        relate|compare|map|match|structure|role -> RELATE
        select|apply formula|calculat|comput|quantif|equation -> QUANTIFY
        (no match)                            -> flag for human (temp default EXPLAIN)
MATH-ENABLING                     -> QUANTIFY
CARS_FOC / CARS_RWT / CARS_RBT    -> (not a science op; handled by the CARS IRT track)
```

---

## 7. Data model (per-user storage)

New migration `database/migrations/0007_mastery.sql` (forward-only). New tables:

```
question_stats(
  question_id text PK references questions,
  attempts int not null default 0,
  correct  int not null default 0,
  updated_at timestamptz not null
)                                             -- population difficulty for b (not per-user)

mastery_kc(     learner_id, kc_id,     p_l, half_life_days, last_practiced_at,
                last_due_review_at, updated_at, PK(learner_id, kc_id))       -- hidden
mastery_skill(  learner_id, operation, p_l, half_life_days, last_practiced_at,
                last_due_review_at, updated_at, PK(learner_id, operation))   -- 7 ops, displayed
mastery_lesson( learner_id, lesson_id, p_l, half_life_days, last_practiced_at,
                last_due_review_at, updated_at, PK(learner_id, lesson_id))   -- displayed
cars_ability(   learner_id, cars_skill, v, updated_at, PK(learner_id, cars_skill))  -- FOC/RWT/RBT
```

- Written by the authority transaction (synchronous projection, like `learner_streams`).
- The existing evidence-ladder `mastery_projections` table + `evaluateMastery` become **legacy** for
  the mastery gate (still fine to keep evidence logging in `attempt_results` / `EvidenceRecord`).
- **Contracts (`@mcat/contracts`):** add `ReasoningOperationSchema` (7 ops), `MasterySeedSchema`,
  and mastery view DTOs carrying **percentages** (`pL: number 0–1`, `refreshNeeded: boolean`).
  New read endpoints on `HTTP_API`: `GET /v1/progress/skills`, `GET /v1/progress/mastery` (lesson
  grain for the atlas), `GET /v1/progress/cars`.

---

## 8. Display (percentages) **[SIGN-OFF: pick a direction]**

- **Progress page** = the colored brain (EvidenceAtlas), with each region/lesson node's fill driven by
  its lesson `P(L)` percentage. Proposed color ramp: `< 40%` dim · `40–70%` warming · `70–95%` bright ·
  `≥ 95%` solid "mastered" · **needs-refresh** overlay (dim + pulse) when decayed below 0.90 or after a
  fresh independent miss.
- **Skills page** = the **7 reasoning skills** as **percentage bars** (remove the 15 clusters). Two
  visual options generated for you to choose:
  - **Option A — 7 bars** (`skills-7-bars.png`): clean horizontal bars, percentage per skill.
  - **Option B — brain-themed** (`skills-brain-themed.png`): the 7 skills mapped onto glowing brain
    regions, intensity = mastery. (Could also do **A as default + B as a hero visual**.)
- **CARS readiness** (`cars-readiness.png`): a gauge for overall readiness vs the 1.7 on-track line +
  three sub-skill bars (FOC / RWT / RBT).

*(Mockups delivered in chat; final visual is your pick. `MasteryBadge`/`MasteryState` in `ui-web`
will gain a percentage-aware mode.)*

---

## 9. Producer Input Contract (what each system MUST emit onto the pipeline)

This is the part that lets future work "shape itself to this pipeline." The mastery engine will only
be as good as what these producers feed it. **Each producer change is gated on your approval (§10).**

### 9.1 Question-bank items (v7)

Every deliverable item MUST carry:

| Field | Purpose | Status today |
|---|---|---|
| `id` | identity | ✅ |
| `primary_kc_id` (single) | KC chain | ✅ |
| `lesson_id` | lesson chain | ✅ |
| `reasoning_operation` (1 of 7) | skill chain | ❌ **NEW tag** (§6) |
| `dok_level` (1–4) | difficulty cold-start `b` | ✅ |
| `family_id` | (kept for evidence/selection) | ✅ |
| `section` + `primary_skill` (SIRS/CARS) | routing + CARS axis | ✅ |
| CARS items: `primary_skill ∈ {CARS_FOC, CARS_RWT, CARS_RBT}` | CARS sub-skill | ✅ |
| `correct_answer` + `explanations` | server-only scoring | ✅ (protected) |

### 9.2 Lessons & study runtime (the attempt event contract)

Whenever a learner answers an item (in a lesson, practice, passage, or protected form), the runtime
MUST emit an attempt with **all** of:

```
questionId, primary_kc_id, lesson_id, reasoning_operation, dok_level, family_id, section,
assistanceLevel (A0–A3), contentBearingHint (bool), isDiagnosticRetry (bool), revealed (bool),
correct (server-decided), elapsedMs,
conditions { timed, passage, protected, mixed },   // for later evidence kinds
changeDimensions []                                 // for transfer (0..5 dims)
```

The engine derives `independent = A0 && !contentBearingHint && !isDiagnosticRetry && !revealed`
and only then moves `P(L)`. **Lessons themselves declare** `lesson_id` + their ordered KC set so the
lesson chain and per-KC chains line up. (Most of this already exists on `EvidenceRecord`; the **new**
requirements are `reasoning_operation` + `dok_level` on the item and threading them into the attempt.)

### 9.3 Diagnostic

At completion, the diagnostic MUST emit a `MasterySeed` (§4.7): per-KC priors (via cluster read),
per-operation priors (**requires new op-grain aggregation**), and CARS `V_0`. It MUST NOT emit mastery
or evidence — seeds only, applied once, asymmetric & capped ≤ 0.4.

### 9.4 CARS — Passage of the Day + Duel

- **PotD** MUST emit `{ carsSkill (FOC/RWT/RBT), correct (bool), dok_level }` → IRT update `K = 0.3`.
- **Duel** MUST emit `{ rubric: { position?, argument?, application? each 0–3 } }`; the engine maps to
  FOC/RWT/RBT, computes `R`, and updates with `K = 0.08` (formative; can't carry readiness).

### 9.5 Recall (boundary)

- The **flashcards/FSRS feature** (separate plan) owns facts and **never writes mastery**.
- The current **cluster-FSRS demo shim** (`recall-schedule.ts`, localStorage) is **replaced** by a
  **mastery-driven due-review** surface: units whose decayed `P(L) < 0.90` are "due"; practicing them
  runs the normal independent-attempt path (which is where half-life doubling happens).

---

## 10. Files I'll add / change — **ask before each** (per your instruction)

**Add (new):**
- `packages/policies/src/{bkt,irt,forgetting,cars,mastery-seed}.ts` (+ manifest `mastery-bkt/provisional-v1`) & tests.
- `database/migrations/0007_mastery.sql` (§7 tables).
- `services/persistence-postgres/src/mastery-repository.ts` + `question-stats-repository.ts`.
- `@mcat/contracts`: `ReasoningOperationSchema`, `MasterySeedSchema`, mastery view DTOs, new endpoints.
- `@mcat/authority-core`: mastery state on `LearnerState` + update orchestration on each accepted attempt.

**Change (each gated on your OK):**
1. `packages/content` schema/engine-schema + `content-cli` + `questions` migration → add
   `reasoning_operation` (7-op) tag + seed mapping + validation. *(producer: question bank)*
2. Study/lesson runtimes (`learner-api` workflow, `authority-core`, `app-native` renderer,
   `vector-lesson-runtime`) → thread the §9.2 attempt contract into BKT. *(producer: lessons)*
3. Diagnostic (`policies/diagnostic`, learner-api diagnostic handler, `diagnostic-client`) → emit
   `MasterySeed` + op-grain aggregation. *(producer: diagnostic)*
4. **Progress page** → brain nodes driven by lesson `P(L)` %. *(display)*
5. **Skills page** → replace 15 clusters with the **7 skills** (bars and/or brain). *(display)*
6. **Recall screen** → replace the cluster-FSRS shim with the mastery due-review surface. *(display)*
7. CARS **PotD + Duel** screens/handlers → emit §9.4 payloads; update `cars_ability`. *(producer)*
8. `ui-web` `MasteryBadge`/`MasteryState` → percentage-aware mode.
9. Architecture/governance tests + `docs/governance/authority-boundaries.md` wording → reflect
   "`P(L)` (independent-only) is the mastery signal." **(governed change — explicit OK needed.)**

---

## 11. What I'm intentionally NOT doing (and why)

- **Not** building the FSRS flashcards feature — separate plan/feature.
- **Not** turning on numeric score prediction — still hard-gated.
- **Not** claiming calibrated IRT — `b` is cold-start/DOK/uncalibrated; manifest stays `provisional`.
- **Not** re-graining the diagnostic to AAMC FC(10)+operation(7) — using the existing 15-cluster read
  plus a new operation aggregation instead (least change).
- **Not** adding skill-merge/distinctness logic — you chose to display all 7.
- **Not** doing multi-KC attribution — single primary KC.
- **Not** touching the separate Recall/flashcards FSRS engine.
- **Not** removing evidence logging — evidence records remain (they power independence + audit); only
  the *mastery gate/display* switches to `P(L)`.

---

## 12. Open decisions needing your sign-off

1. **Display direction:** Skills = Option A (7 bars), Option B (brain-themed), or **A default + B hero**?
   CARS gauge design OK? Color ramp / needs-refresh overlay OK?
2. **CARS mixing:** overall readiness = **mean** vs **min** of the 3 sub-skills; confirm `K = 0.3`
   (PotD) / `0.08` (Duel) and readiness line `V ≥ 1.7`.
3. **Diagnostic → seed mapping** (§4.7): approve the asymmetric-capped formula + adding an
   operation-grain aggregation to the diagnostic output.
4. **7-op tag mapping** (§6): approve the SIRS→op table + SIRS2 keyword disambiguation + CARS handling.
5. **DOK → `b` cold-start** table (§4.2): approve values.
6. **Due-review "session"** definition (§4.4): per continue-session vs 4 AM day boundary.
7. **Governed change** (§10.9): OK to update the authority-boundaries doc + architecture tests so
   `P(L)` (independent-only) is the mastery definition in place of the evidence rungs?
8. **Storage confirm:** new dedicated tables (§7) rather than extending `learner_streams.state_json`.

---

## 13. Constants (quick reference)

| Param | Value | Layer |
|---|---|---|
| `P(L)_0` | 0.2 | BKT prior |
| `T` | 0.15 | BKT learn rate (nudge on every independent answer) |
| `G` | 0.25 | BKT guess (fixed, 4-option) |
| `m` | 1.7 | Slip anchor / mastery cut |
| `S_m` | 0.10 | Max slip |
| mastery threshold | 0.95 | Mastery Learning |
| review line | 0.90 | "due review" trigger |
| `H_0` | 7 | Initial half-life (days) |
| half-life growth | ×2 | On successful due review (reset to 7 on fail) |
| `w` (prereq) | 0.5 | 1-hop prerequisite edge weight |
| `V_0` | 0 | CARS starting ability |
| `K` (CARS) | 0.3 PotD / 0.08 Duel | CARS ability step |
| CARS readiness | 1.7 | overall `V ≥` target (top ≈ 2.5) |
| diagnostic prior cap | 0.4 | max strong-read seed |
| `b` cold-start | `attempts ≤ 20` → DOK table | IRT difficulty |
```

