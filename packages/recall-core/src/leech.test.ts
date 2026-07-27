import { describe, expect, it } from 'vitest';
import type { Card, CardScheduling } from './card';
import { applyLeech, isLeech, LEECH_TAG } from './leech';

const NOW = '2026-01-01T12:00:00.000Z';

function schedWithLapses(lapses: number): CardScheduling {
  return {
    state: 'review',
    due: NOW,
    stability: 2,
    difficulty: 7,
    scheduledDays: 1,
    learningStep: 0,
    reps: 20,
    lapses,
    lastReviewedAt: NOW,
  };
}

function makeCard(lapses: number, over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    noteId: 'n1',
    type: 'basic',
    source: 'user',
    frontHtml: '<p>q</p>',
    backHtml: '<p>a</p>',
    mediaRefs: [],
    tags: [],
    scheduling: schedWithLapses(lapses),
    suspended: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

describe('recall leech handling', () => {
  it('flags a card at/over the threshold', () => {
    expect(isLeech(makeCard(8))).toBe(true);
    expect(isLeech(makeCard(7))).toBe(false);
  });

  it('suspends and tags a leech once', () => {
    const suspended = applyLeech(makeCard(8));
    expect(suspended.suspended).toBe(true);
    expect(suspended.tags).toContain(LEECH_TAG);
    // idempotent: already suspended → unchanged
    expect(applyLeech(suspended)).toBe(suspended);
  });

  it('leaves sub-threshold cards untouched', () => {
    const card = makeCard(3);
    expect(applyLeech(card)).toBe(card);
  });
});
