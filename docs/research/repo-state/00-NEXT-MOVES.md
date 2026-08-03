# Highest-leverage next moves

Derived from a four-lane audit of the repo on 2026-07-29. Supporting detail:

| Lane | File |
|---|---|
| Frontend and user journeys | `A-frontend-and-journeys.md` |
| Backend, persistence, deployment | `B-backend-and-persistence.md` |
| Content and item bank | `C-content-and-item-bank.md` |
| Engineering health and owed work | `D-engineering-health.md` |
| Daily planner design inventory | `../daily-planner-efficacy/01-planner-design-audit.md` |

---

## The one-paragraph diagnosis

The algorithmic layer is the most developed part of this system and the least
load-bearing right now. There is a calibrated-by-simulation 140-item MST diagnostic, a
BKT mastery model with a decay layer, FSRS-6 spaced repetition, a leverage-weighted
planner, and 1,554 passing tests around them — sitting on **15 playable lessons out of
114**, **zero calibrated items**, and a **deployed environment that cannot record a
completed activity**. Every remaining item on this list is an instance of the same
pattern: the engine is further ahead than the things it needs in order to run.

The ordering principle below is therefore not "what is most broken" but **what unblocks
the most other work per hour spent**.

---

## Tier 0 — the deployed loop does not close (do first)

These are small, high-certainty, and they gate everything a real user would do.

### 1. Register `todaysPathActivity` in the deployed route table — ~1–2 h

`packages/contracts/src/http.ts:94` declares it, `client-core` calls it, the dev shim at
`apps/learner-web/server/authority-api.ts:215` serves it, and
`services/lambdas/learner-api/src/routes.ts` **does not list it**. In the deployed
environment a learner can fetch a daily plan and cannot mark anything complete.

The cascade is what makes this Tier 0 rather than a papercut. `recordPlanActivity` appends
to `completedLessons`; the next plan build folds those KCs into `taughtKcIds`
(`authority.ts:1097-1102`); `taughtKcIds` at `practiceUnlockLessons: 3` is what unlocks
Practice and scopes its teach-before-test filter. With the write missing, **Practice can
never unlock in deployment**, however much a learner studies. Everything downstream —
attempts, mastery, mistakes, any response data for calibration — is behind this one route.

### 2. Give the deployed study loop the real question bank — ~8–16 h

`services/lambdas/learner-api/src/lambda.ts:195` constructs `new Authority(undefined,
systemClock)`, which defaults to `loadSyntheticBank()` — a 7-question enzyme-inhibition
fixture — and passes it as `bank` at line 202, while line 205 hands adaptive practice a
real `createPostgresPracticeBankPort(pool)`. So in deployment, practice draws on 2,108
real items and study draws on 7 fake ones.

### 3. Ship migration `0013` and add practice-table grants to the migration lambda — ~2–3 h

Operational blocker for the practice gate on a multi-instance deploy; fails closed today
(`D`, owed-work item).

**Tier 0 total: roughly 11–21 hours, and it is the difference between a deployed demo and
a deployed product.**

---

## Tier 1 — close the evidence loop (the highest-value real work)

Nothing about mastery, calibration, or the efficiency claim is measurable until learner
actions produce durable evidence.

### 4. Make app-native lesson completion write evidence — ~16–24 h

All 14 playable app-native lessons grade in the browser via `LessonRenderer.tsx` and
persist to `localStorage`; `Lesson.tsx` never passes `onIndependentMiss`. Completion sends
only `POST /v1/plan/today/activity`, which records delivery and no evidence.
`key-docs/roadmap-todo.md:244-269` documents this forensically, including a run where
`getMasteryLessons` returns `[]` before and after, and all seven skills sit at the raw
`pL: 0.2` prior.

Consequences today: Progress and the Evidence Atlas never move; Practice can still say
"Start with a lesson" immediately after one is finished, because `taughtKcIds` refreshes
only on plan build.

**Scope honestly.** This mints evidence for 14 lessons. It is Tier 1 because it makes the
architecture true and unblocks measurement, not because it moves many learners.

### 5. Refresh `taughtKcIds` on lesson completion rather than only on plan build — ~4–6 h

Removes the "I just finished a lesson and Practice says I haven't" dead end. Cheap, and
directly user-visible.

### 6. Instrument decision logging with propensities before any real cohort — ~16–24 h

From `../effectiveness-eval/02-off-policy-evaluation-and-instrumentation.md`: replace the
top-level `argmax` in Today's Path and practice selection with tolerance-band sampling and
log candidate set, per-candidate probability, chosen propensity, seed, policy version, and
the decision-time state snapshot.

This sits in Tier 1 because it is the **only irreversible item on this list**. Off-policy
evaluation is unidentified — not noisy, unidentified — on logs from a deterministic policy,
and the suboptimality bound survives infinite data. A deterministic launch cohort is a zero
sample of the counterfactual, permanently. Every other item here can be retrofitted.

---

## Tier 2 — content is the actual product constraint

### 7. Decide the content strategy — a decision, not a task

`content/lessons/` holds **one** authored lesson. Two more live in an out-of-repo sibling
(`research/mcat-curriculum-architecture-v3`), which is why 6 CI tests fail on every clone.
Add 14 app-native pilots and the product is **~13% authored**.

Three coherent options, and this needs a human:

- **Narrow the product** to the ~15 lessons that exist and market it as a focused tool.
  Cheapest, honest, and testable now.
- **Restart the generation pipeline.** A hybrid loop produced lessons earlier in this
  repo's history; if it still works, the gap is weeks rather than months.
- **Ship the shell and author against demand,** using the diagnostic to decide authoring
  order. Highest risk of a learner hitting "Coming soon" on their top priority.

Nothing else in Tier 2 or 3 matters much until this is chosen.

### 8. Vendor the two out-of-repo V3 lessons — ~2–4 h

Unblocks 6 of the 7 CI failures and makes a fresh clone verifiable. Requires access to the
sibling directory, which is not on this machine.

### 9. Fix CARS structurally, not just proportionally — ~60–120 h

160 CARS items across 91 passages, **median 1 item per passage** (max 8). Real MCAT CARS is
9 passages × 5–7 questions. One-question passages train a different task than the exam
tests, so the current CARS content does not practise CARS. Share is also 7.6% against ~23%
of the exam.

The generation pipeline in `packages/cars-generation` was built to produce passage *sets*
and already emits 3 fixture sets of 16 items — visible only at `/cars-preview`, never
reaching the learner bank. **Integrating that pipeline (~24–40 h) is the cheaper path to
the same outcome** and should be tried before hand-authoring.

### 10. De-duplicate the bank — ~4–8 h

45 duplicate stem groups covering 98 items, 4.6% of the bank. A learner sees the same
question twice, which reads as an engine bug, and it splits response data across two IDs
for one item — poisoning calibration before it starts.

### 11. Publish the bank to git with validation in CI — ~16–24 h

All 2,108 questions live in a gitignored local pull. CI cannot see them, a new engineer
cannot run the product meaningfully, and nothing about the bank is reproducible. Automating
`pnpm db:pull` (~4–6 h) is the minimum viable version.

---

## Tier 3 — stop claiming what the code cannot support

### 12. Remove unearned precision from the UI — ~4–8 h

`BucketGapChart` renders percentages and confidence whiskers; Progress shows continuous
mastery. Every item's difficulty is a DOK-derived cold-start value, there are **zero**
empirical `b` parameters, **zero** response data, and 2,108 singleton `family_id`s — so no
inheritance path either. The numbers on screen are more precise than anything behind them.

### 13. Reconcile the two mastery definitions in the docs — ~1–2 h

`docs/mastery-pipeline.md:20,38` says `P(L) ≥ 0.95` *replaces* the evidence ladder;
`:129+`, the lesson-evidence contract, and `mastery-definition-single-source.test.ts`
enforce a *composed* definition. A teammate reading the TL;DR implements the wrong model.
Highest-value doc fix in the repo.

### 14. Stop presenting variety-of-activity-type as interleaving — ~1 h

Per `../daily-planner-efficacy/02-mechanism-evidence.md`, there is no literature on varying
activity *type*; interleaving research concerns topics and is *negative* (g = −0.39) for
some material. Present it as a UX comfort feature, which is an honest thing for it to be.

### 15. Discount self-reported availability — ~2–4 h

Learners overestimate available study time by ≈45%. Plan setup takes typed weekly hours at
face value, so every plan is overbuilt. Small change, real evidence.

### 16. Close the practice-sizing gap — ~4–8 h

`practiceReviewNeed` is computed in the authority, passed into the snapshot, asserted in
tests, and never read by `buildTodaysPath`, which serves `floor(remaining_minutes / 2)`
(`todays-path.ts:612-615`). Either wire it or stop describing the planner as allocating
effort adaptively.

---

## Deliberately not recommended

- **A contextual bandit, high-confidence OPE, switchback designs, or an A/B platform.**
  Each needs 10²–10⁶× a launch cohort. The A/B framework is the most retrofittable thing on
  the list and the one teams build first.
- **Prerequisite-graph sequencing as a differentiator.** 0.448 KC→KC edges per KC, 256
  components, 212 isolated KCs under hard prerequisites — and ALEKS, the flagship
  implementation of the idea, measures g = 0.05.
- **Re-tuning planner scoring weights.** They are self-described as provisional and there
  is no response data to fit them against. Fitting noise is worse than leaving defaults.
- **Implementing the empty projection worker** (~16–40 h) until something needs a rebuildable
  read model.

---

## If only one week is available

Tier 0 in full (11–21 h), items 5 and 10 (8–14 h), item 13 (1–2 h), and a decision on item
7. That yields a deployed product whose core loop closes, no duplicate questions, no
lesson→practice dead end, docs that do not mislead, and an explicit content plan — in
roughly 25–40 hours of work.

Item 6 (propensity logging) should be scheduled before the first real cohort regardless of
what else slips, because it is the only item whose absence cannot be repaired later.
