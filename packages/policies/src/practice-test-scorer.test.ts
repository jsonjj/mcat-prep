import { describe, expect, it } from 'vitest';
import type { UtcTimestamp } from '@mcat/contracts';
import {
  decayWeight,
  decayWeightedAccuracy,
  remeasureMastery,
  scorePracticeTest,
  sittingObservations,
  type DatedUnitObservation,
  type PracticeTestScoredItem,
} from './practice-test-scorer';

const t = (iso: string): UtcTimestamp => iso as UtcTimestamp;

const item = (over: Partial<PracticeTestScoredItem>): PracticeTestScoredItem => ({
  questionId: 'q',
  section: 'cp',
  cluster: 'CP1',
  kcId: 'kc-1',
  skill: 'QUANTIFY',
  carsSkill: null,
  correct: true,
  ...over,
});

describe('practice test scorer — scoring', () => {
  it('totals correctness and breaks it out per section and per cluster', () => {
    const score = scorePracticeTest([
      item({ questionId: 'a', section: 'cp', cluster: 'CP1', correct: true }),
      item({ questionId: 'b', section: 'cp', cluster: 'CP1', correct: false }),
      item({ questionId: 'c', section: 'cars', cluster: 'CA1', carsSkill: 'RWT', skill: null, kcId: null, correct: true }),
      item({ questionId: 'd', section: 'bb', cluster: 'BB1', correct: true }),
    ]);
    expect(score.itemsScored).toBe(4);
    expect(score.correct).toBe(3);
    const cp = score.perSection.find((s) => s.section === 'cp')!;
    expect(cp).toMatchObject({ itemsScored: 2, correct: 1 });
    expect(cp.accuracy).toBeCloseTo(0.5);
    expect(score.perCluster.find((c) => c.cluster === 'CA1')!.accuracy).toBe(1);
  });

  it('populates the review queue from science misses, most-missed KC first', () => {
    const score = scorePracticeTest([
      item({ questionId: 'a', kcId: 'kc-weak', skill: 'QUANTIFY', correct: false }),
      item({ questionId: 'b', kcId: 'kc-weak', skill: 'QUANTIFY', correct: false }),
      item({ questionId: 'c', kcId: 'kc-mild', skill: 'EXPLAIN', correct: false }),
      item({ questionId: 'd', kcId: 'kc-ok', correct: true }),
    ]);
    expect(score.missedQuestionIds).toEqual(['a', 'b', 'c']);
    expect(score.reviewTargets).toEqual([
      { kcId: 'kc-weak', skill: 'QUANTIFY' },
      { kcId: 'kc-mild', skill: 'EXPLAIN' },
    ]);
  });

  it('does not queue CARS misses as per-KC review targets', () => {
    const score = scorePracticeTest([
      item({ questionId: 'a', section: 'cars', cluster: 'CA1', carsSkill: 'RBT', skill: null, kcId: null, correct: false }),
    ]);
    expect(score.missedQuestionIds).toEqual(['a']);
    expect(score.reviewTargets).toEqual([]);
  });
});

describe('practice test scorer — decay weights', () => {
  it('is 1 at age 0 and halves every half-life', () => {
    expect(decayWeight(0, 30)).toBe(1);
    expect(decayWeight(30, 30)).toBeCloseTo(0.5);
    expect(decayWeight(60, 30)).toBeCloseTo(0.25);
  });

  it('decreases monotonically with age', () => {
    const ages = [0, 5, 10, 20, 40, 80];
    const weights = ages.map((a) => decayWeight(a, 30));
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i]!).toBeLessThan(weights[i - 1]!);
    }
  });
});

describe('practice test scorer — decay-weighted re-measure', () => {
  const now = t('2026-03-01T00:00:00.000Z');

  it('a single sitting re-measures to that sitting’s raw accuracy', () => {
    const obs: DatedUnitObservation[] = [
      { unitId: 'CP1', grain: 'cluster', correct: 7, total: 10, at: now },
    ];
    expect(decayWeightedAccuracy(obs, now, 30)).toBeCloseTo(0.7);
    const [read] = remeasureMastery(obs, now, { halfLifeDays: 30 });
    expect(read!.remeasured).toBeCloseTo(0.7);
    expect(read!.sittings).toBe(1);
  });

  it('weights recent test performance far above stale performance', () => {
    // Two months ago: bombed it (0/10). Today: aced it (10/10). Half-life 30d.
    const obs: DatedUnitObservation[] = [
      { unitId: 'CP1', grain: 'cluster', correct: 0, total: 10, at: t('2026-01-01T00:00:00.000Z') },
      { unitId: 'CP1', grain: 'cluster', correct: 10, total: 10, at: now },
    ];
    const remeasured = decayWeightedAccuracy(obs, now, 30)!;
    // The flat average would be 0.5; recency must pull it well above that.
    expect(remeasured).toBeGreaterThan(0.75);
    // ~59 days old → weight 2^(-59/30) ≈ 0.256; num=10, den=10+2.56 ≈ 12.56 → ~0.796.
    expect(remeasured).toBeCloseTo(10 / (10 + 10 * decayWeight(59, 30)), 2);
  });

  it('symmetrically, a recent slump outweighs old strength', () => {
    const obs: DatedUnitObservation[] = [
      { unitId: 'CP1', grain: 'cluster', correct: 10, total: 10, at: t('2026-01-01T00:00:00.000Z') },
      { unitId: 'CP1', grain: 'cluster', correct: 0, total: 10, at: now },
    ];
    expect(decayWeightedAccuracy(obs, now, 30)!).toBeLessThan(0.25);
  });

  it('re-measures each unit independently and reports effective evidence', () => {
    const obs: DatedUnitObservation[] = [
      { unitId: 'CP1', grain: 'cluster', correct: 8, total: 10, at: now },
      { unitId: 'CA1', grain: 'cluster', correct: 2, total: 8, at: now },
    ];
    const reads = remeasureMastery(obs, now, { halfLifeDays: 30 });
    const cp1 = reads.find((r) => r.unitId === 'CP1')!;
    const ca1 = reads.find((r) => r.unitId === 'CA1')!;
    expect(cp1.remeasured).toBeCloseTo(0.8);
    expect(ca1.remeasured).toBeCloseTo(0.25);
    expect(cp1.weightedItems).toBeCloseTo(10);
  });

  it('sittingObservations rolls a scored form into dated per-cluster observations', () => {
    const obs = sittingObservations(
      [
        item({ cluster: 'CP1', correct: true }),
        item({ cluster: 'CP1', correct: false }),
        item({ cluster: 'CA1', carsSkill: 'FOC', skill: null, kcId: null, correct: true }),
      ],
      now,
    );
    const cp1 = obs.find((o) => o.unitId === 'CP1')!;
    expect(cp1).toMatchObject({ grain: 'cluster', correct: 1, total: 2, at: now });
    expect(obs.find((o) => o.unitId === 'CA1')!.total).toBe(1);
  });
});
