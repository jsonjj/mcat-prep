import { describe, expect, it } from 'vitest';
import { FC_AXIS, axisIds } from './diagnostic-axis';
import { lessonsByFc } from './diagnostic-axis-fc';
import {
  BAYES_DIAGNOSTIC_CONFIG,
  computeBayesResult,
  severitySdByBucket,
} from './diagnostic-bayes';
import {
  REPORTED_PRIORITY_COUNT,
  leverageOf,
  type DiagnosticResponse,
} from './diagnostic';
import {
  attenuateCertainty,
  lessonSeedsFromDiagnostic,
  seedPriorFromRead,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
} from './mastery-seed';

/**
 * Calibration evidence for `ClusterSignal.certainty`.
 *
 * The number it replaced was derived from posterior decisiveness and pinned to
 * exactly 1.0 for 76% of production-shape reads in simulation (68% of 190 reads
 * measured off live sessions), which left both of its consumers — the readout's
 * uncertainty whisker and the step size a mastery seed may take — unable to tell
 * a well-estimated bucket from a borderline one. It is now the share of the
 * prior's variance in the gap read that the responses have removed.
 *
 * What is pinned here is the *shape* of the resulting distribution, not any one
 * value: that it varies continuously, that nothing sits at either endpoint, and
 * that reads the old measure could not separate are separated now.
 */

/** Production delivers 140 items over the 10 Foundational Concepts. */
const ITEMS_PER_BUCKET = 14;

/** One bucket's worth of responses: `correct` of `items` at a fixed DOK. */
const bucketResponses = (
  bucketId: string,
  items: number,
  correct: number,
  dokLevel = 2,
): DiagnosticResponse[] =>
  Array.from({ length: items }, (_, i) => ({
    questionId: `${bucketId}-${dokLevel}-${i}`,
    cluster: bucketId as DiagnosticResponse['cluster'],
    section: 'cp' as const,
    familyId: `${bucketId}-${dokLevel}-${i}`,
    correct: i < correct,
    elapsedMs: 60_000,
    dokLevel,
  }));

/** A whole sitting: every concept sampled at the production rate. */
const sitting = (correctFor: (bucketIndex: number) => number): DiagnosticResponse[] =>
  FC_AXIS.buckets.flatMap((b, i) => bucketResponses(b.id, ITEMS_PER_BUCKET, correctFor(i)));

const readsOf = (responses: DiagnosticResponse[]): Map<string, number> => {
  const result = computeBayesResult(responses, undefined, FC_AXIS);
  return new Map(
    result.perCluster.filter((s) => s.itemsSeen > 0).map((s) => [s.cluster as string, s.certainty]),
  );
};

const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]!;
};

describe('certainty is derived from the posterior spread of the gap', () => {
  it('reads exactly zero for a bucket the form never sampled', () => {
    const responses = bucketResponses('FC1', ITEMS_PER_BUCKET, 7);
    const result = computeBayesResult(responses, undefined, FC_AXIS);
    for (const signal of result.perCluster) {
      if (signal.itemsSeen === 0) expect(signal.certainty).toBe(0);
    }
  });

  it('stays in [0,1] and never reaches the top, however clean the evidence', () => {
    for (const items of [1, 2, 6, 14, 28, 60]) {
      for (const correct of [0, Math.floor(items / 2), items]) {
        const read = readsOf(bucketResponses('FC1', items, correct)).get('FC1')!;
        expect(read).toBeGreaterThanOrEqual(0);
        expect(read).toBeLessThan(1);
      }
    }
  });

  /**
   * The property the old measure lacked. Decisiveness is already saturated at
   * six items for a learner answering nothing right, so it reported the same
   * 1.000 at 6, 14 and 28 items; the spread of the gap keeps shrinking.
   */
  it('keeps rising as evidence accumulates, past the point decisiveness settles', () => {
    const reads = [2, 6, 14, 28, 60].map(
      (items) => readsOf(bucketResponses('FC1', items, 0)).get('FC1')!,
    );
    for (let i = 1; i < reads.length; i += 1) {
      expect(reads[i]!, `${reads[i]} should exceed ${reads[i - 1]}`).toBeGreaterThan(reads[i - 1]!);
    }
  });

  /**
   * Every score on a production-length block gets its own confidence. The
   * fifteen possible number-correct outcomes at 14 items are the whole support
   * of a production read, so a duplicate here would be two buckets the seeder
   * could not tell apart.
   */
  it('separates all fifteen number-correct outcomes of a production block', () => {
    const reads = Array.from(
      { length: ITEMS_PER_BUCKET + 1 },
      (_, correct) => readsOf(bucketResponses('FC1', ITEMS_PER_BUCKET, correct)).get('FC1')!,
    );
    expect(new Set(reads.map((r) => r.toFixed(4))).size).toBe(reads.length);
    expect(Math.max(...reads) - Math.min(...reads)).toBeGreaterThan(0.15);
  });

  it('tracks the posterior spread it is derived from, monotonically', () => {
    const responses = sitting((i) => i % (ITEMS_PER_BUCKET + 1));
    const spreads = severitySdByBucket(responses);
    const reads = readsOf(responses);
    const rows = axisIds(FC_AXIS)
      .map((id) => ({ id, sd: spreads.get(id)!, certainty: reads.get(id)! }))
      .sort((a, b) => a.sd - b.sd);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.certainty).toBeLessThanOrEqual(rows[i - 1]!.certainty);
    }
  });
});

describe('the distribution the seeder and the readout now see', () => {
  /**
   * Every learner the production block can produce, at concept grain: each
   * concept scored 0..14 out of 14, over sittings whose overall level ranges
   * from failing everything to answering everything. That is the population of
   * reads the two consumers face.
   */
  const population = (): number[] => {
    const reads: number[] = [];
    for (let offset = 0; offset <= ITEMS_PER_BUCKET; offset += 1) {
      const responses = sitting((i) => (i + offset) % (ITEMS_PER_BUCKET + 1));
      reads.push(...readsOf(responses).values());
    }
    return reads;
  };

  it('is not degenerate: nothing at either endpoint, and wide deciles', () => {
    const reads = population();
    expect(reads.filter((r) => r >= 1).length).toBe(0);
    expect(reads.filter((r) => r <= 0).length).toBe(0);
    expect(quantile(reads, 0.9) - quantile(reads, 0.1)).toBeGreaterThan(0.2);
    // Distinct to four decimals: the seeder can act on the difference.
    expect(new Set(reads.map((r) => r.toFixed(4))).size / reads.length).toBeGreaterThan(0.15);
  });

  it('keeps every seeded prior inside the asymmetric seeding bounds', () => {
    for (let offset = 0; offset <= ITEMS_PER_BUCKET; offset += 1) {
      const result = computeBayesResult(
        sitting((i) => (i + offset) % (ITEMS_PER_BUCKET + 1)),
        undefined,
        FC_AXIS,
      );
      for (const seed of lessonSeedsFromDiagnostic(result, lessonsByFc())) {
        expect(seed.prior).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
        expect(seed.prior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
      }
    }
  });

  /**
   * The seeding defect stated directly: two concepts read at the same gap but
   * with different precision must not seed the same prior. Under the old
   * measure both scored certainty 1.000 and the priors were identical.
   */
  it('seeds two equally weak but unequally measured concepts differently', () => {
    // The same concept read at the same accuracy from six items and from
    // twenty-four. More evidence also sharpens the gap itself, so the gap is
    // held fixed here and only the confidence channel is varied — which is the
    // channel under test.
    const sparse = readsOf(bucketResponses('FC1', 6, 2)).get('FC1')!;
    const dense = readsOf(bucketResponses('FC1', 24, 8)).get('FC1')!;
    expect(dense - sparse).toBeGreaterThan(0.1);

    const units = lessonsByFc().get('FC1')!.length;
    const priorAt = (certainty: number): number =>
      seedPriorFromRead({ gap: 0.7, certainty: attenuateCertainty(certainty, units) });
    expect(priorAt(dense)).toBeLessThan(priorAt(sparse));
    expect(priorAt(dense)).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
  });
});

describe('the confidence channel does not touch the plan', () => {
  /**
   * Selection, stopping and ranking all read posterior *decisiveness* and
   * `gap`, never `certainty`. This pins the consequence: the reported ordering
   * is exactly the leverage ordering, so no change to the confidence channel
   * can move it.
   */
  it('orders priorities by leverage alone', () => {
    const result = computeBayesResult(
      sitting((i) => i % (ITEMS_PER_BUCKET + 1)),
      BAYES_DIAGNOSTIC_CONFIG,
      FC_AXIS,
    );
    const unlock = new Map(FC_AXIS.buckets.map((b) => [b.id, b.unlockWeight]));
    const byLeverage = result.perCluster
      .filter((s) => s.itemsSeen > 0)
      .map((s) => ({
        cluster: s.cluster as string,
        leverage: leverageOf(s.gap, unlock.get(s.cluster as string) ?? 0),
      }))
      .sort((a, b) => b.leverage - a.leverage)
      .map((x) => x.cluster);

    expect(result.topPriorities.map((p) => p.cluster as string)).toEqual(
      byLeverage.slice(0, REPORTED_PRIORITY_COUNT),
    );
  });

  /**
   * Where the concept the report stopped naming goes.
   *
   * Reporting two priorities instead of three demotes a bucket that a full
   * production block measured as thoroughly as the two above it. `stillConfirming`
   * means the opposite of that — weak on the evidence so far, but not enough of it
   * to act on — so the demoted bucket must not appear there, and the seeded
   * mastery prior, which reads every bucket rather than the named two, has to
   * carry it instead.
   */
  it('demotes the third concept to a seed, not to stillConfirming', () => {
    const result = computeBayesResult(
      sitting((i) => i % (ITEMS_PER_BUCKET + 1)),
      BAYES_DIAGNOSTIC_CONFIG,
      FC_AXIS,
    );
    const unlock = new Map(FC_AXIS.buckets.map((b) => [b.id, b.unlockWeight]));
    const ranked = result.perCluster
      .filter((s) => s.itemsSeen > 0)
      .map((s) => ({
        cluster: s.cluster as string,
        leverage: leverageOf(s.gap, unlock.get(s.cluster as string) ?? 0),
      }))
      .sort((a, b) => b.leverage - a.leverage);
    expect(ranked.length).toBeGreaterThan(REPORTED_PRIORITY_COUNT);

    const demoted = ranked[REPORTED_PRIORITY_COUNT]!.cluster;
    expect(result.stillConfirming as string[]).not.toContain(demoted);

    // It is out of the report because two concepts outranked it, not because the
    // form failed to measure it.
    const signal = result.perCluster.find((s) => (s.cluster as string) === demoted)!;
    expect(signal.itemsSeen).toBe(ITEMS_PER_BUCKET);
    expect(signal.certainty).toBeGreaterThan(0.5);

    // What it does still reach: a prior on every lesson it covers.
    const seeded = new Set(
      lessonSeedsFromDiagnostic(result, lessonsByFc()).map((s) => s.unitId),
    );
    for (const lesson of lessonsByFc().get(demoted) ?? []) expect(seeded).toContain(lesson);
  });
});
