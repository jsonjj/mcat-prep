import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, type BktObservationSource, type UtcTimestamp } from '@mcat/contracts';
import { coldStartB, difficultyB, slip, MAX_SLIP_SM, IRT_CONFIG } from './irt';
import {
  bktUpdate,
  isAtCapabilityCut,
  BKT_CONFIG,
  GUESS_BY_OBSERVATION_SOURCE,
  GUESS_G,
  LESSON_EXIT_GUESS_G,
  PRIOR_PL0,
  MASTERY_THRESHOLD,
} from './bkt';
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
import {
  seedCarsAbilityFromRead,
  seedPriorFromRead,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
} from './mastery-seed';
import { PREREQ_DEFAULT_WEIGHT, reinforcePrerequisite } from './prerequisite';
import { applyMasteryAttempt, type ApplyMasteryAttemptInput } from './mastery-attempt';

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
    expect(isAtCapabilityCut(pL)).toBe(true);
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
    const stale = {
      pL: 0.95,
      halfLifeDays: INITIAL_HALF_LIFE,
      lastPracticedAt: T0,
      lastDueReviewAt: null,
    };
    const passed = stepMemory(stale, {
      observation: { correct: true, slip: slip(-1) },
      now: daysAfter(30),
    });
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

describe('applyMasteryAttempt (exactly two direct BKT targets)', () => {
  const fresh = () => ({
    kc: initialMemoryState(),
    reasoningOperation: initialMemoryState(),
  });

  /**
   * The undiscounted channel. Practice items are met cold, so they are scored
   * at the plain guess rate and the golden numbers below are the base rates a
   * lesson exit is measured against (see the discounting suite).
   */
  const practiceAttempt = (input: Omit<ApplyMasteryAttemptInput, 'source'>) =>
    applyMasteryAttempt({ ...input, source: 'adaptive_practice' });

  it('updates exactly two direct grain states: the KC and the reasoning operation', () => {
    const res = practiceAttempt({
      correct: true,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: fresh(),
    });
    expect(Object.keys(res.states).sort()).toEqual(['kc', 'reasoningOperation']);
    expect(Object.keys(res.dueReview).sort()).toEqual(['kc', 'reasoningOperation']);
    // A lesson is a derived rollup (see ./lesson-rollup.ts) and never a direct target.
    expect(res.states).not.toHaveProperty('lesson');
    expect(res.dueReview).not.toHaveProperty('lesson');
  });

  it('raises both direct grains on an independent-correct answer and reinforces prerequisites', () => {
    const res = practiceAttempt({
      correct: true,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: fresh(),
      prerequisites: [initialMemoryState(0.5)],
    });
    expect(res.states.kc.pL).toBeGreaterThan(PRIOR_PL0);
    expect(res.states.reasoningOperation.pL).toBeGreaterThan(PRIOR_PL0);
    expect(res.prerequisites[0]!.pL).toBeGreaterThan(0.5); // reinforced
  });

  it('lowers grains on an independent-wrong answer and does NOT reinforce prerequisites', () => {
    const prereq = initialMemoryState(0.5);
    const res = practiceAttempt({
      correct: false,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: { kc: initialMemoryState(0.6), reasoningOperation: initialMemoryState(0.6) },
      prerequisites: [prereq],
    });
    expect(res.states.kc.pL).toBeLessThan(0.6);
    expect(res.states.reasoningOperation.pL).toBeLessThan(0.6);
    expect(res.prerequisites[0]!.pL).toBe(prereq.pL); // unchanged on a wrong answer
  });

  it('preserves one-hop prerequisite reinforcement in order, including untouched entries', () => {
    const res = practiceAttempt({
      correct: true,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: fresh(),
      prerequisites: [initialMemoryState(0.5), { ...initialMemoryState(0.5), halfLifeDays: 10 }],
    });
    expect(res.prerequisites).toHaveLength(2);
    // Same formula as reinforcePrerequisite: pL + (1-pL)*(w*T), H*(1+w).
    expect(res.prerequisites[0]!.pL).toBeCloseTo(0.5375, 12);
    expect(res.prerequisites[0]!.halfLifeDays).toBeCloseTo(INITIAL_HALF_LIFE * 1.5, 12);
    expect(res.prerequisites[1]!.halfLifeDays).toBeCloseTo(15, 12);
    expect(res.prerequisites[0]!).toEqual(reinforcePrerequisite(initialMemoryState(0.5), T0));
  });

  it('keeps the BKT/IRT/forgetting math bit-for-bit stable (golden numbers)', () => {
    // dokLevel 2 with no calibrated attempts → b = coldStartB(2) = -0.3.
    expect(difficultyB({ attempts: 0, correct: 0, dokLevel: 2 })).toBe(-0.3);
    expect(slip(-0.3)).toBe(0.011920292202211757);

    const up = practiceAttempt({
      correct: true,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: fresh(),
    });
    expect(up.b).toBe(-0.3);
    expect(up.slip).toBe(0.011920292202211757);
    expect(up.states.kc.pL).toBe(0.5724517499645163);
    expect(up.states.reasoningOperation.pL).toBe(0.5724517499645163);
    expect(up.states.kc.halfLifeDays).toBe(INITIAL_HALF_LIFE);
    expect(up.states.kc.lastPracticedAt).toBe(T0);
    expect(up.dueReview).toEqual({ kc: false, reasoningOperation: false });

    const down = practiceAttempt({
      correct: false,
      now: T0,
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: { kc: initialMemoryState(0.6), reasoningOperation: initialMemoryState(0.6) },
    });
    expect(down.states.kc.pL).toBe(0.16979262890379365);

    // Lazy decay still runs before the update on a stale grain (one half-life → 0.48).
    const stale = { pL: 0.96, halfLifeDays: 7, lastPracticedAt: T0, lastDueReviewAt: null };
    const review = practiceAttempt({
      correct: true,
      now: daysAfter(7),
      questionStats: { attempts: 0, correct: 0 },
      dokLevel: 2,
      states: { kc: stale, reasoningOperation: stale },
    });
    expect(review.dueReview).toEqual({ kc: true, reasoningOperation: true });
    expect(review.states.kc.halfLifeDays).toBe(INITIAL_HALF_LIFE * 2);
    expect(review.states.kc.pL).toBe(bktUpdate(0.48, { correct: true, slip: slip(-0.3) }));
    expect(review.states.kc.pL).toBe(0.8171372240877787);
  });
});

/**
 * Lesson-exit observations are DISCOUNTED, and discounting means the raised
 * guess parameter and nothing else.
 *
 * A lesson exit asks about material the learner was shown moments ago, so a
 * learner who has not mastered it gets it right far more often than chance —
 * which is a statement about `P(correct | not mastered)`, i.e. about `guess`.
 * Raising it makes the observation believed less, and `P(L)` then moves by the
 * smaller amount Bayes yields.
 *
 * The alternative — capping the resulting `P(L)` — is rejected, and the last
 * two tests here are what would catch it coming back under another name. A cap
 * pins the grain: the planner reads a pinned grain as permanent unmet learning
 * need and re-teaches known material, and decay multiplies the stored value, so
 * a pinned grain can only ever fall.
 */
describe('lesson-exit observations are discounted through the guess, never capped', () => {
  const fresh = () => ({ kc: initialMemoryState(), reasoningOperation: initialMemoryState() });

  const attempt = (source: BktObservationSource, correct: boolean, states = fresh()) =>
    applyMasteryAttempt({
      correct,
      now: T0,
      source,
      questionStats: { attempts: 0, correct: 0 },
      states,
    });

  it('scores a lesson exit at the raised guess and practice at the plain one', () => {
    expect(GUESS_BY_OBSERVATION_SOURCE.lesson_response).toBe(LESSON_EXIT_GUESS_G);
    expect(GUESS_BY_OBSERVATION_SOURCE.adaptive_practice).toBe(GUESS_G);
    expect(GUESS_BY_OBSERVATION_SOURCE.synthetic_study).toBe(GUESS_G);
    expect(attempt('lesson_response', true).guess).toBe(LESSON_EXIT_GUESS_G);
    expect(attempt('adaptive_practice', true).guess).toBe(GUESS_G);
  });

  it('is worth exactly half the Bayes factor of a practice answer, at any difficulty', () => {
    // The whole justification for 0.5, and the reason it is not a tuned number:
    // LR = (1 - slip) / guess, so doubling the guess halves the evidence a
    // correct answer carries — and `slip` cancels, so the discount is exactly
    // one half whatever the item's difficulty.
    expect(LESSON_EXIT_GUESS_G).toBe(2 * GUESS_G);
    for (const dokLevel of [1, 2, 3, 4]) {
      const s = slip(coldStartB(dokLevel));
      const practiceLR = (1 - s) / GUESS_G;
      const lessonLR = (1 - s) / LESSON_EXIT_GUESS_G;
      expect(lessonLR / practiceLR).toBeCloseTo(0.5, 12);
    }
  });

  it('moves P(L) LESS than a practice answer from the same prior', () => {
    const lesson = attempt('lesson_response', true);
    const practice = attempt('adaptive_practice', true);

    // Measured from the 0.2 prior on an uncalibrated item (b = 0, slip ≈ 0.0154):
    // practice 0.2 → 0.5717 (+0.3717); lesson exit 0.2 → 0.4304 (+0.2304).
    expect(practice.states.kc.pL).toBeCloseTo(0.571692, 6);
    expect(lesson.states.kc.pL).toBeCloseTo(0.430401, 6);

    // Still a real gain — discounted, not ignored — and strictly smaller.
    expect(lesson.states.kc.pL).toBeGreaterThan(PRIOR_PL0);
    expect(lesson.states.kc.pL).toBeLessThan(practice.states.kc.pL);
    expect(lesson.states.kc.pL - PRIOR_PL0).toBeLessThan(practice.states.kc.pL - PRIOR_PL0);

    // Both direct grains, not just the KC: the discount is a property of the
    // observation, so it cannot apply to one grain and miss the other.
    expect(lesson.states.reasoningOperation.pL).toBe(lesson.states.kc.pL);
  });

  it('believes a lesson exit less in BOTH directions, so a miss is less damning too', () => {
    // "Believed less" is symmetric by construction: the same raised guess makes
    // a wrong answer weaker evidence of non-mastery. A one-directional discount
    // would be a thumb on the scale rather than a statement about the channel.
    const lesson = attempt('lesson_response', false, {
      kc: initialMemoryState(0.6),
      reasoningOperation: initialMemoryState(0.6),
    });
    const practice = attempt('adaptive_practice', false, {
      kc: initialMemoryState(0.6),
      reasoningOperation: initialMemoryState(0.6),
    });
    expect(lesson.states.kc.pL).toBeLessThan(0.6);
    expect(lesson.states.kc.pL).toBeGreaterThan(practice.states.kc.pL);
  });

  it('has NO ceiling: repeated lesson exits still reach and pass the mastery cut', () => {
    // The decisive difference from a cap. A cap at any value below 1 would show
    // up here as a trajectory that stops; this one climbs past 0.95 and keeps
    // going, which is what lets the grain express genuine mastery and lets
    // decay mean something.
    let pL = PRIOR_PL0;
    const trajectory: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const step = attempt('lesson_response', true, {
        kc: initialMemoryState(pL),
        reasoningOperation: initialMemoryState(pL),
      });
      expect(step.states.kc.pL).toBeGreaterThan(pL); // strictly monotone, never held
      pL = step.states.kc.pL;
      trajectory.push(pL);
    }

    // 5 correct lesson exits to cross the cut, against 3 correct practice
    // answers — the discount, stated as the thing a learner would notice.
    expect(trajectory.findIndex((p) => p >= MASTERY_THRESHOLD) + 1).toBe(5);
    expect(pL).toBeGreaterThan(0.999);

    let practicePL = PRIOR_PL0;
    let practiceSteps = 0;
    while (practicePL < MASTERY_THRESHOLD) {
      practicePL = attempt('adaptive_practice', true, {
        kc: initialMemoryState(practicePL),
        reasoningOperation: initialMemoryState(practicePL),
      }).states.kc.pL;
      practiceSteps += 1;
    }
    expect(practiceSteps).toBe(3);
  });

  it('applies no bound of its own: the engine value reaches the grain verbatim', () => {
    // Pins the absence of a cap to the arithmetic rather than to a trajectory:
    // the stored `pL` is exactly `bktUpdate` run at the lesson guess, so there
    // is no room between the two for a ceiling, a max-delta or a soft cap.
    const start = 0.93;
    const step = attempt('lesson_response', true, {
      kc: initialMemoryState(start),
      reasoningOperation: initialMemoryState(start),
    });
    expect(step.states.kc.pL).toBe(
      bktUpdate(
        start,
        { correct: true, slip: slip(0) },
        { ...BKT_CONFIG, guess: LESSON_EXIT_GUESS_G },
      ),
    );
    // And a lesson exit alone can carry a grain over the cut from just below it.
    expect(isAtCapabilityCut(step.states.kc.pL)).toBe(true);
  });
});
