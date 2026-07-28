import { describe, expect, it } from 'vitest';
import { priorityFraming, priorityHeading } from './PriorityList';

const copyFor = (count: number): string => `${priorityHeading(count)} ${priorityFraming(count)}`;

describe('priority copy', () => {
  it('offers two starting points and never promises a third', () => {
    expect(priorityHeading(2)).toBe('Two places to start');
    for (const count of [1, 2]) {
      expect(copyFor(count)).not.toMatch(/\bthree\b|\bthird\b|\b3\b/i);
    }
  });

  it('drops to the singular rather than announcing an area it cannot show', () => {
    expect(priorityHeading(1)).toBe('One place to start');
    expect(priorityFraming(1)).not.toMatch(/\bboth\b|\beither\b|\bthese two\b/i);
  });

  it('claims no superlative and no ranking between the two', () => {
    const copy = copyFor(2).toLowerCase();
    for (const overclaim of ['worst', 'weakest', 'biggest', 'ranked', 'top ', 'first', 'second']) {
      expect(copy, `copy overclaims with "${overclaim}"`).not.toContain(overclaim);
    }
  });

  it('promises no reproducibility the re-sit study does not support', () => {
    // The 88.0% worst-world figure is agreement on one of the two recurring; the
    // pair as a set held 47.8% when it was measured. Copy may recommend a
    // starting point, not vouch for the set.
    for (const count of [1, 2]) {
      expect(priorityFraming(count)).not.toMatch(/clearly|came through|apart from|stood out/i);
      expect(priorityFraming(count)).toMatch(/keeps adjusting/);
    }
  });
});
