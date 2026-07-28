import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { SKILL_CLUSTERS } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { BANK_PROFILES } from './data/bank-profiles.generated';
import { REPORTED_PRIORITY_COUNT, UNLOCK_STRENGTH } from './diagnostic';
import { CLUSTER_AXIS, FC_AXIS, axisIds, type DiagnosticAxis } from './diagnostic-axis';
import { BAYES_DIAGNOSTIC_CONFIG } from './diagnostic-bayes';
import { MST_DESIGNS, simulateMstSitting } from './diagnostic-mst';
import {
  UNLOCK_STRENGTHS,
  allocationShape,
  rankingStrengthAt,
  type RankingStrengthMetrics,
} from './diagnostic-ranking';
import {
  accuracyFromRecords,
  agreementCeiling,
  chanceTwoOfThree,
  frontier,
  genericity,
  itemsNeededFor,
  maxRetestAtAccuracy,
  measurePrior,
  observedAgreement,
  precisionCurve,
  remedies,
  tieStructure,
  type Ceiling,
} from './diagnostic-retest';
import {
  DEFAULT_ASSUMPTION_GRID,
  DEFAULT_LEARNER_MODEL,
  PLAN_BARS,
  SWEEP_AXES,
  buildSimBankFor,
  learnerModelFor,
  makeLearner,
  makeLearnerOn,
  makeRng,
  runCohortDetailed,
  simulateSitting,
  trueLeverages,
  type CalibrationMode,
  type RetestRecord,
  type SweepAssumptions,
} from './diagnostic-simulation';

/**
 * Why the test-retest bar fails, and whether any instrument could pass it.
 *
 * The always-on tests here guard the analysis machinery. The study itself is
 * opt-in and takes minutes:
 *
 *   RETEST_STUDY=factors RETEST_LEN=200 pnpm --filter @mcat/policies exec vitest run diagnostic-retest
 *   RETEST_STUDY=axes    RETEST_LEN=140 ...
 *
 * Sharded exactly as the sweep is — each shard writes records to JSON, and the
 * merge step does the analysis over the union:
 *
 *   RETEST_STUDY=factors RETEST_SHARD=0/8 RETEST_OUT=.tmp/retest ...   # x8
 *   RETEST_STUDY=factors RETEST_MERGE=.tmp/retest ...
 */

const STUDY = process.env.RETEST_STUDY;
const N = Number(process.env.RETEST_N ?? 250);
const LEN = Number(process.env.RETEST_LEN ?? 200);
const SHARD = process.env.RETEST_SHARD;

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const fromRepoRoot = (p: string | undefined): string | undefined =>
  p === undefined ? undefined : isAbsolute(p) ? p : resolve(REPO_ROOT, p);
const OUT = fromRepoRoot(process.env.RETEST_OUT);
const MERGE = fromRepoRoot(process.env.RETEST_MERGE);

/** Matches the sweep's design table, so lengths are comparable to it. */
const FLOOR_FOR: Readonly<Record<number, number>> = { 60: 2, 90: 4, 140: 6, 200: 9 };
const configFor = (budget: number) => ({
  ...BAYES_DIAGNOSTIC_CONFIG,
  minItems: Math.round(budget / 2),
  maxItems: budget,
  minItemsPerCluster: FLOOR_FOR[budget] ?? Math.max(2, Math.floor(budget / 15)),
});

/**
 * Passes per learner when scoring the exact oracle.
 *
 * The posterior itself is fixed — it is read off data the cohort already
 * produced — so these only average out the sampler inside the ranking rule.
 * A handful is plenty; the estimator caps it internally.
 */
const CEILING_REPLICATES = 8;

/** Learners per world the oracle is scored on. See {@link ceilingOver}. */
const CEILING_LEARNERS = 250;

// --- Always-on guards -------------------------------------------------------

describe('axis-generalised harness', () => {
  it('builds each axis bank to its generated profile', () => {
    for (const [axisId, axis] of Object.entries(SWEEP_AXES)) {
      const bank = buildSimBankFor(makeRng(1), 'calibrated', axis);
      const counts = new Map<string, number>();
      for (const item of bank) counts.set(item.bucketId, (counts.get(item.bucketId) ?? 0) + 1);
      for (const [bucket, dok] of Object.entries(BANK_PROFILES[axis.id as 'cluster-15'])) {
        const total = dok[0] + dok[1] + dok[2];
        expect(counts.get(bucket) ?? 0, `${axisId} ${bucket}`).toBe(total);
      }
    }
  });

  it('leaves the cluster bank bit-identical to the original builder', () => {
    // Same RNG order, same ids, same parameters — every previously reported
    // figure on the 15-cluster axis must still reproduce.
    const bank = buildSimBankFor(makeRng(20260725), 'misspecified', CLUSTER_AXIS);
    expect(bank).toHaveLength(2108);
    expect(bank[0]!.questionId).toBe('R1-d1-0');
    expect(bank.every((i) => i.bucketId === i.cluster)).toBe(true);
  });

  it('draws the same learner whether or not the bucket list is passed', () => {
    const a = makeLearner('x', makeRng(7));
    const b = makeLearnerOn(SKILL_CLUSTERS, 'x', makeRng(7));
    expect(b).toEqual(a);
  });

  it('gives every axis a learner with an ability per bucket', () => {
    for (const axis of Object.values(SWEEP_AXES)) {
      const learner = makeLearnerOn(axisIds(axis), 'x', makeRng(3));
      expect(Object.keys(learner.theta).sort()).toEqual([...axisIds(axis)].sort());
    }
  });

  it('reports a full ranking whose head is the plan it names', () => {
    const bank = buildSimBankFor(makeRng(5), 'misspecified', CLUSTER_AXIS);
    const learner = makeLearner('sim-0', makeRng(11));
    const run = simulateSitting(learner, bank, makeRng(12));
    // The top-three telemetry is read off `ranked`, so the two lists agreeing at
    // the head is what makes those figures comparable with the reported plan.
    expect(run.ranked.slice(0, REPORTED_PRIORITY_COUNT).map((r) => r.bucket)).toEqual(
      run.reported,
    );
    expect(run.servedItemIds).toHaveLength(run.itemsServed);
  });
});

describe('retest records', () => {
  const cell = runCohortDetailed({ learners: 24, mode: 'misspecified', seed: 4242 });

  it('describes the same sittings the cohort metrics were scored on', () => {
    expect(cell.records).toHaveLength(24);
    const observed = observedAgreement(cell.records);
    expect(observed.twoOfThree).toBeCloseTo(cell.metrics.testRetestTwoOf3, 12);
    expect(observed.exactTop3).toBeCloseTo(cell.metrics.testRetestExact, 12);
    expect(observed.meanItems).toBeCloseTo(cell.metrics.meanItems, 12);
  });

  it('excludes the bank’s empty bucket from every learner’s truth', () => {
    for (const rec of cell.records) expect(Object.keys(rec.theta)).not.toContain('PS1');
  });

  it('produces the same learners whether run whole or in chunks', () => {
    const chunked = [0, 8, 16].flatMap(
      (firstLearner) =>
        runCohortDetailed({ learners: 8, firstLearner, mode: 'misspecified', seed: 4242 }).records,
    );
    expect(chunked).toEqual(cell.records);
  });

  it('recovers the cohort’s accuracy bars from the records alone', () => {
    const accuracy = accuracyFromRecords(cell.records, CLUSTER_AXIS);
    expect(accuracy.top1InTop3).toBeCloseTo(cell.metrics.top1InTop3, 12);
    expect(accuracy.twoOfThree).toBeCloseTo(cell.metrics.twoOfThree, 12);
  });

  it('accumulates information only for buckets that were served', () => {
    for (const rec of cell.records) {
      for (const [bucket, n] of Object.entries(rec.itemsPerBucket)) {
        expect(n).toBeGreaterThan(0);
        expect(rec.fisherPerBucket[bucket]).toBeGreaterThan(0);
      }
    }
  });
});

describe('agreement ceiling', () => {
  // 60 learners rather than 24: the estimator ordering below is a real effect of
  // a few points, and 24 learners is not enough to resolve it reliably.
  const cell = runCohortDetailed({ learners: 60, mode: 'misspecified', seed: 4242 });
  const bank = buildSimBankFor(makeRng(4242), 'misspecified', CLUSTER_AXIS);
  const opts = { axis: CLUSTER_AXIS, replicates: 40 };

  it('rises towards certainty as measurement error is driven out', () => {
    const curve = precisionCurve(cell.records, opts, [2, 1, 0.25, 0.05]);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]!.twoOfThree).toBeGreaterThanOrEqual(curve[i - 1]!.twoOfThree - 0.02);
    }
    // A noiseless instrument repeats itself by construction. If this is not ~1
    // the ceiling is measuring something other than measurement error.
    expect(curve[curve.length - 1]!.twoOfThree).toBeGreaterThan(0.97);
  });

  /**
   * The unbiased estimator is NOT the most reproducible one, which is the whole
   * reason `frontier` exists rather than a single ceiling number. Shrinking
   * towards the learner's own level trades accuracy away for agreement, and at
   * full shrinkage the ranking is the unlock weights alone — identical every
   * time, for every learner.
   */
  it('trades accuracy for reproducibility along the shrinkage axis', () => {
    const points = frontier(cell.records, opts);
    const raw = points[0]!;
    const flat = points[points.length - 1]!;
    expect(raw.shrinkage).toBe(0);
    expect(flat.shrinkage).toBe(1);
    expect(flat.retestTwoOfThree).toBeCloseTo(1, 6);
    expect(flat.retestTwoOfThree).toBeGreaterThan(raw.retestTwoOfThree);
    expect(flat.trueTwoOfThree).toBeLessThan(raw.trueTwoOfThree);
  });

  it('finds the most reproducible point that is still accurate enough', () => {
    const points = frontier(cell.records, opts);
    const best = maxRetestAtAccuracy(points, 0.6, 0.5);
    expect(best).not.toBeNull();
    expect(best!.trueTop1InTop3).toBeGreaterThanOrEqual(0.6);
    for (const p of points) {
      if (p.trueTop1InTop3 >= 0.6 && p.trueTwoOfThree >= 0.5) {
        expect(p.retestTwoOfThree).toBeLessThanOrEqual(best!.retestTwoOfThree);
      }
    }
  });

  /**
   * The estimator ladder, and why only the last rung is a bound.
   *
   * Each step fixes a defect in the one before: `unbiased` ignores that a
   * learner's buckets are correlated; `bayes` uses that but still summarises the
   * responses by an asymptotic normal, which at four items per bucket throws
   * away most of what they say; `exact-bayes` uses the responses themselves. A
   * ceiling drawn from either of the first two is one the shipping engine walks
   * straight through, which is what makes this ordering worth pinning.
   *
   * The first rung's lead is contingent on the selector allocating unevenly, and
   * measurably so: pooling across correlated buckets pays off in proportion to
   * how starved the worst-measured bucket is. At 480 learners `bayes` leads
   * `unbiased` 69.9% to 67.7% under the contention-weighted selector, which
   * spends 2.0 to 9.0 items a bucket, and trails it 63.4% to 67.5% under an even
   * split, which spends 3.7 to 4.7. `unbiased` barely moves between the two
   * (67.7% against 67.5%) — the same conservation the budget test above reports.
   */
  // Monte Carlo over an exact posterior, and the study runs eight of these
  // shards at once, so the default 5s is not enough on a contended machine.
  it('gets strictly sharper as the estimator stops discarding information', { timeout: 120_000 }, () => {
    const naive = agreementCeiling(cell.records, { ...opts, estimator: 'unbiased' });
    const approx = agreementCeiling(cell.records, { ...opts, estimator: 'bayes' });
    const exact = agreementCeiling(cell.records, {
      ...opts,
      bank,
      estimator: 'exact-bayes',
      learnerModel: DEFAULT_LEARNER_MODEL,
      severityRule: 'top3-probability',
      posteriorSamples: 200,
    });
    expect(approx.trueTwoOfThree).toBeGreaterThan(naive.trueTwoOfThree);
    expect(exact.trueTwoOfThree).toBeGreaterThan(approx.trueTwoOfThree);
    expect(exact.twoOfThree).toBeGreaterThan(approx.twoOfThree);
  });

  /**
   * The bound is only meaningful if the oracle is at least as good as the thing
   * it bounds. Each bar needs the rule that is optimal for THAT bar: ranking by
   * P(in true top 3) maximises expected overlap, ranking by P(is true #1)
   * maximises the top-1 bar, and neither wins at the other's game.
   */
  it('matches or beats the shipping engine on the bar each rule targets', { timeout: 120_000 }, () => {
    const engine = accuracyFromRecords(cell.records, CLUSTER_AXIS);
    const base = {
      ...opts,
      bank,
      estimator: 'exact-bayes' as const,
      learnerModel: DEFAULT_LEARNER_MODEL,
      posteriorSamples: 200,
    };
    const overlap = agreementCeiling(cell.records, {
      ...base,
      severityRule: 'top3-probability',
    });
    const top1 = agreementCeiling(cell.records, { ...base, severityRule: 'top1-probability' });
    expect(overlap.trueTwoOfThree).toBeGreaterThanOrEqual(engine.twoOfThree);
    expect(top1.trueTop1InTop3).toBeGreaterThanOrEqual(engine.top1InTop3 - 0.02);
    // Each is the better rule for its own bar, and worse for the other's.
    expect(overlap.trueTwoOfThree).toBeGreaterThan(top1.trueTwoOfThree);
    expect(top1.trueTop1InTop3).toBeGreaterThan(overlap.trueTop1InTop3);
  });

  it('measures the population structure it is handed', () => {
    const prior = measurePrior(cell.records);
    // The default model is global sd 0.7 and idiosyncratic 0.9, and the deficit
    // draw widens the within-learner spread further.
    expect(prior.withinLearnerSd).toBeGreaterThan(0.9);
    expect(prior.betweenLearnerSd).toBeGreaterThan(0.3);
    expect(prior.betweenLearnerSd).toBeLessThan(1.5);
  });

  it('spends the same budget however it allocates it', () => {
    const bank = buildSimBankFor(makeRng(4242), 'misspecified', CLUSTER_AXIS);
    const equal = agreementCeiling(cell.records, {
      ...opts,
      bank,
      allocation: 'equal',
      itemsPerBucket: 8,
    });
    const aimed = agreementCeiling(cell.records, {
      ...opts,
      bank,
      allocation: 'oracle-targeted',
      itemsPerBucket: 8,
    });
    expect(aimed.meanItems).toBeGreaterThan(equal.meanItems * 0.9);
    expect(aimed.meanItems).toBeLessThan(equal.meanItems * 1.1);
  });
});

describe('how generic the plan is', () => {
  const cell = runCohortDetailed({ learners: 120, mode: 'misspecified', seed: 909 });

  it('hands a coarser axis more free agreement', () => {
    expect(chanceTwoOfThree(10)).toBeGreaterThan(chanceTwoOfThree(14));
    expect(chanceTwoOfThree(14)).toBeCloseTo(34 / 364, 12);
    expect(chanceTwoOfThree(10)).toBeCloseTo(22 / 120, 12);
  });

  /**
   * The uniform chance rate is the wrong null for this engine, and by a long
   * way: unlock weights concentrate the Top 3 onto a few buckets, so two
   * *different* learners already agree far more often than 9.3%. Every
   * agreement figure has to be read against this, not against combinatorics.
   */
  it('agrees across learners far more than uniform chance would', () => {
    const g = genericity(cell.records, CLUSTER_AXIS);
    expect(g.crossLearnerAgreement).toBeGreaterThan(3 * chanceTwoOfThree(14));
    expect(g.reportedConcentration).toBeGreaterThan(1);
    // The remedy table's null and this one are the same quantity under
    // independent permutations, so they agree only to sampling error.
    expect(
      Math.abs(remedies(cell.records)[0]!.chance - g.crossLearnerAgreement),
    ).toBeLessThan(0.15);
  });

  it('reports a concentration the ground truth does not fully justify', () => {
    const g = genericity(cell.records, CLUSTER_AXIS);
    expect(g.reportedConcentration).toBeGreaterThan(g.trueConcentration);
  });
});

// --- The study ---------------------------------------------------------------

interface Cell {
  label: string;
  axis: DiagnosticAxis;
  budget: number;
  world: SweepAssumptions;
}

const studyCells = (): Cell[] => {
  const axes =
    STUDY === 'axes'
      ? Object.values(SWEEP_AXES)
      : STUDY === 'ranking'
        ? [FC_AXIS]
        : [CLUSTER_AXIS];
  const cells: Cell[] = [];
  for (const axis of axes) {
    for (const world of DEFAULT_ASSUMPTION_GRID) {
      cells.push({ label: `${axis.id} @ ${LEN}`, axis, budget: LEN, world });
    }
  }
  return cells;
};

function selectShard<T>(cells: T[]): { cells: T[]; label: string } {
  if (SHARD === undefined) return { cells, label: 'all cells' };
  const [kRaw, nRaw] = SHARD.split('/');
  const k = Number(kRaw);
  const n = Number(nRaw);
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 1 || k < 0 || k >= n) {
    throw new Error(`RETEST_SHARD must be "k/n" with 0 <= k < n; got "${SHARD}"`);
  }
  return { cells: cells.filter((_, i) => i % n === k), label: `shard ${k + 1} of ${n}` };
}

/** One cell's records plus the world that produced them. */
interface CellResult {
  label: string;
  axisId: string;
  budget: number;
  world: SweepAssumptions;
  observedTwoOfThree: number;
  trueTop1InTop3: number;
  medianItems: number;
  records: RetestRecord[];
}

const pct = (x: number): string =>
  Number.isNaN(x) ? '   n/a' : `${(x * 100).toFixed(1)}%`.padStart(6);

const worldLabel = (w: SweepAssumptions): string =>
  `rho ${w.correlation.toFixed(1)}  def ${w.deficit[0].toFixed(1)}  off ${w.offset >= 0 ? '+' : ''}${w.offset.toFixed(1)}  ${w.mode.padEnd(12)}`;

/**
 * One cell, run in chunks of learners.
 *
 * A 250-learner cell at 200 items is nearly two minutes of uninterrupted
 * synchronous work, which is long enough for Vitest's worker heartbeat to give
 * up and report a passing run as failed. Learners are seeded from their index
 * alone, so chunking is result-identical — see `CohortOptions.firstLearner`.
 */
async function runCell(cell: Cell, chunk = 25): Promise<CellResult> {
  const records: RetestRecord[] = [];
  for (let first = 0; first < N; first += chunk) {
    records.push(
      ...runCohortDetailed({
        learners: Math.min(chunk, N - first),
        firstLearner: first,
        mode: cell.world.mode,
        cfg: configFor(cell.budget),
        seed: 20260725,
        learnerModel: learnerModelFor(cell.world),
        axis: cell.axis,
      }).records,
    );
    await new Promise((r) => {
      setImmediate(r);
    });
  }
  const accuracy = accuracyFromRecords(records, cell.axis);
  return {
    label: cell.label,
    axisId: cell.axis.id,
    budget: cell.budget,
    world: cell.world,
    observedTwoOfThree: observedAgreement(records).twoOfThree,
    trueTop1InTop3: accuracy.top1InTop3,
    medianItems: accuracy.medianItems,
    records,
  };
}

/** Marginal mean of a metric at each level of one assumption. */
function marginals(
  cells: readonly CellResult[],
  name: string,
  level: (w: SweepAssumptions) => string,
  value: (c: CellResult) => number,
): string {
  const byLevel = new Map<string, number[]>();
  for (const c of cells) {
    const key = level(c.world);
    byLevel.set(key, [...(byLevel.get(key) ?? []), value(c)]);
  }
  const rows = [...byLevel.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return rows
    .map(([key, xs]) => {
      const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
      const worst = Math.min(...xs);
      return `    ${name} = ${key.padEnd(14)} mean ${pct(avg)}   worst ${pct(worst)}   (${xs.length} worlds)`;
    })
    .join('\n');
}

/**
 * Ceiling averaged over a set of worlds, each scored against its own bank and
 * its own learner model.
 *
 * Records are subsampled because the oracle integrates a posterior per sitting,
 * which is thousands of times the cost of the sitting itself. The sample is
 * every k-th learner, so it is spread across the cell rather than truncated.
 */
async function ceilingOver(
  group: readonly CellResult[],
  axis: DiagnosticAxis,
  severityRule: 'top3-probability' | 'top1-probability' | 'plug-in',
): Promise<Ceiling> {
  const per: Ceiling[] = [];
  for (const c of group) {
    const step = Math.max(1, Math.ceil(c.records.length / CEILING_LEARNERS));
    per.push(
      agreementCeiling(
        c.records.filter((_, i) => i % step === 0),
        {
          axis,
          replicates: CEILING_REPLICATES,
          bank: buildSimBankFor(makeRng(20260725), c.world.mode, axis),
          estimator: 'exact-bayes',
          learnerModel: learnerModelFor(c.world),
          posteriorSamples: 300,
          severityRule,
        },
      ),
    );
    // Minutes of unbroken synchronous work otherwise, which Vitest's worker
    // heartbeat reads as a hang and reports as a failure.
    await new Promise((r) => {
      setImmediate(r);
    });
  }
  const avg = (pick: (c: Ceiling) => number): number =>
    per.reduce((s, c) => s + pick(c), 0) / Math.max(1, per.length);
  return {
    ...per[0]!,
    twoOfThree: avg((c) => c.twoOfThree),
    exactTop3: avg((c) => c.exactTop3),
    exactTop2: avg((c) => c.exactTop2),
    sameTop1: avg((c) => c.sameTop1),
    trueTop1InTop3: avg((c) => c.trueTop1InTop3),
    trueTwoOfThree: avg((c) => c.trueTwoOfThree),
    meanThetaSd: avg((c) => c.meanThetaSd),
  };
}

async function reportFactors(cells: readonly CellResult[]): Promise<void> {
  const axis = SWEEP_AXES[(cells[0]?.axisId ?? 'cluster-15') as 'cluster-15'];
  const all = cells.flatMap((c) => c.records);

  console.log(`\n=== test-retest attribution: ${cells.length} worlds, ${all.length} learners ===`);
  // Top-3 2-of-3 no longer gates anything; this study is an attribution of it,
  // so it is reported against the bar it used to be scored on for continuity.
  console.log('Reported here: top-3 2-of-3, telemetry only. The gating criterion is');
  console.log(
    `testRetestReportedOneOf >= ${PLAN_BARS.testRetestReportedAt140} at 140 items — see reportRanking.\n`,
  );

  console.log('  every world, worst first');
  for (const c of [...cells].sort((a, b) => a.observedTwoOfThree - b.observedTwoOfThree)) {
    console.log(`    ${worldLabel(c.world)} ${pct(c.observedTwoOfThree)}  median ${c.medianItems}`);
  }

  console.log('\n  --- factor-by-factor attribution (marginal means over the grid) ---');
  console.log(marginals(cells, 'calibration', (w) => w.mode, (c) => c.observedTwoOfThree));
  console.log(marginals(cells, 'offset', (w) => w.offset.toFixed(1), (c) => c.observedTwoOfThree));
  console.log(
    marginals(cells, 'deficit', (w) => `[${w.deficit[0]},${w.deficit[1]}]`, (c) => c.observedTwoOfThree),
  );
  console.log(
    marginals(cells, 'correlation', (w) => w.correlation.toFixed(1), (c) => c.observedTwoOfThree),
  );

  const original = cells.filter(
    (c) => c.world.offset === 0 && c.world.deficit[0] === 1.5 && c.world.mode === 'misspecified',
  );
  if (original.length > 0) {
    const avg = original.reduce((s, c) => s + c.observedTwoOfThree, 0) / original.length;
    console.log(
      `\n    original easier worlds only (offset 0, deficit 1.5, misspecified): ` +
        `mean ${pct(avg)}  worst ${pct(Math.min(...original.map((c) => c.observedTwoOfThree)))}`,
    );
  }

  // --- is the metric measuring what we think? ------------------------------
  const worst = [...cells].sort((a, b) => a.observedTwoOfThree - b.observedTwoOfThree)[0]!;
  const pooled = observedAgreement(all);
  const gen = genericity(all, axis);
  console.log(
    `\n  --- what the metric is actually measuring ---` +
      `\n    the two sittings shared ${pct(pooled.formOverlap)} of their items` +
      `\n    same Top 1 on both sittings ${pct(pooled.sameTop1)};  identical Top 3 ${pct(pooled.exactTop3)}` +
      `\n\n    reported Top-3 appearance rate: ` +
      gen.reportedAppearance
        .slice(0, 6)
        .map(([b, s]) => `${b} ${(s * 100).toFixed(0)}%`)
        .join('  ') +
      `\n    TRUE     Top-3 appearance rate: ` +
      gen.trueAppearance
        .slice(0, 6)
        .map(([b, s]) => `${b} ${(s * 100).toFixed(0)}%`)
        .join('  ') +
      `\n    top three buckets hold ${gen.reportedConcentration.toFixed(2)} of the 3 reported slots` +
      ` (truth: ${gen.trueConcentration.toFixed(2)})` +
      `\n    2-of-3 agreement between DIFFERENT learners: ${pct(gen.crossLearnerAgreement)}` +
      ` (on ground truth, ${pct(gen.crossLearnerAgreementTrue)})` +
      `\n    -> of the ${pct(pooled.twoOfThree)} measured, ${pct(gen.crossLearnerAgreement)} is available without` +
      ` measuring the learner at all.`,
  );

  // --- the ceiling ---------------------------------------------------------
  console.log('\n  --- maximum achievable agreement ---');
  console.log('    Asked without qualification the question is ill-posed: an instrument that');
  console.log('    ignores the responses and always names the same three buckets scores 100%');
  console.log('    retest. The bound below therefore fixes accuracy and asks how reproducible');
  console.log('    an instrument can be while still being that accurate.');
  console.log('');
  console.log('    The oracle re-reads the engine own data: the same items, the same answers,');
  console.log('    both sittings. It then forms the exact posterior under the true two-level');
  console.log('    population model, knowing every item true difficulty and discrimination,');
  console.log('    the exact leverage weights, and the exact population the learner came from.');
  console.log('    The one thing it cannot escape is the learner own response noise, which is');
  console.log('    what limits reproducibility. Rows differ only in which functional of that');
  console.log('    posterior they rank by; each is the Bayes rule for the bar beside it.\n');

  for (const [name, group] of [
    ['pooled over all worlds', cells],
    [`worst world (${worldLabel(worst.world).trim()})`, [worst]],
  ] as const) {
    const subset = group.flatMap((c) => c.records);
    const obs = observedAgreement(subset);
    const acc = accuracyFromRecords(subset, axis);
    const prior = measurePrior(subset);
    // Every world has its own bank and its own learner model, so the oracle is
    // built per world and the results averaged. Scoring the pooled records
    // against any single world's parameters would hand the oracle the wrong item
    // difficulties for most of them and quietly understate the ceiling.
    const overlapRule = await ceilingOver(group, axis, 'top3-probability');
    const top1Rule = await ceilingOver(group, axis, 'top1-probability');
    const plugIn = await ceilingOver(group, axis, 'plug-in');

    console.log(
      `    ${name}` +
        `\n      between-learner sd ${prior.betweenLearnerSd.toFixed(2)}, within-learner sd ` +
        `${prior.withinLearnerSd.toFixed(2)}; theta sd the served items afford ` +
        `${overlapRule.meanThetaSd.toFixed(2)}` +
        `\n` +
        `\n      rule                                        retest   true#1   true 2-of-3` +
        `\n      engine as shipped                          ${pct(obs.twoOfThree)}   ${pct(acc.top1InTop3)}     ${pct(acc.twoOfThree)}` +
        `\n      oracle, ranked by severity (engine-like)   ${pct(plugIn.twoOfThree)}   ${pct(plugIn.trueTop1InTop3)}     ${pct(plugIn.trueTwoOfThree)}` +
        `\n      oracle, optimal for true 2-of-3            ${pct(overlapRule.twoOfThree)}   ${pct(overlapRule.trueTop1InTop3)}     ${pct(overlapRule.trueTwoOfThree)}` +
        `\n      oracle, optimal for true #1-in-top-3       ${pct(top1Rule.twoOfThree)}   ${pct(top1Rule.trueTop1InTop3)}     ${pct(top1Rule.trueTwoOfThree)}`,
    );
    const ceiling = Math.max(overlapRule.twoOfThree, top1Rule.twoOfThree);
    console.log(
      `\n      => CEILING on retest for an optimally accurate instrument: ${pct(ceiling)}.` +
        `\n         The engine measured ${pct(obs.twoOfThree)}, i.e. ` +
        `${((obs.twoOfThree / ceiling) * 100).toFixed(0)}% of it.` +
        (acc.top1InTop3 > top1Rule.trueTop1InTop3 + 0.02 ||
        acc.twoOfThree > overlapRule.trueTwoOfThree + 0.02
          ? '\n         [WARNING: engine beat its own oracle on accuracy — bound not valid here]'
          : '\n         The oracle matches or beats the engine on both accuracy bars, so it is' +
            '\n         a fair bound rather than a weakened comparison.'),
    );

    const points = frontier(subset, { axis, replicates: 40 });
    console.log('\n      For contrast, deliberately trading accuracy away for agreement:');
    console.log('      shrinkage   retest 2-of-3   true#1-in-top3   true 2-of-3');
    for (const p of points) {
      console.log(
        `      ${p.shrinkage.toFixed(2).padStart(8)}   ${pct(p.retestTwoOfThree)}          ${pct(p.trueTop1InTop3)}        ${pct(p.trueTwoOfThree)}`,
      );
    }
    const best = maxRetestAtAccuracy(points, PLAN_BARS.top1InTop3, PLAN_BARS.twoOfThree);
    console.log(
      best === null
        ? `      No point on this family meets the accuracy bars at this budget.\n`
        : `      Best retest on this family while clearing top1InTop3 >= ${PLAN_BARS.top1InTop3} and ` +
            `twoOfThree >= ${PLAN_BARS.twoOfThree}: ${pct(best.retestTwoOfThree)} (shrinkage ${best.shrinkage}).\n`,
    );
  }

  // --- the tie structure ---------------------------------------------------
  const ties = tieStructure(all, axis);
  console.log(
    `\n  --- true tie structure at the Top-3 cut ---` +
      `\n    3rd-vs-4th true leverage gap: p10 ${ties.p10CutGap.toFixed(3)}  median ${ties.medianCutGap.toFixed(3)}  p90 ${ties.p90CutGap.toFixed(3)}` +
      `\n    learners whose gap is below 0.02 / 0.05 / 0.10 / 0.20: ` +
      [0.02, 0.05, 0.1, 0.2].map((t) => pct(ties.cutGapBelow[t.toFixed(2)] ?? 0)).join(' /') +
      `\n    median gap, sittings agreed ${ties.medianCutGapAgreed.toFixed(3)}  disagreed ${ties.medianCutGapDisagreed.toFixed(3)}` +
      `\n    of the ${ties.disagreements} disagreements, share over buckets truly within 0.02 / 0.05 / 0.10 / 0.20: ` +
      [0.02, 0.05, 0.1, 0.2]
        .map((t) => pct(ties.disagreementsOverNearTies[t.toFixed(2)] ?? 0))
        .join(' /'),
  );

  // --- how much precision would the bar need? ------------------------------
  const bank = buildSimBankFor(makeRng(20260725), worst.world.mode, axis);
  console.log('\n  --- agreement against measurement precision (worst world) ---');
  console.log('    multiplier  mean theta sd   2-of-3');
  for (const p of precisionCurve(worst.records, { axis, replicates: 40 })) {
    console.log(
      `    ${p.precision.toFixed(2).padStart(9)}  ${p.thetaSd.toFixed(3).padStart(12)}  ${pct(p.twoOfThree)}`,
    );
  }
  const needed = itemsNeededFor(worst.records, { axis, replicates: 30, bank }, 0.8);
  console.log(
    needed === null
      ? '\n    Reaching 0.80 needs more than 64 items per bucket — over 900 items.'
      : `\n    Reaching 0.80 needs ${needed.itemsPerBucket} items per bucket = ~${needed.totalItems} items total (${pct(needed.achieved)}).`,
  );

  // --- allocation ----------------------------------------------------------
  console.log('\n  --- would aiming items at the cut help? (worst world, equal budget) ---');
  console.log('    The targeted allocator reads the TRUE leverage to decide where to spend,');
  console.log('    so it bounds what any adaptive rule could buy rather than proposing one.');
  for (const perBucket of [8, 14]) {
    const equal = agreementCeiling(worst.records, {
      axis,
      replicates: 40,
      bank,
      allocation: 'equal',
      itemsPerBucket: perBucket,
    });
    const line = [`    ${perBucket}/bucket (~${equal.meanItems.toFixed(0)} items): even ${pct(equal.twoOfThree)}`];
    for (const width of [0.1, 0.25, 0.5]) {
      const aimed = agreementCeiling(worst.records, {
        axis,
        replicates: 40,
        bank,
        allocation: 'oracle-targeted',
        itemsPerBucket: perBucket,
        targetingWidth: width,
      });
      line.push(`aimed(w=${width}) ${pct(aimed.twoOfThree)}`);
    }
    console.log(line.join('   '));
  }

  // --- remedies ------------------------------------------------------------
  for (const [name, subset] of [
    ['pooled over all worlds', all],
    ['worst world', worst.records],
  ] as const) {
    console.log(`\n  --- report shapes, ${name} ---`);
    console.log(
      '    shape                                        covers  agree   chance  above-chance  named',
    );
    for (const r of remedies(subset)) {
      console.log(
        `    ${r.label.padEnd(44)}${pct(r.coverage)} ${pct(r.agreement)}  ${pct(r.chance)}  ${pct(r.aboveChance)}       ${r.meanReported.toFixed(1)}`,
      );
    }
  }
}

async function reportAxes(cells: readonly CellResult[]): Promise<void> {
  console.log(`\n=== axis comparison at ${LEN} items, ${DEFAULT_ASSUMPTION_GRID.length} worlds each ===`);
  console.log(
    '\n  axis        buckets  chance   retest 2-of-3           above chance          true#1-in-top3',
  );
  console.log(
    '                                worst  median    best   worst  median          worst  median',
  );

  const byAxis = new Map<string, CellResult[]>();
  for (const c of cells) byAxis.set(c.axisId, [...(byAxis.get(c.axisId) ?? []), c]);

  for (const [axisId, list] of byAxis) {
    const axis = SWEEP_AXES[axisId as 'cluster-15'];
    const all = list.flatMap((c) => c.records);
    const k = Math.max(...all.map((r) => Object.keys(r.theta).length));
    const chance = chanceTwoOfThree(k);

    const rates = list.map((c) => c.observedTwoOfThree).sort((a, b) => a - b);
    const corrected = rates.map((r) => (r - chance) / (1 - chance));
    const mid = (xs: number[]): number => xs[Math.floor(xs.length / 2)]!;

    console.log(
      `  ${axisId.padEnd(11)}${String(k).padStart(6)}  ${pct(chance)}  ` +
        `${pct(rates[0]!)}  ${pct(mid(rates))}  ${pct(rates[rates.length - 1]!)}  ` +
        `${pct(corrected[0]!)}  ${pct(mid(corrected))}`,
    );

    const ties = tieStructure(all, axis);
    const gen = genericity(all, axis);
    // Ceiling per axis, so the comparison is "how much of what this axis could
    // deliver does it deliver", not just its raw rate. An axis with more buckets
    // has a lower ceiling for the same instrument quality, which is exactly the
    // bucket-count effect a raw comparison would miss.
    // Max over the two accuracy-optimal rules, matching the factors report: the
    // rule that best recovers the true Top 3 is not the one that repeats itself
    // most, and a ceiling should be the best either can do.
    const ceiling = Math.max(
      (await ceilingOver(list, axis, 'top3-probability')).twoOfThree,
      (await ceilingOver(list, axis, 'top1-probability')).twoOfThree,
    );
    const accuracy = list.map((c) => c.trueTop1InTop3).sort((a, b) => a - b);
    console.log(
      `               true#1-in-top3 worst ${pct(accuracy[0]!)} median ${pct(mid(accuracy))}` +
        `  |  cross-learner agreement ${pct(gen.crossLearnerAgreement)}` +
        `  |  reported concentration ${gen.reportedConcentration.toFixed(2)}/3 (truth ${gen.trueConcentration.toFixed(2)})` +
        `\n               median true 3rd-4th gap ${ties.medianCutGap.toFixed(3)}` +
        `  |  disagreements over sub-0.05 ties ${pct(ties.disagreementsOverNearTies['0.05'] ?? 0)}` +
        // Both sides averaged over the same worlds; a median-vs-mean comparison
        // here reads as though the engine beats its own ceiling.
        `  |  ceiling ${pct(ceiling)}, reached ${((list.reduce((s, c) => s + c.observedTwoOfThree, 0) / list.length / ceiling) * 100).toFixed(0)}%` +
        `  |  mean items ${(all.reduce((s, r) => s + r.itemsA, 0) / all.length).toFixed(0)}`,
    );
  }

  console.log(
    '\n  Raw agreement is not comparable across these rows: a 10-bucket axis is handed ' +
      `${(chanceTwoOfThree(10) * 100).toFixed(1)}% agreement for free where a 14-bucket axis gets ` +
      `${(chanceTwoOfThree(14) * 100).toFixed(1)}%. Read the above-chance columns.`,
  );
}

/**
 * How much of the reported plan is the learner, at each unlock strength.
 *
 * Every strength is scored on the *same* sittings: leverage is invertible, so a
 * recorded ranking can be re-cut at any strength without re-running anything.
 * Re-running per strength would also change which items were served, and no
 * table could then separate the ranking change from the selection change.
 */
function reportRanking(cells: readonly CellResult[]): void {
  const forAxis = cells.filter((c) => c.axisId === FC_AXIS.id);
  if (forAxis.length === 0) {
    console.log('\nNo fc-10 cells in this merge; the ranking study measures the production axis.');
    return;
  }
  const axis = FC_AXIS;
  const all = forAxis.flatMap((c) => c.records);
  const reported = REPORTED_PRIORITY_COUNT;

  console.log(
    `\n=== unlock-weight strength on ${axis.id} at ${forAxis[0]!.budget} items ===` +
      `\n${forAxis.length} worlds x ${forAxis[0]!.records.length} learners = ${all.length} learners pooled` +
      `\nReport names ${reported} priorities.`,
  );
  console.log(
    '\n  unlock weights: ' +
      axis.buckets.map((b) => `${b.id} ${b.unlockWeight.toFixed(2)}`).join('  '),
  );
  const spread = axis.buckets.map((b) => 1 + b.unlockWeight);
  console.log(
    `  so the multiplier spans ${Math.min(...spread).toFixed(2)}-${Math.max(...spread).toFixed(2)}: ` +
      `full strength can only reorder buckets whose gaps differ by under ` +
      `${((Math.max(...spread) / Math.min(...spread) - 1) * 100).toFixed(0)}%.`,
  );

  const alloc = allocationShape(all);
  console.log(
    `\n  --- how the items were actually spread ---` +
      `\n    ${alloc.meanItems.toFixed(0)} items over ${alloc.buckets} buckets ` +
      `(even would be ${(alloc.meanItems / alloc.buckets).toFixed(1)} each)` +
      `\n    least-sampled bucket ${alloc.meanMin.toFixed(1)}, most-sampled ${alloc.meanMax.toFixed(1)}, ` +
      `mean absolute imbalance ${(alloc.imbalance * 100).toFixed(1)}% of an even share` +
      `\n    ` +
      alloc.perBucket.map(([b, c]) => `${b} ${c.toFixed(1)}`).join('  '),
  );

  const pooled = new Map<number, RankingStrengthMetrics>();
  const perWorld = new Map<number, RankingStrengthMetrics[]>();
  for (const strength of UNLOCK_STRENGTHS) {
    pooled.set(strength, rankingStrengthAt(all, axis, strength, reported));
    perWorld.set(
      strength,
      forAxis.map((c) => rankingStrengthAt(c.records, axis, strength, reported)),
    );
  }
  const worst = (strength: number, pick: (m: RankingStrengthMetrics) => number): number =>
    Math.min(...perWorld.get(strength)!.map(pick));

  console.log(
    `\n  --- genericity: what the report scores without measuring the learner ---` +
      `\n  strength   cross-learner top3   cross-learner ${reported}-slot   top3 concentration   ${reported}-slot concentration`,
  );
  for (const s of UNLOCK_STRENGTHS) {
    const m = pooled.get(s)!;
    console.log(
      `  ${s.toFixed(2).padStart(8)}   ${pct(m.crossLearnerTop3)} (truth ${pct(m.crossLearnerTop3True)})` +
        `   ${pct(m.crossLearnerReported)} (truth ${pct(m.crossLearnerReportedTrue)})` +
        `        ${m.top3Concentration.toFixed(2)}/3 (truth ${m.trueTop3Concentration.toFixed(2)})` +
        `      ${m.reportedConcentration.toFixed(2)}/${reported} (truth ${m.trueReportedConcentration.toFixed(2)})`,
    );
  }

  console.log(
    `\n  --- accuracy and reproducibility (pooled, and worst world of ${forAxis.length}) ---` +
      `\n  strength   true#1 in top3      true 2-of-3         weakest#1 in top3   ` +
      `retest top3 2-of-3   retest top${reported} 1-of-${reported}`,
  );
  for (const s of UNLOCK_STRENGTHS) {
    const m = pooled.get(s)!;
    const cell = (value: number, floor: number): string =>
      `${pct(value)}/${pct(floor).trim().padStart(6)}`;
    console.log(
      `  ${s.toFixed(2).padStart(8)}   ` +
        [
          cell(m.trueTop1InTop3, worst(s, (x) => x.trueTop1InTop3)),
          cell(m.trueTwoOfThree, worst(s, (x) => x.trueTwoOfThree)),
          cell(m.weakTop1InTop3, worst(s, (x) => x.weakTop1InTop3)),
          cell(m.retestTop3TwoOf3, worst(s, (x) => x.retestTop3TwoOf3)),
          cell(m.retestReportedOneOf, worst(s, (x) => x.retestReportedOneOf)),
        ].join('  '),
    );
  }
  console.log('    (pooled / worst world; "weakest#1" scores against pure weakness, no unlock term)');

  console.log(
    `\n  --- the ${reported} reported slots, per strength ---` +
      `\n  strength   true#1 named   1-of-${reported} truly top-${reported}   weakest named   ` +
      `1 truly weakest-${reported}   retest exact   least/most reported bucket`,
  );
  for (const s of UNLOCK_STRENGTHS) {
    const m = pooled.get(s)!;
    console.log(
      `  ${s.toFixed(2).padStart(8)}   ${pct(m.trueTop1InReported)}        ${pct(m.reportedOneOfTrue)}` +
        `              ${pct(m.weakTop1InReported)} (${pct(worst(s, (x) => x.weakTop1InReported)).trim()})` +
        `   ${pct(m.weakOneOfReported)}` +
        `             ${pct(m.retestReportedExact)}      ${pct(m.minReportedShare)} / ${pct(m.maxReportedShare)}`,
    );
  }

  console.log('\n  --- per-bucket slot occupancy: reported against truth ---');
  for (const s of UNLOCK_STRENGTHS) {
    const m = pooled.get(s)!;
    const trueBy = new Map(m.trueShare);
    console.log(
      `    strength ${s.toFixed(2)}: ` +
        axisIds(axis)
          .map((b) => {
            const r = m.reportedShare.find(([id]) => id === b)?.[1] ?? 0;
            return `${b} ${(r * 100).toFixed(0)}/${((trueBy.get(b) ?? 0) * 100).toFixed(0)}`;
          })
          .join('  '),
    );
  }
  console.log('    (reported% / true% of the reported slots; a bucket at 0/0 is unreachable)');

  console.log(
    `\n  --- top-${reported} 1-of-${reported} retest by world, worst first ` +
      `(the bar is set just under the worst) ---`,
  );
  const byWorld = forAxis
    .map((c, i) => ({ c, m: perWorld.get(UNLOCK_STRENGTH)![i]! }))
    .sort((x, y) => x.m.retestReportedOneOf - y.m.retestReportedOneOf);
  for (const { c, m } of byWorld) {
    console.log(
      `    ${worldLabel(c.world)} top${reported} 1-of-${reported} ${pct(m.retestReportedOneOf)}` +
        `   top3 2-of-3 ${pct(m.retestTop3TwoOf3)}   exact top${reported} ${pct(m.retestReportedExact)}` +
        `   median ${c.medianItems}`,
    );
  }
}

/**
 * Adaptive against multistage delivery, on the two questions the sweep cannot
 * answer because it only ever runs the adaptive arm.
 *
 * MST assembles its form before the sitting starts and re-derives it from the
 * route alone, so two sittings by the same learner see nearly the same items
 * whenever they route the same way. That makes its test-retest figure a
 * measure of response noise on a fixed form, which is a materially easier
 * question than a genuine re-sit on a freshly assembled one.
 */
function reportMst(): void {
  // The production pairing: the reporting axis the app ships and the design it
  // resolves by label. The adaptive arm beside it is the one the sweep scores,
  // so this is the only place the shipped instrument's own figures come from.
  const axis = FC_AXIS;
  const design = MST_DESIGNS[2]!;
  const cfg = configFor(140);
  const seed = 20260725;

  console.log(`\n=== delivery arms at ~140 items, ${N} learners per world ===`);
  console.log(
    `\n  retest is 1-of-${REPORTED_PRIORITY_COUNT} on the reported plan; cross-learner is the same on a different learner's.`,
  );
  console.log(
    '\n  world                                     arm       retest  form-overlap  true#1  cross-learner',
  );

  const worst: Record<string, { retest: number; top1: number }> = {
    adaptive: { retest: 1, top1: 1 },
    mst: { retest: 1, top1: 1 },
  };

  for (const world of DEFAULT_ASSUMPTION_GRID) {
    const model = learnerModelFor(world);
    const bank = buildSimBankFor(makeRng(seed), world.mode, axis);
    const coverable = new Set(bank.map((i) => i.bucketId));

    const arms: Record<string, { retest: number; overlap: number; top1: number; tops: string[][] }> =
      {
        adaptive: { retest: 0, overlap: 0, top1: 0, tops: [] },
        mst: { retest: 0, overlap: 0, top1: 0, tops: [] },
      };

    for (let i = 0; i < N; i += 1) {
      const learner = makeLearnerOn(axisIds(axis), `sim-${i}`, makeRng(seed + i * 7919), model);
      const trueTop1 = trueLeverages(learner, axis, coverable)[0]!.bucket;
      const rngA = () => makeRng(seed + i * 104729);
      const rngB = () => makeRng(seed + i * 104729 + 1);

      const pairs = {
        adaptive: [
          simulateSitting(learner, bank, rngA(), cfg, {}, axis),
          simulateSitting(learner, bank, rngB(), cfg, {}, axis),
        ],
        mst: [
          simulateMstSitting(learner, bank, design, axis, rngA(), cfg),
          simulateMstSitting(learner, bank, design, axis, rngB(), cfg),
        ],
      };

      for (const [name, [a, b]] of Object.entries(pairs)) {
        const arm = arms[name]!;
        // The arms are compared on the criterion the report is made on — at
        // least one named priority recurring — with the top three kept only for
        // the accuracy column, which every earlier figure was stated on.
        const reportedA = a!.reported as readonly string[];
        const reportedB = b!.reported as readonly string[];
        const top3A = a!.ranked.slice(0, 3).map((r) => r.bucket);
        if (reportedA.some((c) => reportedB.includes(c))) arm.retest += 1;
        if (top3A.includes(trueTop1)) arm.top1 += 1;
        const seen = new Set(b!.servedItemIds);
        arm.overlap +=
          a!.servedItemIds.filter((id) => seen.has(id)).length / Math.max(1, a!.servedItemIds.length);
        arm.tops.push([...reportedA]);
      }
    }

    for (const [name, arm] of Object.entries(arms)) {
      // Same permutation null as everywhere else: a different learner's plan.
      let cross = 0;
      for (let i = 0; i < arm.tops.length; i += 1) {
        const j = (i + 7) % arm.tops.length;
        if (arm.tops[i]!.some((c) => arm.tops[j]!.includes(c))) cross += 1;
      }
      worst[name]!.retest = Math.min(worst[name]!.retest, arm.retest / N);
      worst[name]!.top1 = Math.min(worst[name]!.top1, arm.top1 / N);
      console.log(
        `  ${worldLabel(world)}  ${name.padEnd(9)} ${pct(arm.retest / N)}  ${pct(arm.overlap / N)}       ` +
          `${pct(arm.top1 / N)}  ${pct(cross / N)}`,
      );
    }
  }

  console.log(`\n  worst world of ${DEFAULT_ASSUMPTION_GRID.length}, which is what the bar is set on:`);
  for (const [name, w] of Object.entries(worst)) {
    console.log(`    ${name.padEnd(9)} retest ${pct(w.retest)}  true#1 ${pct(w.top1)}`);
  }
}

describe.skipIf(STUDY === undefined)('test-retest study', () => {
  it.skipIf(STUDY !== 'mst')('compares the delivery arms', { timeout: 60 * 60_000 }, () => {
    reportMst();
    expect(N).toBeGreaterThan(0);
  });

  // The analysis over the merged records is itself minutes of Monte Carlo.
  it.skipIf(MERGE === undefined || STUDY === 'mst')(
    'merges sharded results',
    { timeout: 60 * 60_000 },
    async () => {
      const dir = MERGE!;
      const cells = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as CellResult[]);
      console.log(`\nMerged ${cells.length} cells from ${dir}`);
      if (STUDY === 'ranking') reportRanking(cells);
      else if (cells.some((c) => c.axisId !== cells[0]!.axisId)) await reportAxes(cells);
      else await reportFactors(cells);
      expect(cells.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(MERGE !== undefined || STUDY === 'mst')(
    'measures the retest ceiling across the assumption grid',
    { timeout: 60 * 60_000 },
    async () => {
      const { cells, label } = selectShard(studyCells());
      console.log(
        `\nStudy "${STUDY}": ${label}, ${cells.length} cells x ${N} learners ` +
          `= ${(cells.length * N * 2).toLocaleString()} simulated sittings.`,
      );
      const started = Date.now();
      const results: CellResult[] = [];
      for (const cell of cells) results.push(await runCell(cell));

      if (OUT !== undefined) {
        const file = join(OUT, `${(SHARD ?? 'all').replace('/', '-of-')}.json`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(results));
        console.log(`Wrote ${results.length} cells to ${file}`);
      } else if (STUDY === 'ranking') {
        reportRanking(results);
      } else if (STUDY === 'axes') {
        await reportAxes(results);
      } else {
        await reportFactors(results);
      }
      console.log(`\nFinished in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
      expect(results).toHaveLength(cells.length);
    },
  );
});

/**
 * A pin against harness drift. The 140-item, rho 0.3, deficit 0.6, offset +0.5,
 * misspecified cell at 60 learners.
 *
 * Re-baselined from 93.3% / 90.0% / 76.7% / 140 once the report went from three
 * named priorities to two. That is not a harness change but an instrument one:
 * the early stop asks whether the *reported* plan has settled, and a two-name
 * plan settles sooner, so the fastest quarter of learners now finish at 117
 * items rather than the cap. They pay for it in top-three accuracy, which is
 * where the five points went — the median learner still runs to 140 and the
 * reported plan still recurs on 93.3% of re-sits. Both accuracy bars are still
 * cleared; if the figures move again without the reported count moving, the
 * cause is drift and not this.
 *
 * Opt-in because it costs ~15s.
 */
describe.skipIf(process.env.RETEST_PIN !== '1')('sweep cell pin', () => {
  it('reproduces a known sweep cell exactly', { timeout: 300_000 }, () => {
    const world: SweepAssumptions = {
      correlation: 0.3,
      deficit: [0.6, 0.6],
      offset: 0.5,
      mode: 'misspecified' as CalibrationMode,
    };
    const { metrics } = runCohortDetailed({
      learners: 60,
      mode: world.mode,
      cfg: configFor(140),
      seed: 20260725,
      learnerModel: learnerModelFor(world),
    });
    expect(metrics.top1InTop3).toBeCloseTo(0.8833, 3);
    expect(metrics.twoOfThree).toBeCloseTo(0.85, 3);
    expect(metrics.testRetestTwoOf3).toBeCloseTo(0.75, 3);
    expect(metrics.testRetestReportedOneOf).toBeCloseTo(0.9333, 3);
    expect(metrics.medianItems).toBe(140);
    expect(metrics.p25Items).toBe(117);
  });
});
