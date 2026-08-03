# What the daily planner actually does

## Scope and method (what you read, what you did not)

This audit documents **implemented behavior** in the MCAT prep monorepo’s daily planning / scheduling stack. Primary sources:

| Area | Files read |
|------|------------|
| Daily plan engine | `packages/policies/src/todays-path.ts`, `packages/policies/src/todays-path.test.ts`, `docs/todays-path-engine.md` |
| Orchestration | `packages/authority-core/src/authority.ts` (Today’s Path, practice queue, diagnostic stub, seed application) |
| Mastery / forgetting | `packages/policies/src/bkt.ts`, `forgetting.ts`, `mastery-policy.ts`, `lesson-rollup.ts`, `mastery-attempt.ts`, `irt.ts`, `prerequisite.ts` |
| Practice selection | `packages/policies/src/practice-selection.ts`, `packages/authority-core/src/practice.ts` |
| Spaced repetition (Recall) | `packages/recall-core/src/fsrs.ts`, `leech.ts`, `selection.ts` |
| Diagnostic → plan handoff | `packages/policies/src/diagnostic.ts`, `diagnostic-bayes.ts`, `diagnostic-mst.ts`, `mastery-seed.ts`, `mastery-seed-value.ts`, `apps/learner-web/server/diagnostic-engine.ts` |
| Unlock weights | `packages/policies/src/data/unlock-weights.generated.ts`, `scripts/generate-unlock-weights.mjs` |
| Budget / capacity | `packages/contracts/src/todays-path.ts`, `packages/policies/src/planner.ts`, `ghost.ts`, `diagnostic-value.ts` |
| Granularity counts | `packages/contracts/src/atlas-region-groups.json`, `curriculum/v3/README.md`, `packages/contracts/src/vocab.ts` |

**Not exhaustively traced:** Postgres learner-api lambda wiring, every UI screen, full question bank calibration pipelines, FSRS learner-parameter optimization upstream gates, and runtime telemetry. Where the in-process `Authority` diagnostic stub diverges from the learner-web diagnostic service, both are noted.

---

## The plan assembly pipeline (narrative, ~400 words, end to end)

Today’s Path is a **pure policy engine** (`buildTodaysPath` in `packages/policies/src/todays-path.ts`) orchestrated by `Authority.buildTodaysPath` (`packages/authority-core/src/authority.ts:858`). It **writes no mastery**; it reads a snapshot built from learner state, client-fed recall load, and candidate lessons, then returns an ordered activity list sized to a daily minute budget.

**Day boundary:** Plans are keyed to a learner-local calendar date with a **4 AM rollover** (`authority.ts:790–795`). Rebuilds the same day preserve completed/in-progress activities unless `force` is set.

**Budget:** Learner preset minutes (default **240**, clamped **120–360**) minus minutes already spent on in-progress/complete activities today (`authority.ts:875–885`). Carry-over from yesterday’s unfinished activities is reserved first, capped at **125%** of preset (`todays-path.ts:393–402`).

**Mandatory core (reserved before scored block):**
1. **CARS Duel** — **12 min** each; **1** on budgets &lt; **240 min**, **2** on ≥ **240 min** (`todays-path.ts:418–439`, `carsSecondAtBudget: 240`).
2. **Recall** — if `due ≥ 5` cards; sized by `%` of budget from review-debt band, clamped to card floors/ceilings (`sizeRecall`, `todays-path.ts:330–344`).
3. **Review Mistakes** — **2** short sessions/day (**3** on ≥ **240 min** budgets) only if **≥ 3** open mistakes; **3–8** items per session (`todays-path.ts:465–506`, `mistakesReserved`).

**Scored block:**
1. **New lessons** — unlocked, not mastered, not delivered; ranked by `scoreLesson`; capped by review-debt band; each lesson reserves its **script-authored `estimatedMinutes`** (not the nominal 20-min scaling unit).
2. **Reinforcement lessons** — delivered but not mastered; up to **1**/day (`reinforcementLessonCap`).
3. **Practice** — if `practiceUnlocked` (≥ **3** completed lessons per authority gate); **fills all remaining minutes** at **2 min/question**, split into blocks ≤ **45 min** (`todays-path.ts:608–648`). Question count is **not** tied to `practiceReviewNeed` in the engine (see conflicts).

**Ordering:** Recall pinned first; remaining kinds run through `maxSpread` / `orderActivities` for interleaving; CARS nudged to ~middle or ~⅓ & ~⅔ (`todays-path.ts:781–818`).

**At launch:** Client passes Recall `{ minutesBudget, maxCards }`, Practice `{ x, focus }` where `x = minutes / 2` (`docs/todays-path-engine.md:122–124`). Practice item selection uses `selectPracticeQueue` separately (`authority.ts:2539–2568`).

**Diagnostic influence:** The production diagnostic (`apps/learner-web/server/diagnostic-engine.ts`) scores a **140-item MST form** over **10 Foundational Concepts**, emits **2** top priorities, and produces **KC-grain BKT priors** (`masterySeed`) applied via `applyMasterySeed`. The daily planner consumes resulting **lesson `pL`** values in `scoreLesson`; it does **not** read diagnostic priority lists directly.

---

## Inventory of design choices

### A. Activity types and eligibility

**1.** Five activity kinds exist: `cars_duel`, `recall`, `review_mistakes`, `lesson`, `practice` — no separate “diagnostic” activity in the daily plan (`todays-path.ts:156–161`).

**2.** CARS Duel is reserved every day when not carried over (`todays-path.ts:418–439`).
- (b) Fixed **12** minutes per duel (`TODAYS_PATH_CONFIG.costs.carsDuel: 12`, `todays-path.ts:122`).
- (c) “Formative — never mastery” (`todays-path.ts:428`); CARS ability updated elsewhere with low duel weight (`cars.ts:17–18`, `CARS_K_DUEL = 0.08`).
- (d) Different cost would change how many other activities fit; CARS is never omitted when budget allows.

**3.** Recall requires minimum due volume (`todays-path.ts:335`).
- (b) `eligibility.recallMinDue = 5` (`todays-path.ts:136`).
- (c) “Recall 4–20 (flexes higher on debt)” in config comment (`todays-path.ts:60`); floor/ceiling in `blocks.recallMinCards: 4` (`todays-path.ts:131`).
- (d) Below 5 due cards, no Recall block appears regardless of budget.

**4.** Review Mistakes reserved only when enough open mistakes exist (`todays-path.ts:476–477`).
- (b) `eligibility.mistakesMinOpen = 3` (`todays-path.ts:136`).
- (c) Avoids promising work that opens an empty Mistakes page (`todays-path.ts:465–467`, `authority.ts:833–836`).
- (d) With 0–2 open mistakes, no reserved mistake sessions (mid-day injector may still add one — `authority.ts:972–1018`).

**5.** Lessons require unlock + not mastered; delivered vs mastered are separate gates (`todays-path.ts:525–538`, `571–606`).
- (b) `mastered` excludes from planning; `delivered` routes to reinforcement path instead of new-lesson path.
- (c) Collapsing delivery into mastery made finished-but-unmastered lessons unreachable (`todays-path.ts:529–535`).
- (d) A learner who completes a lesson without mastery gets at most one revisit/day, not repeated “new” labeling.

**6.** Practice unlock gate (`authority.ts:1132`).
- (b) `practiceUnlockLessons = 3` completed lessons (`todays-path.ts:150`).
- (c) “Teach-before-test” (`todays-path.ts:508–509`).
- (d) Fewer completed lessons → no Practice in plan even if budget remains.

**7.** Diagnostic is onboarding-only, not a daily plan activity. Production diagnostic: **140 items**, **7×20** MST (`diagnostic-mst.ts:214–224`), FC-10 axis (`diagnostic-engine.ts:46`).

---

### B. Time budget and duration estimates

**8.** One plan minute = one budget slot (`todays-path.ts:31`, `TODAYS_PATH_CONFIG` comment).

**9.** Activity duration constants (`todays-path.ts:120–127`):

| Activity | Minutes | Formula / source |
|----------|---------|------------------|
| CARS Duel | **12** | Fixed |
| Lesson | **script `estimatedMinutes`** | Per candidate; nominal **20** used only for cap scaling |
| Practice | **2** per question | `costs.practicePerQuestion: 2` |
| Recall | **⅓** (~20 s) per card | `costs.recallPerCard: 1/3` |
| Review Mistakes | **2** per item | `costs.mistakePerItem: 2` |

**10.** Lesson cap scaling uses nominal 20 min, not actual durations (`todays-path.ts:316–318`).
- (b) Normal band: `ceil(budgetMinutes / costs.lesson)` new-lesson cap.
- (c) “FILL the whole budget with new lessons when available” (`todays-path.ts:316–317`).
- (d) On a 240-min day, up to **12** new lessons if candidates exist — actual reserved time depends on each lesson’s authored length (test: 57-min lesson consumes 57 min, `todays-path.test.ts:630–641`).

**11.** Recall due-minute estimate comes from client (`packages/recall-core/src/selection.ts:90`).
- (b) `estimatedMinutesForDue = round((due × secondsPerCard) / 60)`; default `DEFAULT_SECONDS_PER_CARD = 20` (`selection.ts:12`, `90`).
- (c) “Rough minutes to clear the due queue” (`selection.ts:20`); can use rolling learner `secondsPerCard` when provided (`selection.ts:42–46`).
- (d) Review-debt band uses this estimate vs budget; faster/slower actual review changes whether new lessons are throttled.

**12.** Daily preset bounds (`packages/contracts/src/todays-path.ts:20–26`).
- (b) Presets **120, 180, 240, 300, 360** min; min **120**, max **360**, default **240**.
- (c) “2 / 3 / 4 / 5 / 6 hours” (`todays-path.ts:19`).
- (d) Budget outside range clamped on set (`authority.ts:812–816`).

**13.** Carry-over cap (`todays-path.ts:88`, `145`).
- (b) `carryOverCapPct = 1.25`.
- (c) “today's total load <= this * preset” (`todays-path.ts:87–88`).
- (d) Heavy carry-over stops adding activities once 125% of preset reached.

**14.** Max non-lesson block length (`todays-path.ts:86`, `144`).
- (b) `maxActivityMinutes = 45`; practice split: `floor(45/2) = 22` questions max per block (`todays-path.ts:623–626`).
- (c) “No splittable workload block may exceed this; lesson scripts are atomic” (`todays-path.ts:85–86`).
- (d) Long practice days become multiple ≤45-min blocks; long lessons may exceed 45 min as single activities.

**15.** `freeStudyMinutes = max(0, dailyBudgetMinutes - plannedMinutes)` (`todays-path.ts:653`) — leftover when plan under-fills preset.

---

### C. Review-debt bands and recall sizing

**16.** Review debt ratio (`todays-path.ts:285`).
- (b) `debt = recall.estimatedMinutesForDue / budgetMinutes` (0 if budget 0).
- (c) “debt = recall due-minutes / daily budget” (`todays-path.ts:66–67`).
- (d) High recall backlog throttles new teaching.

**17.** Band thresholds (`todays-path.ts:139`, `67–70`):

| Band | Condition | Recall share of budget | Recall card ceiling |
|------|-----------|------------------------|---------------------|
| `normal` | debt &lt; **0.30** | **0.25** | **20** |
| `reduce_new` | **0.30** ≤ debt &lt; **0.50** | **0.40** | **40** |
| `pause_new` | debt ≥ **0.50** | **0.60** | **60** |

**18.** Recall card count (`todays-path.ts:339–341`).
- (b) `cards = min(clamp(round(share × budget / recallPerCard), recallMinCards, ceiling), due + newAvailable)`.
- (c) Ceiling “flexes higher on debt so the %-share is reachable” (`todays-path.ts:297–298`).
- (d) High debt can schedule up to 60 cards on a large budget if available.

**19.** New-lesson caps by band (`newLessonCapFor`, `todays-path.ts:309–318`):

| Band | New-lesson cap |
|------|----------------|
| `pause_new` | **0** |
| `reduce_new` | **2** (`newLessonCap`) |
| `normal` | **`ceil(budget / 20)`** |

- (c) Pause = “debt recovery: no new lessons today” (`todays-path.ts:314`).
- (d) `newLessonCapMax: 6` is **defined but unused** in code (`docs/todays-path-engine.md:154–155`).

---

### D. Lesson scoring (`scoreLesson`)

**20.** Composite score (`todays-path.ts:360–382`):

```
score = clamp01(examWeight × (0.5 + 0.5 × unlock) × coverageUrgency × masteryFactor)
```

**21.** Section exam weights (`todays-path.ts:147–148`).
- (b) `{ bb: 1.0, cp: 0.92, ps: 0.85, cars: 0.8 }`, `defaultExamWeight: 0.7`.
- (c) “Provisional per-section exam weight (blueprint proxy)” (`todays-path.ts:91–92`).
- (d) BB-tagged lessons score higher all else equal.

**22.** Unlock / leverage term (`todays-path.ts:370–373`).
- (b) With prerequisite graph: `clamp01(dependentsCount / 4)`; without graph: `clamp01(kcCount / 6)`.
- (c) “A real graph's zero is meaningful: a leaf unlocks nothing” (`todays-path.ts:368–369`).
- (d) Leaf lessons in a real graph score lower than high-fan-out lessons.

**23.** Coverage urgency (`todays-path.ts:375–376`).
- (b) `pressure = totalDays !== null ? clamp01(dayNumber / totalDays) : 0.3`; `coverageUrgency = (covered ? 0.4 : 1.0) × (0.6 + 0.4 × pressure)`.
- (c) “uncovered clusters climb as test day nears” (`todays-path.ts:374–375`).
- (d) Without test date, pressure fixed at **0.3** → multiplier **0.72** for uncovered, **0.288** for covered clusters.

**24.** Mastery / learning-need factor (`todays-path.ts:377–381`).
- (b) `pL = clamp01(lesson.pL ?? PRIOR_PL0)` with `PRIOR_PL0 = 0.2`; `masteryFactor = 1 - masteryWeight + masteryWeight × (1 - pL)` where `masteryWeight = 0.7`.
- (c) “Lower P(L) means more learning need… unknown mastery falls back to P(L)_0” (`todays-path.ts:377–379`); `masteryWeight` raised so need can outrank KC-count proxy (`todays-path.test.ts:665–691`).
- (d) `masteryFactor` range **[0.3, 1.0]**; lower `pL` → higher score.

**25.** Same-cluster picking does **not** apply `perRepeatDecay` (`todays-path.ts:536–567`, `docs/todays-path-engine.md:141–149`).
- (b) `perRepeatDecay: 0.8` exists in config (`todays-path.ts:146`) but is **never read**.
- (c) Comment says “Same-cluster picks diminish via coverage” (`todays-path.ts:527`) — only affects `priorityReason` label (`COVERAGE_GAP` vs `NEW_LEARNING`), not score.
- (d) Multiple lessons same cluster/day are not score-penalized beyond first pick’s cluster tracking.

**26.** `coveragePct` in snapshot is **not read** by `buildTodaysPath` (`docs/todays-path-engine.md:131–134`) — no phase tilt implemented.

---

### E. Variety / interleaving (`orderActivities`, `maxSpread`)

**27.** Recall always first when present (`todays-path.ts:781–788`).

**28.** Zero-adjacency when feasible (`interleaveNoAdjacent`, `todays-path.ts:702–724`).
- (b) Greedy: always pick fullest kind ≠ last placed; tie-break rank: recall **0**, lesson **1**, cars_duel **2**, review_mistakes **3**, practice **4** (`todays-path.ts:682–687`).
- (c) “Reaches ZERO same-kind adjacency whenever no kind holds more than half the set (+1)” (`todays-path.ts:703–705`).
- (d) When achievable, no back-to-back same kind.

**29.** Forced-run floor when one kind dominates (`maxSpread`, `todays-path.ts:739–767`).
- (b) With `d` dominant items and `o` others: longest run ≥ **`ceil(d / (o + 1))`**; algorithm chunks dominant kind evenly across gaps (`todays-path.ts:733–736`, `757–766`).
- (c) “Variety no longer depends on a Review-Mistakes session” (`todays-path.ts:736–737`); replaces old ~**10**-long runs (`todays-path.test.ts:179–184`).
- (d) Worst-case same-kind run over budget sweep ≤ **4** (`todays-path.test.ts:212–213`); e.g. 12 lessons + 2 CARS → max run **4** (`todays-path.test.ts:164–176`).

**30.** CARS placement (`placeCars`, `todays-path.ts:796–818`).
- (b) 1 duel → target index `round(n/2)`; 2 duels → `round(n/3)`, `round(2n/3)`; swaps only if no same-kind adjacency created.
- (c) “CARS is placed ~middle (1) or ~1/3 and ~2/3 (2)” (`todays-path.ts:778–779`).
- (d) CARS breaks up mid-day without lengthening same-kind runs.

---

### F. Practice planning vs practice selection

**31.** Plan-level practice sizing (`todays-path.ts:612–615`).
- (b) `practiceQs = floor(remaining / 2)` when unlocked.
- (c) Comments say “Practice FILLS the remaining budget” and “sized to real review need” in places (`todays-path.ts:508–509`, `authority.ts:1130–1131`) — **engine uses budget fill only**.
- (d) `practiceReviewNeed` (count of taught KCs with `pL < 0.95`) is computed in authority (`authority.ts:1133–1139`) but **never read** in `buildTodaysPath`.

**32.** Dead plan config keys (`todays-path.ts:128–134`, `143–151`): `practiceMinQ: 6`, `practiceMaxQ: 24`, `practiceMaxQHard: 90`, `questionsPerReviewKc: 2` — **not referenced** in engine (`docs/todays-path-engine.md:156–159`).

**33.** `pickPracticeFocus` returns `null` always (`todays-path.ts:675–678`) — whole-exam practice, no weakness focus in plan.

**34.** Session-level practice selection uses separate policy (`practice-selection.ts`).

**35.** Priority score for science units (`practice-selection.ts:195–214`):
- (b) `weakness = clamp(1 - (0.6×plKc + 0.4×plSkill), 0, 1)`; `priority = max(0, weakness × examWeight × urgency + explore + coverage - recency)`.
- (c) Coefficients “provisional defaults… meant to be refit from data” (`practice-selection.ts:16–17`).
- (d) Weaker KCs/skills get more training slots.

**36.** Urgency term (`practice-selection.ts:208–209`).
- (b) `urgency = 1 + urgencyLambda × min(overdueDays, 30)/30` with `urgencyLambda = 1.0`.
- (c) no stated rationale beyond formula comment.
- (d) Overdue review KCs get up to **2×** urgency multiplier.

**37.** Explore / coverage / recency bonuses (`practice-selection.ts:141–155`).
- (b) `exploreBonus = 0.15`, `coverageBonus = 0.1`, `recencyPenalty = 0.2`.
- (c) no stated rationale.
- (d) Never-practised and uncovered clusters get additive boosts.

**38.** Slot allocation (`allocateSlots`, `practice-selection.ts:254–293`).
- (b) CARS share = `round((carsMass/totalMass) × x)` but never all **x** if science exists; science split: `repair ≤ floor(scienceBudget × 0.3)`, `probe ≤ round(scienceBudget × 0.1)`, remainder `train`.
- (c) “repairs are capped and probes take a small fixed fraction” (`practice-selection.ts:251–252`).
- (d) At most **30%** science slots go to repair; **10%** to probes.

**39.** Target success rates via logit offsets (`practice-selection.ts:133–155`, `232–240`).
- (b) `logitTrain = 1.3863` (~**80%**), `logitProbe = 0.2007` (~**55%**), `logitRepair = 1.7346` (~**85%**); band width **0.5** in b-space; `center = theta - offset`.
- (c) “Train aims easier (~80%), probe ~55%, repair ~85%” (`practice-selection.ts:133–134`, `229–230`).
- (d) Repair items target easiest success band.

**40.** Ability from P(L) (`practice-selection.ts:181–184`, `316`).
- (b) `theta = clamp(log(p/(1-p)), -4, 4)`; blended `0.6×plKc + 0.4×plSkill` for science.
- (c) no stated rationale for 0.6/0.4 blend.
- (d) Saturated P(L) does not explode difficulty targeting.

**41.** Repair queue (`authority.ts:2777–2784`, `practice.ts:527–550`).
- (b) First unassisted miss on science practice queues repair; `recentMisses` dedupes by KC, limit **20** (`authority.ts:2563`); one miss per KC in queue.
- (c) “a recent miss is the most actionable evidence” (`practice-selection.ts:318`).
- (d) Recent misses consume repair slot budget before train/probe.

**42.** Practice queue hard cap (`authority.ts:2544`).
- (b) `requested = min(floor(x), 50)`.
- (c) no stated rationale.
- (d) Single session never exceeds 50 items from authority.

**43.** Mid-day mistake injection (`authority.ts:972–1018`).
- (b) Threshold **5** open mistakes; max sessions **2** or **3** (long budget); bumps last ready activity to `snoozed`.
- (c) “Pile-ups later in the day are caught by the authority's mid-day injector” (`todays-path.ts:468–469`).
- (d) Extra mistake sessions can appear beyond morning plan.

---

### G. Mastery definitions (two coexisting systems)

**44.** BKT capability cut (`bkt.ts:49–50`, `181–182`).
- (b) `MASTERY_THRESHOLD = 0.95`; `isAtCapabilityCut: pL >= 0.95`.
- (c) “Mastered when P(L) >= 0.95 (Corbett & Anderson)” (`bkt.ts:49`).
- (d) Planner “weak KC” for `practiceReviewNeed` uses this cut (`authority.ts:1138`).

**45.** Lesson mastery claim (`lesson-rollup.ts:93`, `234–247`).
- (b) `mastered = every required KC: isAtCapabilityCut(pL) AND evidenceSufficient`; warrant min tier **`independent`** (`MASTERY_WARRANT_MIN_TIER`).
- (c) “P(L) >= 0.95 says capability is high; it says nothing about whether that estimate is warranted” (`bkt.ts:167–171`); requiring `retained`/`strong` would be unreachable (no delayed evidence producer) (`lesson-rollup.ts:90–91`).
- (d) High P(L) alone does not exclude lessons from plan if warrant missing.

**46.** BKT update constants (`bkt.ts:44–50`, `109–114`).
- (b) `PRIOR_PL0 = 0.2`, `LEARN_RATE_T = 0.15`, `GUESS_G = 0.25`, learning nudge on both outcomes (`bkt.ts:157–158`).
- (c) Prior “low = conservative, fail-closed” (`bkt.ts:43`); constants “provisional… to be refit” (`bkt.ts:17–19`).
- (d) Faster/slower learning changes items-to-threshold.

**47.** Lesson-exit guess discount (`bkt.ts:84`, `96–100`).
- (b) `LESSON_EXIT_GUESS_G = 0.5` vs practice `0.25` — one correct exit = half the LR of practice (`bkt.ts:66–72`).
- (c) Long rationale: raised guess vs cap (`bkt.ts:52–83`).
- (d) Lesson-channel evidence moves P(L) more slowly than practice.

**48.** Evidence recipe ladder (`mastery-policy.ts:70–114`):

| Recipe name | Target tier | Key slot requirements |
|-------------|-------------|------------------------|
| `independent` | independent | independent ≥ **2** families |
| `independent_corroborated_by_transfer` | independent | + transfer ≥ **2** families, **2** change dimensions |
| `retained` | retained | + delayed ≥ **1** family, **48 h** delay; + mixed ≥ **1** |
| `strong` | strong | + integrated_passage, timed, protected ≥ **1** each |

Freshness: **45** days general, **21** days strong kinds (`mastery-policy.ts:71–72`).

---

### H. Forgetting / decay (BKT-side)

**49.** BKT memory decay (`forgetting.ts:18–23`, `61–63`).
- (b) `P_decayed = P × 2^(-elapsedDays / H)`; `INITIAL_HALF_LIFE = 7` days; `REVIEW_LINE = 0.9`; successful due review doubles H (`HALF_LIFE_GROWTH = 2`); failed due review resets H to **7**.
- (c) “Lazy decay from lastPracticedAt” (`forgetting.ts:5–7`); due review when decayed P(L) &lt; **0.9** (`forgetting.ts:9–10`).
- (d) Longer gaps reduce displayed P(L) and trigger due-review handling on next practice.

**50.** Prerequisite reinforcement (`prerequisite.ts:18–27`, `38–50`).
- (b) On correct dependent practice: `P(L)_A += (1-P(L)_A)×(w×T)` with `w = 0.5`, `T = 0.15`; `H_A ×= (1+w)`.
- (c) “1-hop prerequisite reinforcement” (`prerequisite.ts:4–8`); inert until graph loaded.
- (d) Indirect boost to prereq KCs without direct items.

---

### I. Spaced repetition (Recall / FSRS-side — separate from BKT)

**51.** Recall uses FSRS-6 via `ts-fsrs` (`packages/recall-core/src/fsrs.ts:1–7`), not the legacy `packages/policies/src/fsrs.ts` (FSRS-4.5 manifest).

**52.** FSRS-6 parameters (`recall-core/src/fsrs.ts:21–32`).
- (b) `RECALL_DESIRED_RETENTION = 0.9`; learning steps **`1m`, `10m`**; relearning **`10m`**; `enable_fuzz: false`; `enable_short_term: true`.
- (c) “Config locked to the plan” (`fsrs.ts:4–5`); “Only Again is a lapse” (`fsrs.ts:5–6`, `116`).
- (d) Lower retention target → shorter intervals; Hard/Good/Easy do not count as lapses.

**53.** Leech handling (`recall-core/src/leech.ts:11–22`, `fsrs.ts:24`).
- (b) `RECALL_LEECH_THRESHOLD = 8` lapses → auto-suspend + tag `leech`.
- (c) “A card that keeps lapsing wastes review time” (`leech.ts:2–4`).
- (d) Chronic failures removed from due queue until unsuspended.

**54.** Card selection priority (`recall-core/src/selection.ts:3–8`, `59–67`).
- (b) Order: due learning/relearning → due reviews (most overdue first) → new cards.
- (c) “Never returns not-yet-due reviews early” (`selection.ts:7–8`).
- (d) New cards only after due queue in unlimited mode.

**Two decay models coexist:** BKT half-life on KC/skill grains (`forgetting.ts`); FSRS stability/retrievability on flashcard grains (`recall-core/src/fsrs.ts:110–112`). The daily planner reads Recall load from FSRS due counts, not BKT decay.

---

### J. IRT / difficulty (practice & BKT slip)

**55.** Cold-start difficulty from DOK (`irt.ts:37–50`).
- (b) DOK 1→**-1.0**, 2→**-0.3**, 3→**0.4**, 4→**1.0**, ≥5→**1.4**, unknown→**0**.
- (c) “Uncalibrated proxy” until enough attempts (`irt.ts:6–7`).
- (d) New items behave as if author-labeled difficulty until **20** attempts.

**56.** Calibrated difficulty (`irt.ts:17`, `66–72`).
- (b) `MIN_ATTEMPTS_FOR_B = 20`; `p` clamped to **[0.02, 0.98]**; `b = ln((1-p)/p)`.
- (c) no stated rationale for 20 attempts.
- (d) Item b stabilizes after population data accumulates.

**57.** Slip formula (`irt.ts:12–15`, `79–82`).
- (b) `SLIP_ANCHOR_M = 1.7`, `MAX_SLIP_SM = 0.1`; `slip = S_m / (1 + exp(m - b))`.
- (c) “Slip difficulty anchor = the mastery cut (85% rule)” (`irt.ts:12`).
- (d) Harder items contribute more slip in BKT updates.

---

### K. Diagnostic → plan handoff

**58.** Production diagnostic axis (`diagnostic-engine.ts:46`).
- (b) **`FC_AXIS`** — **10** AAMC Foundational Concepts; reasoning/CARS bank items out of scope for this diagnostic (`diagnostic-engine.ts:41–44`).
- (c) “FC leverage is nearly flat, so ordering is driven by severity rather than unlock weight” (`diagnostic-engine.ts:42–44`).
- (d) Reported priorities are FC buckets, not 15 skill clusters.

**59.** Diagnostic form length (`diagnostic-mst.ts:214–224`, `diagnostic-engine.ts:104–108`).
- (b) **`MST_140_RECOMMENDED`**: **7** stages × **20** items = **140** total; **3** modules/stage; contention allocation; `minItemsPerBucket: 8`.
- (c) Extensive comment block on sweep tradeoffs (`diagnostic-mst.ts:200–213`).
- (d) Fixed-length form (not adaptive early-stop in delivered MST path).

**60.** Bayesian scoring constants (`diagnostic-bayes.ts:401–409`).
- (b) Grid **41** points on θ ∈ **[−4, 4]**; prior N(0,1); `DISCRIMINATION = 1.5`, `GUESSING = 0.25`; DOK difficulties **{1:-1, 2:0, 3:1, 4:1.8}**; stop config includes `minItems: 30`, `maxItems: 60`, `stabilityWindow: 8`, `stopConfidence: 70` — used in bayes path, **not** in fixed MST delivery.
- (c) “CALIBRATION STATUS — IMPORTANT: … UNCALIBRATED prior” (`diagnostic-bayes.ts:26–31`).
- (d) EIG selection accuracy depends on future calibration.

**61.** Reported priorities (`diagnostic.ts:333`, `471`).
- (b) `REPORTED_PRIORITY_COUNT = 2`; filter `certainty >= 0.5 && gap >= 0.35`; rank `leverage = gap × (1 + UNLOCK_STRENGTH × unlockWeight)` with `UNLOCK_STRENGTH = 1`.
- (c) Long comment on reproducibility vs genericity trade (`diagnostic.ts:272–301`); third slot fails retest reproducibility (`diagnostic.ts:321–327`).
- (d) Learner sees 2 starting areas, not 3.

**62.** Hand-tuned unlock weights (active in legacy diagnostic ranking) (`diagnostic.ts:245–261`).
- (b) e.g. R1 **1.0**, R2 **0.9**, R3 **0.8**, CP3 **0.5**, … CA2 **0.15**.
- (c) “Hand-tuned… stand-in for the real prerequisite graph”; generated table **NOT wired** (`diagnostic.ts:233–243`, `unlock-weights.generated.ts:9–14`).
- (d) Switching to generated weights would reorder diagnostics once graph dense enough.

**63.** Mastery seed from diagnostic (`mastery-seed.ts:17–19`, `37–49`, `115–116`, `206–211`).
- (b) `SEED_PRIOR_FLOOR = 0.05`, `SEED_PRIOR_CAP = 0.4`; asymmetric: weak reads pull below **0.2**, strong reads raise toward cap; `attenuateCertainty = certainty / sqrt(units)`.
- (c) “Modelling choice, not measured… conservative direction — under-crediting” (`mastery-seed.ts:111–113`); “first few real attempts overwhelm” imperfect read (`mastery-seed.ts:173–175`).
- (d) Seed moves starting P(L) slightly; cannot set mastery.

**64.** Seed grain (`diagnostic-engine.ts:213–222`, `mastery-seed.ts:241–253`).
- (b) Production emits **`kcPriors` only** via `kcSeedsFromDiagnostic` + `kcsByFc(orderedKcsForLesson)`; duplicate KC takes **min** prior.
- (c) Lesson-grain seeds previously no-op’d (`mastery-seed.ts:231–235`); lesson has no stored P(L) (`lesson-rollup.ts:4–7`).
- (d) Planner reads **lesson rollup pL** (mean of member KCs), not raw seed per lesson id.

**65.** Seed application (`authority.ts:2462–2481`).
- (b) Only initializes **unpracticed** KC states; re-clamps to **[0.05, 0.4]**; corroboration required.
- (c) “Last point at which… enforced” (`authority.ts:2437–2440`).
- (d) Practiced KCs ignore seed.

**66.** Seed efficacy analysis (`mastery-seed-value.ts`).
- (b) Documents analytic/simulation machinery; notes seed band often &lt; **1 item** of evidence vs BKT threshold (`mastery-seed-value.ts:787–789` region).
- (c) “Checkable” claim that seed shortens path to decision (`mastery-seed-value.ts:28–32`).
- (d) Empirical no-op vs weak signal distinguished by AUC tooling — not runtime behavior.

**67.** In-process authority diagnostic stub (`authority.ts:558`, `632–642`).
- (b) **`DIAGNOSTIC_PROBE_IDS = ['q-enz-basics-1']`** — single probe, not full engine.
- (c) no stated rationale in stub itself.
- (d) Dev/tests using in-process authority do not exercise production diagnostic→seed pipeline unless separately wired.

**68.** Diagnostic does **not** directly enqueue plan activities — influence is indirect via **KC priors → lesson pL → scoreLesson** and onboarding flow.

---

### L. Capacity, pacing, study-duration assumptions

**69.** Capacity classification (`planner.ts:16–35`, `authority.ts:702–707`).
- (b) Default `minutesPerWeek` **300** if unset; `requiredP50Minutes: 1800`, `requiredP80Minutes: 2600`, `disruptionBuffer: 0.1`; labels: `on_track` / `tight` / `goal_plan_mismatch` / `rolling`.
- (c) “Capacity classification (P50/P80 + buffer)” (`planner.ts:8`).
- (d) Display-only capacity label on Today view; does not block plan activities.

**70.** Ghost pacing companion (`ghost.ts:43–44`, `68–82`).
- (b) Idle if `lastActiveDaysAgo >= 2`; scheduled pace: expected coverage = `dayNumber/totalDays`; ahead/on_track/behind bands ± **`0.05`** coverage.
- (c) “Never invents peer comparisons… never blocks learning” (`ghost.ts:6–9`).
- (d) Messaging only; no schedule mutation.

**71.** Coverage metric for planner (`authority.ts:718–723`).
- (b) `coveragePct = clustersWithEvidence / SKILL_CLUSTERS.length` (**15** clusters).
- (c) Used for ghost and snapshot field; **not** used inside `buildTodaysPath` scoring.
- (d) Changing cluster count changes percentage denominator.

**72.** Runway / curriculum hours model (`diagnostic-value.ts:46–49`).
- (b) `contentHours: 114` (~114 lessons × ~1 hr); diagnostic item cost **95 s**/item; headline runways **40, 90, 120, 300** hours.
- (c) “First-pass lesson coverage is about 114 hours” (`diagnostic-value.ts:13–14`).
- (d) Used in diagnostic value simulation, not daily minute allocation.

**73.** Plan date rollover (`authority.ts:793–795`).
- (b) Local midnight minus **4 hours**.
- (c) no stated rationale.
- (d) Study after midnight before 4 AM counts as previous plan day.

**74.** Default weekly minutes when setting daily budget (`authority.ts:822`).
- (b) `minutesPerWeek = clamped × 7`.
- (c) no stated rationale.
- (d) Setting 240 min/day → 1680 min/week stored.

---

## Granularity map

| Grain | Count (canonical) | Where stored / used | Planner operates on |
|-------|-------------------|---------------------|---------------------|
| Knowledge components (KCs) | **422** (`atlas-region-groups.json:7`, `curriculum/v3/README.md`) | BKT `state.mastery.kc`; evidence warrants | **Indirectly** — lesson rollup mean pL; practice selection; `practiceReviewNeed` counts weak **taught KCs** |
| Lessons | **114** (`atlas-region-groups.json:6`) | Delivery (`completedLessons`); candidate list from client | **Primary** — plan schedules `lesson` activities by `lessonId`/slug |
| Skill clusters | **15** (`vocab.ts:12–29`) | Lesson tags; diagnostic legacy axis; coveragePct denominator | **Input feature** — `cluster` on candidates affects `covered` flag & scoring context |
| AAMC Foundational Concepts | **10** (`diagnostic-axis-fc.ts:56`) | Production diagnostic axis; KC seed partitioning | **Diagnostic only** — not planner partition |
| Reasoning operations | **7** (`vocab.ts:90–98`) | BKT skill grain; practice specs | **Practice selection**, not daily activity list |
| CARS sub-skills | **3** (implied by `carsExamWeight: SECTION_WEIGHT/3`, `practice-selection.ts:174–175`) | CARS IRT `V` | CARS Duel activity + practice probes |

**Planner operating grain:** **Lessons** (activities) with **KC-derived** mastery signals and **cluster**-level coverage flags. Flashcards (Recall) are a separate FSRS grain. Diagnostic seeds **KCs**, surfaced to planner as **per-lesson rollup pL**.

---

## Known conflicts, TODOs, and self-flagged weaknesses

| Issue | Evidence |
|-------|----------|
| **Practice sized to review need (documented) vs budget-fill (implemented)** | `authority.ts:1130–1131` computes `practiceReviewNeed`; `buildTodaysPath` uses `floor(remaining/2)` only (`todays-path.ts:612–615`); confirmed in `docs/todays-path-engine.md:82`, `136–139`, `161–163` |
| **Unused config constants** | `perRepeatDecay`, `questionsPerReviewKc`, `practiceMaxQHard`, `practiceMinQ`/`practiceMaxQ`, `newLessonCapMax` — present, not read (`docs/todays-path-engine.md:141–159`) |
| **Phase tilt / coveragePct** | Snapshot field never consumed by engine (`docs/todays-path-engine.md:131–134`) |
| **Same-cluster diminishing returns** | Comment claims decay; only `coveredNow` tracking (`todays-path.ts:527`) |
| **Two mastery definitions** | `pL >= 0.95` vs `independent` warrant rollup (`bkt.ts` vs `lesson-rollup.ts`) — explicitly documented as non-redundant |
| **Two FSRS implementations** | `packages/policies/src/fsrs.ts` (4.5) vs `recall-core` (6 via ts-fsrs) — Recall uses latter |
| **Two decay models** | BKT half-life on skills/KCs; FSRS on cards — both active in planner inputs |
| **Unlock weights: hand-tuned vs generated** | Generated table deliberately not adopted (`diagnostic.ts:233–243`) |
| **Diagnostic calibration** | “UNCALIBRATED DOK-derived priors” (`diagnostic-bayes.ts:26–31`, `DIAGNOSTIC_MANIFEST` in `diagnostic.ts:17–18`) |
| **Seed may be weak/no-op** | `mastery-seed-value.ts` simulation; attenuation across many KCs; prior band &lt; 1 item evidence; lesson-grain seed historically no-op (`mastery-seed.ts:231–235`) |
| **Authority diagnostic stub vs production** | Single-question probe (`authority.ts:558`) vs 140-item MST (`diagnostic-engine.ts`) |
| **App-native lessons write no mastery** | `docs/todays-path-engine.md:27–38` — planner unlocks practice on **delivery**, mastery stays at prior |
| **Policy versions provisional** | `TODAYS_PATH_MANIFEST.status: provisional_active` (`todays-path.ts:22–23`); BKT, practice-selection, FSRS manifests similar |
| **Shadow smart stop not wired** | `shadowSmartStop` in `diagnostic.ts:544–548` |
| **Retained/strong evidence recipes unreachable** | No delayed-evidence producer (`lesson-rollup.ts:90–91`; `key-docs/roadmap-todo.md`) |

---

## What I could not determine from the code

1. **Exact distribution of lesson `estimatedMinutes`** across the 114-lesson catalog (only that nominal 20 is not used for reservation; examples 12–57 appear in tests/docs).
2. **Production Postgres path** for diagnostic completion and automatic `applyMasterySeed` timing relative to first `buildTodaysPath` (client mutation exists in `apps/learner-web/src/app/queries.ts:184`; lambda flow not fully traced).
3. **Whether `secondsPerCard` rolling estimate** is passed from client in all builds or always defaults to 20s for debt calculation.
4. **Empirical FSRS parameter refit gate** (“>= 400 graded reviews”) — referenced in `packages/policies/src/fsrs.ts:9` for policies copy; recall-core wrapper does not enforce it locally.
5. **Live prerequisite graph** completeness for `dependentsCount` on app-native catalog — planner supports null → KC-count fallback (`todays-path.ts:370–373`).
6. **Quantitative outcomes** of seed AUC / items-to-mastery simulations (machinery exists in `mastery-seed-value.ts`; results not embedded as constants).

---

*Audit generated from codebase state read July 29, 2026. Numeric values are as literal in source unless marked [derived].*
