import { describe, expect, it } from 'vitest';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
import { PRIOR_PL0 } from './bkt';
import type { DiagnosticResponse } from './diagnostic';
import { computeBayesResult } from './diagnostic-bayes';
import {
  attenuateCertainty,
  lessonSeedsFromDiagnostic,
  lessonsByCluster,
  SEED_PRIOR_CAP,
  SEED_PRIOR_FLOOR,
  seedsFromBucketReads,
} from './mastery-seed';

/** A full sitting: every cluster sampled, with accuracy varying by cluster. */
const sitting = (): DiagnosticResponse[] =>
  SKILL_CLUSTERS.flatMap((cluster, ci) =>
    Array.from({ length: 6 }, (_, i) => ({
      questionId: `${cluster}-${i}`,
      cluster,
      section: CLUSTER_INFO[cluster].section,
      familyId: `${cluster}-${i}`,
      correct: (ci + i) % 3 !== 0,
      elapsedMs: 60_000,
      dokLevel: 2,
    })),
  );

describe('bucket read -> unit seeds', () => {
  const units = new Map<string, readonly string[]>([
    ['CP1', ['a', 'b', 'c', 'd']],
    ['CP2', ['e']],
  ]);

  it('gives every unit under a bucket the same prior', () => {
    const seeds = seedsFromBucketReads(
      [{ bucketId: 'CP1', gap: 0.9, certainty: 0.8, itemsSeen: 10 }],
      units,
    );
    expect(seeds).toHaveLength(4);
    expect(new Set(seeds.map((s) => s.prior)).size).toBe(1);
    expect(seeds.every((s) => s.bucketId === 'CP1')).toBe(true);
  });

  it('trusts a read less the more units share it', () => {
    const wide = seedsFromBucketReads([{ bucketId: 'CP1', gap: 0.9, certainty: 0.8, itemsSeen: 10 }], units);
    const narrow = seedsFromBucketReads([{ bucketId: 'CP2', gap: 0.9, certainty: 0.8, itemsSeen: 10 }], units);
    // Same read, but CP1 spreads it over four units and CP2 over one.
    expect(wide[0]!.certainty).toBeLessThan(narrow[0]!.certainty);
    expect(attenuateCertainty(0.8, 4)).toBeCloseTo(0.4, 10);
    expect(attenuateCertainty(0.8, 1)).toBeCloseTo(0.8, 10);
  });

  it('emits nothing for an unsampled or unmapped bucket', () => {
    expect(seedsFromBucketReads([{ bucketId: 'CP1', gap: 0.9, certainty: 0.8, itemsSeen: 0 }], units)).toEqual([]);
    expect(seedsFromBucketReads([{ bucketId: 'ZZ9', gap: 0.9, certainty: 0.8, itemsSeen: 10 }], units)).toEqual([]);
  });

  it('lets a weak read sink a prior but caps how far a strong one may raise it', () => {
    const weak = seedsFromBucketReads([{ bucketId: 'CP2', gap: 1, certainty: 1, itemsSeen: 20 }], units);
    const strong = seedsFromBucketReads([{ bucketId: 'CP2', gap: 0, certainty: 1, itemsSeen: 20 }], units);
    expect(weak[0]!.prior).toBeLessThan(PRIOR_PL0);
    expect(weak[0]!.prior).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
    expect(strong[0]!.prior).toBeGreaterThan(PRIOR_PL0);
    expect(strong[0]!.prior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
  });
});

describe('diagnostic -> lesson priors', () => {
  it('covers the atlas without assigning a lesson to two clusters', () => {
    const byCluster = lessonsByCluster();
    const all = [...byCluster.values()].flat();
    expect(all.length).toBeGreaterThan(100);
    expect(new Set(all).size).toBe(all.length);
  });

  it('seeds real lessons from a full sitting, and never awards mastery', () => {
    const seeds = lessonSeedsFromDiagnostic(computeBayesResult(sitting()));
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(seed.prior).toBeGreaterThanOrEqual(SEED_PRIOR_FLOOR);
      // The ceiling is far below BKT's 0.95 mastery threshold, so no diagnostic
      // read can seed a lesson into a state the learner has not demonstrated.
      expect(seed.prior).toBeLessThanOrEqual(SEED_PRIOR_CAP);
      expect(lessonsByCluster().get(seed.bucketId)).toContain(seed.unitId);
    }
  });

  it('is empty for a learner who answered nothing', () => {
    expect(lessonSeedsFromDiagnostic(computeBayesResult([]))).toEqual([]);
  });
});
