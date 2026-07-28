# Practice ↔ Today's Path contract

**Status:** count-based today (`getPracticeQueue(X)`); the minutes→X handoff
described here is the **planned** seam and is intentionally **deferred**.
**Source of truth (engine):** [`docs/practice-engine.md`](./practice-engine.md)
and [`packages/authority-core/src/practice.ts`](../packages/authority-core/src/practice.ts).

Practice is the adaptive **test-out** loop. Unlike Recall (fact-only, never
writes mastery — see [`docs/recall-today-contract.md`](./recall-today-contract.md)),
Practice is **server-authoritative and writes `P(L)`**. This document describes
the single seam between Practice and the daily scheduler ("Today's Path").

## Who owns what

- **Today's Path owns pacing.** It decides how much of the day belongs to
  practice (a minutes budget) and, later, an optional weakness **focus**.
- **Practice owns selection + scoring.** Given a count it decides _which_
  KC×skill×DOK×band specs to serve, pulls fresh items, and writes mastery.

The scheduler never reaches into the selection engine or the mastery tables;
Practice never second-guesses the day plan. They talk through the small shapes
below.

## The flow (target)

1. When Today's Path builds the day it hands Practice a **minutes budget** for
   the practice slice (and optionally a `focus` token — a cluster like `bb1`, a
   reasoning op like `explain`, or `cars`).
2. Practice converts **minutes → a question count `X`** using a rolling
   **seconds-per-question** estimate (a provisional default until enough timing
   data accrues — Practice is untimed for the learner, so this is a pacing
   estimate only, not a per-item clock).
3. Practice serves the queue via `getPracticeQueue(X, focus)` and scores answers
   via `submitPracticeAttempt` — a first, unassisted correct attempt moves
   `P(L)` (see the engine doc).
4. After the session Practice can return a small **report** (questions served,
   first-try correct, KCs moved, repairs queued) that the scheduler reads for the
   daily recap and to rebalance the next day.

## What exists today

- The caller is **count-based**: `getPracticeQueue(X)`. The learner picks `X`
  (and an optional focus) on the Practice hub (`PracticeHome`), and the session
  (`PracticeSession`) runs `n/X` with no recap — it returns to the hub.
- The **minutes → X** conversion, the `focus` derived from the day plan, and the
  post-session **report → scheduler** step are **not wired**. There is no daily
  scheduler yet; the standalone Practice hub drives itself.

## Why it is safe to defer

`getPracticeQueue(X)` is the stable seam. Wiring Today's Path later means:

1. computing `X` from the minutes budget (a pure `minutesToQuestionCount`
   helper, mirroring Recall's `minutesToCardCount`), and
2. passing the scheduler's `focus` through unchanged.

Neither changes the engine, the DTOs, or the mastery writes — so the handoff is
additive. Until then, Practice is fully usable count-first, exactly as shipped.
