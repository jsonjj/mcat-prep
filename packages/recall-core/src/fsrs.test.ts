import { describe, expect, it } from 'vitest';
import { isFailingRating, newScheduling, rateScheduling, retrievability } from './fsrs';

const NOW = '2026-01-01T12:00:00.000Z';

const graduate = (): ReturnType<typeof rateScheduling>['scheduling'] => {
  let scheduling = newScheduling(NOW);
  let t = Date.parse(NOW);
  for (let i = 0; i < 6; i += 1) {
    const result = rateScheduling(scheduling, 'good', new Date(t).toISOString());
    scheduling = result.scheduling;
    t += Math.max(1, result.intervalDays) * 86_400_000;
  }
  return scheduling;
};

describe('recall fsrs wrapper', () => {
  it('starts a new card fresh', () => {
    const s = newScheduling(NOW);
    expect(s.state).toBe('new');
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
    expect(s.lastReviewedAt).toBeNull();
  });

  it('treats only "again" as a failing rating', () => {
    expect(isFailingRating('again')).toBe(true);
    expect(isFailingRating('hard')).toBe(false);
    expect(isFailingRating('good')).toBe(false);
    expect(isFailingRating('easy')).toBe(false);
  });

  it('records the review time and advances reps on a rating', () => {
    const { scheduling } = rateScheduling(newScheduling(NOW), 'good', NOW);
    expect(scheduling.reps).toBe(1);
    expect(scheduling.lastReviewedAt).toBe(new Date(NOW).toISOString());
    expect(['learning', 'review']).toContain(scheduling.state);
  });

  it('graduates to review after repeated good ratings', () => {
    const s = graduate();
    expect(s.state).toBe('review');
    expect(s.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('counts a lapse when a review card is failed', () => {
    const s = graduate();
    const before = s.lapses;
    const after = rateScheduling(s, 'again', new Date(Date.parse(s.due) + 86_400_000).toISOString());
    expect(after.scheduling.lapses).toBe(before + 1);
    expect(['learning', 'relearning']).toContain(after.scheduling.state);
  });

  it('decays retrievability over elapsed time', () => {
    const s = graduate();
    const base = Date.parse(s.lastReviewedAt ?? NOW);
    const soon = retrievability(s, new Date(base + 86_400_000).toISOString());
    const later = retrievability(s, new Date(base + 400 * 86_400_000).toISOString());
    expect(soon).toBeGreaterThan(later);
  });
});
