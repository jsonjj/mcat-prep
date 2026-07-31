import { describe, expect, it } from 'vitest';
import {
  REPAIR_FRESH_SET_SIZE,
  REPAIR_MAX_TRIES,
  REVIEW_DWELL_SECONDS,
  afterFreshAttempt,
  dwellElapsed,
  dwellRemainingSeconds,
  dwellSecondsFor,
  freshItemAt,
  isLastMistake,
} from './repair-flow';

/**
 * The guided repair runner's step machine. The LOCKED per-mistake flow is
 * review → fresh #1 → correct? advance : fresh #2 → correct? advance : advance,
 * so this pins: a correct fresh attempt advances; a miss earns exactly ONE more
 * fresh question, then advances regardless; and an empty served queue never
 * dead-ends — it counts the review complete and advances.
 */

describe('afterFreshAttempt — the bounded 2-try rule', () => {
  it('advances immediately on a correct fresh attempt', () => {
    expect(afterFreshAttempt(0, true)).toEqual({ kind: 'advance' });
  });

  it('serves exactly one more fresh question after a first miss', () => {
    // First try (index 0) missed → retry at index 1, never further.
    expect(afterFreshAttempt(0, false)).toEqual({ kind: 'retry', tryCount: 1 });
  });

  it('advances anyway after the second miss (two tries spent), leaving it open', () => {
    expect(afterFreshAttempt(1, false)).toEqual({ kind: 'advance' });
  });

  it('advances on a correct second try', () => {
    expect(afterFreshAttempt(1, true)).toEqual({ kind: 'advance' });
  });

  it('never allows more than REPAIR_MAX_TRIES fresh attempts', () => {
    // Whatever the (out-of-range) try count, a miss at/over the cap advances.
    expect(afterFreshAttempt(REPAIR_MAX_TRIES - 1, false)).toEqual({ kind: 'advance' });
    expect(afterFreshAttempt(REPAIR_MAX_TRIES, false)).toEqual({ kind: 'advance' });
  });
});

describe('freshItemAt — the empty-queue guard', () => {
  const items = ['first', 'second'] as const;

  it('serves the item at the current try index', () => {
    expect(freshItemAt(items, 0)).toBe('first');
    expect(freshItemAt(items, 1)).toBe('second');
  });

  it('returns undefined (→ advance) when the queue came back empty', () => {
    expect(freshItemAt([], 0)).toBeUndefined();
  });

  it('returns undefined (→ advance) when a second distinct item is unavailable', () => {
    // The practice queue dedupes to ≤1 per KC×skill, so a focus can yield only one
    // fresh question; the second try then has nothing and must advance, not hang.
    expect(freshItemAt(['only'], 1)).toBeUndefined();
  });

  it('fetches one fresh question per try (the 2-try rule)', () => {
    expect(REPAIR_FRESH_SET_SIZE).toBe(REPAIR_MAX_TRIES);
  });
});

describe('review dwell — the mandatory reading gate', () => {
  it('is content-aware: ~15s for science buckets, ~25s for CARS', () => {
    expect(REVIEW_DWELL_SECONDS).toEqual({ science: 15, cars: 25 });
    expect(dwellSecondsFor('tofix')).toBe(15);
    expect(dwellSecondsFor('patterns')).toBe(15);
    expect(dwellSecondsFor('wins')).toBe(15);
    expect(dwellSecondsFor('cars')).toBe(25);
  });

  it('counts whole seconds down to zero, never negative', () => {
    expect(dwellRemainingSeconds('tofix', 0)).toBe(15);
    expect(dwellRemainingSeconds('tofix', 1000)).toBe(14);
    expect(dwellRemainingSeconds('tofix', 14_000)).toBe(1);
    expect(dwellRemainingSeconds('tofix', 15_000)).toBe(0);
    expect(dwellRemainingSeconds('tofix', 99_000)).toBe(0);
    // A stray negative elapsed reads as "just started", not as a bonus.
    expect(dwellRemainingSeconds('tofix', -500)).toBe(15);
    expect(dwellRemainingSeconds('cars', 0)).toBe(25);
    expect(dwellRemainingSeconds('cars', 10_000)).toBe(15);
  });

  it('gates the CTA until the SCIENCE dwell (15s) elapses, then enables', () => {
    expect(dwellElapsed('tofix', 0)).toBe(false);
    expect(dwellElapsed('tofix', 14_999)).toBe(false); // one tick short — still locked
    expect(dwellElapsed('tofix', 15_000)).toBe(true); // reached → unlocked
    expect(dwellElapsed('tofix', 30_000)).toBe(true);
  });

  it('gates the CTA longer for CARS (25s) — not unlocked at the science threshold', () => {
    expect(dwellElapsed('cars', 15_000)).toBe(false); // science would be open; CARS is not
    expect(dwellElapsed('cars', 24_999)).toBe(false);
    expect(dwellElapsed('cars', 25_000)).toBe(true);
  });
});

describe('isLastMistake — advancing off the end finishes', () => {
  it('is true only on the final mistake', () => {
    expect(isLastMistake(0, 3)).toBe(false);
    expect(isLastMistake(1, 3)).toBe(false);
    expect(isLastMistake(2, 3)).toBe(true);
  });

  it('treats a single-mistake run as immediately last', () => {
    expect(isLastMistake(0, 1)).toBe(true);
  });
});
