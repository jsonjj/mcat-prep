import { describe, expect, it } from 'vitest';
import { buildTodaysPath, type TodaysPathSnapshot } from './todays-path';

/**
 * WS5 integration into the Today's-Path engine: a scheduled practice test is
 * reserved when the cadence (decided upstream and handed in on the snapshot) says
 * it is due, and never otherwise. The cadence decision itself is exercised in
 * `practice-test-cadence.test.ts`; this pins the ENGINE side of the seam.
 */

function snap(over: Partial<TodaysPathSnapshot> = {}): TodaysPathSnapshot {
  return {
    planDate: '2026-03-01',
    dailyBudgetMinutes: 360,
    dayNumber: 40,
    totalDays: 100,
    coveragePct: 0.5,
    recall: { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
    mistakesOpen: 0,
    practiceUnlocked: true,
    practiceReviewNeed: 4,
    candidateLessons: [],
    carryOver: [],
    ...over,
  };
}

describe("today's path — scheduled practice test", () => {
  it('reserves a practice_test activity when the cadence says one is due', () => {
    const result = buildTodaysPath(
      snap({
        practiceTest: { due: true, phase: 'biweekly', estimatedMinutes: 180, reason: 'cadence_due' },
      }),
    );
    const test = result.activities.find((a) => a.kind === 'practice_test');
    expect(test).toBeDefined();
    expect(test!.estimatedMinutes).toBe(180);
    expect(test!.title).toBe('Practice Test');
    expect(test!.detail).toContain('biweekly');
  });

  it('reserves nothing when no practice test is due (or the field is absent)', () => {
    expect(buildTodaysPath(snap()).activities.some((a) => a.kind === 'practice_test')).toBe(false);
    expect(
      buildTodaysPath(
        snap({ practiceTest: { due: false, phase: 'monthly', estimatedMinutes: 180, reason: 'not_due_recent' } }),
      ).activities.some((a) => a.kind === 'practice_test'),
    ).toBe(false);
  });

  it('does not double-book a practice test already carried over from a prior day', () => {
    const result = buildTodaysPath(
      snap({
        practiceTest: { due: true, phase: 'weekly', estimatedMinutes: 180, reason: 'cadence_due' },
        carryOver: [
          {
            activityId: 'practice-test',
            kind: 'practice_test',
            title: 'Practice Test',
            detail: 'Resume your test.',
            estimatedMinutes: 180,
            count: null,
            minutesBudget: null,
            focus: null,
            lessonSlug: null,
            lessonId: null,
            priorityReason: 'OVERDUE_REVIEW',
          },
        ],
      }),
    );
    expect(result.activities.filter((a) => a.kind === 'practice_test')).toHaveLength(1);
  });

  it('counts the test against the day so a small budget becomes a test day', () => {
    // A 2-hour budget with a 3-hour test: the test is reserved and the day fills
    // to (or past) the budget, leaving no room for a scored practice block.
    const result = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 120,
        practiceTest: { due: true, phase: 'weekly', estimatedMinutes: 180, reason: 'cadence_due' },
      }),
    );
    expect(result.activities.some((a) => a.kind === 'practice_test')).toBe(true);
    expect(result.activities.some((a) => a.kind === 'practice')).toBe(false);
  });
});
