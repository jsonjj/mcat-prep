import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, type UtcTimestamp } from '@mcat/contracts';
import { coldStartB, difficultyB, slip, MAX_SLIP_SM, IRT_CONFIG } from './irt';
import { bktUpdate, isMastered, PRIOR_PL0, MASTERY_THRESHOLD } from './bkt';
import {
  currentPL,
  decayPL,
  initialMemoryState,
  isDueReview,
  stepMemory,
  INITIAL_HALF_LIFE,
  REVIEW_LINE,
} from './forgetting';
import {
  carsUpdate,
  isCarsOnTrack,
  overallCarsReadiness,
  predictedCorrect,
  rubricToR,
  CARS_K_POTD,
  CARS_K_DUEL,
  CARS_READINESS_TARGET,
} from './cars';
import { seedCarsAbilityFromRead, seedPriorFromRead, SEED_PRIOR_CAP, SEED_PRIOR_FLOOR } from './mastery-seed';
import { PREREQ_DEFAULT_WEIGHT, reinforcePrerequisite } from './prerequisite';
import { applyMasteryAttempt } from './mastery-attempt';

const at = (iso: string): UtcTimestamp => UtcTimestampSchema.parse(iso);
const T0 = at('2026-07-20T12:00:00.000Z');
const daysAfter = (n: number): UtcTimestamp =>
  at(new Date(Date.parse(T0) + n * 86_400_000).toISOString());

describe('irt', () => {
  it('cold-starts b from DOK when attempts are below the calibration floor', () => {
    expect(difficultyB({ attempts: 5, correct: 5, dokLevel: 1 })).toBe(coldStartB(1));
    expect(coldStartB(1)).toBeLessThan(0); // easy → negative
    expect(coldStartB(4)).toBeGreaterThan(0); // hard → positive
    expect(coldStartB(undefined)).toBe(0);
  });

  it('computes b from population fraction correct once calibrated', () => {
    const easy = difficultyB({ attempts: 100, correct: 90 }); // p=0.9 → negative b
    const hard = difficultyB({ attempts: 100, correct: 20 }); // p=0.2 → positive b
    expect(easy).toBeLessThan(0);
    expect(hard).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(easy);
  });

  it('clamps b for all-correct / all-wrong items (no divergence)', () => {
    expect(Number.isFinite(difficultyB({ attempts: 100, correct: 100 }))).toBe(true);
    expect(Number.isFinite(difficultyB({ attempts: 100, correct: 0 }))).toBe(true);
  });

  it('slip rises with difficulty and is bounded by S_m', () => {
    const easy = slip(-2);
    const hard = slip(+2);
    expect(easy).toBeLessThan(hard);
    expect(hard).toBeLessThanOrEqual(MAX_SLIP_SM);
    expect(easy).toBeGreaterThan(0);
    // At b = m the slip is exactly half of S_m.
    expect(slip(IRT_CONFIG.slipAnchor)).toBeCloseTo(MAX_SLIP_SM / 2, 6);
  });
});

describe('bkt', () => {
  it('raises P(L) on a correct answer and lowers it on a wrong one', () => {
    const s = slip(0);
    const up = bktUpdate(0.5, { correct: true, slip: s });
    const down = bktUpdate(0.5, { correct: false, slip: s });
    expect(up).toBeGreaterThan(0.5);
    expect(down).toBeLessThan(0.5);
  });

  it('reaches mastery after repeated independent correct answers on an easy item', () => {
    let pL = PRIOR_PL0;
    const s = slip(-1);
    for (let i = 0; i < 25; i += 1) pL = bktUpdate(pL, { correct: true, slip: s });
    expect(isMastered(pL)).toBe(true);
    expect(pL).toBeGreaterThanOrEqual(MASTERY_THRESHOLD);
  });

  it('keeps P(L) within (0,1)', () => {
    expect(bktUpdate(0.999, { correct: true, slip: slip(2) })).toBeLessThanOrEqual(1);
    expect(bktUpdate(0.001, { correct: false, slip: slip(-2) })).toBeGreaterThanOrEqual(0);
  });
});

describe('forgetting', () => {
  it('decays P(L) more slowly with a larger half-life', () => {
    const short = decayPL(0.95, 7, 7); // one half-life → ~0.475
    const long = decayPL(0.95, 7, 28);
    expect(short).toBeCloseTo(0.475, 3);
    expect(long).toBeGreaterThan(short);
  });

  it('applies lazy decay from lastPracticedAt on read', () => {
    const state = { ...initialMemoryState(0.9), lastPracticedAt: T0, halfLifeDays: 7 };
    expect(currentPL(state, T0)).toBeCloseTo(0.9, 6);
    expect(currentPL(state, daysAfter(7))).toBeCloseTo(0.45, 3);
  });

  it('flags a due review below the review line', () => {
    expect(isDueReview(REVIEW_LINE - 0.01)).toBe(true);
    expect(isDueReview(REVIEW_LINE + 0.01)).toBe(false);
  });

  it('doubles the half-life on a successful due review and resets on failure', () => {
    // Seed a unit that has decayed well below the review line.
    const stale = { pL: 0.95, halfLifeDays: INITIAL_HALF_LIFE, lastPracticedAt: T0, lastDueReviewAt: null };
    const passed = stepMemory(stale, { observation: { correct: true, slip: slip(-1) }, now: daysAfter(30) });
    expect(passed.wasDueReview).toBe(true);
    expect(passed.state.halfLifeDays).toBe(INITIAL_HALF_LIFE * 2);

    const failed = stepMemory(
      { ...stale, halfLifeDays: 28 },
      { observation: { correct: false, slip: slip(-1) }, now: daysAfter(60) },
    );
    expect(failed.wasDueReview).toBe(true);
    expect(failed.state.halfLifeDays).toBe(INITIAL_HALF_LIFE);
  });

  it('does not treat a first-ever practice as a due review', () => {
    const fresh = initialMemoryState(PRIOR_PL0);
    const res = stepMemory(fresh, { observation: { correct: true, slip: slip(0) }, now: T0 });
    expect(res.wasDueReview).toBe(false);
  });
});

describe('cars', () => {
  it('predicts higher correctness as ability exceeds difficulty', () => {
    expect(predictedCorrect(2, 0)).toBeGreaterThan(predictedCorrect(0, 0));
    expect(predictedCorrect(0, 0)).toBeCloseTo(0.5, 6);
  });

  it('moves ability toward the observed result, weighted by K', () => {
    const potd = carsUpdate(0, { r: 1, b: 0, k: CARS_K_POTD });
    const duel = carsUpdate(0, { r: 1, b: 0, k: CARS_K_DUEL });
    expect(potd).toBeGreaterThan(0);
    expect(duel).toBeGreaterThan(0);
    // A single Duel moves ability far less than a single measured passage.
    expect(duel).toBeLessThan(potd);
  });

  it('scores the Duel rubric, normalizing by exercised criteria', () => {
    expect(rubricToR({ position: 3, argument: 3, application: 3 })).toBeCloseTo(1, 6);
    expect(rubricToR({ argument: 3 })).toBeCloseTo(1, 6); // single criterion → score/3
    expect(rubricToR({ position: 0, argument: 0, application: 0 })).toBeCloseTo(0, 6);
    expect(rubricToR({})).toBeNull();
  });

  it('computes overall readiness as the sub-skill mean and gates on target', () => {
    expect(overallCarsReadiness(1.7, 1.7, 1.7)).toBeCloseTo(1.7, 6);
    expect(isCarsOnTrack(CARS_READINESS_TARGET)).toBe(true);
    expect(isCarsOnTrack(CARS_READINESS_TARGET - 0.1)).toBe(false);
  });
});

describe('mastery-seed (asymmetric, capped)', () => {
  it('lowers the prior freely for a confident weak read', () => {
    const pL = seedPriorFromRead({ gap: 1, certainty: 1 });
    expect(pL).toBe(SEED_PRIOR_FLOOR);
    expect(pL).toBeLessThan(PRIOR_PL0);
  });

  it('raises the prior only up to the cap for a confident strong read', () => {
    const pL = seedPriorFromRead({ gap: 0, certainty: 1 });
    expect(pL).toBe(SEED_PRIOR_CAP);
    expect(pL).toBeLessThanOrEqual(0.4);
  });

  it('leaves a neutral or low-confidence read at the default prior', () => {
    expect(seedPriorFromRead({ gap: 0.5, certainty: 1 })).toBeCloseTo(PRIOR_PL0, 6);
    expect(seedPriorFromRead({ gap: 0, certainty: 0 })).toBeCloseTo(PRIOR_PL0, 6);
  });

  it('seeds CARS ability asymmetrically (weak low, strong modest)', () => {
    expect(seedCarsAbilityFromRead({ gap: 1, certainty: 1 })).toBeLessThan(-1);
    expect(seedCarsAbilityFromRead({ gap: 0, certainty: 1 })).toBeLessThanOrEqual(0.5);
    expect(seedCarsAbilityFromRead({ gap: 0.5, certainty: 1 })).toBeCloseTo(0, 6);
  });
});

describe('prerequisite reinforcement', () => {
  it('stretches half-life by (1 + w) and nudges P(L) up', () => {
    const before = { pL: 0.4, halfLifeDays: 10, lastPracticedAt: T0, lastDueReviewAt: null };
    const after = reinforcePrerequisite(before, T0);
    expect(after.halfLifeDays).toBeCloseTo(10 * (1 + PREREQ_DEFAULT_WEIGHT), 6);
    // +(1-0.4)*(0.5*0.15) = +0.045
    expect(after.pL).toBeCloseTo(0.4 + 0.6 * (PREREQ_DEFAULT_WEIGHT * 0.15), 6);
    expect(after.lastPracticedAt).toBe(T0);
  });

  it('reinforces from the decayed value, not the stored one', () => {
    const stale = { pL: 0.9, halfLifeDays: 7, lastPracticedAt: T0, lastDueReviewAt: null };
    const after = reinforcePrerequisite(stale, daysAfter(7)); // decays ~0.45 first
    expect(after.pL).toBeLessThan(0.9);
    expect(after.pL).toBeGreaterThan(0.45);
  });
});

describe('applyMasteryAttempt (composition across grains)', () => {
  const fresh = () => ({
    kc: initialMemoryState(),
    skill: initialMemoryState(),
    lesson: initialMemoryState(),
  });

  it('raises all three grains on an independent-correct answer and reinforces prerequisites', () => {
    const res = applyMasteryAttempt({
      correct: true,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: fresh(),
      prerequisites: [initialMemoryState(0.5)],
    });
    expect(res.states.kc.pL).toBeGreaterThan(PRIOR_PL0);
    expect(res.states.skill.pL).toBeGreaterThan(PRIOR_PL0);
    expect(res.states.lesson.pL).toBeGreaterThan(PRIOR_PL0);
    expect(res.prerequisites[0]!.pL).toBeGreaterThan(0.5); // reinforced
  });

  it('lowers grains on an independent-wrong answer and does NOT reinforce prerequisites', () => {
    const prereq = initialMemoryState(0.5);
    const res = applyMasteryAttempt({
      correct: false,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: { kc: initialMemoryState(0.6), skill: initialMemoryState(0.6), lesson: initialMemoryState(0.6) },
      prerequisites: [prereq],
    });
    expect(res.states.kc.pL).toBeLessThan(0.6);
    expect(res.prerequisites[0]!.pL).toBe(prereq.pL); // unchanged on a wrong answer
  });
});
