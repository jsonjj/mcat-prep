# Review Mistakes — repair runner (implementation plan)

**Status:** NOT built. Today's Path currently schedules a "Review Mistakes" slot
(when `open >= 3`) whose "Start" simply opens the existing read-only Mistakes page
(`/app/mistakes`). This document specifies what the real **guided repair runner**
should do so the slot can light up later without changing Today's Path.

Source specs: `MCAT_TODAYS_PATH_PLAN.md` §3/§6, `MCAT_APP_DESIGN_DECISIONS.md` §4
(the review flow) and §5 (Mistakes as a pattern dashboard), `MCAT_APP_LEARNING_FLOW_PLAN.md`
§5.3 (feedback & remediation). Mastery boundary: repair evidence flows through the
**existing** independent-attempt / `diagnostic_retry` path — the repair runner
itself writes no mastery formulas.

## What exists today

- **Data:** `Authority.getErrorLog(state)` → `ErrorEntryView[]`
  (`questionId, skillId, occurredAt, chosenChoiceId, cause, repaired`). `repaired`
  is inferred from the presence of a `diagnostic_retry` evidence record for the
  item. `family_id` exists on questions/evidence but is **not** exposed on the
  error entry.
- **Surface:** `/app/mistakes` renders the log read-only (open vs repaired).
- **Repair only happens inline** in the Study loop (diagnose → one retry → reveal);
  there is no standalone runner and no fresh-twin variant picker.

## What the repair runner should do

Input from Today's Path: a **count** `N` (how many mistakes to repair) — mirrors
`getPracticeQueue(X)`. Output: a guided session that, per open mistake:

1. **Pick a fresh twin, not the same item.** Use the missed item's `family_id`
   (+ `KC × skill × misconception_id`) to pull a **different** sibling item from
   the bank (a real transfer check, not recall of one item). Fall back gracefully:
   same family → sibling KC → skip.
2. **Run diagnose-before-reveal.** Present the twin; on the answer, run the app's
   standard remediation: name the cause → one unassisted retry → reveal with the
   **refutation** from the misconception catalog (name the trap → disprove → give
   the rule). Never end on the wrong answer.
3. **Write repair evidence through the existing path.** A first, unassisted correct
   attempt is independent evidence (moves `P(L)` via the normal mastery path and
   flips the mistake's `repaired` to true once a delayed, different-family success
   lands, per `MASTERY_PLAN`). The runner must NOT compute mastery itself.
4. **Graduate fixed mistakes.** When repaired, move the entry into the "Fixed"
   win-pile so the active list stays small (design decision §5).

## Contracts to add (when built)

- Extend `ErrorEntryView` (or add a `RepairTargetView`) to carry `familyId`,
  `kcId`, `skill`, and `misconceptionId` so the runner can pick a fresh twin.
- A selection service `getRepairQueue(user, N)` → ordered fresh twins (reuse the
  Practice `PracticeBankPort.findItems` + `recentMisses`/`queueRepair` seam, which
  already exists).
- A runner screen `/app/mistakes/repair` that consumes the queue and reuses the
  learning-mode question UI + feedback pattern (the same components Practice uses).

## Today's Path integration (already in place)

- The engine already **schedules and sizes** the Review Mistakes slot
  (`open >= 3`, `2 min`/mistake, block 5–20) and **orders** it near the end (not
  last). When the runner exists, only the client launch target changes: instead of
  navigating to `/app/mistakes`, launch `/app/mistakes/repair` with
  `{ count, returnTo, activityId }` (same guided-runner return contract the other
  activities use). No engine change required.
