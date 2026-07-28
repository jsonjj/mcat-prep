import { beforeAll, describe, expect, it } from 'vitest';
import { FC_AXIS, axisIds, indexAxis } from '../../../packages/policies/src/diagnostic-axis';
import { computeBayesResult } from '../../../packages/policies/src/diagnostic-bayes';
import type { DiagnosticResponse } from '../../../packages/policies/src/diagnostic';
import {
  MST_140_RECOMMENDED,
  simulateMstSitting,
} from '../../../packages/policies/src/diagnostic-mst';
import {
  DEFAULT_ASSUMPTION_GRID,
  buildSimBankFor,
  learnerModelFor,
  makeLearnerOn,
  makeRng,
} from '../../../packages/policies/src/diagnostic-simulation';
import { certaintyBand, type CertaintyBandId } from '../src/components/BucketGapChart';

/**
 * Where the certainty band cut points in `src/components/BucketGapChart.tsx`
 * come from, and the guard that tells us when they have gone stale.
 *
 * The chart turns `certainty` into a whisker width and a worded band by cutting
 * the distribution at its 3rd and 7th deciles. That distribution is a property
 * of the delivered form, not of the metric, so cuts derived from any other form
 * — a different length, a different block structure, a different allocation rule
 * — silently stop splitting the cohort the way they claim to. That is exactly
 * how the previous pair drifted: they were the deciles of a population the
 * served form does not generate, and against the served form they sorted reads
 * 13/39/48 rather than 30/40/30.
 *
 * So this measures the form `productionDesign()` actually resolves to, on the
 * axis `diagnostic-engine.ts` actually reports on, and re-scores each sitting
 * through the same `computeBayesResult` the engine calls. The always-on case
 * runs a slice deep enough to catch a real move; `CERTAINTY_LEARNERS=1000`
 * reproduces the 240,000-read figures quoted in the chart, in about 40 seconds.
 *
 * The harness imports are relative because `@mcat/policies` deliberately keeps
 * the simulation surface unexported — it is a harness, not a policy. Nothing
 * here may be imported by anything under `src/`: the browser bundle must not
 * carry a cohort simulator.
 */

/**
 * The assumption grid at 40 learners a world — 9,600 concept reads, about a
 * second and a half. Deep enough that occupancy lands within a point of the
 * 240,000-read figures, and short enough to run unconditionally.
 */
const SLICE_LEARNERS = 40;

/**
 * How far the slice may sit from the occupancy the full run reports.
 *
 * The slice is the first 40 learners of each world rather than a random 40, so
 * its error against the full run is a fixed offset of about a point rather than
 * sampling noise, and it does not shrink on a re-run. Set at a point and a half:
 * loose enough not to fail on that offset, and an order of magnitude tighter
 * than the 18-point skew the superseded cuts produced.
 */
const OCCUPANCY_TOLERANCE = 0.015;

/** The sweep's own seed, so the cohort here is the one the plan bars were set on. */
const SEED = 20260725;

/** Recorded in `BucketGapChart.tsx`: min, the nine deciles, then max. */
const RECORDED_DECILES = [
  0.3746, 0.6956, 0.7529, 0.7914, 0.8362, 0.8819, 0.9221, 0.9527, 0.9731, 0.9863, 0.9991,
] as const;

const quantile = (sorted: readonly number[], q: number): number => {
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
};

/**
 * Every concept read the served form produces across the assumption grid.
 *
 * Sitting A only, and seeded exactly as `runMstCohortDetailed` seeds it, so this
 * is a re-scoring of the same cohort the reproducibility bars were measured on
 * rather than a fresh population that happens to resemble it. The responses are
 * rebuilt from the items served and how they were answered, which is the same
 * log the engine posts to `computeBayesResult`.
 */
function measureReads(learnersPerWorld: number): number[] {
  const axis = FC_AXIS;
  const bucketIds = axisIds(axis);
  const sections = indexAxis(axis);
  const reads: number[] = [];

  for (const world of DEFAULT_ASSUMPTION_GRID) {
    const bank = buildSimBankFor(makeRng(SEED), world.mode, axis);
    const itemsById = new Map(bank.map((item) => [item.questionId, item]));
    const model = learnerModelFor(world);

    for (let i = 0; i < learnersPerWorld; i += 1) {
      const learner = makeLearnerOn(bucketIds, `sim-${i}`, makeRng(SEED + i * 7919), model);
      const run = simulateMstSitting(
        learner,
        bank,
        MST_140_RECOMMENDED,
        axis,
        makeRng(SEED + i * 104729),
      );
      const responses: DiagnosticResponse[] = run.servedItemIds.map((questionId, k) => {
        const item = itemsById.get(questionId)!;
        return {
          questionId,
          cluster: item.bucketId as DiagnosticResponse['cluster'],
          section: sections.get(item.bucketId)!.section,
          familyId: questionId,
          correct: run.servedCorrect[k]!,
          elapsedMs: 60_000,
          dokLevel: item.dokLevel,
        };
      });
      for (const signal of computeBayesResult(responses, undefined, axis).perCluster) {
        if (signal.itemsSeen > 0) reads.push(signal.certainty);
      }
    }
  }
  return reads;
}

/**
 * Share of reads each band claims, put through the chart's own `certaintyBand`
 * rather than through a copy of its cut points. A transcription here would let
 * the constants move without this noticing, which is the failure being fixed.
 */
const occupancy = (reads: readonly number[]): Record<CertaintyBandId, number> => {
  const counts: Record<CertaintyBandId, number> = { provisional: 0, moderate: 0, confident: 0 };
  for (const certainty of reads) counts[certaintyBand(certainty).id] += 1;
  return {
    provisional: counts.provisional / reads.length,
    moderate: counts.moderate / reads.length,
    confident: counts.confident / reads.length,
  };
};

describe('certainty band calibration', () => {
  // Measured once and shared: the slice costs a second and a half, and every case
  // below asks a different question of the same population.
  let sorted: number[] = [];
  beforeAll(() => {
    sorted = measureReads(SLICE_LEARNERS).sort((a, b) => a - b);
  });

  it('reads every sampled concept of every world', () => {
    expect(sorted).toHaveLength(DEFAULT_ASSUMPTION_GRID.length * SLICE_LEARNERS * 10);
  });

  it('sorts the served form into the 30/40/30 the cuts claim', () => {
    const shares = occupancy(sorted);

    expect(Math.abs(shares.provisional - 0.3)).toBeLessThan(OCCUPANCY_TOLERANCE);
    expect(Math.abs(shares.moderate - 0.4)).toBeLessThan(OCCUPANCY_TOLERANCE);
    expect(Math.abs(shares.confident - 0.3)).toBeLessThan(OCCUPANCY_TOLERANCE);
  });

  it('still centres where the recorded distribution says it does', () => {
    for (let decile = 1; decile <= 9; decile += 1) {
      expect(
        Math.abs(quantile(sorted, decile / 10) - RECORDED_DECILES[decile]!),
        `decile ${decile}`,
      ).toBeLessThan(0.02);
    }
  });

  /**
   * The reason the chart may treat both ends as unreachable: nothing sits at 0
   * or 1, so the whisker is always drawn and the tightest read still needs the
   * track's `min-width` floor rather than vanishing.
   *
   * The extremes themselves are not pinned — they are a min and a max over a
   * tail, so they keep moving outward as the run deepens. The slice bottoms out
   * near 0.43 where the full run reaches 0.375.
   */
  it('never reaches either end of the scale', () => {
    expect(sorted[0]!).toBeGreaterThan(0);
    expect(sorted[sorted.length - 1]!).toBeLessThan(1);
  });
});

/**
 * The full run, printed rather than asserted: this is the table the recorded
 * deciles were read off, and re-running it is how the next person checks whether
 * the numbers in `BucketGapChart.tsx` still describe the form being served.
 *
 *   CERTAINTY_LEARNERS=1000 pnpm --filter @mcat/learner-web exec vitest run server/certainty-bands
 */
const DEEP_LEARNERS = Number(process.env.CERTAINTY_LEARNERS ?? 0);

describe.skipIf(DEEP_LEARNERS < 1)('certainty distribution at depth', () => {
  it('reports the decile table', { timeout: 30 * 60_000 }, () => {
    const sorted = measureReads(DEEP_LEARNERS).sort((a, b) => a - b);
    const label = (k: number): string => (k === 0 ? 'min' : k === 10 ? 'max' : `D${k}`);

    console.log(
      `\ncertainty on ${MST_140_RECOMMENDED.label} / ${FC_AXIS.id}, ` +
        `${DEFAULT_ASSUMPTION_GRID.length} worlds x ${DEEP_LEARNERS} learners, seed ${SEED}` +
        `\n${sorted.length.toLocaleString()} concept reads`,
    );
    for (let k = 0; k <= 10; k += 1) {
      console.log(`  ${label(k).padStart(4)}  ${quantile(sorted, k / 10).toFixed(4)}`);
    }
    const shares = occupancy(sorted);
    console.log(
      '  occupancy: ' +
        (['provisional', 'moderate', 'confident'] as const)
          .map((band) => `${band} ${(shares[band] * 100).toFixed(1)}%`)
          .join(' / '),
    );
    expect(sorted.length).toBeGreaterThan(0);
  });
});
