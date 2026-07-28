import { describe, expect, it } from 'vitest';
import {
  buildTodaysPath,
  reviewDebtBand,
  TODAYS_PATH_CONFIG,
  type CarriedActivity,
  type TodaysPathCandidateLesson,
  type TodaysPathSnapshot,
} from './todays-path';

function snap(overrides: Partial<TodaysPathSnapshot> = {}): TodaysPathSnapshot {
  return {
    planDate: '2026-07-27',
    dailyBudgetMinutes: 180,
    dayNumber: 1,
    totalDays: 100,
    coveragePct: 0,
    recall: { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
    mistakesOpen: 0,
    practiceAvailable: true,
    practiceWeakness: 0.8,
    candidateLessons: [],
    carryOver: [],
    ...overrides,
  };
}

const lessonHigh: TodaysPathCandidateLesson = {
  lessonId: 'L-high',
  slug: 'high',
  title: 'High value',
  section: 'bb',
  cluster: 'BB1',
  kcCount: 6,
  mastered: false,
  covered: false,
};
const lessonLow: TodaysPathCandidateLesson = {
  lessonId: 'L-low',
  slug: 'low',
  title: 'Low value',
  section: 'ps',
  cluster: 'PS1',
  kcCount: 1,
  mastered: false,
  covered: true,
};

const noAdjacentSameKind = (acts: readonly { kind: string }[]): boolean =>
  acts.every((a, i) => i === 0 || a.kind !== acts[i - 1]!.kind);

const carried = (id: string, minutes = 20): CarriedActivity => ({
  activityId: id,
  kind: 'lesson',
  title: id,
  detail: 'carried',
  estimatedMinutes: minutes,
  count: null,
  minutesBudget: null,
  focus: null,
  lessonSlug: id,
  lessonId: id,
  priorityReason: 'NEW_LEARNING',
});

describe('Today\u2019s Path engine', () => {
  it('always reserves CARS Duel and never exceeds the budget', () => {
    const r = buildTodaysPath(snap());
    expect(r.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
    expect(r.plannedMinutes).toBeLessThanOrEqual(r.dailyBudgetMinutes);
  });

  it('includes Recall only when enough cards are due, sized within the card floor/ceiling', () => {
    const withDue = buildTodaysPath(
      snap({ recall: { dueLearning: 0, dueReviews: 10, newAvailable: 5, due: 10, estimatedMinutesForDue: 4 } }),
    );
    const recall = withDue.activities.find((a) => a.kind === 'recall');
    expect(recall).toBeDefined();
    expect(recall!.count!).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.blocks.recallMinCards);
    expect(recall!.count!).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.blocks.recallMaxCards);

    const belowFloor = buildTodaysPath(
      snap({ recall: { dueLearning: 0, dueReviews: 3, newAvailable: 0, due: 3, estimatedMinutesForDue: 1 } }),
    );
    expect(belowFloor.activities.some((a) => a.kind === 'recall')).toBe(false);
  });

  it('includes Review Mistakes only when enough are open', () => {
    expect(buildTodaysPath(snap({ mistakesOpen: 5 })).activities.some((a) => a.kind === 'review_mistakes')).toBe(true);
    expect(buildTodaysPath(snap({ mistakesOpen: 2 })).activities.some((a) => a.kind === 'review_mistakes')).toBe(false);
  });

  it('classifies review-debt bands and pauses new lessons when debt is high', () => {
    expect(reviewDebtBand({ dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 }, 180)).toBe('normal');
    const r = buildTodaysPath(
      snap({
        recall: { dueLearning: 0, dueReviews: 60, newAvailable: 0, due: 60, estimatedMinutesForDue: 120 },
        candidateLessons: [lessonHigh],
      }),
    );
    expect(r.reviewDebtBand).toBe('pause_new');
    expect(r.activities.some((a) => a.kind === 'lesson')).toBe(false);
  });

  it('differentiates lessons by value (not a flat score) and picks the stronger first', () => {
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 120, practiceAvailable: false, candidateLessons: [lessonLow, lessonHigh] }),
    );
    const lessons = r.activities.filter((a) => a.kind === 'lesson');
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0]!.lessonSlug).toBe('high');
  });

  it('excludes mastered lessons', () => {
    const r = buildTodaysPath(
      snap({ practiceAvailable: false, candidateLessons: [{ ...lessonHigh, mastered: true }] }),
    );
    expect(r.activities.some((a) => a.kind === 'lesson')).toBe(false);
  });

  it('sizes Practice within its floor/hard-ceiling and count == minutes / 2', () => {
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 240, practiceWeakness: 1, coveragePct: 0.5, candidateLessons: [] }));
    const practice = r.activities.find((a) => a.kind === 'practice');
    expect(practice).toBeDefined();
    expect(practice!.count!).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.blocks.practiceMinQ);
    expect(practice!.count!).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.practiceMaxQHard);
    expect(practice!.estimatedMinutes).toBe(practice!.count! * TODAYS_PATH_CONFIG.costs.practicePerQuestion);
  });

  it('flexes the recall ceiling above the normal 20 under a high review-debt band', () => {
    const highDebt = { dueLearning: 0, dueReviews: 80, newAvailable: 0, due: 80, estimatedMinutesForDue: 200 };
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 360, recall: highDebt }));
    expect(r.reviewDebtBand).toBe('pause_new');
    const recall = r.activities.find((a) => a.kind === 'recall')!;
    expect(recall.count!).toBeGreaterThan(TODAYS_PATH_CONFIG.recallCeiling.normal);
  });

  it('fills much more of a large budget than the old ~147-min cap', () => {
    const lessons = Array.from({ length: 8 }, (_, i) => ({ ...lessonHigh, lessonId: `L${i}`, slug: `s${i}` }));
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, coveragePct: 0.5, practiceWeakness: 1, candidateLessons: lessons }),
    );
    expect(r.plannedMinutes).toBeGreaterThan(200);
    expect(r.plannedMinutes).toBeLessThanOrEqual(360);
  });

  it('admits more new lessons on a larger budget', () => {
    const lessons = Array.from({ length: 8 }, (_, i) => ({ ...lessonHigh, lessonId: `L${i}`, slug: `s${i}` }));
    const countLessons = (b: number) =>
      buildTodaysPath(snap({ dailyBudgetMinutes: b, practiceAvailable: false, candidateLessons: lessons }))
        .activities.filter((a) => a.kind === 'lesson').length;
    expect(countLessons(360)).toBeGreaterThan(countLessons(120));
  });

  it('never emits duplicate activity ids when carrying over practice/lessons', () => {
    const carryOver: CarriedActivity[] = [
      { activityId: 'practice', kind: 'practice', title: 'Practice', detail: 'carried', estimatedMinutes: 20, count: 10, minutesBudget: 20, focus: null, lessonSlug: null, lessonId: null, priorityReason: 'NEW_LEARNING' },
      { activityId: 'lesson:s0', kind: 'lesson', title: 'L0', detail: 'carried', estimatedMinutes: 20, count: null, minutesBudget: null, focus: null, lessonSlug: 's0', lessonId: 'L0', priorityReason: 'NEW_LEARNING' },
    ];
    const lessons = [
      { ...lessonHigh, lessonId: 'L0', slug: 's0' },
      { ...lessonHigh, lessonId: 'L1', slug: 's1' },
    ];
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 240, practiceWeakness: 1, candidateLessons: lessons, carryOver }),
    );
    const ids = r.activities.map((a) => a.activityId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.activities.filter((a) => a.activityId === 'practice').length).toBe(1);
    expect(r.activities.filter((a) => a.activityId === 'lesson:s0').length).toBe(1);
  });

  it('orders for variety: no two same-kind activities back-to-back; mistakes not last', () => {
    const lessons = Array.from({ length: 2 }, (_, i) => ({ ...lessonHigh, lessonId: `L${i}`, slug: `s${i}` }));
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 360,
        coveragePct: 0.6,
        practiceWeakness: 1,
        recall: { dueLearning: 0, dueReviews: 10, newAvailable: 0, due: 10, estimatedMinutesForDue: 4 },
        mistakesOpen: 5,
        candidateLessons: lessons,
      }),
    );
    expect(noAdjacentSameKind(r.activities)).toBe(true);
    expect(r.activities[r.activities.length - 1]!.kind).not.toBe('review_mistakes');
    expect(r.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
  });

  it('reserves carry-over first and caps total load at ~125% of the preset', () => {
    const carryOver = Array.from({ length: 10 }, (_, i) => carried(`c${i}`, 20)); // 200 min
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 120, carryOver }));
    expect(r.plannedMinutes).toBeLessThanOrEqual(Math.round(120 * TODAYS_PATH_CONFIG.carryOverCapPct));
    expect(r.activities.some((a) => a.carriedOver)).toBe(true);
  });

  it('never schedules a single activity longer than maxActivityMinutes', () => {
    const lessons = Array.from({ length: 6 }, (_, i) => ({ ...lessonHigh, lessonId: `L${i}`, slug: `s${i}` }));
    for (const budget of [120, 180, 240, 300, 360]) {
      for (const coveragePct of [0, 0.5, 1]) {
        const r = buildTodaysPath(
          snap({
            dailyBudgetMinutes: budget,
            coveragePct,
            practiceWeakness: 1,
            recall: { dueLearning: 0, dueReviews: 80, newAvailable: 0, due: 80, estimatedMinutesForDue: 30 },
            mistakesOpen: 20,
            candidateLessons: lessons,
          }),
        );
        for (const a of r.activities) {
          expect(a.estimatedMinutes).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.maxActivityMinutes);
        }
      }
    }
  });

  it('splits a large practice workload into multiple ≤45-min blocks with unique ids', () => {
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, coveragePct: 1, practiceWeakness: 1, candidateLessons: [] }),
    );
    const practice = r.activities.filter((a) => a.kind === 'practice');
    expect(practice.length).toBeGreaterThan(1);
    for (const p of practice) {
      expect(p.estimatedMinutes).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.maxActivityMinutes);
    }
    const ids = practice.map((p) => p.activityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spreads practice blocks so none run back-to-back (variety)', () => {
    const lessons = Array.from({ length: 3 }, (_, i) => ({ ...lessonHigh, lessonId: `L${i}`, slug: `s${i}` }));
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, coveragePct: 0.7, practiceWeakness: 1, candidateLessons: lessons }),
    );
    expect(r.activities.filter((a) => a.kind === 'practice').length).toBeGreaterThan(1);
    expect(noAdjacentSameKind(r.activities)).toBe(true);
  });

  it('produces a sane plan even at the 2-hour floor', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 120,
        recall: { dueLearning: 0, dueReviews: 8, newAvailable: 0, due: 8, estimatedMinutesForDue: 3 },
        candidateLessons: [lessonHigh],
      }),
    );
    expect(r.activities.length).toBeGreaterThan(0);
    expect(r.plannedMinutes).toBeLessThanOrEqual(120);
    expect(r.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
  });
});
