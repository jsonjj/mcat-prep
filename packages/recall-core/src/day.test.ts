import { describe, expect, it } from 'vitest';
import { isSameRecallDay, recallDayStart } from './day';

// Uses local time; construct Dates with local components.
describe('recall day boundary (04:00 local)', () => {
  it('rolls a pre-4am time back to the previous day', () => {
    const early = new Date(2026, 0, 2, 3, 0, 0); // Jan 2, 03:00 local
    const start = recallDayStart(early);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(4);
  });

  it('keeps a post-4am time on the same day', () => {
    const late = new Date(2026, 0, 2, 5, 0, 0);
    const start = recallDayStart(late);
    expect(start.getDate()).toBe(2);
    expect(start.getHours()).toBe(4);
  });

  it('treats late night as the same recall day', () => {
    const evening = new Date(2026, 0, 2, 23, 0, 0);
    const afterMidnight = new Date(2026, 0, 3, 1, 30, 0);
    expect(isSameRecallDay(evening, afterMidnight)).toBe(true);
  });

  it('separates across the 4am boundary', () => {
    const beforeBoundary = new Date(2026, 0, 3, 3, 0, 0);
    const afterBoundary = new Date(2026, 0, 3, 5, 0, 0);
    expect(isSameRecallDay(beforeBoundary, afterBoundary)).toBe(false);
  });
});
