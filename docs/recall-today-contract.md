# Recall ↔ Today's Path contract

**Status:** implemented in `packages/recall-core` (the platform-neutral Recall core).
**Source of truth:** [`packages/recall-core/src/today-contract.ts`](../packages/recall-core/src/today-contract.ts)
and the selection service in
[`packages/recall-core/src/selection.ts`](../packages/recall-core/src/selection.ts).
This document mirrors those files; if they disagree, the code wins.

Recall is the user-owned flashcards feature (FSRS-6). This contract describes the
one seam between Recall and the daily scheduler ("Today's Path"). Recall is
**fact-only and never writes mastery** — see
[`docs/recall-mastery-boundary.md`](./recall-mastery-boundary.md).

## Who owns what

- **Today's Path owns pacing.** It decides how much of the day belongs to recall.
- **Recall owns cards.** It decides _which_ cards come back and _when_, using FSRS.

The scheduler never reaches into FSRS state; Recall never second-guesses the
day plan. They talk through the small request/report shapes below.

## The flow

1. When Today's Path builds the day it hands Recall a **minutes budget** for the
   recall slice (a `RecallRequest`; `minutesBudget` is preferred, `maxCards` is
   also accepted and **wins when both are set**).
2. Recall converts minutes → a card count using a **rolling seconds-per-card**
   estimate derived from the recent review log (`rollingSecondsPerCard`, falling
   back to `DEFAULT_SECONDS_PER_CARD = 20`), via `minutesToCardCount`.
3. Recall fills the queue **due-first, then new, with no internal cap** — the
   caller's `maxCards`/`minutesBudget` is the only limit (`getReviewQueue`).
   Ordering is: due (re)learning → most-overdue reviews → new cards. Recall
   **never returns not-yet-due reviews early**; the scheduler enforces the cap.
4. After the session Recall returns a **`RecallSessionReport`** that the
   scheduler reads to apply its **review-debt bands**
   (MCAT_APP_LEARNING_FLOW_PLAN §6: 20–30% ordinary; 30–40% reduce new;
   50–60% pause new) and to surface recall minutes on the daily recap.

Until the real scheduler exists, the standalone Recall tab drives itself and
reports the same shapes, so wiring Today's Path later is a no-op for Recall.

## Producer / consumer summary

- **Today's Path PRODUCES** a `RecallRequest` (`minutesBudget` preferred, or `maxCards`).
- **Recall PRODUCES** back:
  - a `RecallLoad` **forecast** (read _before_ the session to size the slice / pick the band), and
  - a `RecallSessionReport` (read _after_ the session).
- **Recall CONSUMES** nothing authoritative from the scheduler beyond the budget.

## Shapes

```ts
// packages/recall-core/src/today-contract.ts
interface RecallRequest {
  minutesBudget?: number; // preferred
  maxCards?: number; // wins over minutesBudget when both are set
}

interface RecallSessionReport {
  cardsReviewed: number;
  minutesSpent: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  remaining: RecallLoad; // load right after the session
}

// packages/recall-core/src/selection.ts
interface RecallLoad {
  dueLearning: number;
  dueReviews: number;
  newAvailable: number;
  due: number; // learning + relearning + review due now
  estimatedMinutesForDue: number; // at the supplied seconds/card
}
```

## Helpers (all pure)

- `minutesToCardCount(minutes, secondsPerCard = 20)` — budget → card count.
- `rollingSecondsPerCard(recentElapsedSeconds, fallback = 20)` — mean of recent
  review durations; the adapter feeds elapsed times from the review log.
- `tallyRatings(ratings)` — `{ again, hard, good, easy }` for the report / recap.
- `getReviewQueue(cards, { now, maxCards?, minutesBudget?, secondsPerCard? })` —
  the ordered queue (due-first-then-new, no internal cap).
- `estimateLoad(cards, now, secondsPerCard = 20)` — the `RecallLoad` forecast.

## What crosses the boundary (and what never does)

- **Crosses:** a minutes/card budget in; a load forecast and a session report out
  (counts + minutes + rating tally). Minutes may feed the daily capacity/recap.
- **Never crosses:** anything that can move mastery `P(L)`. Recall minutes are
  _not_ mastery and must never be fed into BKT/IRT (see the mastery boundary doc).
