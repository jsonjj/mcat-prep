import { describe, expect, it } from 'vitest';
import { masteryRecall, recallDailyMinutes, RECALL_WRITES_MASTERY } from './mastery-boundary';
import { minutesToCardCount, rollingSecondsPerCard, tallyRatings } from './today-contract';
import type { RecallLoad } from './selection';

const EMPTY_LOAD: RecallLoad = {
  dueLearning: 0,
  dueReviews: 0,
  newAvailable: 0,
  due: 0,
  estimatedMinutesForDue: 0,
};

describe('recall ↔ mastery boundary', () => {
  it('never writes or reads mastery', () => {
    expect(RECALL_WRITES_MASTERY).toBe(false);
    expect(masteryRecall.writesMastery).toBe(false);
    expect(masteryRecall.readsMastery).toBe(false);
    expect(masteryRecall.surfacesDailyMinutes).toBe(true);
  });

  it('surfaces only minutes toward the daily model', () => {
    const minutes = recallDailyMinutes({
      cardsReviewed: 10,
      minutesSpent: 7,
      again: 1,
      hard: 2,
      good: 5,
      easy: 2,
      remaining: EMPTY_LOAD,
    });
    expect(minutes).toBe(7);
  });
});

describe('recall ↔ today contract', () => {
  it('converts minutes to a card count', () => {
    expect(minutesToCardCount(10, 30)).toBe(20);
    expect(minutesToCardCount(0)).toBe(0);
  });

  it('derives a rolling seconds-per-card, falling back when empty', () => {
    expect(rollingSecondsPerCard([10, 20, 30])).toBe(20);
    expect(rollingSecondsPerCard([], 15)).toBe(15);
  });

  it('tallies session ratings', () => {
    expect(tallyRatings(['again', 'good', 'good', 'easy'])).toEqual({
      again: 1,
      hard: 0,
      good: 2,
      easy: 1,
    });
  });
});
