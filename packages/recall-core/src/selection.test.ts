import { describe, expect, it } from 'vitest';
import type { Card, CardScheduling, CardState } from './card';
import { estimateLoad, getReviewQueue } from './selection';

const NOW = '2026-01-01T12:00:00.000Z';
const nowMs = Date.parse(NOW);
const DAY = 86_400_000;

function sched(state: CardState, dueOffsetMs: number): CardScheduling {
  return {
    state,
    due: new Date(nowMs + dueOffsetMs).toISOString(),
    stability: 2,
    difficulty: 5,
    scheduledDays: 1,
    learningStep: 0,
    reps: 1,
    lapses: 0,
    lastReviewedAt: new Date(nowMs - DAY).toISOString(),
  };
}

function makeCard(id: string, scheduling: CardScheduling, over: Partial<Card> = {}): Card {
  return {
    id,
    noteId: `n_${id}`,
    type: 'basic',
    source: 'user',
    frontHtml: `<p>${id}</p>`,
    backHtml: '<p>a</p>',
    mediaRefs: [],
    tags: [],
    scheduling,
    suspended: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

const cards: Card[] = [
  makeCard('new1', sched('new', 0), { createdAt: '2026-01-01T00:00:00.000Z' }),
  makeCard('rev-overdue', sched('review', -10 * DAY)),
  makeCard('rev-slight', sched('review', -1 * DAY)),
  makeCard('learn', sched('learning', -1000)),
  makeCard('rev-future', sched('review', 5 * DAY)),
  makeCard('susp', sched('review', -3 * DAY), { suspended: true }),
  makeCard('del', sched('review', -3 * DAY), { deletedAt: NOW }),
];

describe('recall selection', () => {
  it('orders learning → most-overdue reviews → new, excluding not-due/suspended/deleted', () => {
    const q = getReviewQueue(cards, { now: NOW });
    expect(q.map((c) => c.id)).toEqual(['learn', 'rev-overdue', 'rev-slight', 'new1']);
  });

  it('caps by maxCards (due-first)', () => {
    expect(getReviewQueue(cards, { now: NOW, maxCards: 2 }).map((c) => c.id)).toEqual([
      'learn',
      'rev-overdue',
    ]);
  });

  it('converts a minutes budget to a card count', () => {
    expect(getReviewQueue(cards, { now: NOW, minutesBudget: 2, secondsPerCard: 60 })).toHaveLength(
      2,
    );
  });

  it('never returns not-yet-due reviews', () => {
    const ids = getReviewQueue(cards, { now: NOW }).map((c) => c.id);
    expect(ids).not.toContain('rev-future');
    expect(ids).not.toContain('susp');
    expect(ids).not.toContain('del');
  });

  it('forecasts load for the scheduler', () => {
    const load = estimateLoad(cards, NOW, 60);
    expect(load).toEqual({
      dueLearning: 1,
      dueReviews: 2,
      newAvailable: 1,
      due: 3,
      estimatedMinutesForDue: 3,
    });
  });
});
