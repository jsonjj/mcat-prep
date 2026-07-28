import { describe, expect, it } from 'vitest';
import { BKT_CONFIG, MASTERY_THRESHOLD, PRIOR_PL0, bktUpdate, type BktConfig } from './bkt';
import { SEED_PRIOR_CAP, SEED_PRIOR_FLOOR } from './mastery-seed';
import {
  bandCollapse,
  boundedOracleArm,
  compareArms,
  correctEvidence,
  decisionBoundaryPrior,
  FLAT_ARM,
  incorrectEvidence,
  itemsToDecisionAllCorrect,
  reseed,
  reseededArm,
  scoreArm,
  seedBand,
  seedSignal,
  seedTrials,
  SEEDED_ARM,
  SHIPPED_BOUNDS,
  slipForDok,
  unboundedOracleArm,
  type Arm,
  type ResponseModel,
  type SeedTrial,
} from './mastery-seed-value';

/**
 * Whether the diagnostic's mastery seed changes what a learner is asked to do.
 *
 * The guards in the first three blocks are arithmetic about BKT under the
 * shipped constants and cost nothing to run. They are the load-bearing part of
 * this file: they pin *why* the seed does what it does, so a later change to the
 * threshold, the guess/slip pair, the learn rate or the seeding bounds either
 * keeps the finding or fails here and has to restate it.
 *
 * The cohort study is opt-in — it runs real MST sittings:
 *
 *   SEED_VALUE=1 pnpm --filter @mcat/policies exec vitest run mastery-seed-value
 *
 * Read every level in it as conditional on a generative learner model that has
 * never been fitted to a real learner. What travels is the ordering of the arms
 * and the size of the differences relative to one item, not the rates.
 */

const DOKS = [1, 2, 3, 4] as const;

describe('what one item of BKT evidence is worth', () => {
  it('prices a correct answer near 1.37 nats and a miss at more than twice that', () => {
    for (const dok of DOKS) {
      const s = slipForDok(dok);
      expect(correctEvidence(s)).toBeGreaterThan(1.34);
      expect(correctEvidence(s)).toBeLessThan(1.39);
      // A miss is worth 2.3 (DOK 4) to 3.5 (DOK 1) correct answers in the other
      // direction, which is what makes a seeded prior short-lived.
      expect(-incorrectEvidence(s) / correctEvidence(s)).toBeGreaterThan(2.2);
    }
  });

  it('keeps a correct answer worth the same across the whole cold-start DOK range', () => {
    const values = DOKS.map((dok) => correctEvidence(slipForDok(dok)));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.03);
  });
});

describe('the mastery decision is an integer count of correct answers', () => {
  it('reaches the threshold in three from the flat default, at every DOK', () => {
    for (const dok of DOKS) {
      expect(itemsToDecisionAllCorrect(PRIOR_PL0, slipForDok(dok))).toBe(3);
    }
  });

  /**
   * The finding, stated as arithmetic. Seeding may place a prior anywhere in
   * `[SEED_PRIOR_FLOOR, SEED_PRIOR_CAP]`, and every point of that interval needs
   * three or four all-correct answers. So the seed cannot change the decision by
   * more than one item, and cannot beat the flat default at all — the flat
   * default already sits in the 3-item region.
   */
  it('needs three or four items from anywhere in the seeding range, never two', () => {
    for (const dok of DOKS) {
      const s = slipForDok(dok);
      for (let p = SEED_PRIOR_FLOOR; p <= SEED_PRIOR_CAP + 1e-9; p += 0.005) {
        const items = itemsToDecisionAllCorrect(p, s);
        expect(items, `prior ${p.toFixed(3)} at DOK ${dok}`).toBeGreaterThanOrEqual(3);
        expect(items, `prior ${p.toFixed(3)} at DOK ${dok}`).toBeLessThanOrEqual(4);
      }
      // Two items would need a prior the cap forbids, by a wide margin.
      const two = decisionBoundaryPrior(2, s);
      expect(two).toBeGreaterThan(SEED_PRIOR_CAP);
    }
  });

  it('puts the three-item boundary below the flat default, so seeding can only slow it', () => {
    for (const dok of DOKS) {
      const three = decisionBoundaryPrior(3, slipForDok(dok));
      expect(three).toBeGreaterThan(SEED_PRIOR_FLOOR);
      expect(three).toBeLessThan(PRIOR_PL0);
      // Pinned: the boundary sits at 0.121 (DOK 1) to 0.132 (DOK 4).
      expect(three).toBeGreaterThan(0.12);
      expect(three).toBeLessThan(0.14);
    }
  });

  /**
   * The whole seeding range is worth under two items of evidence, and the count
   * being changed is an integer. That is the mechanism behind the finding, and it
   * is the invariant to check first if the finding ever stops holding.
   */
  it('spans under two items of evidence from floor to cap', () => {
    const s = slipForDok(2);
    const odds = (p: number): number => p / (1 - p);
    const nats = Math.log(odds(SEED_PRIOR_CAP) / odds(SEED_PRIOR_FLOOR));
    expect(nats / correctEvidence(s)).toBeLessThan(2);
    // And under one item across the band real reads actually occupy.
    expect(Math.log(odds(0.33) / odds(0.1)) / correctEvidence(s)).toBeLessThan(1.2);
  });
});

describe('what dominates the item count', () => {
  const seededRange = (bkt: BktConfig): number[] =>
    [SEED_PRIOR_FLOOR, PRIOR_PL0, SEED_PRIOR_CAP].map((p) =>
      itemsToDecisionAllCorrect(p, slipForDok(2), bkt),
    );

  /**
   * The candidates, priced against each other. Each row changes ONE constant and
   * reports items-to-decision at the seeding floor, the flat default and the cap.
   * What matters is not the level but where the default sits inside the triple:
   * the seed can only act where the default and the cap differ.
   */
  it('separates the threshold, the learn rate and the guessing floor', () => {
    // Shipped. The default already sits at the cap's value, so the seed's entire
    // reach is the floor-end 4 — one extra item, in the slower direction.
    expect(seededRange(BKT_CONFIG)).toEqual([4, 3, 3]);

    // The learning nudge is the *compressor*, not a neutral shift. Removing it
    // separates the cap from the default, which is the seed's only route to
    // saving an item — the nudge is currently spending that separation.
    expect(seededRange({ ...BKT_CONFIG, learnRate: 0 })).toEqual([5, 4, 3]);

    // The threshold is the knob that moves the default off the cap. At 0.90 a
    // strong read decides one item sooner than the default; at 0.99 the spread
    // is back on the slow side, where the seed cannot help.
    expect(seededRange({ ...BKT_CONFIG, masteryThreshold: 0.9 })).toEqual([3, 3, 2]);
    expect(seededRange({ ...BKT_CONFIG, masteryThreshold: 0.99 })).toEqual([5, 4, 4]);

    // The guessing floor sets what one item is worth and so the level, but it
    // leaves the default on the cap's value either way.
    expect(seededRange({ ...BKT_CONFIG, guess: 0.4 })).toEqual([5, 4, 4]);
    expect(seededRange({ ...BKT_CONFIG, guess: 0.1 })).toEqual([3, 2, 2]);
  });

  /**
   * One miss erases the seed. Both endpoints of the widest band seeding can
   * produce land within a fraction of a point of each other, above the 3-item
   * boundary, so from the first wrong answer onward the two arms are the same
   * instrument.
   */
  it('collapses the whole seeding band on a single wrong answer', () => {
    const miss = [{ correct: false, slip: slipForDok(2) }];
    const collapse = bandCollapse(SEED_PRIOR_FLOOR, SEED_PRIOR_CAP, miss);
    expect(collapse.retained).toBeLessThan(0.05);
    // Both endpoints land above the 3-item boundary, so neither is any longer
    // distinguishable from the flat default by the decision rule.
    const three = decisionBoundaryPrior(3, slipForDok(2));
    for (const p of [SEED_PRIOR_FLOOR, PRIOR_PL0, SEED_PRIOR_CAP]) {
      expect(bktUpdate(p, miss[0]!)).toBeGreaterThan(three);
    }
  });

  /**
   * Why lowering the threshold a little buys nothing: the `P(L)` trajectory
   * arrives in big jumps, so there is a wide empty gap either side of 0.95 and a
   * threshold anywhere inside it decides identically.
   *
   * From the flat default an unbroken run lands on 0.572, 0.864, then 0.967. Any
   * threshold in (0.864, 0.967] therefore costs exactly three items — which
   * makes 0.95 and 0.90 the same rule, and puts the nearest threshold that saves
   * an item down at 0.864.
   */
  it('leaves a wide dead band around the threshold, where its value cannot matter', () => {
    const s = slipForDok(2);
    let pL = PRIOR_PL0;
    const path = [1, 2, 3].map(() => {
      pL = bktUpdate(pL, { correct: true, slip: s });
      return pL;
    });
    expect(path[1]!).toBeGreaterThan(0.86);
    expect(path[1]!).toBeLessThan(0.87);
    expect(path[2]!).toBeGreaterThan(0.96);
    // Every threshold in the gap gives the identical count from the default.
    for (const threshold of [0.87, 0.9, 0.93, MASTERY_THRESHOLD, 0.96]) {
      expect(
        itemsToDecisionAllCorrect(PRIOR_PL0, s, { ...BKT_CONFIG, masteryThreshold: threshold }),
        `threshold ${threshold}`,
      ).toBe(3);
    }
    expect(itemsToDecisionAllCorrect(PRIOR_PL0, s, { ...BKT_CONFIG, masteryThreshold: 0.86 })).toBe(2);
  });
});

describe('the seed on real sittings', () => {
  // Small enough to stay in the always-on suite; the study runs 250.
  const trials = seedTrials({ learners: 6 });

  it('seeds every lesson under every concept the form sampled', () => {
    expect(trials.length).toBeGreaterThan(500);
    for (const trial of trials) {
      expect(trial.seededPrior).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
      expect(trial.seededPrior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
    }
  });

  /**
   * The measured band, and the reason it cannot matter. Both halves are pinned:
   * the band is narrow, and the boundary that would let it act sits below it.
   */
  it('lands in a band worth about one item, entirely above the three-item boundary', () => {
    const band = seedBand(trials);
    expect(band.min).toBeGreaterThan(0.09);
    expect(band.max).toBeLessThan(0.35);
    expect(band.itemsOfEvidence).toBeLessThan(1.2);
    expect(band.atTwoItemBoundary).toBe(0);
    // Almost nothing sits low enough to decide differently, and what does, slows.
    expect(band.belowThreeItemBoundary).toBeLessThan(0.05);
  });

  /** The option-pricing copy of the seeding formula must be the shipped one. */
  it('reseeds identically to the shipped seeder at the shipped bounds', () => {
    for (const trial of trials) {
      expect(reseed(trial, SHIPPED_BOUNDS)).toBeCloseTo(trial.seededPrior, 12);
    }
  });

  it('never decides sooner than the flat prior, on either response model', () => {
    for (const which of ['graded', 'latent'] as ResponseModel[]) {
      const delta = compareArms(trials, FLAT_ARM, SEEDED_ARM, which);
      expect(delta.faster, which).toBe(0);
      expect(delta.changed, which).toBeLessThan(0.05);
      expect(delta.meanItemsSaved, which).toBeLessThanOrEqual(0);
    }
  });

  /**
   * The strongest form of the finding: the limit is the bounds, not the read.
   *
   * A prior that KNOWS whether the learner is mastered still cannot beat the flat
   * default while `SEED_PRIOR_CAP` holds — raising a mastered learner to the cap
   * changes nothing, and dropping everyone else to the floor costs them an item —
   * so it comes out behind. Nothing that improves the diagnostic can change that.
   * Removing the cap does, immediately.
   */
  it('shows no prior inside the seeding bounds can save an item, oracle included', () => {
    const bounded = compareArms(trials, FLAT_ARM, boundedOracleArm('latent'), 'latent');
    expect(bounded.faster).toBe(0);
    expect(bounded.meanItemsSaved).toBeLessThan(0);

    // The seed's near-no-op behaviour is therefore not a failure of the read:
    // it sits closer to the flat prior than perfect knowledge does.
    const seeded = compareArms(trials, FLAT_ARM, SEEDED_ARM, 'latent');
    expect(Math.abs(seeded.meanItemsSaved)).toBeLessThan(Math.abs(bounded.meanItemsSaved));

    const unbounded = compareArms(trials, FLAT_ARM, unboundedOracleArm('latent'), 'latent');
    expect(unbounded.meanItemsSaved).toBeGreaterThan(0.5);
  });
});

// --- Opt-in study -----------------------------------------------------------

const STUDY = process.env.SEED_VALUE === '1';
const STUDY_N = Number(process.env.SEED_VALUE_N ?? 250);

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const num = (x: number, dp = 2): string => (Number.isNaN(x) ? '—' : x.toFixed(dp));

const armTable = (trials: readonly SeedTrial[], arms: readonly Arm[], which: ResponseModel): string => {
  const rows = arms.map((arm) => {
    const s = scoreArm(trials, arm, which);
    const d = compareArms(trials, FLAT_ARM, arm, which);
    return [
      s.label.padEnd(34),
      num(s.medianItems, 1).padStart(6),
      num(s.meanItems).padStart(6),
      num(s.p90Items, 1).padStart(5),
      pct(s.fired).padStart(7),
      pct(s.falseMastery).padStart(7),
      pct(s.missedMastery).padStart(7),
      num(d.meanItemsSaved).padStart(7),
      pct(d.changed).padStart(7),
    ].join(' ');
  });
  const head = [
    'arm'.padEnd(34),
    'median'.padStart(6),
    'mean'.padStart(6),
    'p90'.padStart(5),
    'fired'.padStart(7),
    'false'.padStart(7),
    'missed'.padStart(7),
    'saved'.padStart(7),
    'moved'.padStart(7),
  ].join(' ');
  return [`--- ${which} learner ---`, head, ...rows].join('\n');
};

describe.skipIf(!STUDY)('study: what the mastery seed is worth', () => {
  it('reports the item and false-mastery distributions, and prices the options', () => {
    const trials = seedTrials({ learners: STUDY_N });
    const band = seedBand(trials);

    const lines: string[] = [
      `trials: ${trials.length} lesson seeds over ${STUDY_N} learners`,
      `seed band: min ${num(band.min, 3)} p01 ${num(band.p01, 3)} median ${num(band.median, 3)} ` +
        `p99 ${num(band.p99, 3)} max ${num(band.max, 3)}`,
      `band is ${num(band.natsWide)} nats = ${num(band.itemsOfEvidence)} items of evidence; ` +
        `${pct(band.belowThreeItemBoundary)} below the 3-item boundary`,
      `boundaries at DOK 2: 3 items from ${num(decisionBoundaryPrior(3, slipForDok(2)), 4)}, ` +
        `2 items from ${num(decisionBoundaryPrior(2, slipForDok(2)), 4)}`,
    ];

    /**
     * The options, each expressed as an arm so it is priced on the same trials
     * and against the same baseline. None of them is implemented; several would
     * change product behaviour and are here to be costed, not adopted.
     */
    const options = (which: ResponseModel): Arm[] => [
      FLAT_ARM,
      SEEDED_ARM,
      boundedOracleArm(which),
      unboundedOracleArm(which),
      {
        // Seed the transition parameter instead of the prior: a strong read
        // means the learner picks this up faster, a weak one slower.
        label: 'seeded learn rate, flat prior',
        prior: () => PRIOR_PL0,
        bkt: (t) => ({
          ...BKT_CONFIG,
          learnRate: Math.min(
            0.45,
            Math.max(0.05, BKT_CONFIG.learnRate * (1 + 3 * (t.seededPrior - PRIOR_PL0))),
          ),
        }),
      },
      // 0.90 is inside the dead band around 0.95 and so is the same rule; 0.86
      // is the first threshold below it that changes the count. Both are shown
      // because "lower the threshold" is only an option at the second value.
      {
        label: 'seeded prior, threshold 0.90',
        prior: (t) => t.seededPrior,
        bkt: () => ({ ...BKT_CONFIG, masteryThreshold: 0.9 }),
      },
      {
        label: 'flat prior, threshold 0.90',
        prior: () => PRIOR_PL0,
        bkt: () => ({ ...BKT_CONFIG, masteryThreshold: 0.9 }),
      },
      {
        label: 'seeded prior, threshold 0.86',
        prior: (t) => t.seededPrior,
        bkt: () => ({ ...BKT_CONFIG, masteryThreshold: 0.86 }),
      },
      {
        label: 'flat prior, threshold 0.86',
        prior: () => PRIOR_PL0,
        bkt: () => ({ ...BKT_CONFIG, masteryThreshold: 0.86 }),
      },
      // Bounds and grain, priced by reseeding the same reads. 0.6 is chosen
      // because the two-item boundary sits at 0.454: a cap below it cannot buy
      // an item however good the read, and one above it can.
      reseededArm('seeded, cap 0.6', { ...SHIPPED_BOUNDS, cap: 0.6 }),
      reseededArm('seeded, bucket grain (no dilution)', { ...SHIPPED_BOUNDS, attenuate: false }),
      reseededArm('seeded, bucket grain + cap 0.6', {
        ...SHIPPED_BOUNDS,
        cap: 0.6,
        attenuate: false,
      }),
      // More asymmetric the way the seeding comment argues for: further down for
      // weakness, no further up for strength.
      reseededArm('seeded, floor 0.02, cap 0.3', { ...SHIPPED_BOUNDS, floor: 0.02, cap: 0.3 }),
      {
        label: 'seeded prior, 3-item evidence floor',
        prior: (t) => t.seededPrior,
        minItems: 3,
      },
      {
        label: 'flat prior, 3-item evidence floor',
        prior: () => PRIOR_PL0,
        minItems: 3,
      },
    ];

    // Whether the read carries signal, which decides how to read the no-op.
    for (const which of ['latent', 'graded'] as ResponseModel[]) {
      const signal = seedSignal(trials, which);
      lines.push(
        `${which} signal: truly mastered ${pct(signal.trueRate)}, AUC ${num(signal.auc, 3)}, ` +
          `mean prior ${num(signal.meanPriorMastered, 3)} mastered vs ` +
          `${num(signal.meanPriorNot, 3)} not`,
      );
    }
    // The graded truth's bar is a convention, so its sensitivity is shown rather
    // than hidden inside one number.
    for (const bar of [0.6, 0.7, 0.85]) {
      const flat = scoreArm(trials, FLAT_ARM, 'graded', bar);
      const seeded = scoreArm(trials, SEEDED_ARM, 'graded', bar);
      lines.push(
        `graded bar ${bar}: truly mastered ${pct(seedSignal(trials, 'graded', bar).trueRate)}, ` +
          `false mastery flat ${pct(flat.falseMastery)} seeded ${pct(seeded.falseMastery)}`,
      );
    }

    for (const which of ['latent', 'graded'] as ResponseModel[]) {
      lines.push('', armTable(trials, options(which), which));
      const delta = compareArms(trials, FLAT_ARM, SEEDED_ARM, which);
      lines.push(
        `seeded vs flat (${which}): moved ${pct(delta.changed)} of trials, ` +
          `faster ${pct(delta.faster)}, slower ${pct(delta.slower)}, ` +
          `mean saved ${num(delta.meanItemsSaved, 3)}, ` +
          `false mastery ${pct(delta.falseMasteryBaseline)} -> ${pct(delta.falseMasteryCandidate)}`,
        `delta histogram: ${JSON.stringify(delta.deltas)}`,
      );
      const flat = scoreArm(trials, FLAT_ARM, which);
      const seeded = scoreArm(trials, SEEDED_ARM, which);
      lines.push(
        `items histogram, flat:   ${JSON.stringify(flat.histogram)}`,
        `items histogram, seeded: ${JSON.stringify(seeded.histogram)}`,
      );
    }

    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(trials.length).toBeGreaterThan(0);
    expect(MASTERY_THRESHOLD).toBe(0.95);
  }, 900_000);
});
