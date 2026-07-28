import { describe, expect, it } from 'vitest';
import {
  buildTodaysPath,
  reviewDebtBand,
  scoreLesson,
  sizeRecall,
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
    practiceUnlocked: true,
    practiceReviewNeed: 10,
    candidateLessons: [],
    carryOver: [],
    ...overrides,
  };
}

const lesson = (over: Partial<TodaysPathCandidateLesson> = {}): TodaysPathCandidateLesson => ({
  lessonId: 'L',
  slug: 's',
  title: 'Lesson',
  section: 'bb',
  cluster: 'BB1',
  kcCount: 4,
  mastered: false,
  covered: false,
  unlocked: true,
  dependentsCount: 0,
  ...over,
});

const lessonHigh = lesson({ lessonId: 'L-high', slug: 'high', title: 'High', section: 'bb', cluster: 'BB1', kcCount: 6 });
const lessonLow = lesson({ lessonId: 'L-low', slug: 'low', title: 'Low', section: 'ps', cluster: 'PS1', kcCount: 1, covered: true });

const manyLessons = (n: number): TodaysPathCandidateLesson[] =>
  Array.from({ length: n }, (_, i) => lesson({ lessonId: `L${i}`, slug: `s${i}` }));

const noAdjacentSameKind = (acts: readonly { kind: string }[]): boolean =>
  acts.every((a, i) => i === 0 || a.kind !== acts[i - 1]!.kind);

/** Longest run of consecutive same-kind activities (1 = perfectly interleaved). */
const maxSameKindRun = (acts: readonly { kind: string }[]): number => {
  let max = 0;
  let run = 0;
  let prev: string | null = null;
  for (const a of acts) {
    run = a.kind === prev ? run + 1 : 1;
    prev = a.kind;
    if (run > max) max = run;
  }
  return max;
};

describe('Today\u2019s Path engine', () => {
  it('always reserves CARS Duel and never exceeds the budget', () => {
    const r = buildTodaysPath(snap());
    expect(r.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
    expect(r.plannedMinutes).toBeLessThanOrEqual(r.dailyBudgetMinutes);
  });

  it('puts Recall first when eligible; otherwise opens on a lesson', () => {
    const withRecall = buildTodaysPath(
      snap({
        recall: { dueLearning: 0, dueReviews: 12, newAvailable: 0, due: 12, estimatedMinutesForDue: 4 },
        candidateLessons: manyLessons(2),
      }),
    );
    expect(withRecall.activities[0]!.kind).toBe('recall');

    const noRecall = buildTodaysPath(snap({ practiceUnlocked: false, candidateLessons: manyLessons(2) }));
    expect(noRecall.activities[0]!.kind).toBe('lesson');
  });

  it('never places two activities of the same kind back-to-back when variety is feasible', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 360,
        coveragePct: 0.6,
        practiceUnlocked: false, // no practice fill → a varied mix, so no-adjacency is achievable
        recall: { dueLearning: 0, dueReviews: 10, newAvailable: 0, due: 10, estimatedMinutesForDue: 4 },
        mistakesOpen: 5,
        candidateLessons: manyLessons(3),
      }),
    );
    expect(noAdjacentSameKind(r.activities)).toBe(true);
  });

  it('includes Recall only when enough cards are due, within the card floor/ceiling', () => {
    const withDue = buildTodaysPath(
      snap({ recall: { dueLearning: 0, dueReviews: 10, newAvailable: 5, due: 10, estimatedMinutesForDue: 4 } }),
    );
    const recall = withDue.activities.find((a) => a.kind === 'recall');
    expect(recall).toBeDefined();
    expect(recall!.count!).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.blocks.recallMinCards);
    expect(recall!.count!).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.recallCeiling.normal);

    const belowFloor = buildTodaysPath(
      snap({ recall: { dueLearning: 0, dueReviews: 3, newAvailable: 0, due: 3, estimatedMinutesForDue: 1 } }),
    );
    expect(belowFloor.activities.some((a) => a.kind === 'recall')).toBe(false);
  });

  it('sizeRecall returns a bounded card count when enough are due, else null', () => {
    // Below the due floor → not scheduled.
    expect(
      sizeRecall({ dueLearning: 0, dueReviews: 2, newAvailable: 0, due: 2, estimatedMinutesForDue: 1 }, 180),
    ).toBeNull();
    // Enough due → a count within the floor/ceiling, minutes derived from the card cost.
    const r = sizeRecall(
      { dueLearning: 0, dueReviews: 40, newAvailable: 10, due: 40, estimatedMinutesForDue: 12 },
      180,
    );
    expect(r).not.toBeNull();
    expect(r!.cards).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.blocks.recallMinCards);
    expect(r!.cards).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.recallCeiling.normal);
    expect(r!.minutes).toBe(Math.round(r!.cards * TODAYS_PATH_CONFIG.costs.recallPerCard));
  });

  it('flexes the recall ceiling above the normal 20 under a high review-debt band', () => {
    const highDebt = { dueLearning: 0, dueReviews: 80, newAvailable: 0, due: 80, estimatedMinutesForDue: 200 };
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 360, recall: highDebt }));
    expect(r.reviewDebtBand).toBe('pause_new');
    expect(r.activities.find((a) => a.kind === 'recall')!.count!).toBeGreaterThan(
      TODAYS_PATH_CONFIG.recallCeiling.normal,
    );
  });

  it('reserves short Review-Mistakes spacer sessions every day (2/day, 3 on longer budgets), even with none open', () => {
    const short = buildTodaysPath(snap({ mistakesOpen: 0, dailyBudgetMinutes: 180 }));
    const shortSessions = short.activities.filter((a) => a.kind === 'review_mistakes');
    expect(shortSessions.length).toBe(TODAYS_PATH_CONFIG.mistakesReserved.perDay);

    const long = buildTodaysPath(snap({ mistakesOpen: 0, dailyBudgetMinutes: 360 }));
    const longSessions = long.activities.filter((a) => a.kind === 'review_mistakes');
    expect(longSessions.length).toBe(TODAYS_PATH_CONFIG.mistakesReserved.perDayLongBudget);

    // Every reserved session stays short (bounded by the max-items ceiling) with a floor.
    const shortCap =
      TODAYS_PATH_CONFIG.mistakesReserved.maxItems * TODAYS_PATH_CONFIG.costs.mistakePerItem;
    for (const s of [...shortSessions, ...longSessions]) {
      expect(s.estimatedMinutes).toBeLessThanOrEqual(shortCap);
      expect(s.count!).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.mistakesReserved.minItems);
    }
  });

  it('uses the reserved Mistakes sessions as spacers to break up long practice runs', () => {
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, practiceUnlocked: true, candidateLessons: manyLessons(2) }),
    );
    // Several practice blocks + reserved mistakes sessions, and no long same-kind run
    // survives — the spacers separate what used to be back-to-back practice.
    expect(r.activities.filter((a) => a.kind === 'practice').length).toBeGreaterThan(1);
    expect(r.activities.filter((a) => a.kind === 'review_mistakes').length).toBeGreaterThanOrEqual(2);
    expect(maxSameKindRun(r.activities)).toBeLessThanOrEqual(2);
  });

  it('pauses new lessons under a high review-debt band', () => {
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

  it('only offers UNLOCKED, non-mastered lessons, stronger value first', () => {
    const locked = lesson({ lessonId: 'L-locked', slug: 'locked', unlocked: false });
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 120, practiceUnlocked: false, candidateLessons: [lessonLow, lessonHigh, locked] }),
    );
    const lessons = r.activities.filter((a) => a.kind === 'lesson');
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0]!.lessonSlug).toBe('high');
    expect(lessons.some((a) => a.lessonSlug === 'locked')).toBe(false);
  });

  it('excludes mastered lessons', () => {
    const r = buildTodaysPath(
      snap({ practiceUnlocked: false, candidateLessons: [lesson({ ...lessonHigh, mastered: true })] }),
    );
    expect(r.activities.some((a) => a.kind === 'lesson')).toBe(false);
  });

  it('admits more new lessons on a larger budget', () => {
    const count = (b: number) =>
      buildTodaysPath(snap({ dailyBudgetMinutes: b, practiceUnlocked: false, candidateLessons: manyLessons(8) }))
        .activities.filter((a) => a.kind === 'lesson').length;
    expect(count(360)).toBeGreaterThan(count(120));
  });

  it('locks Practice until enough lessons are completed (unlock gate)', () => {
    expect(buildTodaysPath(snap({ practiceUnlocked: false, practiceReviewNeed: 20 })).activities.some((a) => a.kind === 'practice')).toBe(false);
    expect(buildTodaysPath(snap({ practiceUnlocked: true, practiceReviewNeed: 20 })).activities.some((a) => a.kind === 'practice')).toBe(true);
  });

  it('fills (nearly) the whole budget once Practice is unlocked', () => {
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 360, practiceUnlocked: true, candidateLessons: manyLessons(2) }));
    expect(r.plannedMinutes).toBeGreaterThanOrEqual(340);
    expect(r.freeStudyMinutes).toBeLessThanOrEqual(20);
    expect(r.plannedMinutes).toBeLessThanOrEqual(360);
  });

  it('leaves the day only partly filled (free study) when Practice is locked and lessons run out', () => {
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 360, practiceUnlocked: false, candidateLessons: manyLessons(2) }));
    expect(r.activities.some((a) => a.kind === 'practice')).toBe(false);
    expect(r.freeStudyMinutes).toBeGreaterThan(0);
  });

  it('caps each practice block at <=45 min (count == minutes / 2)', () => {
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 240, practiceUnlocked: true }));
    const practice = r.activities.find((a) => a.kind === 'practice');
    expect(practice).toBeDefined();
    expect(practice!.count!).toBeLessThanOrEqual(
      Math.floor(TODAYS_PATH_CONFIG.maxActivityMinutes / TODAYS_PATH_CONFIG.costs.practicePerQuestion),
    );
    expect(practice!.estimatedMinutes).toBe(practice!.count! * TODAYS_PATH_CONFIG.costs.practicePerQuestion);
  });

  it('never schedules a single activity longer than maxActivityMinutes', () => {
    for (const budget of [120, 180, 240, 300, 360]) {
      const r = buildTodaysPath(
        snap({
          dailyBudgetMinutes: budget,
          coveragePct: 0.5,
          practiceUnlocked: true,
          practiceReviewNeed: 60,
          recall: { dueLearning: 0, dueReviews: 80, newAvailable: 0, due: 80, estimatedMinutesForDue: 30 },
          mistakesOpen: 20,
          candidateLessons: manyLessons(6),
        }),
      );
      for (const a of r.activities) {
        expect(a.estimatedMinutes).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.maxActivityMinutes);
      }
    }
  });

  it('splits a large practice workload into multiple ≤45-min blocks with unique ids', () => {
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, practiceUnlocked: true, candidateLessons: manyLessons(3) }),
    );
    const practice = r.activities.filter((a) => a.kind === 'practice');
    expect(practice.length).toBeGreaterThan(1);
    for (const p of practice) expect(p.estimatedMinutes).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.maxActivityMinutes);
    const ids = practice.map((p) => p.activityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds a 2nd CARS Duel only on longer presets', () => {
    const short = buildTodaysPath(snap({ dailyBudgetMinutes: 180 }));
    const long = buildTodaysPath(snap({ dailyBudgetMinutes: 300 }));
    expect(short.activities.filter((a) => a.kind === 'cars_duel').length).toBe(1);
    expect(long.activities.filter((a) => a.kind === 'cars_duel').length).toBe(2);
  });

  it('reserves carry-over first and caps total load at ~125% of the preset (no duplicate ids)', () => {
    const carryOver: CarriedActivity[] = [
      { activityId: 'practice', kind: 'practice', title: 'Practice', detail: 'carried', estimatedMinutes: 20, count: 10, minutesBudget: 20, focus: null, lessonSlug: null, lessonId: null, priorityReason: 'NEW_LEARNING' },
      { activityId: 'lesson:s0', kind: 'lesson', title: 'L0', detail: 'carried', estimatedMinutes: 20, count: null, minutesBudget: null, focus: null, lessonSlug: 's0', lessonId: 'L0', priorityReason: 'NEW_LEARNING' },
    ];
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 240, practiceUnlocked: true, practiceReviewNeed: 40, candidateLessons: [lesson({ lessonId: 'L0', slug: 's0' }), lesson({ lessonId: 'L1', slug: 's1' })], carryOver }),
    );
    const ids = r.activities.map((a) => a.activityId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.plannedMinutes).toBeLessThanOrEqual(Math.round(240 * TODAYS_PATH_CONFIG.carryOverCapPct));
    expect(r.activities.filter((a) => a.activityId === 'practice').length).toBe(1);
    expect(r.activities.filter((a) => a.activityId === 'lesson:s0').length).toBe(1);
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

describe('scoreLesson mastery nudge', () => {
  const cfg = TODAYS_PATH_CONFIG;

  it('scores a LESS-mastered lesson higher when everything else is equal', () => {
    const s = snap();
    // Identical candidates differing ONLY in P(L): the lower-mastery one needs the
    // work, so it should score strictly higher.
    const lessMastered = scoreLesson(lesson({ pL: 0.1 }), s, cfg);
    const moreMastered = scoreLesson(lesson({ pL: 0.9 }), s, cfg);
    expect(lessMastered).toBeGreaterThan(moreMastered);
  });

  it('keeps mastery MINOR: a clearly stronger primary driver still outranks a slightly-less-mastered lesson', () => {
    const s = snap();
    // Strong primary driver (unlocks many downstream lessons) but MORE mastered, so
    // the mastery nudge works AGAINST it.
    const strongDriver = scoreLesson(
      lesson({ section: 'bb', dependentsCount: 4, covered: false, pL: 0.5 }),
      s,
      cfg,
    );
    // Weak primary driver (nothing depends on it) but slightly LESS mastered, so the
    // mastery nudge works FOR it.
    const weakDriver = scoreLesson(
      lesson({ section: 'bb', dependentsCount: 0, kcCount: 1, covered: false, pL: 0.4 }),
      s,
      cfg,
    );
    // The driver gap dominates: mastery can tip near-ties, never override a real driver.
    expect(strongDriver).toBeGreaterThan(weakDriver);
  });

  it('treats undefined pL identically to the P(L)_0 prior (0.2) — no change vs baseline', () => {
    const s = snap();
    const absent = scoreLesson(lesson(), s, cfg); // no pL provided
    const atPrior = scoreLesson(lesson({ pL: 0.2 }), s, cfg);
    expect(absent).toBe(atPrior);
  });
});
