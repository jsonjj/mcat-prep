import { SKILL_CLUSTERS, type SkillCluster } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { REPORTED_PRIORITY_COUNT } from './diagnostic';
import { CLUSTER_AXIS } from './diagnostic-axis';
import {
  MST_DESIGNS,
  bucketCounts,
  cutScoresFor,
  defaultRoutingQuantiles,
  moduleDifficulties,
  planMstForm,
  routeFromScore,
  simulateMstSitting,
  type MstDesign,
} from './diagnostic-mst';
import {
  buildSimBank,
  makeLearner,
  makeRng,
  type SimLearner,
} from './diagnostic-simulation';

/**
 * The MST delivery arm's structural guarantees.
 *
 * Accuracy is the sweep's business, not this file's. What is checked here is
 * everything MST claims *by construction* — fixed length, guaranteed per-bucket
 * coverage, no repeats, routing that actually separates learners, and bit-exact
 * reproduction under a seed — because those are the properties that make it a
 * different design rather than a differently-tuned one.
 */

const BANK = buildSimBank(makeRng(20260725), 'misspecified');
const AXIS = CLUSTER_AXIS;

/** A learner of uniform ability everywhere, for isolating routing from deficits. */
const flatLearner = (id: string, theta: number): SimLearner => ({
  id,
  theta: Object.fromEntries(SKILL_CLUSTERS.map((c) => [c, theta])) as Record<SkillCluster, number>,
  deficits: [],
});

const totalOf = (design: MstDesign): number =>
  typeof design.itemsPerStage === 'number'
    ? design.itemsPerStage * design.stages
    : design.itemsPerStage.reduce((s, n) => s + n, 0);

describe('MST form planning', () => {
  it('guarantees the declared per-bucket floor on every preset', () => {
    for (const design of MST_DESIGNS) {
      const plan = planMstForm(design, BANK, AXIS);
      expect(plan.totalItems).toBe(totalOf(design));
      for (const [bucket, count] of plan.itemsPerBucket) {
        expect(
          count,
          `${design.label} gave bucket ${bucket} only ${count} items`,
        ).toBeGreaterThanOrEqual(design.minItemsPerBucket);
      }
    }
  });

  it('excludes buckets the bank cannot cover rather than failing on them', () => {
    // PS1 is genuinely empty in the real corpus profile the bank mirrors.
    const plan = planMstForm(MST_DESIGNS[0]!, BANK, AXIS);
    expect(plan.uncoverableBuckets).toEqual(['PS1']);
    expect(plan.itemsPerBucket.has('PS1')).toBe(false);
  });

  it('fails loudly when the form is too short to honour the floor', () => {
    const impossible: MstDesign = {
      label: 'too short',
      stages: 2,
      itemsPerStage: 10,
      modulesPerStage: 2,
      minItemsPerBucket: 5,
    };
    expect(() => planMstForm(impossible, BANK, AXIS)).toThrow(/guarantees only 1 per bucket/);
  });

  it('fails loudly when the bank cannot supply a bucket', () => {
    const thinBank = BANK.filter((i) => i.cluster !== 'R2' || i.questionId.endsWith('-0'));
    expect(() => planMstForm(MST_DESIGNS[3]!, thinBank, AXIS)).toThrow(
      /bucket "R2" needs \d+ items but the bank holds/,
    );
  });

  it('rejects a design whose stage list disagrees with its stage count', () => {
    const mismatched: MstDesign = {
      label: 'mismatched',
      stages: 3,
      itemsPerStage: [20, 20],
      modulesPerStage: 2,
      minItemsPerBucket: 1,
    };
    expect(() => planMstForm(mismatched, BANK, AXIS)).toThrow(/lists 2 stages but stages is 3/);
  });

  it('gives every module at a stage the same content, so coverage is route-independent', () => {
    const plan = planMstForm(MST_DESIGNS[2]!, BANK, AXIS);
    const fromSlots = new Map<string, number>();
    for (const stage of plan.slotsByStage) {
      for (const bucket of stage) fromSlots.set(bucket, (fromSlots.get(bucket) ?? 0) + 1);
    }
    expect(fromSlots).toEqual(plan.itemsPerBucket);
  });
});

describe('MST routing arithmetic', () => {
  it('spreads module difficulty across the ladder the bank can reach', () => {
    expect(moduleDifficulties(1)).toEqual([0]);
    expect(moduleDifficulties(2)).toEqual([-1, 1]);
    expect(moduleDifficulties(3)).toEqual([-1, 0, 1]);
  });

  it('splits ability into equal-mass bands by default', () => {
    expect(defaultRoutingQuantiles(2)).toEqual([0.5]);
    expect(defaultRoutingQuantiles(3)).toEqual([1 / 3, 2 / 3]);
  });

  it('asks for fewer correct to stay high on a harder module', () => {
    const q = defaultRoutingQuantiles(3);
    const easy = cutScoresFor(30, -1, q);
    const hard = cutScoresFor(30, 1, q);
    expect(hard[0]!).toBeLessThan(easy[0]!);
    expect(hard[1]!).toBeLessThan(easy[1]!);
    expect(easy[0]!).toBeLessThan(easy[1]!);
  });

  it('routes to the module whose cuts the score clears', () => {
    expect(routeFromScore(0, [10, 20])).toBe(0);
    expect(routeFromScore(10, [10, 20])).toBe(1);
    expect(routeFromScore(25, [10, 20])).toBe(2);
  });
});

describe('MST sitting', () => {
  it('serves exactly the designed number of items, with no repeats', () => {
    for (const design of MST_DESIGNS) {
      const learner = makeLearner('sim-0', makeRng(11));
      const run = simulateMstSitting(learner, BANK, design, AXIS, makeRng(22));
      expect(run.itemsServed, design.label).toBe(totalOf(design));
      expect(run.servedItemIds).toHaveLength(run.itemsServed);
      expect(new Set(run.servedItemIds).size, design.label).toBe(run.itemsServed);
      expect(run.routePath).toHaveLength(design.stages);
      expect(run.cutScores).toHaveLength(design.stages - 1);
    }
  });

  it('meets the per-bucket floor in the items actually served', () => {
    for (const design of MST_DESIGNS) {
      const plan = planMstForm(design, BANK, AXIS);
      for (let i = 0; i < 8; i += 1) {
        const learner = makeLearner(`sim-${i}`, makeRng(100 + i));
        const run = simulateMstSitting(learner, BANK, design, AXIS, makeRng(200 + i));
        const counts = bucketCounts(run, BANK);
        for (const bucket of plan.itemsPerBucket.keys()) {
          expect(
            counts.get(bucket) ?? 0,
            `${design.label}, learner ${i}, bucket ${bucket}`,
          ).toBeGreaterThanOrEqual(design.minItemsPerBucket);
        }
      }
    }
  });

  it('always begins in the shared routing module', () => {
    for (const design of MST_DESIGNS) {
      const learner = makeLearner('sim-0', makeRng(7));
      const run = simulateMstSitting(learner, BANK, design, AXIS, makeRng(8));
      expect(run.routePath[0]).toBe(0);
      for (const module of run.routePath) {
        expect(module).toBeGreaterThanOrEqual(0);
        expect(module).toBeLessThan(design.modulesPerStage);
      }
    }
  });

  it('routes strong learners higher than weak ones', () => {
    const design = MST_DESIGNS[1]!;
    const meanRoute = (theta: number): number => {
      let total = 0;
      for (let i = 0; i < 25; i += 1) {
        const run = simulateMstSitting(
          flatLearner(`flat-${i}`, theta),
          BANK,
          design,
          AXIS,
          makeRng(3000 + i),
        );
        // Stage 1 is fixed for everyone, so only the routed stages carry signal.
        total += run.routePath.slice(1).reduce((s, m) => s + m, 0);
      }
      return total / 25;
    };

    const weak = meanRoute(-1.5);
    const middling = meanRoute(0);
    const strong = meanRoute(1.5);

    expect(weak).toBeLessThan(middling);
    expect(middling).toBeLessThan(strong);
    // The extremes should land in the outer modules almost every time.
    const routedStages = design.stages - 1;
    expect(weak).toBeLessThan(0.5);
    expect(strong).toBeGreaterThan((design.modulesPerStage - 1.5) * routedStages);
  });

  it('reproduces a sitting exactly under a fixed seed', () => {
    const design = MST_DESIGNS[2]!;
    const learner = makeLearner('sim-42', makeRng(4242));
    const a = simulateMstSitting(learner, BANK, design, AXIS, makeRng(99));
    const b = simulateMstSitting(learner, BANK, design, AXIS, makeRng(99));
    expect(a).toEqual(b);
  });

  it('gives two learners on the same route the same form', () => {
    const design = MST_DESIGNS[1]!;
    const a = simulateMstSitting(flatLearner('a', 1.5), BANK, design, AXIS, makeRng(51));
    const b = simulateMstSitting(flatLearner('b', 1.5), BANK, design, AXIS, makeRng(52));
    if (a.routePath.join() === b.routePath.join()) {
      expect(a.servedItemIds).toEqual(b.servedItemIds);
    }
  });

  it('serves harder items to learners routed upward', () => {
    const design = MST_DESIGNS[1]!;
    const dokById = new Map(BANK.map((i) => [i.questionId, i.dokLevel]));
    const meanDok = (theta: number): number => {
      const run = simulateMstSitting(flatLearner('x', theta), BANK, design, AXIS, makeRng(77));
      const routed = run.servedItemIds.slice(design.itemsPerStage as number);
      return routed.reduce((s, id) => s + dokById.get(id)!, 0) / routed.length;
    };
    expect(meanDok(-1.5)).toBeLessThan(meanDok(1.5));
  });

  it('scores with the shared posterior rather than a private one', () => {
    const learner = makeLearner('sim-1', makeRng(13));
    const run = simulateMstSitting(learner, BANK, MST_DESIGNS[1]!, AXIS, makeRng(14));
    expect(run.reported).toHaveLength(REPORTED_PRIORITY_COUNT);
    expect(run.ranked.slice(0, REPORTED_PRIORITY_COUNT).map((r) => r.bucket)).toEqual(
      run.reported,
    );
    expect(['High', 'Medium', 'Still building']).toContain(run.confidenceLabel);
    expect(run.internalConfidence).toBeGreaterThanOrEqual(0);
    expect(run.internalConfidence).toBeLessThanOrEqual(100);
    // PS1 is never served, so it can never be resolved.
    expect(run.unresolved).toBeGreaterThanOrEqual(1);
  });

  it('lets a sweep move the cuts', () => {
    const design = MST_DESIGNS[1]!;
    const learner = flatLearner('mid', 0);
    const lenient = simulateMstSitting(
      learner,
      BANK,
      { ...design, routingQuantiles: [0.05, 0.1] },
      AXIS,
      makeRng(61),
    );
    const strict = simulateMstSitting(
      learner,
      BANK,
      { ...design, routingQuantiles: [0.9, 0.95] },
      AXIS,
      makeRng(61),
    );
    const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
    expect(sum(lenient.routePath)).toBeGreaterThan(sum(strict.routePath));
  });

  it('rejects a quantile list that does not match the module count', () => {
    const design: MstDesign = { ...MST_DESIGNS[1]!, routingQuantiles: [0.5] };
    expect(() =>
      simulateMstSitting(makeLearner('sim-0', makeRng(1)), BANK, design, AXIS, makeRng(2)),
    ).toThrow(/need 2 routing quantiles, got 1/);
  });
});
