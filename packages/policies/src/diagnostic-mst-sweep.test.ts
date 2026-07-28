import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FC_AXIS, axisIds } from './diagnostic-axis';
import { BAYES_DIAGNOSTIC_CONFIG, type BayesDiagnosticConfig } from './diagnostic-bayes';
import {
  MST_140_RECOMMENDED,
  MST_DESIGNS,
  defaultRoutingQuantiles,
  planMstForm,
  simulateMstSitting,
  type MstDesign,
} from './diagnostic-mst';
import {
  REVIEW_BLOCK_FLOOR,
  adaptationPoints,
  evenSplitConfig,
  minBlockSize,
  runAdaptiveCohortDetailed,
  runMstCohortDetailed,
  uniformMstDesign,
} from './diagnostic-mst-sweep';
import {
  DEFAULT_ASSUMPTION_GRID,
  buildSimBankFor,
  evaluateBars,
  learnerModelFor,
  makeLearnerOn,
  makeRng,
  type CohortMetrics,
  type SweepAssumptions,
} from './diagnostic-simulation';

/**
 * Where MST's deficit against item-level adaptive selection comes from, and
 * whether routing granularity recovers it.
 *
 * Opt-in; the full grid is tens of minutes.
 *
 *   MST_SWEEP=attribution scripts/run-mst-sweep.sh
 *   MST_SWEEP=granularity scripts/run-mst-sweep.sh
 *   MST_SWEEP=quantiles   scripts/run-mst-sweep.sh
 *   MST_SWEEP=final       scripts/run-mst-sweep.sh
 *   MST_SWEEP=bars MST_WORLDS=hard MST_N=1500 SHARDS=6 scripts/run-mst-sweep.sh
 *
 * Every arm runs the same learners under the same seeds and is scored by
 * `summariseCohort`, so a difference between two rows is a difference in item
 * delivery and nothing else.
 */

const STUDY = process.env.MST_SWEEP;
const N = Number(process.env.MST_N ?? 250);
const SHARD = process.env.MST_SHARD;
const TOTAL = Number(process.env.MST_LEN ?? 140);

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const fromRepoRoot = (p: string | undefined): string | undefined =>
  p === undefined ? undefined : isAbsolute(p) ? p : resolve(REPO_ROOT, p);
const OUT = fromRepoRoot(process.env.MST_OUT);
const MERGE = fromRepoRoot(process.env.MST_MERGE);

const AXIS = FC_AXIS;
const BUCKETS = axisIds(AXIS).length;

/** Matches the adaptive sweep's 140-item design, so the arms are comparable. */
const ADAPTIVE_CFG: BayesDiagnosticConfig = {
  ...BAYES_DIAGNOSTIC_CONFIG,
  minItems: Math.round(TOTAL / 2),
  maxItems: TOTAL,
  minItemsPerCluster: 6,
};

/** One row of the table: a delivery arm the sweep can run against a world. */
interface Arm {
  label: string;
  /** Null for the adaptive arms, which have no block structure. */
  design: MstDesign | null;
  cfg: BayesDiagnosticConfig;
  note: string;
}

const mstArm = (label: string, design: MstDesign, note = ''): Arm => ({
  label,
  design,
  cfg: ADAPTIVE_CFG,
  note,
});

/**
 * The attribution ladder.
 *
 * Each rung removes exactly one thing the adaptive arm has and MST does not, so
 * the gap between two adjacent rows is that one thing's worth. Read downward:
 * whichever step is large is where the six points went.
 */
const attributionArms = (): Arm[] => [
  {
    label: 'adaptive (shipped selector)',
    design: null,
    cfg: ADAPTIVE_CFG,
    note: 'contention-weighted allocation, re-decided every item',
  },
  {
    label: 'adaptive, even split',
    design: null,
    cfg: evenSplitConfig(TOTAL, BUCKETS),
    note: 'per-item difficulty choice kept, allocation adaptivity removed',
  },
  mstArm(
    'MST 1 stage (linear form)',
    uniformMstDesign(TOTAL, 1, BUCKETS, { modulesPerStage: 1 }),
    'even split, no routing at all — the floor staged delivery builds on',
  ),
  mstArm('MST 2 x 70', uniformMstDesign(TOTAL, 2, BUCKETS), 'one routing decision'),
  mstArm(
    'MST 50 + 3 x 30 (shipped)',
    { ...MST_DESIGNS[2]!, minItemsPerBucket: Math.floor(TOTAL / BUCKETS) },
    'three routing decisions',
  ),
  mstArm('MST 7 x 20', uniformMstDesign(TOTAL, 7, BUCKETS), 'six routing decisions'),
  mstArm(
    'MST 14 x 10',
    uniformMstDesign(TOTAL, 14, BUCKETS),
    'thirteen routing decisions, below the review floor',
  ),
  mstArm(
    'MST 7 x 20, contention slots',
    uniformMstDesign(TOTAL, 7, BUCKETS, { allocation: 'contention' }),
    'the one arm that adapts allocation as well as difficulty',
  ),
];

/** Stage counts at fixed total length. Block size is `TOTAL / stages`. */
const granularityArms = (): Arm[] =>
  [1, 2, 3, 4, 5, 7, 10, 14, 20].flatMap((stages) => {
    const modulesPerStage = stages === 1 ? 1 : 3;
    const block = Math.floor(TOTAL / stages);
    const rows = [
      mstArm(
        `MST ${stages} x ${block}`,
        uniformMstDesign(TOTAL, stages, BUCKETS, { modulesPerStage }),
      ),
    ];
    if (stages > 1) {
      rows.push(
        mstArm(
          `MST ${stages} x ${block} contention`,
          uniformMstDesign(TOTAL, stages, BUCKETS, { modulesPerStage, allocation: 'contention' }),
        ),
      );
    }
    return rows;
  });

/**
 * Routing cuts, at the granularity the attribution points at.
 *
 * Equal-mass bands under the engine's N(0,1) prior are not equal-mass against
 * the harness's cohort, which measures around −0.38 with sd 0.75 — so the
 * default [1/3, 2/3] fills the modules roughly 47/39/14 rather than in thirds.
 * The lower sets ask what re-centring on the realised cohort is worth; the
 * upper set is the control in the other direction.
 */
const QUANTILE_SETS: readonly (readonly number[])[] = [
  [1 / 3, 2 / 3],
  [0.24, 0.48],
  [0.2, 0.5],
  [0.15, 0.4],
  [0.45, 0.75],
];

const quantileArms = (): Arm[] => {
  const out: Arm[] = [];
  for (const stages of [4, 7]) {
    for (const q of QUANTILE_SETS) {
      const design = uniformMstDesign(TOTAL, stages, BUCKETS, { routingQuantiles: q });
      out.push(
        mstArm(
          `MST ${stages}x${minBlockSize(design)} q=[${q.map((x) => x.toFixed(2)).join(',')}]`,
          design,
        ),
      );
    }
    // Two modules is a coarser ladder but a more reliable route into each one,
    // which is the trade the quantile sweep cannot express on its own.
    for (const q of [[0.5], [0.35]] as const) {
      const design = uniformMstDesign(TOTAL, stages, BUCKETS, {
        modulesPerStage: 2,
        routingQuantiles: q,
      });
      out.push(
        mstArm(`MST ${stages}x${minBlockSize(design)} 2-way q=[${q[0]!.toFixed(2)}]`, design),
      );
    }
    // Four modules asks whether the ladder itself is the limit, at the cost of
    // routing on a finer number-correct distinction than the block can support.
    const four = uniformMstDesign(TOTAL, stages, BUCKETS, { modulesPerStage: 4 });
    out.push(mstArm(`MST ${stages}x${minBlockSize(four)} 4-way`, four));
  }
  return out;
};

/**
 * Cuts aimed where the sweep says they belong, rather than where the prior
 * says they do.
 *
 * The equal-mass default routes on the engine's N(0,1) prior. Re-centring on
 * the realised cohort — around −0.38 — makes module occupancy far more even and
 * makes accuracy *worse*, in every world; pushing the cuts the other way makes
 * occupancy more lopsided and accuracy better. Even occupancy is therefore not
 * the objective: the bank's DOK ladder sits above this cohort, so a learner
 * routed upward is served items above their ability and the block buys less.
 */
const RAISED_QUANTILES: readonly number[] = [0.45, 0.75];
const RAISED_QUANTILES_4: readonly number[] = [0.4, 0.6, 0.8];

/** The levers the earlier studies isolated, separately and in combination. */
const finalArms = (): Arm[] => [
  {
    label: 'adaptive (shipped selector)',
    design: null,
    cfg: ADAPTIVE_CFG,
    note: 'the arm every current bar was set on',
  },
  mstArm(
    'MST 50 + 3 x 30 (shipped)',
    { ...MST_DESIGNS[2]!, minItemsPerBucket: Math.floor(TOTAL / BUCKETS) },
    'the arm every learner actually meets',
  ),
  mstArm('MST 7 x 20', uniformMstDesign(TOTAL, 7, BUCKETS), 'granularity alone'),
  mstArm(
    'MST 7 x 20 raised cuts',
    uniformMstDesign(TOTAL, 7, BUCKETS, { routingQuantiles: RAISED_QUANTILES }),
    'granularity + cuts',
  ),
  mstArm(
    'MST 7 x 20 4-way raised',
    uniformMstDesign(TOTAL, 7, BUCKETS, {
      modulesPerStage: 4,
      routingQuantiles: RAISED_QUANTILES_4,
    }),
    'granularity + cuts + a finer ladder',
  ),
  mstArm(
    'MST 7 x 20 contention',
    uniformMstDesign(TOTAL, 7, BUCKETS, { allocation: 'contention' }),
    'granularity + allocation',
  ),
  mstArm(
    'MST 7 x 20 contention raised',
    uniformMstDesign(TOTAL, 7, BUCKETS, {
      routingQuantiles: RAISED_QUANTILES,
      allocation: 'contention',
    }),
    'every lever at once',
  ),
  mstArm(
    'MST 5 x 28 contention raised',
    uniformMstDesign(TOTAL, 5, BUCKETS, {
      routingQuantiles: RAISED_QUANTILES,
      allocation: 'contention',
    }),
    'every lever, a longer review window',
  ),
  mstArm(
    'MST 4 x 35 contention raised',
    uniformMstDesign(TOTAL, 4, BUCKETS, {
      routingQuantiles: RAISED_QUANTILES,
      allocation: 'contention',
    }),
    'every lever, the shipped review window',
  ),
];

/** The two arms the bars are set on, and nothing else, so this can be run deep. */
const barsArms = (): Arm[] => [
  {
    label: 'adaptive (telemetry)',
    design: null,
    cfg: ADAPTIVE_CFG,
    note: 'PLAN_BARS.testRetestReportedAt140',
  },
  mstArm(
    `${MST_140_RECOMMENDED.label} (served)`,
    MST_140_RECOMMENDED,
    'PLAN_BARS.testRetestReportedMstAt140',
  ),
  mstArm(
    'MST 50 + 3 x 30 (superseded)',
    { ...MST_DESIGNS[2]!, minItemsPerBucket: Math.floor(TOTAL / BUCKETS) },
    'what the bar was set on before adoption',
  ),
];

const armsFor = (study: string): Arm[] =>
  study === 'granularity'
    ? granularityArms()
    : study === 'quantiles'
      ? quantileArms()
      : study === 'final'
        ? finalArms()
        : study === 'bars'
          ? barsArms()
          : attributionArms();

/**
 * The corner every arm fails in: correlated abilities, a shallow deficit, and
 * an item bank calibrated on a different population than it is served to.
 *
 * Reported separately because a worst-of-24 figure at 250 learners carries a
 * 2.4-point standard error and a downward selection bias on top of it, which is
 * the same order as every difference the design sweep is trying to resolve.
 * Running these few cells deep is the only way the bar rests on a measurement.
 */
const HARD_WORLDS: readonly SweepAssumptions[] = DEFAULT_ASSUMPTION_GRID.filter(
  (w) => w.deficit[0] === 0.6 && w.mode === 'misspecified' && w.correlation === 0.7,
);

const gridFor = (): readonly SweepAssumptions[] =>
  process.env.MST_WORLDS === 'hard' ? HARD_WORLDS : DEFAULT_ASSUMPTION_GRID;

// --- Running ----------------------------------------------------------------

interface Point {
  arm: string;
  note: string;
  world: SweepAssumptions;
  /** Null for the adaptive arms, which have no block structure. JSON has no NaN. */
  minBlock: number | null;
  routingDecisions: number | null;
  metrics: CohortMetrics;
  /** Share of learners in each module, per routed stage. Empty for adaptive arms. */
  moduleOccupancy: number[][];
}

/**
 * Where the routing rule actually put people.
 *
 * A design can lose accuracy either because it has too few decisions or because
 * the decisions it does make send nearly everyone to the same module, and the
 * accuracy figures cannot tell those apart. This can.
 */
function occupancyOf(
  design: MstDesign,
  world: SweepAssumptions,
  learners: number,
  seed: number,
): number[][] {
  const bank = buildSimBankFor(makeRng(seed), world.mode, AXIS);
  const model = learnerModelFor(world);
  const stages = planMstForm(design, bank, AXIS).slotsByStage.length;
  const counts = Array.from({ length: Math.max(0, stages - 1) }, () =>
    Array.from({ length: design.modulesPerStage }, () => 0),
  );
  for (let i = 0; i < learners; i += 1) {
    const learner = makeLearnerOn(axisIds(AXIS), `sim-${i}`, makeRng(seed + i * 7919), model);
    const run = simulateMstSitting(
      learner,
      bank,
      design,
      AXIS,
      makeRng(seed + i * 104729),
      ADAPTIVE_CFG,
    );
    run.routePath.slice(1).forEach((module, stage) => {
      const row = counts[stage];
      if (row !== undefined && row[module] !== undefined) row[module] += 1;
    });
  }
  return counts.map((row) => row.map((c) => c / Math.max(1, learners)));
}

function runPoint(arm: Arm, world: SweepAssumptions, learners: number, seed = 20260725): Point {
  const shared = {
    learners,
    mode: world.mode,
    seed,
    learnerModel: learnerModelFor(world),
    axis: AXIS,
  };
  const cell =
    arm.design === null
      ? runAdaptiveCohortDetailed({ ...shared, cfg: arm.cfg })
      : runMstCohortDetailed({ ...shared, design: arm.design, cfg: arm.cfg });
  return {
    arm: arm.label,
    note: arm.note,
    world,
    minBlock: arm.design === null ? null : minBlockSize(arm.design),
    routingDecisions: arm.design === null ? null : adaptationPoints(arm.design),
    metrics: cell.metrics,
    moduleOccupancy:
      arm.design === null || arm.design.modulesPerStage < 2
        ? []
        : occupancyOf(arm.design, world, Math.min(learners, 100), seed),
  };
}

// --- Reporting --------------------------------------------------------------

const pct = (x: number): string =>
  Number.isNaN(x) ? '   n/a' : `${(x * 100).toFixed(1)}%`.padStart(6);

interface Summary {
  arm: string;
  note: string;
  worlds: number;
  minBlock: number | null;
  routingDecisions: number | null;
  retestWorst: number;
  retestPooled: number;
  top1Worst: number;
  top1Pooled: number;
  twoOf3Worst: number;
  twoOf3Pooled: number;
  occupancy: number[];
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

function summarise(points: readonly Point[]): Summary[] {
  const byArm = new Map<string, Point[]>();
  for (const p of points) byArm.set(p.arm, [...(byArm.get(p.arm) ?? []), p]);
  return [...byArm].map(([arm, ps]) => {
    // Averaged over routed stages: a design with more stages would otherwise be
    // summarised by a longer row than one with fewer.
    const flat = ps.flatMap((p) => p.moduleOccupancy);
    const modules = Math.max(0, ...flat.map((row) => row.length));
    return {
      arm,
      note: ps[0]!.note,
      worlds: ps.length,
      minBlock: ps[0]!.minBlock,
      routingDecisions: ps[0]!.routingDecisions,
      retestWorst: Math.min(...ps.map((p) => p.metrics.testRetestReportedOneOf)),
      retestPooled: mean(ps.map((p) => p.metrics.testRetestReportedOneOf)),
      top1Worst: Math.min(...ps.map((p) => p.metrics.top1InTop3)),
      top1Pooled: mean(ps.map((p) => p.metrics.top1InTop3)),
      twoOf3Worst: Math.min(...ps.map((p) => p.metrics.twoOfThree)),
      twoOf3Pooled: mean(ps.map((p) => p.metrics.twoOfThree)),
      occupancy: Array.from({ length: modules }, (_, m) => mean(flat.map((row) => row[m] ?? 0))),
    };
  });
}

const worldLabel = (w: SweepAssumptions): string =>
  `rho ${w.correlation.toFixed(1)} def ${w.deficit[0].toFixed(1)} off ${w.offset >= 0 ? '+' : ''}` +
  `${w.offset.toFixed(1)} ${w.mode.slice(0, 6)}`;

/**
 * The gating metric world by world.
 *
 * The worst-world column is a minimum over 24 cells, so it is both biased low
 * and noisier than any cell in it — at 250 learners a cell's standard error is
 * about 2.4 points at p = 0.82. Two arms whose worst-world figures differ by
 * less than that have not been separated, and only the full matrix shows
 * whether they at least fail in the same places.
 */
function reportWorlds(points: readonly Point[]): void {
  const arms = [...new Set(points.map((p) => p.arm))];
  const byWorld = new Map<string, Map<string, number>>();
  for (const p of points) {
    const key = worldLabel(p.world);
    const row = byWorld.get(key) ?? new Map<string, number>();
    row.set(p.arm, p.metrics.testRetestReportedOneOf);
    byWorld.set(key, row);
  }
  const short = (arm: string): string => arm.replace(/^(MST|adaptive)[, ]*/, '').slice(0, 11);
  console.log('\n  retest 1-of-2 by world (worst first, by the first arm)');
  console.log(`    ${'world'.padEnd(32)}${arms.map((a) => short(a).padStart(12)).join('')}`);
  const rows = [...byWorld].sort(
    (a, b) => (a[1].get(arms[0]!) ?? 1) - (b[1].get(arms[0]!) ?? 1),
  );
  for (const [world, row] of rows) {
    console.log(
      `    ${world.padEnd(32)}` + arms.map((a) => pct(row.get(a) ?? Number.NaN).padStart(12)).join(''),
    );
  }
}

function report(points: readonly Point[]): void {
  const rows = summarise(points);
  console.log(
    `\n=== ${STUDY ?? 'attribution'} at ${TOTAL} items on ${AXIS.id}, ` +
      `${rows[0]?.worlds ?? 0} worlds x ${N} learners ===`,
  );
  console.log(
    '\n  arm                                    block  routes   retest 1-of-2      true #1' +
      '           true 2-of-3',
  );
  console.log(
    '                                                        worst  pooled    worst  pooled' +
      '    worst  pooled',
  );
  for (const r of rows) {
    console.log(
      `  ${r.arm.padEnd(38)}` +
        `${r.minBlock === null ? '    -' : String(r.minBlock).padStart(5)}` +
        `${r.routingDecisions === null ? '       -' : String(r.routingDecisions).padStart(8)}` +
        `  ${pct(r.retestWorst)} ${pct(r.retestPooled)}   ${pct(r.top1Worst)} ${pct(r.top1Pooled)}` +
        `   ${pct(r.twoOf3Worst)} ${pct(r.twoOf3Pooled)}` +
        (r.minBlock !== null && r.minBlock < REVIEW_BLOCK_FLOOR ? '  [below review floor]' : ''),
    );
  }

  console.log('\n  module occupancy, mean over routed stages and worlds');
  for (const r of rows) {
    if (r.occupancy.length === 0) continue;
    console.log(`    ${r.arm.padEnd(38)}${r.occupancy.map((x) => pct(x)).join(' ')}`);
  }

  const notes = rows.filter((r) => r.note !== '');
  if (notes.length > 0) {
    console.log('');
    for (const r of notes) console.log(`  ${r.arm.padEnd(38)}${r.note}`);
  }

  reportWorlds(points);
}

// --- Sharding ---------------------------------------------------------------

interface Cell {
  arm: Arm;
  world: SweepAssumptions;
}

function selectShard(cells: Cell[]): { cells: Cell[]; label: string } {
  if (SHARD === undefined) return { cells, label: 'all cells' };
  const [kRaw, nRaw] = SHARD.split('/');
  const k = Number(kRaw);
  const n = Number(nRaw);
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 1 || k < 0 || k >= n) {
    throw new Error(`MST_SHARD must be "k/n" with 0 <= k < n; got "${SHARD}"`);
  }
  return { cells: cells.filter((_, i) => i % n === k), label: `shard ${k + 1} of ${n}` };
}

describe.skipIf(STUDY === undefined)('MST granularity sweep', () => {
  it.skipIf(MERGE === undefined)('merges sharded results', () => {
    const points = readdirSync(MERGE!)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(join(MERGE!, f), 'utf8')) as Point[]);
    console.log(`\nMerged ${points.length} cells from ${MERGE!}`);
    report(points);
    expect(points.length).toBeGreaterThan(0);
  });

  it.skipIf(MERGE !== undefined)(
    'measures each delivery arm across the assumption grid',
    { timeout: 4 * 60 * 60_000 },
    async () => {
      const all: Cell[] = [];
      for (const arm of armsFor(STUDY!)) {
        for (const world of gridFor()) all.push({ arm, world });
      }
      const { cells, label } = selectShard(all);
      console.log(
        `\nRunning ${label}: ${cells.length} cells x ${N} learners ` +
          `= ${(cells.length * N * 2).toLocaleString()} simulated sittings.`,
      );

      const started = Date.now();
      const points: Point[] = [];
      for (const cell of cells) {
        points.push(runPoint(cell.arm, cell.world, N));
        // A cell is a minute of uninterrupted synchronous work, which Vitest's
        // worker heartbeat reads as a hang.
        await new Promise((r) => {
          setImmediate(r);
        });
      }

      if (OUT !== undefined) {
        const file = join(OUT, `${(SHARD ?? 'all').replace('/', '-of-')}.json`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(points));
        console.log(`Wrote ${points.length} cells to ${file}`);
      } else {
        report(points);
      }
      console.log(`\nFinished in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
      expect(points).toHaveLength(cells.length);
    },
  );
});

// --- Always-on guards -------------------------------------------------------

describe('MST sweep harness', () => {
  it('lays out a uniform design at the requested total and block size', () => {
    const design = uniformMstDesign(140, 7, 10);
    expect(design.stages).toBe(7);
    expect(minBlockSize(design)).toBe(20);
    expect(adaptationPoints(design)).toBe(6);
    expect(design.minItemsPerBucket).toBe(14);
    const bank = buildSimBankFor(makeRng(1), 'misspecified', FC_AXIS);
    const plan = planMstForm(design, bank, FC_AXIS);
    expect(plan.totalItems).toBe(140);
    for (const count of plan.itemsPerBucket.values()) expect(count).toBe(14);
  });

  it('quotes the lower floor a contention-allocated design actually guarantees', () => {
    const design = uniformMstDesign(140, 7, 10, { allocation: 'contention' });
    // Routing stage 2 each, then six stages contributing their floor of 1.
    expect(design.minItemsPerBucket).toBe(8);
    const bank = buildSimBankFor(makeRng(1), 'misspecified', FC_AXIS);
    for (let i = 0; i < 6; i += 1) {
      const learner = makeLearnerOn(axisIds(FC_AXIS), `sim-${i}`, makeRng(100 + i));
      const run = simulateMstSitting(learner, bank, design, FC_AXIS, makeRng(200 + i));
      expect(run.itemsServed).toBe(140);
      expect(new Set(run.servedItemIds).size).toBe(140);
      const counts = new Map<string, number>();
      const bucketOf = new Map(bank.map((item) => [item.questionId, item.bucketId]));
      for (const id of run.servedItemIds) {
        const b = bucketOf.get(id)!;
        counts.set(b, (counts.get(b) ?? 0) + 1);
      }
      for (const bucket of axisIds(FC_AXIS)) {
        expect(counts.get(bucket) ?? 0, `${bucket}`).toBeGreaterThanOrEqual(8);
      }
      // If it never moves off the even split it is not doing anything.
      expect(Math.max(...counts.values())).toBeGreaterThan(14);
    }
  });

  it('gives the routing stage the remainder rather than dropping items', () => {
    const design = uniformMstDesign(140, 9, 10);
    const sizes = design.itemsPerStage as readonly number[];
    expect(sizes.reduce((s, n) => s + n, 0)).toBe(140);
    expect(sizes[0]).toBeGreaterThan(sizes[1]!);
  });

  it('forces an even split when the breadth floor takes the whole budget', () => {
    const cfg = evenSplitConfig(140, 10);
    const cell = runAdaptiveCohortDetailed({ learners: 4, cfg, mode: 'misspecified' });
    for (const rec of cell.records) {
      for (const bucket of axisIds(FC_AXIS)) {
        expect(rec.itemsPerBucket[bucket], `${rec.learner} ${bucket}`).toBe(14);
      }
    }
  });

  it('scores the MST arm through the same cohort summary as the adaptive arm', () => {
    const design = { ...MST_DESIGNS[2]!, minItemsPerBucket: 14 };
    const cell = runMstCohortDetailed({ learners: 4, design, mode: 'misspecified' });
    expect(cell.metrics.learners).toBe(4);
    expect(cell.metrics.medianItems).toBe(140);
    expect(cell.records).toHaveLength(4);
    for (const rec of cell.records) {
      expect(rec.servedA).toHaveLength(140);
      expect(rec.correctA).toHaveLength(140);
      expect(Object.values(rec.itemsPerBucket).every((n) => n === 14)).toBe(true);
    }
  });

  it('keeps the default quantiles first in the sweep, so the shipped cuts are the baseline', () => {
    expect(QUANTILE_SETS[0]).toEqual(defaultRoutingQuantiles(3));
  });

  it('serves the recommended design at a reviewable block size', () => {
    expect(minBlockSize(MST_140_RECOMMENDED)).toBe(20);
    expect(minBlockSize(MST_140_RECOMMENDED)).toBeGreaterThanOrEqual(REVIEW_BLOCK_FLOOR);
    expect(adaptationPoints(MST_140_RECOMMENDED)).toBe(6);
    const bank = buildSimBankFor(makeRng(1), 'misspecified', FC_AXIS);
    expect(planMstForm(MST_140_RECOMMENDED, bank, FC_AXIS).totalItems).toBe(140);
  });

  it('scores each arm against its own reproducibility bar and not the other one', () => {
    const design = { ...MST_DESIGNS[2]!, minItemsPerBucket: 14 };
    const m = runMstCohortDetailed({ learners: 4, design, mode: 'misspecified' }).metrics;
    // Four learners cannot clear either bar reliably, so the rate is substituted
    // with one that sits between the two and the assertion is on which bar was
    // consulted rather than on the rate itself.
    const asMst = evaluateBars({ ...m, testRetestReportedOneOf: 0.84 }, 140, 'mst');
    expect(asMst.testRetestReportedMstAt140).toBe(true);
    expect(asMst.testRetestReportedAt140).toBe(true);
    const asAdaptive = evaluateBars({ ...m, testRetestReportedOneOf: 0.84 }, 140, 'adaptive');
    expect(asAdaptive.testRetestReportedAt140).toBe(false);
    expect(asAdaptive.testRetestReportedMstAt140).toBe(true);
  });
});
