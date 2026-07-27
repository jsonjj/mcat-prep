# Recall ↔ mastery boundary

**Status:** implemented in `packages/recall-core`.
**Source of truth:** [`packages/recall-core/src/mastery-boundary.ts`](../packages/recall-core/src/mastery-boundary.ts).
This document mirrors that file; if they disagree, the code wins.

## Hard rule

**Recall never writes mastery.** Flashcards are user-owned _facts_ scheduled by
FSRS-6; concept / skill / lesson mastery is the BKT engine's job. The two systems
are deliberately **disjoint** so nothing double-counts:

- `docs/mastery-pipeline.md` **§0** — "FSRS stays with the separate
  Recall/flashcards feature; mastery decay is BKT-based and independent."
- `docs/mastery-pipeline.md` **§9.5** (Recall boundary) — the flashcards/FSRS
  feature owns facts and never writes mastery; it replaces the old cluster-FSRS
  demo shim, which is unrelated to these user cards.
- MCAT_MASTERY_PLAN.md **§9.2** — facts → FSRS; concept/skill mastery → BKT decay.

FSRS-facts and BKT-concepts are two separate memory models over two separate
object sets. A card being "due" says nothing about a concept's `P(L)`, and a
concept being due for review says nothing about any card.

## What mastery needs FROM Recall

Nothing that can move `P(L)`. Concretely, Recall must **not**:

- call `applyMasteryAttempt` (or any mastery update),
- write the `mastery_*` tables / projections,
- import `@mcat/authority-core` or the mastery policies from Recall UI/adapters.

The **only** permitted coupling is surfacing recall **minutes** to the daily
recap / capacity model (never mastery). That single value is exposed by
`recallDailyMinutes(report)`, which returns `report.minutesSpent` — a time
number, not a mastery signal, and it must never be fed into BKT/IRT.

## What Recall needs FROM mastery

Nothing. Recall is fully decoupled and reads no mastery state. (A future
mastery-driven concept due-review surface is a separate mastery-workstream item
that lives in Today's Path / Study — not in this feature.)

## Compile-time + runtime markers

```ts
// packages/recall-core/src/mastery-boundary.ts
export const RECALL_WRITES_MASTERY = false as const;

export const masteryRecall: RecallMasteryBoundary = {
  writesMastery: false, // always false — Recall is fact-only
  readsMastery: false, // Recall reads no mastery state
  surfacesDailyMinutes: true, // the one permitted coupling: recall minutes → daily recap
};

// The only value Recall exposes toward the mastery/capacity side: minutes spent.
export function recallDailyMinutes(report: RecallSessionReport): number {
  return report.minutesSpent;
}
```

## How the boundary is enforced

- **Package boundaries** (`tests/architecture/boundaries.test.ts`): `@mcat/recall-core`
  is a pure layer with no UI/browser/app dependencies and no dependency on an app.
- **Browser boundaries** (`tests/architecture/browser-boundaries.test.ts`):
  `apps/learner-web` has no runtime dependency on, and no source import of,
  `@mcat/authority-core` or `@mcat/content`.
- **Recall guard** (`tests/architecture/recall-boundary.test.ts`): the Recall UI
  and adapters do not import `@mcat/authority-core`, the mastery policies, or call
  `applyMasteryAttempt` / write `mastery_*`.

Together these keep the FSRS-facts feature and the BKT-mastery pipeline from ever
touching each other except through the recall-minutes surface above.
