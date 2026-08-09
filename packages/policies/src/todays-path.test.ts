import { describe, expect, it } from 'vitest';
import {
  buildTodaysPath,
  orderActivities,
  repairItemCap,
  reviewDebtBand,
  scoreLesson,
  sizeRecall,
  TODAYS_PATH_CONFIG,
  type CarriedActivity,
  type PlannedActivity,
  type TodaysPathActivityKind,
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
    mistakesRepairable: 0,
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
  delivered: false,
  covered: false,
  unlocked: true,
  dependentsCount: null,
  estimatedMinutes: 20,
  ...over,
});

const lessonHigh = lesson({
  lessonId: 'L-high',
  slug: 'high',
  title: 'High',
  section: 'bb',
  cluster: 'BB1',
  kcCount: 6,
});
const lessonLow = lesson({
  lessonId: 'L-low',
  slug: 'low',
  title: 'Low',
  section: 'ps',
  cluster: 'PS1',
  kcCount: 1,
  covered: true,
});

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

/**
 * The unbeatable floor on the longest same-kind run for a set of activities: `o`
 * items of other kinds open at most `o + 1` gaps for the `d` items of the dominant
 * kind, so one gap must hold ceil(d / (o + 1)). Recall is pinned first by the
 * orderer and there is only ever one of it, so it counts only toward the gaps.
 */
const sameKindRunFloor = (acts: readonly { kind: string }[]): number => {
  const rest = acts.filter((a) => a.kind !== 'recall');
  if (rest.length === 0) return acts.length > 0 ? 1 : 0;
  const counts = new Map<string, number>();
  for (const a of rest) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const dominant = Math.max(...counts.values());
  return Math.max(1, Math.ceil(dominant / (rest.length - dominant + 1)));
};

const planned = (kind: TodaysPathActivityKind, id: string): PlannedActivity => ({
  activityId: id,
  kind,
  title: id,
  detail: '',
  estimatedMinutes: 10,
  count: null,
  minutesBudget: null,
  focus: null,
  lessonSlug: null,
  lessonId: null,
  priorityReason: 'NEW_LEARNING',
  carriedOver: false,
});

describe('Today\u2019s Path engine', () => {
  it('always reserves CARS Duel and never exceeds the budget', () => {
    const r = buildTodaysPath(snap());
    expect(r.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
    expect(r.plannedMinutes).toBeLessThanOrEqual(r.dailyBudgetMinutes);
  });

  it('refreshes a carried-over lesson’s estimated minutes from the current candidate', () => {
    const carriedLesson: CarriedActivity = {
      ...planned('lesson', 'lesson:carry'),
      lessonSlug: 'carry',
      lessonId: 'L-carry',
      estimatedMinutes: 15, // stale value baked in when it was first planned days ago
    };
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 360,
        carryOver: [carriedLesson],
        candidateLessons: [lesson({ lessonId: 'L-carry', slug: 'carry', estimatedMinutes: 50 })],
      }),
    );
    const carried = r.activities.find((a) => a.kind === 'lesson' && a.lessonSlug === 'carry');
    expect(carried?.carriedOver).toBe(true);
    expect(carried?.estimatedMinutes).toBe(50); // refreshed from the candidate, not the stale 15
  });

  it('puts Recall first when eligible; otherwise opens on a lesson', () => {
    const withRecall = buildTodaysPath(
      snap({
        recall: {
          dueLearning: 0,
          dueReviews: 12,
          newAvailable: 0,
          due: 12,
          estimatedMinutesForDue: 4,
        },
        candidateLessons: manyLessons(2),
      }),
    );
    expect(withRecall.activities[0]!.kind).toBe('recall');

    const noRecall = buildTodaysPath(
      snap({ practiceUnlocked: false, candidateLessons: manyLessons(2) }),
    );
    expect(noRecall.activities[0]!.kind).toBe('lesson');
  });

  it('never places two activities of the same kind back-to-back when variety is feasible', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 360,
        coveragePct: 0.6,
        practiceUnlocked: false, // no practice fill → a varied mix, so no-adjacency is achievable
        recall: {
          dueLearning: 0,
          dueReviews: 10,
          newAvailable: 0,
          due: 10,
          estimatedMinutesForDue: 4,
        },
        mistakesOpen: 5,
        candidateLessons: manyLessons(3),
      }),
    );
    expect(noAdjacentSameKind(r.activities)).toBe(true);
  });

  it('unlocks Practice WITHIN a day once enough lessons are scheduled (new learner), bounded to lesson minutes', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 240,
        practiceUnlocked: false, // brand-new learner: nothing completed across days
        candidateLessons: manyLessons(6), // but today itself schedules >= the unlock threshold
      }),
    );
    const practiceMin = r.activities
      .filter((a) => a.kind === 'practice')
      .reduce((s, a) => s + a.estimatedMinutes, 0);
    const lessonMin = r.activities
      .filter((a) => a.kind === 'lesson')
      .reduce((s, a) => s + a.estimatedMinutes, 0);
    // Practice now fills the day for a new learner whose day itself teaches enough...
    expect(practiceMin).toBeGreaterThan(0);
    // ...but is bounded to ~the day's lesson minutes (reinforcement, not budget-fill/overload).
    expect(practiceMin).toBeLessThanOrEqual(lessonMin);
  });

  it('keeps Practice OFF within a day below the lesson unlock threshold (new learner)', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 240,
        practiceUnlocked: false,
        candidateLessons: manyLessons(TODAYS_PATH_CONFIG.practiceUnlockLessons - 1),
      }),
    );
    expect(r.activities.some((a) => a.kind === 'practice')).toBe(false);
  });

  it('cuts an unavoidable same-kind run into even chunks instead of one long tail', () => {
    // 12 lessons + 2 CARS: zero adjacency is impossible, but the two CARS open three
    // gaps, so the longest lesson run must be 4 — not the 10-long tail a greedy
    // "take the fullest kind" pass leaves behind once the minority kinds run dry.
    const acts = [
      ...Array.from({ length: 12 }, (_, i) => planned('lesson', `lesson:${i}`)),
      planned('cars_duel', 'cars-duel:1'),
      planned('cars_duel', 'cars-duel:2'),
    ];
    const ordered = orderActivities(acts);
    expect(ordered.length).toBe(acts.length);
    expect(maxSameKindRun(ordered)).toBe(4);
    expect(maxSameKindRun(ordered)).toBe(sameKindRunFloor(ordered));
  });

  /**
   * Variety is an ORDERING guarantee, NOT a side effect of reserving a Review-Mistakes
   * session. Mistakes sessions are only reserved once misses are actually open, so on a
   * clean day the ordering carries variety alone: every plan must land on the floor for
   * its own activity set. Before the orderer owned this outright, the same sweep peaked
   * at a 10-long same-kind run.
   */
  it('holds the longest same-kind run at its floor across the input range, nothing open', () => {
    let worst = 0;
    for (const dailyBudgetMinutes of [120, 180, 240, 300, 360, 480]) {
      for (const recall of [
        { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
        { dueLearning: 0, dueReviews: 10, newAvailable: 0, due: 10, estimatedMinutesForDue: 4 },
        { dueLearning: 0, dueReviews: 80, newAvailable: 0, due: 80, estimatedMinutesForDue: 120 },
      ]) {
        for (const lessonCount of [0, 1, 2, 3, 6, 12]) {
          for (const practiceUnlocked of [true, false]) {
            const r = buildTodaysPath(
              snap({
                dailyBudgetMinutes,
                recall,
                practiceUnlocked,
                mistakesOpen: 0,
                candidateLessons: manyLessons(lessonCount),
              }),
            );
            const run = maxSameKindRun(r.activities);
            expect(run).toBe(sameKindRunFloor(r.activities));
            worst = Math.max(worst, run);
          }
        }
      }
    }
    // Worst case over the whole sweep: a day whose budget admits only one kind.
    expect(worst).toBeLessThanOrEqual(4);
  });

  it('includes Recall only when enough cards are due, within the card floor/ceiling', () => {
    const withDue = buildTodaysPath(
      snap({
        recall: {
          dueLearning: 0,
          dueReviews: 10,
          newAvailable: 5,
          due: 10,
          estimatedMinutesForDue: 4,
        },
      }),
    );
    const recall = withDue.activities.find((a) => a.kind === 'recall');
    expect(recall).toBeDefined();
    expect(recall!.count!).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.blocks.recallMinCards);
    expect(recall!.count!).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.recallCeiling.normal);

    const belowFloor = buildTodaysPath(
      snap({
        recall: {
          dueLearning: 0,
          dueReviews: 3,
          newAvailable: 0,
          due: 3,
          estimatedMinutesForDue: 1,
        },
      }),
    );
    expect(belowFloor.activities.some((a) => a.kind === 'recall')).toBe(false);
  });

  it('sizeRecall returns a bounded card count when enough are due, else null', () => {
    // Below the due floor → not scheduled.
    expect(
      sizeRecall(
        { dueLearning: 0, dueReviews: 2, newAvailable: 0, due: 2, estimatedMinutesForDue: 1 },
        180,
      ),
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

  it('schedules Recall for a freshly added deck (new cards, none due yet)', () => {
    // A newly imported deck is all "new" (nothing due). It must still schedule a
    // Recall block so the cards surface on Today's Path, not stay invisible until due.
    const r = sizeRecall(
      { dueLearning: 0, dueReviews: 0, newAvailable: 8, due: 0, estimatedMinutesForDue: 0 },
      180,
    );
    expect(r).not.toBeNull();
    expect(r!.cards).toBeGreaterThanOrEqual(TODAYS_PATH_CONFIG.blocks.recallMinCards);
    expect(r!.cards).toBeLessThanOrEqual(8); // never more than are available

    const built = buildTodaysPath(
      snap({
        recall: {
          dueLearning: 0,
          dueReviews: 0,
          newAvailable: 8,
          due: 0,
          estimatedMinutesForDue: 0,
        },
      }),
    );
    expect(built.activities.some((a) => a.kind === 'recall')).toBe(true);

    // Still nothing below the floor when due + new together don't reach it.
    expect(
      sizeRecall(
        { dueLearning: 0, dueReviews: 1, newAvailable: 3, due: 1, estimatedMinutesForDue: 0 },
        180,
      ),
    ).toBeNull();
  });

  it('flexes the recall ceiling above the normal 20 under a high review-debt band', () => {
    const highDebt = {
      dueLearning: 0,
      dueReviews: 80,
      newAvailable: 0,
      due: 80,
      estimatedMinutesForDue: 200,
    };
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 360, recall: highDebt }));
    expect(r.reviewDebtBand).toBe('pause_new');
    expect(r.activities.find((a) => a.kind === 'recall')!.count!).toBeGreaterThan(
      TODAYS_PATH_CONFIG.recallCeiling.normal,
    );
  });

  it('scales the repair-item cap from ~3 at 2 hr to ~5 at 6 hr', () => {
    expect(repairItemCap(120)).toBe(3); // 2 hr floor
    expect(repairItemCap(240)).toBe(4); // 4 hr
    expect(repairItemCap(360)).toBe(5); // 6 hr ceiling
    // Clamped both ways: below the floor stays 3, above the ceiling stays 5.
    expect(repairItemCap(60)).toBe(TODAYS_PATH_CONFIG.mistakesReserved.capBase);
    expect(repairItemCap(600)).toBe(TODAYS_PATH_CONFIG.mistakesReserved.capMax);
  });

  it('reserves ONE Review-Mistakes repair slot, sized 3→5 by budget from repairable', () => {
    // Plenty repairable so the budget cap, not the supply, is what binds.
    const repairable = 5;
    const short = buildTodaysPath(
      snap({ mistakesRepairable: repairable, dailyBudgetMinutes: 120 }),
    );
    const shortSessions = short.activities.filter((a) => a.kind === 'review_mistakes');
    // A SINGLE slot (the guided runner feeds every mistake one at a time), never a
    // fan-out of short spacers.
    expect(shortSessions).toHaveLength(1);
    expect(shortSessions[0]!.count).toBe(TODAYS_PATH_CONFIG.mistakesReserved.capBase); // ~3 at 2 hr

    const long = buildTodaysPath(snap({ mistakesRepairable: repairable, dailyBudgetMinutes: 360 }));
    const longSessions = long.activities.filter((a) => a.kind === 'review_mistakes');
    expect(longSessions).toHaveLength(1);
    expect(longSessions[0]!.count).toBe(TODAYS_PATH_CONFIG.mistakesReserved.capMax); // ~5 at 6 hr

    // ~3 minutes per repair sizes the section (count × mistakePerItem), never above repairable.
    for (const s of [...shortSessions, ...longSessions]) {
      expect(s.estimatedMinutes).toBe(s.count! * TODAYS_PATH_CONFIG.costs.mistakePerItem);
      expect(s.count!).toBeLessThanOrEqual(repairable);
    }
  });

  it('never sizes the slot above what is repairable, even on a long budget', () => {
    // Only 3 repairable on a 6 hr day whose cap is 5 → the slot is 3, not 5.
    const r = buildTodaysPath(snap({ mistakesRepairable: 3, dailyBudgetMinutes: 360 }));
    const session = r.activities.find((a) => a.kind === 'review_mistakes');
    expect(session).toBeDefined();
    expect(session!.count).toBe(3);
    expect(session!.estimatedMinutes).toBe(3 * TODAYS_PATH_CONFIG.costs.mistakePerItem);
  });

  /**
   * The slot must not promise work the runner cannot serve. Reserving against
   * unservable misses is exactly the dead end that shipped: the learner is told
   * mistakes piled up and lands on an empty page. The gate is now REPAIRABLE
   * (servable + prioritized), not the raw open count.
   */
  it('reserves no Mistakes slot below the declared repairable eligibility', () => {
    for (const repairable of [0, TODAYS_PATH_CONFIG.eligibility.mistakesMinOpen - 1]) {
      const r = buildTodaysPath(snap({ mistakesRepairable: repairable, dailyBudgetMinutes: 360 }));
      expect(r.activities.some((a) => a.kind === 'review_mistakes')).toBe(false);
    }
    // A large raw open count that is not REPAIRABLE (untaught KCs, etc.) still schedules nothing.
    const openButUnservable = buildTodaysPath(
      snap({ mistakesOpen: 20, mistakesRepairable: 0, dailyBudgetMinutes: 360 }),
    );
    expect(openButUnservable.activities.some((a) => a.kind === 'review_mistakes')).toBe(false);

    const eligible = buildTodaysPath(
      snap({
        mistakesRepairable: TODAYS_PATH_CONFIG.eligibility.mistakesMinOpen,
        dailyBudgetMinutes: 360,
      }),
    );
    const sessions = eligible.activities.filter((a) => a.kind === 'review_mistakes');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.count!).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.eligibility.mistakesMinOpen);
  });

  it('keeps long practice runs spread even with the single Mistakes slot', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 360,
        practiceUnlocked: true,
        candidateLessons: manyLessons(2),
        mistakesRepairable: 5,
      }),
    );
    // Spreading no longer DEPENDS on multiple mistakes sessions — the orderer owns it —
    // but the one slot is still present, and practice never runs more than 2 deep.
    expect(r.activities.filter((a) => a.kind === 'practice').length).toBeGreaterThan(1);
    expect(r.activities.filter((a) => a.kind === 'review_mistakes')).toHaveLength(1);
    expect(maxSameKindRun(r.activities)).toBeLessThanOrEqual(2);
  });

  it('pauses new lessons under a high review-debt band', () => {
    expect(
      reviewDebtBand(
        { dueLearning: 0, dueReviews: 0, newAvailable: 0, due: 0, estimatedMinutesForDue: 0 },
        180,
      ),
    ).toBe('normal');
    const r = buildTodaysPath(
      snap({
        recall: {
          dueLearning: 0,
          dueReviews: 60,
          newAvailable: 0,
          due: 60,
          estimatedMinutesForDue: 120,
        },
        candidateLessons: [lessonHigh],
      }),
    );
    expect(r.reviewDebtBand).toBe('pause_new');
    expect(r.activities.some((a) => a.kind === 'lesson')).toBe(false);
  });

  it('only offers UNLOCKED, non-mastered lessons, stronger value first', () => {
    const locked = lesson({ lessonId: 'L-locked', slug: 'locked', unlocked: false });
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 120,
        practiceUnlocked: false,
        candidateLessons: [lessonLow, lessonHigh, locked],
      }),
    );
    const lessons = r.activities.filter((a) => a.kind === 'lesson');
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0]!.lessonSlug).toBe('high');
    expect(lessons.some((a) => a.lessonSlug === 'locked')).toBe(false);
  });

  it('excludes mastered lessons', () => {
    const r = buildTodaysPath(
      snap({
        practiceUnlocked: false,
        candidateLessons: [lesson({ ...lessonHigh, mastered: true })],
      }),
    );
    expect(r.activities.some((a) => a.kind === 'lesson')).toBe(false);
  });

  /**
   * Delivery is not capability. A lesson finished at the prior with no evidence
   * used to arrive here as `mastered: true` — the producer OR'd completion into
   * the claim — and the new-lesson filter then dropped it for good. These three
   * pin the replacement from both sides: it is no longer NEW work, it is still
   * REACHABLE, and it is never dressed up as new teaching.
   */
  describe('a delivered lesson whose mastery claim is withheld', () => {
    const deliveredWeak = lesson({
      ...lessonHigh,
      delivered: true,
      mastered: false,
      pL: 0.2,
    });

    it('is not offered as new work', () => {
      const r = buildTodaysPath(
        snap({ practiceUnlocked: false, candidateLessons: [deliveredWeak] }),
      );
      const newWork = r.activities.filter(
        (a) => a.kind === 'lesson' && a.priorityReason !== 'TAUGHT_NOT_MASTERED',
      );
      expect(newWork).toEqual([]);
    });

    it('stays reachable as reinforcement rather than vanishing from the plan', () => {
      const r = buildTodaysPath(
        snap({ practiceUnlocked: false, candidateLessons: [deliveredWeak] }),
      );
      const offered = r.activities.filter((a) => a.lessonId === deliveredWeak.lessonId);
      expect(offered).toHaveLength(1);
      expect(offered[0]!.priorityReason).toBe('TAUGHT_NOT_MASTERED');
      expect(offered[0]!.detail).toContain('Revisit');
      // The same activity id as the new-work offer, so the authority's same-day
      // rebuild restores its completed status instead of showing a second copy.
      expect(offered[0]!.activityId).toBe(`lesson:${deliveredWeak.slug}`);
    });

    it('is dropped once the claim is warranted, and stays dropped while locked', () => {
      const mastered = buildTodaysPath(
        snap({
          practiceUnlocked: false,
          candidateLessons: [lesson({ ...deliveredWeak, mastered: true })],
        }),
      );
      expect(mastered.activities.some((a) => a.kind === 'lesson')).toBe(false);

      const locked = buildTodaysPath(
        snap({
          practiceUnlocked: false,
          candidateLessons: [lesson({ ...deliveredWeak, unlocked: false })],
        }),
      );
      expect(locked.activities.some((a) => a.kind === 'lesson')).toBe(false);
    });

    it('never outranks new teaching for the day, and is capped', () => {
      const delivered = Array.from({ length: 4 }, (_, i) =>
        lesson({ lessonId: `D${i}`, slug: `d${i}`, delivered: true, pL: 0.2 }),
      );
      const r = buildTodaysPath(
        snap({
          dailyBudgetMinutes: 120,
          practiceUnlocked: false,
          candidateLessons: [...delivered, lessonHigh],
        }),
      );
      const lessons = r.activities.filter((a) => a.kind === 'lesson');
      expect(lessons.filter((a) => a.priorityReason === 'TAUGHT_NOT_MASTERED')).toHaveLength(
        TODAYS_PATH_CONFIG.reinforcementLessonCap,
      );
      expect(lessons.some((a) => a.lessonSlug === lessonHigh.slug)).toBe(true);
    });
  });

  it('caps a fresh Day-1 lesson wall and keeps the same-kind run short', () => {
    // Fresh Day 1: Practice locked, nothing due, no open mistakes — only new lessons
    // plus the daily CARS. Filling the whole budget with lessons made a long
    // back-to-back lesson run the orderer could only break with the single CARS; the
    // new-lesson cap keeps the day varied instead.
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 360,
        practiceUnlocked: false,
        recall: {
          dueLearning: 0,
          dueReviews: 0,
          newAvailable: 0,
          due: 0,
          estimatedMinutesForDue: 0,
        },
        mistakesOpen: 0,
        candidateLessons: manyLessons(20),
      }),
    );
    const lessons = r.activities.filter((a) => a.kind === 'lesson');
    expect(lessons.length).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.newLessonCapMax);
    // No long lesson wall, and still exactly at the provable floor for its own set
    // (the max-spread rule that holds on later days is untouched).
    expect(maxSameKindRun(r.activities)).toBeLessThanOrEqual(3);
    expect(maxSameKindRun(r.activities)).toBe(sameKindRunFloor(r.activities));
  });

  it('admits more new lessons on a larger budget', () => {
    const count = (b: number) =>
      buildTodaysPath(
        snap({ dailyBudgetMinutes: b, practiceUnlocked: false, candidateLessons: manyLessons(8) }),
      ).activities.filter((a) => a.kind === 'lesson').length;
    expect(count(360)).toBeGreaterThan(count(120));
  });

  it('locks Practice until enough lessons are completed (unlock gate)', () => {
    expect(
      buildTodaysPath(snap({ practiceUnlocked: false, practiceReviewNeed: 20 })).activities.some(
        (a) => a.kind === 'practice',
      ),
    ).toBe(false);
    expect(
      buildTodaysPath(snap({ practiceUnlocked: true, practiceReviewNeed: 20 })).activities.some(
        (a) => a.kind === 'practice',
      ),
    ).toBe(true);
  });

  it('fills (nearly) the whole budget once Practice is unlocked', () => {
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, practiceUnlocked: true, candidateLessons: manyLessons(2) }),
    );
    expect(r.plannedMinutes).toBeGreaterThanOrEqual(340);
    expect(r.freeStudyMinutes).toBeLessThanOrEqual(20);
    expect(r.plannedMinutes).toBeLessThanOrEqual(360);
  });

  it('leaves the day only partly filled (free study) when Practice is locked and lessons run out', () => {
    const r = buildTodaysPath(
      snap({ dailyBudgetMinutes: 360, practiceUnlocked: false, candidateLessons: manyLessons(2) }),
    );
    expect(r.activities.some((a) => a.kind === 'practice')).toBe(false);
    expect(r.freeStudyMinutes).toBeGreaterThan(0);
  });

  it('caps each practice block at <=45 min (count == minutes / 2)', () => {
    const r = buildTodaysPath(snap({ dailyBudgetMinutes: 240, practiceUnlocked: true }));
    const practice = r.activities.find((a) => a.kind === 'practice');
    expect(practice).toBeDefined();
    expect(practice!.count!).toBeLessThanOrEqual(
      Math.floor(
        TODAYS_PATH_CONFIG.maxActivityMinutes / TODAYS_PATH_CONFIG.costs.practicePerQuestion,
      ),
    );
    expect(practice!.estimatedMinutes).toBe(
      practice!.count! * TODAYS_PATH_CONFIG.costs.practicePerQuestion,
    );
  });

  it('keeps non-lesson activities within maxActivityMinutes', () => {
    for (const budget of [120, 180, 240, 300, 360]) {
      const r = buildTodaysPath(
        snap({
          dailyBudgetMinutes: budget,
          coveragePct: 0.5,
          practiceUnlocked: true,
          practiceReviewNeed: 60,
          recall: {
            dueLearning: 0,
            dueReviews: 80,
            newAvailable: 0,
            due: 80,
            estimatedMinutesForDue: 30,
          },
          mistakesOpen: 20,
          candidateLessons: manyLessons(6),
        }),
      );
      for (const a of r.activities.filter((activity) => activity.kind !== 'lesson')) {
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
    for (const p of practice)
      expect(p.estimatedMinutes).toBeLessThanOrEqual(TODAYS_PATH_CONFIG.maxActivityMinutes);
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
      {
        activityId: 'practice',
        kind: 'practice',
        title: 'Practice',
        detail: 'carried',
        estimatedMinutes: 20,
        count: 10,
        minutesBudget: 20,
        focus: null,
        lessonSlug: null,
        lessonId: null,
        priorityReason: 'NEW_LEARNING',
      },
      {
        activityId: 'lesson:s0',
        kind: 'lesson',
        title: 'L0',
        detail: 'carried',
        estimatedMinutes: 20,
        count: null,
        minutesBudget: null,
        focus: null,
        lessonSlug: 's0',
        lessonId: 'L0',
        priorityReason: 'NEW_LEARNING',
      },
    ];
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 240,
        practiceUnlocked: true,
        practiceReviewNeed: 40,
        candidateLessons: [
          lesson({ lessonId: 'L0', slug: 's0' }),
          lesson({ lessonId: 'L1', slug: 's1' }),
        ],
        carryOver,
      }),
    );
    const ids = r.activities.map((a) => a.activityId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.plannedMinutes).toBeLessThanOrEqual(
      Math.round(240 * TODAYS_PATH_CONFIG.carryOverCapPct),
    );
    expect(r.activities.filter((a) => a.activityId === 'practice').length).toBe(1);
    expect(r.activities.filter((a) => a.activityId === 'lesson:s0').length).toBe(1);
  });

  it('produces a sane plan even at the 2-hour floor', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 120,
        recall: {
          dueLearning: 0,
          dueReviews: 8,
          newAvailable: 0,
          due: 8,
          estimatedMinutesForDue: 3,
        },
        candidateLessons: [lessonHigh],
      }),
    );
    expect(r.activities.length).toBeGreaterThan(0);
    expect(r.plannedMinutes).toBeLessThanOrEqual(120);
    expect(r.activities.some((a) => a.kind === 'cars_duel')).toBe(true);
  });

  it('budgets a lesson at its supplied 57-minute estimate, not the flat 20-minute cost', () => {
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 120,
        practiceUnlocked: false,
        candidateLessons: [lesson({ lessonId: 'L-long', slug: 'long', estimatedMinutes: 57 })],
      }),
    );

    const scheduled = r.activities.find((a) => a.kind === 'lesson');
    expect(scheduled?.estimatedMinutes).toBe(57);
    expect(r.plannedMinutes).toBe(69); // 12-minute CARS + the real 57-minute lesson
  });
});

/**
 * Today's Path is strictly in-order with no skip, so a scheduled step whose runner
 * opens empty (e.g. Recall reserved as "N due" against 0 actual cards) pins the plan
 * to itself and locks every later step. The engine's job is to not emit such a step in
 * the first place; the runner carries a matching safety net for the estimate/reality
 * gap it cannot see. No mastery is read or written on this path.
 */
describe('never schedules a step it cannot fulfil (no deadlock)', () => {
  const carriedRecall = (over: Partial<CarriedActivity> = {}): CarriedActivity => ({
    activityId: 'recall',
    kind: 'recall',
    title: 'Recall',
    detail: '10 flashcards due (spaced repetition).',
    estimatedMinutes: 4,
    count: 10,
    minutesBudget: 4,
    focus: null,
    lessonSlug: null,
    lessonId: null,
    priorityReason: 'OVERDUE_REVIEW',
    ...over,
  });

  const nothingDue = {
    dueLearning: 0,
    dueReviews: 0,
    newAvailable: 0,
    due: 0,
    estimatedMinutesForDue: 0,
  };

  it('omits fresh Recall when zero cards are due', () => {
    const r = buildTodaysPath(
      snap({ recall: nothingDue, candidateLessons: manyLessons(2), practiceUnlocked: false }),
    );
    expect(r.activities.some((a) => a.kind === 'recall')).toBe(false);
  });

  it('drops a carried-over Recall when nothing is due today, and leads with real work', () => {
    // Without the guard the carried step is re-reserved verbatim — "N due" against 0
    // actual cards — and, pinned first, deadlocks the whole day. It is dropped instead,
    // so the plan opens on something the learner can actually do.
    const r = buildTodaysPath(
      snap({
        recall: nothingDue,
        carryOver: [carriedRecall()],
        candidateLessons: manyLessons(2),
        practiceUnlocked: false,
      }),
    );
    expect(r.activities.some((a) => a.kind === 'recall')).toBe(false);
    expect(r.activities.length).toBeGreaterThan(0);
    expect(r.activities[0]!.kind).not.toBe('recall');
  });

  it('still carries Recall forward when cards are genuinely due', () => {
    // The guard is scoped to the unfulfillable case only: real due cards keep the
    // carried Recall (and the orderer still pins it first).
    const r = buildTodaysPath(
      snap({
        recall: {
          dueLearning: 0,
          dueReviews: 10,
          newAvailable: 0,
          due: 10,
          estimatedMinutesForDue: 4,
        },
        carryOver: [carriedRecall()],
        candidateLessons: manyLessons(2),
        practiceUnlocked: false,
      }),
    );
    const recall = r.activities.filter((a) => a.kind === 'recall');
    expect(recall).toHaveLength(1);
    expect(recall[0]!.carriedOver).toBe(true);
    expect(r.activities[0]!.kind).toBe('recall');
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

  it('uses a confirmed zero downstream count instead of the KC-count fallback', () => {
    const s = snap();
    const leafInRealGraph = lesson({ kcCount: 6, dependentsCount: 0 });
    const missingGraph = { ...leafInRealGraph, dependentsCount: null } as TodaysPathCandidateLesson;

    expect(scoreLesson(leafInRealGraph, s, cfg)).toBeLessThan(scoreLesson(missingGraph, s, cfg));
  });

  it('lets post-discount learning need outrank a short lesson’s KC-count proxy', () => {
    const s = snap();
    // One correct lesson exit moves P(L) from 0.2 to 0.430401 at the discounted
    // guess rate. That 57-minute lesson still needs teaching; the 12-minute
    // comparison lesson is nearly mastered but has the larger KC-count proxy.
    const highNeedLong = lesson({
      lessonId: 'L-high-need',
      slug: 'high-need',
      title: 'High need',
      kcCount: 1,
      pL: 0.430401,
      estimatedMinutes: 57,
    });
    const lowNeedShort = lesson({
      lessonId: 'L-low-need',
      slug: 'low-need',
      title: 'Low need',
      kcCount: 6,
      pL: 0.9,
      estimatedMinutes: 12,
    });
    const before = { ...cfg, masteryWeight: 0.2 };

    // Before the tuning, KC count wins. The raised weight reverses this exact
    // ordering, and only 58 minutes remain after CARS: just one of these lessons
    // fits. The old order picks the easy short lesson; the tuned order picks need.
    expect(scoreLesson(highNeedLong, s, before)).toBeLessThan(scoreLesson(lowNeedShort, s, before));
    expect(scoreLesson(highNeedLong, s, cfg)).toBeGreaterThan(scoreLesson(lowNeedShort, s, cfg));
    const input = snap({
      dailyBudgetMinutes: 70,
      practiceUnlocked: false,
      candidateLessons: [lowNeedShort, highNeedLong],
    });
    const beforePath = buildTodaysPath(input, before);
    const r = buildTodaysPath(
      snap({
        dailyBudgetMinutes: 70,
        practiceUnlocked: false,
        candidateLessons: [lowNeedShort, highNeedLong],
      }),
    );
    expect(beforePath.activities.filter((a) => a.kind === 'lesson').map((a) => a.lessonId)).toEqual(
      ['L-low-need'],
    );
    expect(r.activities.filter((a) => a.kind === 'lesson').map((a) => a.lessonId)).toEqual([
      'L-high-need',
    ]);
  });

  it('treats undefined pL identically to the P(L)_0 prior (0.2) — no change vs baseline', () => {
    const s = snap();
    const absent = scoreLesson(lesson(), s, cfg); // no pL provided
    const atPrior = scoreLesson(lesson({ pL: 0.2 }), s, cfg);
    expect(absent).toBe(atPrior);
  });
});
