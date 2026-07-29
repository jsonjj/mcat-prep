import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLUSTER_AXIS, FC_AXIS, type DiagnosticAxis } from './diagnostic-axis';
import { BAYES_DIAGNOSTIC_CONFIG } from './diagnostic-bayes';
import {
  DEFAULT_ASSUMPTION_GRID,
  PLAN_BARS,
  runSweepDetailed,
  summariseSweep,
  type SweepAssumptions,
  type SweepDesign,
  type SweepPoint,
} from './diagnostic-simulation';
import {
  crossovers,
  DEFAULT_RUNWAY_MODEL,
  HEADLINE_RUNWAYS,
  netValueCurve,
  RUNWAY_GRID,
  summariseValues,
  type NetValue,
} from './diagnostic-value';

/**
 * The assumption sweep: every candidate design against every plausible world,
 * scored on bars declared before the run.
 *
 * Opt-in — it takes minutes, not seconds.
 *
 *   SIM_SWEEP=1 pnpm --filter @mcat/policies exec vitest run diagnostic-sweep
 *
 * Sharded across cores (each shard writes a JSON artefact, then merge to report):
 *
 *   SIM_SWEEP=1 SWEEP_SHARD=0/8 SWEEP_OUT=.tmp/sweep pnpm ... &   # ×8
 *   SIM_SWEEP=1 SWEEP_MERGE=.tmp/sweep pnpm ...
 *
 * What this can and cannot tell us: the learner model has never been fitted to
 * real response data, so no absolute number here is a forecast. What survives
 * contact with reality is the *ordering* of designs, and any design that fails
 * outright. Read the `worst` column, not the `best` one, and never quote these
 * figures to a learner or in external material.
 */

const ENABLED = process.env.SIM_SWEEP === '1';
const N = Number(process.env.SWEEP_N ?? 250);
const SHARD = process.env.SWEEP_SHARD;

/**
 * Vitest runs with the package as its cwd, so a relative path here would land in
 * `packages/policies/` rather than where the caller launched from. Resolve
 * against the repo root instead, which is two levels up.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const fromRepoRoot = (p: string | undefined): string | undefined =>
  p === undefined ? undefined : isAbsolute(p) ? p : resolve(REPO_ROOT, p);

const OUT = fromRepoRoot(process.env.SWEEP_OUT);
const MERGE = fromRepoRoot(process.env.SWEEP_MERGE);

/**
 * Candidate lengths. The per-bucket floor scales with the budget so each design
 * is a coherent test rather than a longer version of the same one; the floor is
 * what determines coverage, and the plan document's 140-item recommendation
 * rests on the per-dimension item count rather than the total.
 */
const BUDGETS = [
  { budget: 60, floor: 2 },
  { budget: 90, floor: 4 },
  { budget: 140, floor: 6 },
  { budget: 200, floor: 9 },
] as const;

/**
 * Both axes, because the reporting partition is still an open question and the
 * length answer has to hold under either. They are not interchangeable for this
 * purpose: the axis sets how finely the curriculum is cut, so it changes both
 * how many items a bucket gets and how much study time one bucket costs.
 */
const AXES: readonly { id: string; axis: DiagnosticAxis }[] = [
  { id: 'fc-10', axis: FC_AXIS },
  { id: 'cluster-15', axis: CLUSTER_AXIS },
];

const DESIGNS: SweepDesign[] = AXES.flatMap(({ id, axis }) =>
  BUDGETS.map(({ budget, floor }) => ({
    label: `${id} ${String(budget).padStart(3)} items (floor ${floor})`,
    axis,
    cfg: {
      ...BAYES_DIAGNOSTIC_CONFIG,
      minItems: Math.round(budget / 2),
      maxItems: budget,
      minItemsPerCluster: floor,
    },
  })),
);

/** A swept cell plus what it was worth, per runway, after paying for itself. */
interface ValuedPoint extends SweepPoint {
  axisId: string;
  value: NetValue[];
}

/**
 * One unit of parallelisable work. Cells are independent — same seed, same
 * learners, no shared state — so sharding them changes nothing about the result.
 */
interface Cell {
  design: SweepDesign;
  world: SweepAssumptions;
}

const allCells = (): Cell[] => {
  const cells: Cell[] = [];
  for (const design of DESIGNS) {
    for (const world of DEFAULT_ASSUMPTION_GRID) cells.push({ design, world });
  }
  return cells;
};

/** Interleaved rather than contiguous, so long designs spread evenly across shards. */
function selectShard(cells: Cell[]): { cells: Cell[]; label: string } {
  if (SHARD === undefined) return { cells, label: 'all cells' };
  const [kRaw, nRaw] = SHARD.split('/');
  const k = Number(kRaw);
  const n = Number(nRaw);
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 1 || k < 0 || k >= n) {
    throw new Error(`SWEEP_SHARD must be "k/n" with 0 <= k < n; got "${SHARD}"`);
  }
  return { cells: cells.filter((_, i) => i % n === k), label: `shard ${k + 1} of ${n}` };
}

const pct = (x: number): string =>
  Number.isNaN(x) ? '  n/a' : `${(x * 100).toFixed(1)}%`.padStart(6);

function reportWorlds(points: readonly SweepPoint[]): void {
  console.log('\n--- every design × every world -------------------------------------');
  console.log(
    '  design                        rho  deficit  calibration    true#1    2of3  retest  median',
  );
  for (const p of points) {
    const a = p.assumptions;
    console.log(
      `  ${p.design.padEnd(30)}` +
        a.correlation.toFixed(2).padStart(4) +
        a.deficit[0].toFixed(1).padStart(8) +
        `  ${a.mode.padEnd(13)}` +
        pct(p.metrics.top1InTop3) +
        pct(p.metrics.twoOfThree) +
        pct(p.metrics.testRetestTwoOf3) +
        String(p.metrics.medianItems).padStart(7),
    );
  }
}

function reportSummary(points: readonly SweepPoint[]): void {
  console.log('\n--- worst case across all worlds (this is the column that matters) ---');
  for (const s of summariseSweep(points)) {
    console.log(
      `\n  ${s.design}` +
        `\n    true #1 in Top 3     worst ${pct(s.top1InTop3.worst)}  median ${pct(s.top1InTop3.median)}  best ${pct(s.top1InTop3.best)}` +
        `\n    2-of-3 correct       worst ${pct(s.twoOfThree.worst)}  median ${pct(s.twoOfThree.median)}  best ${pct(s.twoOfThree.best)}` +
        `\n    re-sit 2-of-3        worst ${pct(s.testRetestTwoOf3.worst)}  median ${pct(s.testRetestTwoOf3.median)}  best ${pct(s.testRetestTwoOf3.best)}` +
        `\n    median length        worst ${s.medianItems.worst}  median ${s.medianItems.median}  best ${s.medianItems.best}` +
        `\n    cleared every bar in ${s.worldsClearingAllBars}/${s.worlds} worlds` +
        (s.barsFailedSomewhere.length > 0
          ? `\n    failed somewhere: ${s.barsFailedSomewhere.join(', ')}`
          : '\n    failed nowhere'),
    );
  }
}

const num = (x: number, dp = 3): string => x.toFixed(dp).padStart(dp + 4);

/**
 * What each length is worth per hour of runway, after the form has been charged
 * for the study time it consumed.
 *
 * Reported per axis, because the axis fixes how much content one bucket holds
 * and therefore where the coverage boundaries fall. Read the worst column: a
 * length that only wins in the friendly worlds has been chosen by assumption.
 */
function reportValue(points: readonly ValuedPoint[]): void {
  console.log('\n--- net value: concepts correctly prioritised per hour of runway ----');
  console.log(`Model: ${JSON.stringify(DEFAULT_RUNWAY_MODEL)}`);

  for (const { id } of AXES) {
    const forAxis = points.filter((p) => p.axisId === id);
    if (forAxis.length === 0) continue;
    console.log(`\n  === ${id} ===`);

    const at = (runway: number, field: (v: NetValue) => number): Map<string, number[]> => {
      const out = new Map<string, number[]>();
      for (const p of forAxis) {
        const v = p.value.find((x) => x.runwayHours === runway);
        if (v === undefined) continue;
        const list = out.get(p.design) ?? [];
        list.push(field(v));
        out.set(p.design, list);
      }
      return out;
    };

    for (const runway of HEADLINE_RUNWAYS) {
      const perHour = summariseValues(at(runway, (v) => v.perHour), runway);
      const gain = summariseValues(at(runway, (v) => v.netGain), runway);
      const covered = summariseValues(at(runway, (v) => v.bucketsCovered), runway);
      const share = summariseValues(at(runway, (v) => v.shareOfAchievableGain), runway);
      const best = perHour.reduce((a, b) => (b.worst > a.worst ? b : a));
      const spread = best.worst - Math.min(...perHour.map((r) => r.worst));
      console.log(
        `\n  ${runway}h runway   ` +
          (spread < 1e-9
            ? 'every length ties — the runway covers everything, so ordering buys nothing'
            : `best on the worst world: ${best.design}`),
      );
      console.log(
        '    design                       per-hour worst  median   buckets   net vs no test   share of gain',
      );
      for (const row of perHour) {
        const g = gain.find((x) => x.design === row.design)!;
        const c = covered.find((x) => x.design === row.design)!;
        const s = share.find((x) => x.design === row.design)!;
        console.log(
          `    ${row.design.padEnd(28)}${num(row.worst, 4)}${num(row.median, 4)}` +
            `   ${c.median.toFixed(1).padStart(5)}` +
            `        ${g.worst >= 0 ? ' ' : ''}${g.worst.toFixed(3)} / ${g.median.toFixed(3)}` +
            `     ${(s.median * 100).toFixed(1).padStart(6)}%`,
        );
      }
    }

    const byRunway = RUNWAY_GRID.map((runwayHours) => ({
      runwayHours,
      rows: summariseValues(at(runwayHours, (v) => v.perHour), runwayHours),
    })).filter((r) => r.rows.length > 0);
    const moves = crossovers(byRunway);
    console.log(
      `\n  best length by runway (worst world): ` +
        (moves.length === 0
          ? `${byRunway[0]?.rows.reduce((a, b) => (b.worst > a.worst ? b : a)).design} throughout`
          : moves.map((m) => `${m.from} -> ${m.to} at ${m.runwayHours}h`).join('; ')),
    );

    // Runways where the longest form is strictly worth its extra hours, and
    // runways where a form is worth less than the study time it consumed. Both
    // are questions only the fine grid can answer.
    const label = (budget: number): string =>
      `${id} ${String(budget).padStart(3)} items (floor ${BUDGETS.find((b) => b.budget === budget)!.floor})`;
    const beats = byRunway
      .filter((r) => {
        const long = r.rows.find((x) => x.design === label(200));
        const mid = r.rows.find((x) => x.design === label(140));
        return long !== undefined && mid !== undefined && long.worst > mid.worst + 1e-9;
      })
      .map((r) => r.runwayHours);
    console.log(
      `  200 beats 140 on the worst world at: ${beats.length === 0 ? 'no runway' : `${beats.join(', ')}h`}`,
    );

    for (const { budget } of BUDGETS) {
      const negative = RUNWAY_GRID.filter((h) => {
        const xs = [...at(h, (v) => v.netGain).get(label(budget)) ?? []];
        return xs.length > 0 && Math.min(...xs) < -1e-9;
      });
      if (negative.length > 0) {
        console.log(
          `  ${label(budget)} is net negative against no test at: ${negative.join(', ')}h`,
        );
      }
    }
  }
}

const readPoints = (dir: string): ValuedPoint[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ValuedPoint[]);

describe.skipIf(!ENABLED)('diagnostic assumption sweep', () => {
  it.skipIf(MERGE === undefined)('merges sharded results', () => {
    const dir = MERGE!;
    const points = readPoints(dir);
    console.log(`\nMerged ${points.length} cells from ${dir}`);
    console.log('Pre-registered bars:', JSON.stringify(PLAN_BARS));
    reportWorlds(points);
    reportSummary(points);
    reportValue(points);
    expect(points.length).toBeGreaterThan(0);
  });

  it.skipIf(MERGE !== undefined)(
    'compares candidate designs across the assumption grid',
    { timeout: 60 * 60_000 },
    async () => {
      const { cells, label } = selectShard(allCells());
      console.log(
        `\nRunning ${label}: ${cells.length} cells × ${N} learners ` +
          `= ${(cells.length * N * 2).toLocaleString()} simulated sittings.`,
      );

      const started = Date.now();
      const points: ValuedPoint[] = [];
      for (const cell of cells) {
        const axis = cell.design.axis ?? CLUSTER_AXIS;
        const run = runSweepDetailed([cell.design], { learners: N, grid: [cell.world] });
        points.push(
          ...run.points.map((p) => ({
            ...p,
            axisId: axis.id,
            value: netValueCurve(run.records, axis),
          })),
        );
        // A single uninterrupted synchronous run blocks the event loop long
        // enough that Vitest's worker heartbeat times out and reports the run
        // as failed despite passing.
        await new Promise((resolve) => {
          setImmediate(resolve);
        });
      }
      const elapsed = (Date.now() - started) / 1000;

      if (OUT !== undefined) {
        const file = join(OUT, `${(SHARD ?? 'all').replace('/', '-of-')}.json`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(points, null, 1));
        console.log(`Wrote ${points.length} cells to ${file}`);
      } else {
        console.log('Pre-registered bars:', JSON.stringify(PLAN_BARS));
        reportWorlds(points);
        reportSummary(points);
        reportValue(points);
      }

      console.log(
        `\nFinished in ${elapsed.toFixed(1)}s ` +
          `(${((elapsed * 1000) / (cells.length * N * 2)).toFixed(1)} ms per sitting).\n`,
      );
      expect(points).toHaveLength(cells.length);
    },
  );
});
