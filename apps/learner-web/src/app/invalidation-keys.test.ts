import { describe, expect, it } from 'vitest';
import {
  LEARNER_KEYS,
  MASTERY_KEYS,
  MISTAKE_KEYS,
  PLAN_ACTIVITY_COMPLETE_INVALIDATE,
  PRACTICE_INVALIDATE_KEYS,
  TODAYS_PATH_INVALIDATE,
} from './invalidation-keys';

/**
 * The bug these guard: adaptive practice invalidated six mastery/progress keys
 * and neither of the Mistakes tab's own two, so a miss the server had already
 * recorded was read back from a stale cache and the tab looked empty.
 *
 * The rule is "every mutation that can write or clear a miss names both mistake
 * keys", not "every mutation invalidates everything" — so the sets that cannot
 * touch a mistake are asserted to stay narrow as well.
 */

const missing = (set: readonly string[]): string[] => MISTAKE_KEYS.filter((k) => !set.includes(k));

describe('the Mistakes tab’s query keys', () => {
  it('are the keys useErrorLog and useMistakePatterns actually read under', () => {
    expect([...MISTAKE_KEYS]).toEqual(['errors', 'error-patterns']);
  });

  it('are named by a scored practice attempt — the write that hid the bug', () => {
    // A first attempt writes the row on a miss and resolves earlier rows in the
    // same KC when it lands, so both directions need the tab dropped.
    expect(missing(PRACTICE_INVALIDATE_KEYS)).toEqual([]);
  });

  it('are named by the broad learner set the Study loop mutates through', () => {
    // A study miss writes an attempt-log row exactly like a practice miss.
    expect(missing(LEARNER_KEYS)).toEqual([]);
  });

  it('are named when a plan activity COMPLETES', () => {
    // Completing a Review Mistakes slot moves `mistakesReviewedThrough`, which
    // changes which open misses are still schedulable.
    expect(missing(PLAN_ACTIVITY_COMPLETE_INVALIDATE)).toEqual([]);
  });
});

describe('the invalidation stays targeted rather than blanket', () => {
  it('leaves the mistake keys out of the plain plan-mutation set', () => {
    // in_progress / skipped and a budget change move no mistake state.
    expect(TODAYS_PATH_INVALIDATE).toEqual(['today', 'todays-path', 'bootstrap']);
    expect(missing(TODAYS_PATH_INVALIDATE)).toEqual([...MISTAKE_KEYS]);
  });

  it('keeps the mastery readouts free of mistake keys on their own', () => {
    expect(MASTERY_KEYS).not.toContain('errors');
    expect(MASTERY_KEYS).not.toContain('error-patterns');
  });

  it('never invalidates recall caches from an authority mutation', () => {
    // An FSRS "Again" is the scheduler hitting target retention, never a mistake
    // (docs/design/error-handling-design.md §6.4), and recall owns its own caches.
    for (const set of [
      PRACTICE_INVALIDATE_KEYS,
      LEARNER_KEYS,
      TODAYS_PATH_INVALIDATE,
      PLAN_ACTIVITY_COMPLETE_INVALIDATE,
    ]) {
      expect(set.filter((k) => k.startsWith('recall'))).toEqual([]);
    }
  });

  it('holds no duplicates, so one key is never invalidated twice per mutation', () => {
    for (const set of [
      PRACTICE_INVALIDATE_KEYS,
      LEARNER_KEYS,
      TODAYS_PATH_INVALIDATE,
      PLAN_ACTIVITY_COMPLETE_INVALIDATE,
    ]) {
      expect(new Set(set).size).toBe(set.length);
    }
  });
});
