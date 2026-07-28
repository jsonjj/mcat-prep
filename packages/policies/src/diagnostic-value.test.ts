import { describe, expect, it } from 'vitest';
import { FC_AXIS, axisIds } from './diagnostic-axis';
import type { RetestRecord } from './diagnostic-simulation';
import { trueLeverageOf } from './diagnostic-retest';
import { DEFAULT_RUNWAY_MODEL, netValueAt, crossovers, type DesignValue } from './diagnostic-value';

/**
 * The net-value model against the published runway analysis it reuses.
 *
 * `docs/design/diagnostic-clean-slate-proposal.md` states the coverage table
 * for a 140-item form over 10 concepts — 3 of 10 concepts at 40h, 7 at 90h, all
 * 10 at 120h and above. Reproducing those four rows is what makes this the same
 * model rather than a second one that happens to agree in prose.
 */

const BUCKETS = axisIds(FC_AXIS);

/** One learner: known abilities, and a reported order supplied directly. */
const record = (
  theta: Record<string, number>,
  reported: readonly string[],
  itemsA: number,
): RetestRecord => ({
  learner: 'probe',
  axisId: FC_AXIS.id,
  theta,
  a: reported.map((b) => [b, 0] as const),
  b: reported.map((b) => [b, 0] as const),
  itemsA,
  itemsB: itemsA,
  itemsPerBucket: {},
  fisherPerBucket: {},
  servedA: [],
  correctA: [],
  servedB: [],
  correctB: [],
  sharedItems: 0,
  confidenceA: 'High',
  confidenceB: 'High',
});

/** Ability that makes the first three buckets the true weakest, in order. */
const THETA: Record<string, number> = Object.fromEntries(
  BUCKETS.map((id, i) => [id, i < 3 ? -2 + i * 0.1 : 1 + i * 0.01]),
);

const truth = (): string[] =>
  trueLeverageOf(record(THETA, BUCKETS, 140), FC_AXIS)
    .slice(0, 3)
    .map((t) => t.bucket);

describe('the runway model', () => {
  const perfect = [record(THETA, truth().concat(BUCKETS.filter((b) => !truth().includes(b))), 140)];

  it('reproduces the proposal’s coverage table for a 140-item form', () => {
    const covered = (runway: number): number => netValueAt(perfect, FC_AXIS, runway).bucketsCovered;
    expect(netValueAt(perfect, FC_AXIS, 40).hoursPerBucket).toBeCloseTo(11.4, 5);
    expect(netValueAt(perfect, FC_AXIS, 40).testHours).toBeCloseTo(3.694, 3);
    expect(covered(40)).toBe(3);
    expect(covered(90)).toBe(7);
    expect(covered(120)).toBe(10);
    expect(covered(300)).toBe(10);
  });

  /**
   * The knee. Once the runway covers everything, an optimal ordering and an
   * arbitrary one end in the same place, so there is no gain to capture and
   * none to lose — whatever the reported order says.
   */
  it('is worth nothing above the knee', () => {
    const scrambled = [record(THETA, [...BUCKETS].reverse(), 140)];
    for (const runway of [120, 200, 300]) {
      const good = netValueAt(perfect, FC_AXIS, runway);
      const bad = netValueAt(scrambled, FC_AXIS, runway);
      expect(good.hits).toBe(bad.hits);
      expect(good.shareOfAchievableGain).toBe(0);
      expect(good.netGain).toBe(0);
    }
  });

  it('captures nearly all of the achievable gain below the knee', () => {
    for (const runway of [40, 60, 90]) {
      expect(netValueAt(perfect, FC_AXIS, runway).shareOfAchievableGain).toBeCloseTo(1, 5);
    }
  });

  /**
   * The cost side, which accuracy-per-length cannot express: a form long enough
   * to push the learner across a coverage boundary can hand back less than it
   * took, however well it ordered what remains.
   */
  it('can be net negative when the test costs the learner a whole bucket', () => {
    // 11.4 hours of content per concept, so a runway just above a multiple of
    // 11.4 loses a concept to any form costing more than the remainder.
    const long = [record(THETA, [...BUCKETS].reverse(), 200)];
    const boundary = 11.4 * 4 + 1;
    expect(netValueAt(long, FC_AXIS, boundary).netGain).toBeLessThan(0);
  });

  it('charges a longer form more of the runway', () => {
    const short = netValueAt([record(THETA, BUCKETS, 60)], FC_AXIS, 60);
    const long = netValueAt([record(THETA, BUCKETS, 200)], FC_AXIS, 60);
    expect(long.testHours).toBeGreaterThan(short.testHours);
    expect(long.bucketsCovered).toBeLessThanOrEqual(short.bucketsCovered);
    expect(long.testHours - short.testHours).toBeCloseTo(
      ((200 - 60) * DEFAULT_RUNWAY_MODEL.secondsPerItem) / 3600,
      6,
    );
  });

  it('scores an uninformed order at its expected overlap and no better', () => {
    const scrambled = [record(THETA, [...BUCKETS].reverse(), 140)];
    const v = netValueAt(scrambled, FC_AXIS, 40);
    expect(v.uninformedHits).toBeCloseTo((3 * v.bucketsCovered) / 10, 6);
    expect(v.hits).toBeLessThanOrEqual(v.uninformedHits);
  });
});

describe('crossovers', () => {
  const row = (design: string, runwayHours: number, worst: number): DesignValue => ({
    design,
    runwayHours,
    worst,
    median: worst,
    best: worst,
  });

  it('reports a change of leader only when the challenger is strictly ahead', () => {
    const moves = crossovers([
      { runwayHours: 40, rows: [row('a', 40, 1), row('b', 40, 0.5)] },
      { runwayHours: 60, rows: [row('a', 60, 1), row('b', 60, 1)] },
      { runwayHours: 80, rows: [row('a', 80, 0.5), row('b', 80, 1)] },
    ]);
    expect(moves).toEqual([{ runwayHours: 80, from: 'a', to: 'b' }]);
  });

  it('says nothing when one design leads throughout', () => {
    expect(
      crossovers([
        { runwayHours: 40, rows: [row('a', 40, 1), row('b', 40, 0.5)] },
        { runwayHours: 80, rows: [row('a', 80, 1), row('b', 80, 0.5)] },
      ]),
    ).toEqual([]);
  });
});
