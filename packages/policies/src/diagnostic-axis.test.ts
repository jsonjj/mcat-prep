import { SKILL_CLUSTERS, type SkillCluster } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { CLUSTER_AXIS, FC_AXIS, FC_PLUS_AXIS, axisIds, indexAxis } from './diagnostic-axis';
import { computeBayesResult, selectNextBayes } from './diagnostic-bayes';
import {
  REPORTED_PRIORITY_COUNT,
  type DiagnosticCandidate,
  type DiagnosticResponse,
} from './diagnostic';

describe('CLUSTER_AXIS', () => {
  it('reproduces the canonical cluster order', () => {
    expect(axisIds(CLUSTER_AXIS)).toEqual(SKILL_CLUSTERS);
  });
});

describe('FC_AXIS', () => {
  const expected = Array.from({ length: 10 }, (_, i) => `FC${i + 1}`);

  it('covers the ten Foundational Concepts in order', () => {
    expect(FC_AXIS.id).toBe('fc-10');
    expect(FC_AXIS.buckets).toHaveLength(10);
    expect(axisIds(FC_AXIS)).toEqual(expected);
    expect(indexAxis(FC_AXIS).size).toBe(10);
  });

  it('carries a usable weight and title for every bucket', () => {
    for (const bucket of FC_AXIS.buckets) {
      expect(Number.isFinite(bucket.unlockWeight)).toBe(true);
      expect(bucket.unlockWeight).toBeGreaterThanOrEqual(0);
      expect(bucket.title.length).toBeGreaterThan(0);
    }
  });

  /**
   * Tripwire, not a target. The FCs are a content axis and none of their
   * lessons sit in the high-leverage reasoning or CARS clusters, so aggregating
   * cluster weights up to FC level compresses the range badly and leaves five
   * FCs tied. If this starts failing the axis has gained real spread and the
   * simulation's leverage read is worth revisiting.
   */
  it('has markedly less leverage spread than the cluster axis', () => {
    const spread = (weights: number[]): number => Math.max(...weights) - Math.min(...weights);
    const fc = FC_AXIS.buckets.map((b) => b.unlockWeight);
    const cluster = CLUSTER_AXIS.buckets.map((b) => b.unlockWeight);
    expect(spread(fc)).toBeLessThan(spread(cluster) / 2);
    expect(new Set(fc).size).toBeLessThan(FC_AXIS.buckets.length);
  });
});

describe('FC_PLUS_AXIS', () => {
  const expected = [
    ...Array.from({ length: 10 }, (_, i) => `FC${i + 1}`),
    'R1',
    'R2',
    'R3',
    'CA1',
    'CA2',
  ];

  it('is the ten Foundational Concepts plus the five clusters they do not cover', () => {
    expect(FC_PLUS_AXIS.id).toBe('fc-15');
    expect(axisIds(FC_PLUS_AXIS)).toEqual(expected);
    expect(indexAxis(FC_PLUS_AXIS).size).toBe(15);
  });

  it('reuses the FC buckets verbatim', () => {
    expect(FC_PLUS_AXIS.buckets.slice(0, 10)).toEqual(FC_AXIS.buckets);
  });

  /**
   * The composite is built off CLUSTER_INFO/UNLOCK_WEIGHT rather than off
   * CLUSTER_AXIS, to keep diagnostic-axis-fc.ts from importing back into
   * diagnostic-axis.ts. This is what makes that indirection safe.
   */
  it('reuses the reasoning and CARS buckets verbatim', () => {
    const cluster = indexAxis(CLUSTER_AXIS);
    for (const bucket of FC_PLUS_AXIS.buckets.slice(10)) {
      expect(bucket).toEqual(cluster.get(bucket.id));
    }
  });

  /**
   * The FC axis flattens leverage because none of its lessons reach the
   * high-weight reasoning clusters. Re-admitting those clusters is the whole
   * reason the composite exists, so it must recover the cluster axis's spread —
   * CA2 at 0.15 even undercuts the 0.20 floor the FC buckets tie at.
   */
  it('recovers the full leverage spread the FC axis loses', () => {
    const weights = FC_PLUS_AXIS.buckets.map((b) => b.unlockWeight);
    expect(Math.min(...weights)).toBe(0.15);
    expect(Math.max(...weights)).toBe(1);

    const spread = (ws: number[]): number => Math.max(...ws) - Math.min(...ws);
    expect(spread(weights)).toBe(spread(CLUSTER_AXIS.buckets.map((b) => b.unlockWeight)));
  });
});

describe('every axis', () => {
  const axes = [CLUSTER_AXIS, FC_AXIS, FC_PLUS_AXIS];

  it('carries finite non-negative weights and unique ids throughout', () => {
    for (const axis of axes) {
      for (const bucket of axis.buckets) {
        expect(Number.isFinite(bucket.unlockWeight)).toBe(true);
        expect(bucket.unlockWeight).toBeGreaterThanOrEqual(0);
        expect(bucket.title.length).toBeGreaterThan(0);
      }
      expect(indexAxis(axis).size).toBe(axis.buckets.length);
    }
  });
});

/**
 * The point of the axis argument: the engine must report on whatever partition
 * it is handed, not on the 15 clusters it used to be wired to.
 */
describe('engine over a non-default axis', () => {
  // Responses are typed to `SkillCluster`; off-cluster bucket ids ride in the
  // same field, which is the boundary the engine documents in `asCluster`.
  const asCluster = (bucketId: string): SkillCluster => bucketId as SkillCluster;

  const candidates: DiagnosticCandidate[] = FC_AXIS.buckets.flatMap((b) =>
    Array.from({ length: 8 }, (_, i) => ({
      questionId: `${b.id}-${i}`,
      cluster: asCluster(b.id),
      section: b.section,
      familyId: `${b.id}-f${i % 3}`,
      format: 'discrete_mcq' as const,
      eligible: true,
      dokLevel: (i % 4) + 1,
    })),
  );

  it('reports on the ten Foundational Concepts', () => {
    const responses: DiagnosticResponse[] = [];
    for (let step = 0; step < 60; step += 1) {
      const pick = selectNextBayes(responses, candidates, undefined, 'seed', FC_AXIS);
      if (pick.done || pick.questionId === undefined) break;
      const item = candidates.find((c) => c.questionId === pick.questionId)!;
      responses.push({
        questionId: item.questionId,
        cluster: item.cluster,
        section: item.section,
        familyId: item.familyId,
        // One planted weakness, so the ranking has something to find.
        correct: item.cluster !== asCluster('FC5') && step % 3 !== 0,
        elapsedMs: 40_000,
        dokLevel: item.dokLevel ?? 1,
      });
    }

    const result = computeBayesResult(responses, undefined, FC_AXIS);
    expect(result.perCluster.map((s) => s.cluster)).toEqual(axisIds(FC_AXIS));
    expect(result.topPriorities).toHaveLength(REPORTED_PRIORITY_COUNT);
    expect(result.topPriorities[0]?.cluster).toBe('FC5');
    expect(result.topPriorities[0]?.title).toBe('Chemical Interactions and Reactions');
  });
});
