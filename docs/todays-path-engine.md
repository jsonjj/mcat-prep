# Today's Path engine (daily learning-plan orchestrator)

**Date of Documentation:** July 28, 2026 (Reflects code as of current commit)
**Status:** implemented. Server-authoritative — Today's Path **orchestrates** the
other engines and **writes NO mastery**.
**Selection policy:** `todays-path / provisional-v1`
([`packages/policies/src/todays-path.ts`](../packages/policies/src/todays-path.ts)),
registered in `ACTIVE_POLICY_MANIFESTS`.
**Orchestration + persistence:** `Authority.buildTodaysPath` /
`getTodaysPath` / `recordPlanActivity` / `setDailyBudget`
([`packages/authority-core/src/authority.ts`](../packages/authority-core/src/authority.ts)).

This document describes the *actual, currently implemented* behavior of the engine, verified line-by-line against the codebase. If this document and the code disagree, the code wins.

*(A prior version of this document described planned behaviors as if they were implemented. See the "Owner's Stated Intent vs. Reality" section below for explicit corrections and the intended future state.)*

Today's Path is the top-level engine that decides **what to study today and in
what order**, sized to a daily time budget, then runs it top-to-bottom, one
activity at a time. It **calls** the existing engines (CARS Duel, Recall,
Lessons, Practice, Review Mistakes) with a computed input; each called engine
owns its own writes (Practice moves `P(L)`; Recall/CARS stay formative). Today's
Path reads mastery/forgetting/coverage/review-debt state and **writes none of it** —
an authority test asserts `getMasterySkills` is unchanged by a build.

## The 5 steps (Current Implementation)

Build Allowed List → Score Items → Pick Winners → Order List → Implement.

1. **Build Allowed List** — per-activity eligibility.
   - **CARS Duel:** always.
   - **Recall:** only when `due >= 5`.
   - **Review Mistakes:** only when **`open >= 3`** misses are actually open.
   - **Lesson:** unlocked + **not mastered** (P(L) has not crossed threshold and not completed in a prior plan) + not prerequisite-blocked. *(Note: The client currently sends `prerequisiteLessonIds: []` and `cluster: null`, so `unlocked` is effectively constant `true` and `covered` is constant `false`.)*
   - **Practice:** available once enough lessons are completed (post-onboarding, `practiceUnlockLessons: 3`).

2. **Score Items** — only candidate lessons are scored. Practice is not scored.
   - Lessons are scored **exactly once** (`base: scoreLesson(...)`) and sorted.
   - The lesson score formula is: `clamp01(examWeight * (0.5 + 0.5 * unlock) * coverageUrgency * masteryFactor)`
     - `examWeight`: uses a static section weight (e.g., 1.0 for bb, 0.92 for cp).
     - `unlock`: driven by `clamp01(kcCount / 6)`. Since `dependentsCount` is 0 (no client prereqs), this term provides a **2× swing** in score.
     - `coverageUrgency`: uses a static `(0.6 + 0.4 * pressure)`. Since `covered` is false, it uses a 1.0 multiplier.
     - `masteryFactor`: bounded to `[0.8, 1.0]` by `masteryWeight: 0.2` (a 1.25× swing). **Mastery mathematically cannot overcome the KC count unlock term**. The engine functions as a budget-filler, not a highly adaptive tutor.

3. **Pick Winners** — runs on the minutes budget (1 slot = 1 minute).
   - Reserve carry-over items first (capped at 1.25× preset).
   - Reserve the mandatory core: CARS Duel (1 or 2 depending on budget), Recall (sized by due/debt, up to band ceilings), and Review-Mistakes (2–3 short sessions of 3–8 items, only when ≥3 are open).
   - Fill the rest with the scored block:
     - **New Lessons:** Picks the highest-scoring unlocked/unmastered lessons up to a cap. The cap scales with the budget on a normal day: **`ceil(budget/20)`**.
     - **Practice:** Any remaining budget is **pure budget-fill**. It simply calculates `practiceQs = floor(remaining / 2)` and splits them into <=45-minute blocks. Practice is *not* sized to review need; though `practiceReviewNeed` is computed and passed in, it is **never read**.

4. **Order List** — teaching rules, NOT score order:
   - Recall always first.
   - Lessons, Practice, and Review Mistakes are max-spread so no two of the same kind run back-to-back. Where one kind outnumbers all the others, its unavoidable repetition is cut into even chunks.
   - CARS is nudged toward the middle (or ~1/3 and ~2/3) via adjacency-safe swaps.

5. **Implement** — the client runs the ordered list one-at-a-time ("do this
   next"), launching each activity with its computed input. **Unfinished work carries to tomorrow, capped at 1.25× preset.**

## Locked decisions (`TODAYS_PATH_CONFIG`)

- **Budget:** 1 slot = 1 minute.
- **Time costs:** CARS Duel **12** (fixed) · Lesson **20** (flat) · Practice
  **2**/question · Recall **0.33**/card (20s) · Review Mistakes **2**/mistake.
- **Reserved Mistakes sessions:** **2**/day (**3** on ≥4 hr budgets), reserved
  **only once ≥3 misses are actually open**. Kept short (**3–8 items**) and **never sized above the open-mistake count**.
- **Variety is the orderer's job:** max-spread reaches **zero** same-kind adjacency whenever no kind holds more than half the day; when one does, forced repetition is cut into even chunks.
- **Min-eligibility:** Recall **≥5 due** · Review Mistakes **≥3 open**.
- **Review-debt bands** (debt = recall due-minutes ÷ budget): `<0.30` normal
  (recall ~20–30% of budget) · `0.30–0.40` reduce new-lesson admission · `≥0.50`
  pause new lessons (recall up to ~60%).
- **Carry-over:** today's total load ≤ **1.25×** preset.

## The seam

- **Client → server (build):** because Recall (fact flashcards) and the
  app-native lesson catalog live on the client, the client feeds a
  `RecallLoadInput` (from `RecallService.estimateLoad`) + `CandidateLessonInput[]`
  (from `APP_NATIVE_LESSONS`) into `POST /v1/plan/today/build`. The server scores,
  sizes, orders, and persists the plan on `LearnerState.plan`.
- **Server surfaces:** `GET /v1/plan/today/path` (read; `built:false` when no plan
  for today) · `POST /v1/plan/today/build` (build/persist; idempotent per day
  unless `force`) · `POST /v1/plan/today/activity` (mark in_progress/complete/
  skipped) · `PUT /v1/profile/daily-budget` (set the preset).
- **Launch inputs the client hands each engine:** CARS Duel → defaults (auto-start);
  Recall → `{ minutesBudget, maxCards }`; Lesson → app-native slug; Practice →
  `{ x, focus }` (`x = minutes / 2`, honored by `getPracticeQueue(x, focus)`);
  Review Mistakes → the Mistakes surface.

## Owner's Stated Intent vs. Reality

The engine's original design specification included behaviors that **do not exist in the code**. The owner wants to know what the engine is supposed to become; this section explicitly marks the gaps as unbuilt so they are not conflated with current reality.

### 1. Phase Tilt
- **Intent:** `lessonTilt = 1 − 0.5·phase` and `practiceTilt = 0.5 + 0.5·phase`, meant to favor lessons early and practice later as coverage completes.
- **Reality:** **Absent.** There is no phase tilt mechanism. `coveragePct` is computed and passed in the snapshot but is **never read** by the engine.

### 2. The Practice Value Formula
- **Intent:** `Practice value = weakness × max(0.1, coveragePct)`.
- **Reality:** **Absent.** Practice is never scored and has no value formula. It serves as pure budget-fill at the end of the day's planning (`floor(remaining / 2)`). `pickPracticeFocus` returns `null` unconditionally, meaning there is no weakness targeting.

### 3. Per-Repeat Decay
- **Intent:** A diminishing-returns decay of `0.8` applied per additional pick of the same kind.
- **Reality:** **Absent.** While `perRepeatDecay: 0.8` exists in the configuration object, it is never used in the lesson scoring or picking logic.

### 4. Re-Scoring After Each Pick
- **Intent:** Re-score the remaining items after each pick to apply the diminishing returns decay.
- **Reality:** **Absent.** Candidate lessons are scored exactly once and sorted. The top ones are picked linearly without any re-scoring.

### 5. Lesson Cap Scaling
- **Intent:** A new-lesson cap that scales with the budget as `clamp(floor(budget/90), 2, 6)`.
- **Reality:** **Absent.** The real scaling formula implemented for normal days is `ceil(budget/20)`. The `newLessonCap: 2` config is only used as a throttle during `reduce_new` debt states, and `newLessonCapMax: 6` is never used.

### 6. Practice Ceiling Scaling
- **Intent:** A practice ceiling that scales with the budget as `clamp(floor(budget/4), 24, 90)` questions.
- **Reality:** **Absent.** The configuration keys `practiceMinQ`, `practiceMaxQ`, and `practiceMaxQHard` are present but are dead code. Practice simply fills the remaining budget unconditionally and is only bounded by the `maxActivityMinutes` (split into <=45-minute blocks).

### Other Deferred / Unbuilt Capabilities
- **Real per-lesson `estimatedMinutes`:** Intended to use client-provided estimates, but the engine currently uses a flat 20-minute cost (`cfg.costs.lesson = 20`).
- **Real prerequisites and clusters:** Intended to drive unlock gating and coverage urgency. The client currently sends `cluster: null` and `prerequisiteLessonIds: []`, rendering `unlocked` constantly `true` and `covered` constantly `false`.
- **Practice sized to review need:** Intended to size practice to the count of weak/overdue taught KCs. Currently, it acts as a greedy remainder fill.
- **A Review Mistakes repair runner:** Today the slot just links to the open Mistakes page.
- **Bandit/RL optimizer:** For the splits and refit coefficients.
