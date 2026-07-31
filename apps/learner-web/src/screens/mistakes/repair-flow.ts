import type { RepairBucket } from '@mcat/contracts';

/**
 * The guided Review-Mistakes runner's step machine, kept separate from the screen
 * so the flow decisions are testable without the authority client or React.
 *
 * The flow, per mistake, is LOCKED (docs/mistakes-repair-plan.md + the product
 * decision): the learner REVIEWS the mistake (sees the trap / their pick vs the
 * key / the CARS passage) for a MANDATORY DWELL, then takes a MANDATORY, BOUNDED
 * "try a fresh one":
 *
 *   review (dwell) → fresh #1 → correct? advance : fresh #2 → correct? advance : advance
 *
 * A correct fresh attempt on the same KC (science) or CARS sub-skill flips the
 * mistake's COMPUTED `resolved` on the next read — the runner writes nothing. A
 * miss on both tries advances anyway and leaves the mistake open (it can resurface
 * another day). The fresh attempt is scored through the ordinary practice path.
 */

/**
 * Mandatory READING dwell before a mistake's fresh question unlocks, in SECONDS,
 * content-aware: a CARS review carries a whole passage to re-read, so it holds the
 * gate longer than a science miss/pattern/win. Single named constants so the two
 * durations are trivial to tune.
 */
export const REVIEW_DWELL_SECONDS = { science: 15, cars: 25 } as const;

/** The dwell (seconds) a bucket's review requires — CARS reads longer than science. */
export function dwellSecondsFor(bucket: RepairBucket): number {
  return bucket === 'cars' ? REVIEW_DWELL_SECONDS.cars : REVIEW_DWELL_SECONDS.science;
}

/**
 * Seconds still remaining on the review dwell, given how long the review has been on
 * screen (`elapsedMs`). Whole seconds, never negative — a PURE function of the two
 * inputs, so the gate is testable without a clock, timers, or React. The screen
 * feeds it a live `elapsedMs` to drive the on-screen countdown.
 */
export function dwellRemainingSeconds(bucket: RepairBucket, elapsedMs: number): number {
  const remainingMs = dwellSecondsFor(bucket) * 1000 - Math.max(0, elapsedMs);
  return remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 1000);
}

/**
 * Whether the review dwell has elapsed, so the fresh-one CTA may unlock. The CTA is
 * gated (disabled) while this is false.
 */
export function dwellElapsed(bucket: RepairBucket, elapsedMs: number): boolean {
  return dwellRemainingSeconds(bucket, elapsedMs) === 0;
}

/**
 * Fresh attempts allowed per mistake before advancing regardless. Two: a first
 * fresh question, then one more on a miss. `tryCount` (0-based) doubles as the
 * index into the served fresh queue, so try #1 is `items[0]` and try #2 `items[1]`.
 */
export const REPAIR_MAX_TRIES = 2;

/** How many fresh questions to fetch per mistake — one per try (the 2-try rule). */
export const REPAIR_FRESH_SET_SIZE = REPAIR_MAX_TRIES;

/** What happens after a graded fresh attempt. */
export type FreshNext =
  /** Move on to the next mistake (correct, or the second try is spent). */
  | { readonly kind: 'advance' }
  /** Serve one more fresh question for THIS mistake, at the given try index. */
  | { readonly kind: 'retry'; readonly tryCount: number };

/**
 * The next step after a fresh attempt is graded.
 *
 * Correct → advance. Wrong with a try left → serve the second fresh question.
 * Wrong with no try left (two used) → advance anyway, leaving the mistake open.
 */
export function afterFreshAttempt(tryCount: number, correct: boolean): FreshNext {
  if (correct) return { kind: 'advance' };
  const used = tryCount + 1;
  if (used >= REPAIR_MAX_TRIES) return { kind: 'advance' };
  return { kind: 'retry', tryCount: used };
}

/**
 * The fresh item for the current try, or `undefined` when the served queue cannot
 * supply it. `undefined` is the EMPTY-QUEUE GUARD: the practice queue dedupes to at
 * most one item per KC×skill (and CARS can be thin), so a focus may return zero or
 * one fresh questions. The runner must NOT dead-end there — it counts the review
 * complete and advances — so the screen treats `undefined` as "advance".
 */
export function freshItemAt<T>(items: readonly T[], tryCount: number): T | undefined {
  return items[tryCount];
}

/** Whether a mistake index is the last one in the sequence. */
export function isLastMistake(index: number, total: number): boolean {
  return index + 1 >= total;
}
