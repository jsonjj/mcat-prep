# Review Mistakes — repair runner (implementation plan)

**Status:** NOT built. Today's Path schedules a "Review Mistakes" slot (reserved
once `open >= eligibility.mistakesMinOpen`, injected mid-day on a pile-up) whose
"Start" opens the Mistakes page (`/app/mistakes`), where each miss offers a fresh
re-attempt through the ordinary practice queue. This document specifies what the
real **guided repair runner** should do so the slot can light up later without
changing Today's Path.

Source specs: `MCAT_TODAYS_PATH_PLAN.md` §3/§6, `MCAT_APP_DESIGN_DECISIONS.md` §4
(the review flow) and §5 (Mistakes as a pattern dashboard), `MCAT_APP_LEARNING_FLOW_PLAN.md`
§5.3 (feedback & remediation). Mastery boundary: repair evidence flows through the
**existing** independent-attempt / `diagnostic_retry` path — the repair runner
itself writes no mastery formulas.

## What exists today

- **Data:** `Authority.getErrorLog(state)` → `ErrorEntryView[]`, read from the
  question attempt log (`0010_practice_attempt_log.sql` +
  `0011_study_attempt_log.sql`, which covers both question surfaces) and
  hydrated from the bank: `questionId, kcId, skillId, cluster, familyId,
  occurredAt, stem, chosenChoiceId/Text, correctChoiceId/Text, choiceRationale,
  resolved, focus`. `familyId` **is** exposed now, so step 1's fresh-twin pick has
  its input. `resolved` means a later correct first attempt landed on a *different*
  item in the same KC — being shown a mistake is not repair.
- **Surface:** `/app/mistakes` renders the misses with their content plus a
  KC/cluster-grain patterns section; every row's primary action is "try again",
  which routes into the adaptive practice queue with a focus token so the
  re-attempt lands on a fresh unseen item.
- **Repair only happens inline** — in Practice and in the Study loop. Both lead
  with the refutation of the chosen distractor and then take one more pass at the
  same item (spaced ~3 items in Practice, immediate in Study). They differ on
  *when* the key lands: Study names it on the first miss, Practice defers it to the
  second (§3.3, amended 2026-07-28). There is no standalone runner and no
  fresh-twin variant picker.

## What the repair runner should do

Input from Today's Path: a **count** `N` (how many mistakes to repair) — mirrors
`getPracticeQueue(X)`. Output: a guided session that, per open mistake:

1. **Pick a fresh twin, not the same item.** Use the missed item's `family_id`
   (+ `KC × skill × misconception_id`) to pull a **different** sibling item from
   the bank (a real transfer check, not recall of one item). Fall back gracefully:
   same family → sibling KC → skip.
2. **Reveal immediately, with the refutation of the distractor they picked.**
   Present the twin; on the answer, give the key and the refutation of *that*
   specific wrong choice straight away (name the trap → disprove → give the rule).
   Never end on the wrong answer.

   > **Superseded (2026-07):** this step previously specified
   > "diagnose-before-reveal — name the cause → one unassisted retry → reveal".
   > `docs/design/error-handling-design.md` §2.2–§2.3 settles both halves of that
   > against tier-A evidence: experts classifying error causes agree at
   > κ = 0.000–0.063 and students call 81% of execution errors "simple" against an
   > expert rate of 40% (worst among the weakest students), so a self-reported
   > cause is not a recoverable signal; and Butler/Karpicke/Roediger 2007 measured
   > .71 vs .71 for withholding versus revealing on multiple choice, with feedback
   > *timing* pooling to g = 0.03 while feedback *content* spans 0.05 → 0.49. The
   > screen is therefore spent on the refutation rather than on a delay or a
   > picker. Both question flows now work this way (`PracticeSession.tsx` and
   > `Study.tsx`), and there is no cause field left on `ErrorEntryView` for the
   > runner to read — nor a `ProbableCause` type anywhere to reintroduce one.

   > **Amended 2026-07-28, adaptive Practice only:** the key is now withheld on a
   > **first** miss — the learner gets the refutation of the option they chose and
   > nothing that names the correct answer — and disclosed on the second pass,
   > right or wrong. Product decision by the product owner; evidence and scope
   > recorded in `docs/design/error-handling-design.md` §3.3. The refutation is
   > still mandatory on every miss and the flow still never ends on the wrong
   > answer; the Study loop above is unchanged.

   The refutation source is the item's per-choice rationale, not a misconception
   catalog: `error_models` is populated on **0 of 2,108** corpus items.

   **Temporary stand-in:** until the fresh-twin selection in step 1 exists,
   Practice re-inserts the *same* missed item about three questions later
   (`RETRY_GAP`) for a second pass. That is deliberately weaker than a sibling
   item — it measures memory of one item rather than transfer — and it is what the
   fresh twin is meant to replace, not a second mechanism to keep alongside it.
3. **Write repair evidence through the existing path.** A first, unassisted correct
   attempt is independent evidence (moves `P(L)` via the normal mastery path and
   flips the mistake's `resolved` to true once a delayed success on a different
   item lands, per `MASTERY_PLAN`). The runner must NOT compute mastery itself.
4. **Graduate fixed mistakes.** When repaired, move the entry into the "Fixed"
   win-pile so the active list stays small (design decision §5).

## Contracts to add (when built)

- ~~Extend `ErrorEntryView` to carry `familyId`, `kcId`, `skill`~~ — done. There is
  no `misconceptionId` to add: `error_models` is populated on 0 of 2,108 items, so
  grouping and twin-picking stay at KC / family / cluster grain.
- A selection service `getRepairQueue(user, N)` → ordered fresh twins (reuse the
  Practice `PracticeBankPort.findItems` + `recentMisses`/`queueRepair` seam, which
  already exists).
- A runner screen `/app/mistakes/repair` that consumes the queue and reuses the
  learning-mode question UI + feedback pattern (the same components Practice uses).

## Today's Path integration (already in place)

- The engine already **schedules and sizes** the Review Mistakes slot
  (`2 min`/mistake, never sized above the open-mistake count) and **orders** it
  near the end (not last). Both the reserved slot and the mid-day injection are
  sized from `Authority.openMistakes`, i.e. from the same list the Mistakes tab
  renders, so the slot cannot promise work the page cannot show. When the runner
  exists, only the client launch target changes: instead of
  navigating to `/app/mistakes`, launch `/app/mistakes/repair` with
  `{ count, returnTo, activityId }` (same guided-runner return contract the other
  activities use). No engine change required.
