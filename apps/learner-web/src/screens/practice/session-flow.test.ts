import { describe, expect, it } from 'vitest';
import { RETRY_GAP, resurfaceAt, subAfterFirstAttempt } from './session-flow';

/**
 * The practice miss flow: reveal-first, no cause naming, spaced resurface kept.
 * See docs/design/error-handling-design.md §2.2–§2.3.
 */
describe('practice miss flow', () => {
  it('reveals immediately on a miss instead of asking what happened', () => {
    expect(subAfterFirstAttempt(false)).toBe('reveal');
    expect(subAfterFirstAttempt(true)).toBe('reveal');
  });

  it('still re-inserts the missed item a few questions later', () => {
    // Mid-session: the item comes back after a gap, not on the next screen.
    expect(resurfaceAt(0, 8)).toBe(1 + RETRY_GAP);
    expect(resurfaceAt(2, 8)).toBe(3 + RETRY_GAP);
    expect(resurfaceAt(0, 8)).toBeGreaterThan(1);
  });

  it('keeps the second pass on the last remaining step rather than dropping it', () => {
    // index 7 of an 8-step sequence: clamped to the end, so it retries next.
    expect(resurfaceAt(7, 8)).toBe(8);
    expect(resurfaceAt(6, 8)).toBe(8);
  });

  it('never re-inserts before the step that follows the miss', () => {
    for (const [index, length] of [
      [0, 1],
      [3, 4],
      [5, 12],
    ] as const) {
      expect(resurfaceAt(index, length)).toBeGreaterThanOrEqual(index + 1);
    }
  });
});
