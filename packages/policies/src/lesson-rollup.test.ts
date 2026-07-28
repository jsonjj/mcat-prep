import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, type UtcTimestamp } from '@mcat/contracts';
import { MASTERY_THRESHOLD, PRIOR_PL0 } from './bkt';
import { initialMemoryState, type MemoryState } from './forgetting';
import {
  isLessonRollupAvailable,
  rollUpLessonMastery,
  type LessonRollupInput,
  type LessonRollupView,
} from './lesson-rollup';

const at = (iso: string): UtcTimestamp => UtcTimestampSchema.parse(iso);
const T0 = at('2026-07-20T12:00:00.000Z');
const daysAfter = (n: number): UtcTimestamp =>
  at(new Date(Date.parse(T0) + n * 86_400_000).toISOString());

/** A KC that has been practiced, with `pL` stored as-of `lastPracticedAt`. */
const practiced = (
  pL: number,
  lastPracticedAt: UtcTimestamp = T0,
  halfLifeDays = 7,
): MemoryState => ({
  pL,
  halfLifeDays,
  lastPracticedAt,
  lastDueReviewAt: null,
});

const rollup = (input: LessonRollupInput): LessonRollupView => {
  const result = rollUpLessonMastery(input);
  if (!isLessonRollupAvailable(result)) {
    throw new Error(`expected an available rollup: ${result.rejectionCodes.join()}`);
  }
  return result.view;
};

describe('lesson rollup (derived, never a BKT grain)', () => {
  it('uses every required member KC and exposes the arithmetic mean as the lesson pL', () => {
    const view = rollup({
      lessonId: 'lesson-enz-inhibition',
      requiredKcIds: ['kc-a', 'kc-b', 'kc-c'],
      kcStates: { 'kc-a': practiced(0.9), 'kc-b': practiced(0.6), 'kc-c': practiced(0.3) },
      now: T0,
    });
    expect(view.requiredKcCount).toBe(3);
    expect(view.members.map((m) => m.kcId)).toEqual(['kc-a', 'kc-b', 'kc-c']);
    expect(view.pL).toBeCloseTo((0.9 + 0.6 + 0.3) / 3, 12);
  });

  it('keeps the authored curriculum order of the required KC list', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-c', 'kc-a', 'kc-b'],
      kcStates: { 'kc-a': practiced(0.9), 'kc-b': practiced(0.6), 'kc-c': practiced(0.3) },
      now: T0,
    });
    expect(view.members.map((m) => m.kcId)).toEqual(['kc-c', 'kc-a', 'kc-b']);
  });

  it('reads current lazily-decayed KC values rather than stored ones', () => {
    const fresh = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a'],
      kcStates: { 'kc-a': practiced(0.96) },
      now: T0,
    });
    const decayed = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a'],
      kcStates: { 'kc-a': practiced(0.96) },
      now: daysAfter(7), // exactly one half-life
    });
    expect(fresh.pL).toBeCloseTo(0.96, 12);
    expect(decayed.pL).toBeCloseTo(0.48, 12);
  });

  it('never decays a never-practiced KC state', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a'],
      kcStates: { 'kc-a': initialMemoryState(0.5) },
      now: daysAfter(365),
    });
    expect(view.pL).toBeCloseTo(0.5, 12);
  });

  it('masters a lesson only when EVERY required KC is at or above the threshold', () => {
    const all = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a', 'kc-b'],
      kcStates: { 'kc-a': practiced(MASTERY_THRESHOLD), 'kc-b': practiced(0.99) },
      now: T0,
    });
    expect(all.mastered).toBe(true);
  });

  it('does NOT master a lesson whose mean is above threshold but which has one weak KC', () => {
    // mean = 0.9767 > 0.95, yet one KC is far below the line.
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a', 'kc-b', 'kc-c'],
      kcStates: { 'kc-a': practiced(1), 'kc-b': practiced(1), 'kc-c': practiced(0.93) },
      now: T0,
    });
    expect(view.pL).toBeGreaterThan(MASTERY_THRESHOLD);
    expect(view.mastered).toBe(false);
    expect(view.weakestKcId).toBe('kc-c');
    expect(view.weakestPL).toBeCloseTo(0.93, 12);
  });

  it('does NOT master a lesson whose only gap is an unstarted required KC', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a', 'kc-unstarted'],
      kcStates: { 'kc-a': practiced(0.99), 'kc-unstarted': initialMemoryState() },
      now: T0,
    });
    expect(view.members[1]!.pL).toBe(PRIOR_PL0);
    expect(view.mastered).toBe(false);
  });

  it('reports review-due when ANY previously practiced required KC is due', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a', 'kc-b'],
      kcStates: {
        'kc-a': practiced(0.99),
        'kc-b': practiced(0.96, at('2026-06-01T12:00:00.000Z')),
      },
      now: T0,
    });
    expect(view.members[0]!.reviewDue).toBe(false);
    expect(view.members[1]!.reviewDue).toBe(true);
    expect(view.reviewDue).toBe(true);
  });

  it('never reports review-due for a KC that was never practiced', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-unstarted'],
      kcStates: { 'kc-unstarted': initialMemoryState() },
      now: daysAfter(365),
    });
    expect(view.members[0]!.pL).toBe(PRIOR_PL0); // below the review line, but never practiced
    expect(view.members[0]!.reviewDue).toBe(false);
    expect(view.reviewDue).toBe(false);
  });

  it('counts a duplicated required KC once so it cannot double-weight the mean', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a', 'kc-a', 'kc-b'],
      kcStates: { 'kc-a': practiced(0.9), 'kc-b': practiced(0.3) },
      now: T0,
    });
    expect(view.requiredKcCount).toBe(2);
    expect(view.pL).toBeCloseTo(0.6, 12);
  });

  it('ignores states for KCs outside the required list', () => {
    const view = rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a'],
      kcStates: { 'kc-a': practiced(0.9), 'kc-other-lesson': practiced(0.1) },
      now: T0,
    });
    expect(view.requiredKcCount).toBe(1);
    expect(view.pL).toBeCloseTo(0.9, 12);
  });

  it('fails closed on a missing lesson-to-KC mapping', () => {
    const result = rollUpLessonMastery({
      lessonId: 'l-unmapped',
      requiredKcIds: undefined, // e.g. orderedKcsForLesson() returned null
      kcStates: { 'kc-a': practiced(0.99) },
      now: T0,
    });
    expect(isLessonRollupAvailable(result)).toBe(false);
    expect(result).toEqual({
      status: 'unavailable',
      lessonId: 'l-unmapped',
      rejectionCodes: ['LESSON_KC_MAP_MISSING'],
      missingKcIds: [],
    });
    expect(result).not.toHaveProperty('view');
  });

  it('fails closed on an empty lesson-to-KC mapping instead of defaulting', () => {
    const result = rollUpLessonMastery({
      lessonId: 'l-empty',
      requiredKcIds: [],
      kcStates: { 'kc-a': practiced(0.99) },
      now: T0,
    });
    expect(isLessonRollupAvailable(result)).toBe(false);
    expect(result).toEqual({
      status: 'unavailable',
      lessonId: 'l-empty',
      rejectionCodes: ['LESSON_KC_MAP_EMPTY'],
      missingKcIds: [],
    });
  });

  it('fails closed on a mapping that is blank after normalization', () => {
    const result = rollUpLessonMastery({
      lessonId: 'l-blank',
      requiredKcIds: ['', '  '],
      kcStates: {},
      now: T0,
    });
    expect(isLessonRollupAvailable(result)).toBe(false);
  });

  it('fails closed when a 5-KC lesson is supplied only 3 states, however strong they are', () => {
    const result = rollUpLessonMastery({
      lessonId: 'l-five',
      requiredKcIds: ['kc-1', 'kc-2', 'kc-3', 'kc-4', 'kc-5'],
      kcStates: { 'kc-1': practiced(0.99), 'kc-2': practiced(0.99), 'kc-3': practiced(0.99) },
      now: T0,
    });
    expect(isLessonRollupAvailable(result)).toBe(false);
    expect(result).toEqual({
      status: 'unavailable',
      lessonId: 'l-five',
      rejectionCodes: ['LESSON_KC_STATE_MISSING'],
      missingKcIds: ['kc-4', 'kc-5'],
    });
    expect(result).not.toHaveProperty('view');
  });

  it('fails closed on the WRONG 3 of 5, which a cardinality check would wave through', () => {
    // Five states supplied for a five-KC lesson, but two of them belong to other KCs:
    // the counts match, only the identities disagree.
    const result = rollUpLessonMastery({
      lessonId: 'l-five',
      requiredKcIds: ['kc-1', 'kc-2', 'kc-3', 'kc-4', 'kc-5'],
      kcStates: {
        'kc-1': practiced(0.99),
        'kc-2': practiced(0.99),
        'kc-3': practiced(0.99),
        'kc-98': practiced(0.99),
        'kc-99': practiced(0.99),
      },
      now: T0,
    });
    expect(isLessonRollupAvailable(result)).toBe(false);
    expect(result).toEqual({
      status: 'unavailable',
      lessonId: 'l-five',
      rejectionCodes: ['LESSON_KC_STATE_MISSING'],
      missingKcIds: ['kc-4', 'kc-5'],
    });
  });

  it('reports every uncovered required KC, not just the first', () => {
    const result = rollUpLessonMastery({
      lessonId: 'l-five',
      requiredKcIds: ['kc-1', 'kc-2', 'kc-3'],
      kcStates: {},
      now: T0,
    });
    expect(isLessonRollupAvailable(result)).toBe(false);
    if (isLessonRollupAvailable(result)) throw new Error('unreachable');
    expect(result.missingKcIds).toEqual(['kc-1', 'kc-2', 'kc-3']);
  });

  it('never mutates the supplied KC states', () => {
    const state = practiced(0.9);
    const snapshot = { ...state };
    rollup({
      lessonId: 'l1',
      requiredKcIds: ['kc-a'],
      kcStates: { 'kc-a': state },
      now: daysAfter(30),
    });
    expect(state).toEqual(snapshot);
  });
});
