# Today's Path engine (daily learning-plan orchestrator)

**Status:** implemented. Server-authoritative — Today's Path **orchestrates** the
other engines and **writes NO mastery**.
**Selection policy:** `todays-path / provisional-v1`
([`packages/policies/src/todays-path.ts`](../packages/policies/src/todays-path.ts)),
registered in `ACTIVE_POLICY_MANIFESTS`.
**Orchestration + persistence:** `Authority.buildTodaysPath` /
`getTodaysPath` / `recordPlanActivity` / `setDailyBudget`
([`packages/authority-core/src/authority.ts`](../packages/authority-core/src/authority.ts)).
This document mirrors those files; if they disagree, the code wins.

Today's Path is the top-level engine that decides **what to study today and in
what order**, sized to a daily time budget, then runs it top-to-bottom, one
activity at a time. It **calls** the existing engines (CARS Duel, Recall,
Lessons, Practice, Review Mistakes) with a computed input; each called engine
owns its own writes (Practice moves `P(L)`; Recall/CARS stay formative). Today's
Path reads mastery/forgetting/coverage/review-debt state and **writes none of it**
— an authority test asserts `getMasterySkills` is unchanged by a build.

## The 5 steps (same skeleton as Practice, at the activity level)

Build Allowed List → Score Items → Pick Winners → Order List → Implement.

1. **Build Allowed List** — per-activity eligibility. CARS Duel: always. Recall:
   only when `due >= 5`. Review Mistakes: only when `open >= 3`. Lesson: unlocked +
   **not mastered** (`getMasteryLessons().mastered` or a lesson finished from a
   prior plan) + not prerequisite-blocked. Practice: available post-onboarding.
2. **Score Items** — only the scored block (lessons + practice) is scored; the
   core is reserved. Lessons are scored by **every driver that has data** so the
   pick is never arbitrary: `exam-weight(section) × unlock(KC count) ×
   coverage/deadline-urgency`. Practice value scales with **weakness × coverage**.
3. **Pick Winners** — runs on the minutes budget (1 slot = 1 minute). Reserve the
   mandatory core first (CARS always; Recall/Review Mistakes when eligible, sized
   by due-volume/debt), then fill the rest with the scored block **highest
   value-per-minute first**, with a **phase tilt** (new lessons early →
   reinforcement later) and **diminishing returns** (re-score after each pick +
   a per-repeat decay). Guardrails: review-debt throttle, new-lesson cap,
   block floor–ceilings, total ≤ budget, carry-over cap.
4. **Order List** — teaching rules, NOT score order: Recall early · new lessons
   early · teach-before-test · CARS mid · Review Mistakes near the end but not
   last · rule-priority tie-break.
5. **Implement** — the client runs the ordered list one-at-a-time ("do this
   next"), launching each activity with its computed input and advancing when the
   learner finishes it. **Unfinished work carries to tomorrow, capped at ~125%.**

## Locked decisions (`TODAYS_PATH_CONFIG`)

- **Budget:** 1 slot = 1 minute; daily preset **2 / 3 / 4 / 5 / 6 hr**.
- **Time costs:** CARS Duel **12** (fixed) · Lesson **20** (flat) · Practice
  **2**/question · Recall **0.33**/card (20s) · Review Mistakes **2**/mistake.
- **Block floor–ceiling:** Practice **6–24 q** · Recall **4–20 cards** · Review
  Mistakes **5–20**.
- **Min-eligibility:** Recall **≥5 due** · Review Mistakes **≥3 open**.
- **Review-debt bands** (debt = recall due-minutes ÷ budget): `<0.30` normal
  (recall ~20–30% of budget) · `0.30–0.40` reduce new-lesson admission · `≥0.50`
  pause new lessons (recall up to ~60%).
- **Carry-over:** today's total load ≤ **1.25×** preset.

## Provisional coefficients (documented; tune later)

Phase tilt `phase = coveragePct`: `lessonTilt = 1 − 0.5·phase`,
`practiceTilt = 0.5 + 0.5·phase`. Practice value `= weakness × max(0.1,
coveragePct)` (so lessons win early, practice climbs as coverage completes).
Per-repeat decay `0.8`. New-lesson cap `2` (→1 in `reduce_new`, →0 in
`pause_new`). Section exam-weight `{ bb 1.0, cp 0.92, ps 0.85, cars 0.8 }`
(default 0.7). Lesson unlock proxy `= KC count / 6`. All refit-from-data later.

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
  Review Mistakes → the Mistakes surface (placeholder — see
  [`mistakes-repair-plan.md`](./mistakes-repair-plan.md)).

## What is deferred

- A **Review Mistakes repair runner** (today the slot links to the Mistakes page).
- Real per-lesson `estimatedMinutes` (engine uses the flat 20-min cost).
- Per-lesson skill tags for the "serves-a-high-priority-skill" term (omitted until
  lessons carry reasoning-op metadata; the other drivers differentiate lessons).
- Persisting into the dedicated `plan_projections` / `checkpoints` tables (v1 rides
  `LearnerState.plan` in the event-sourced projection).
- A bandit/RL optimizer for the splits, and refit coefficients.
