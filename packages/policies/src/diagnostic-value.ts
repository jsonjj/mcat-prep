import { indexAxis, type DiagnosticAxis } from './diagnostic-axis';
import { trueLeverageOf } from './diagnostic-retest';
import type { RetestRecord } from './diagnostic-simulation';

/**
 * What a diagnostic is worth once it is charged for the study time it consumes.
 *
 * Accuracy per length answers the wrong question. The diagnostic's own duration
 * comes out of the learner's runway, so a longer form buys a better ordering of
 * a queue the learner now has less time to work through. Whether that trade is
 * worth taking depends entirely on how much runway there is, and
 * `docs/design/diagnostic-clean-slate-proposal.md` (the runway section) already
 * models why: first-pass lesson coverage is about 114 hours, so above roughly
 * that much available time the learner reaches every bucket regardless of order
 * and the ordering is worth exactly nothing. Below it, ordering is close to the
 * whole game — and near a coverage boundary the test's own cost can push the
 * learner off a bucket they would otherwise have reached.
 *
 * This reuses that model rather than inventing another: same content budget,
 * same per-concept cost, same integer coverage count. It differs only in taking
 * the *measured* per-learner form length and reported ordering from a simulated
 * cohort instead of a summary accuracy figure.
 */

export interface RunwayModel {
  /**
   * Hours of first-pass lesson content the whole curriculum holds — 114 lessons
   * at about an hour each.
   */
  contentHours: number;
  /**
   * Seconds one diagnostic item costs the learner.
   *
   * The proposal prices 140 items at 3.7 hours and 200 at 5.3, which is 95
   * seconds either way; that figure is used rather than the round 90 so this
   * model reproduces the published runway table exactly. The bank carries no
   * response-time data to fit against — `SLOW_MS` in diagnostic.ts is a 90
   * second *threshold*, not a mean, and the harness stamps a flat 60 seconds on
   * every simulated response purely to fill the field.
   */
  secondsPerItem: number;
  /** How many priorities the report names, and so how many it is judged on. */
  reported: number;
}

export const DEFAULT_RUNWAY_MODEL: RunwayModel = {
  contentHours: 114,
  secondsPerItem: 95,
  reported: 3,
};

/** The headline runways: severely constrained, constrained, at the knee, past it. */
export const HEADLINE_RUNWAYS: readonly number[] = [40, 90, 120, 300];

/** A fine grid, for locating the runway at which the best length changes. */
export const RUNWAY_GRID: readonly number[] = Array.from({ length: 57 }, (_, i) => 20 + i * 5);

export interface NetValue {
  runwayHours: number;
  /** Buckets the axis can actually rank — the partition the content is cut into. */
  buckets: number;
  /** Hours of first-pass content one bucket costs. */
  hoursPerBucket: number;
  /** Mean hours the form itself consumed, at the lengths actually served. */
  testHours: number;
  /** Mean buckets reachable after paying for the test. */
  bucketsCovered: number;
  /**
   * Mean count of the learner's truly-weakest buckets that land inside the
   * prefix they have time to reach. This is the quantity being bought.
   */
  hits: number;
  /** The same count for a learner handed the same time but an arbitrary order. */
  uninformedHits: number;
  /** And for a learner who skipped the diagnostic entirely and kept the hours. */
  noTestHits: number;
  /** Concepts correctly prioritised per hour of runway — the net-value metric. */
  perHour: number;
  /**
   * Hits bought net of the hits the test's own duration cost. Negative means
   * the form spent more coverage than its ordering returned.
   */
  netGain: number;
  /**
   * Share of the gain that was there to be captured, on the proposal's
   * definition. Zero — not undefined — when the runway covers everything, since
   * at that point a perfect ordering and a random one end in the same place.
   */
  shareOfAchievableGain: number;
}

const clampCoverage = (hours: number, hoursPerBucket: number, buckets: number): number =>
  Math.max(0, Math.min(buckets, Math.floor(hours / hoursPerBucket)));

/**
 * Score one cohort's records at one runway.
 *
 * Coverage is per learner, not per cohort: an adaptive form that stopped early
 * for one learner and ran to the cap for another charged them different
 * amounts, and averaging the lengths first would hide exactly the learners the
 * cost falls hardest on.
 */
export function netValueAt(
  records: readonly RetestRecord[],
  axis: DiagnosticAxis,
  runwayHours: number,
  model: RunwayModel = DEFAULT_RUNWAY_MODEL,
): NetValue {
  const byId = indexAxis(axis);
  let buckets = 0;
  let testHoursSum = 0;
  let coveredSum = 0;
  let hitSum = 0;
  let uninformedSum = 0;
  let noTestSum = 0;
  let gainNumerator = 0;
  let gainDenominator = 0;

  for (const rec of records) {
    const k = Object.keys(rec.theta).length;
    if (k === 0) continue;
    buckets = Math.max(buckets, k);
    const hoursPerBucket = model.contentHours / k;

    const testHours = (rec.itemsA * model.secondsPerItem) / 3600;
    const covered = clampCoverage(runwayHours - testHours, hoursPerBucket, k);
    const noTestCovered = clampCoverage(runwayHours, hoursPerBucket, k);

    const truth = new Set(
      trueLeverageOf(rec, axis)
        .slice(0, model.reported)
        .map((t) => t.bucket),
    );
    // Buckets absent from the report sit behind the ones that are in it: the
    // learner works the named order first and the remainder in whatever order
    // the planner already had, which is the uninformed order.
    const reported = rec.a.map(([bucket]) => bucket);
    const rest = [...byId.keys()].filter((id) => !reported.includes(id) && id in rec.theta);
    const queue = [...reported, ...rest];

    let hits = 0;
    for (const bucket of queue.slice(0, covered)) if (truth.has(bucket)) hits += 1;

    // An arbitrary order reaches a random `covered` of the `k` buckets, so it
    // catches `reported * covered / k` of the weakest in expectation. Taking the
    // expectation rather than drawing one keeps the baseline noiseless.
    const uninformed = (truth.size * covered) / k;
    const noTest = (truth.size * noTestCovered) / k;
    const perfect = Math.min(truth.size, covered);

    testHoursSum += testHours;
    coveredSum += covered;
    hitSum += hits;
    uninformedSum += uninformed;
    noTestSum += noTest;
    gainNumerator += hits - uninformed;
    gainDenominator += perfect - uninformed;
  }

  const n = Math.max(1, records.length);
  return {
    runwayHours,
    buckets,
    hoursPerBucket: buckets > 0 ? model.contentHours / buckets : Number.NaN,
    testHours: testHoursSum / n,
    bucketsCovered: coveredSum / n,
    hits: hitSum / n,
    uninformedHits: uninformedSum / n,
    noTestHits: noTestSum / n,
    perHour: hitSum / n / runwayHours,
    netGain: (hitSum - noTestSum) / n,
    shareOfAchievableGain: gainDenominator > 1e-9 ? gainNumerator / gainDenominator : 0,
  };
}

/** {@link netValueAt} over a grid of runways. */
export const netValueCurve = (
  records: readonly RetestRecord[],
  axis: DiagnosticAxis,
  runways: readonly number[] = RUNWAY_GRID,
  model: RunwayModel = DEFAULT_RUNWAY_MODEL,
): NetValue[] => runways.map((h) => netValueAt(records, axis, h, model));

// --- Reading a set of curves ------------------------------------------------

/** One design's net value at one runway, already aggregated across worlds. */
export interface DesignValue {
  design: string;
  runwayHours: number;
  /** Worst across the assumption grid — the floor the design guarantees. */
  worst: number;
  median: number;
  best: number;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Collapse per-world net values into one row per design per runway.
 *
 * `values` is keyed by design and holds one number per world, in any order.
 */
export function summariseValues(
  values: ReadonlyMap<string, readonly number[]>,
  runwayHours: number,
): DesignValue[] {
  return [...values].map(([design, xs]) => ({
    design,
    runwayHours,
    worst: xs.length === 0 ? Number.NaN : Math.min(...xs),
    median: median(xs),
    best: xs.length === 0 ? Number.NaN : Math.max(...xs),
  }));
}

export interface Crossover {
  /** Lowest runway at which `to` overtakes `from`. */
  runwayHours: number;
  from: string;
  to: string;
}

/**
 * Where the best design changes as runway grows.
 *
 * Ties are resolved towards the incumbent, so a crossover is reported only when
 * the challenger is strictly better: two designs that are level are not a
 * decision, and reporting one would invent a boundary the data does not carry.
 */
export function crossovers(
  byRunway: readonly { runwayHours: number; rows: readonly DesignValue[] }[],
  pick: (row: DesignValue) => number = (row) => row.worst,
): Crossover[] {
  const out: Crossover[] = [];
  let leader: string | null = null;
  for (const { runwayHours, rows } of [...byRunway].sort((a, b) => a.runwayHours - b.runwayHours)) {
    if (rows.length === 0) continue;
    const incumbent = rows.find((r) => r.design === leader);
    const best = rows.reduce((a, b) => (pick(b) > pick(a) ? b : a));
    const winner =
      incumbent !== undefined && pick(incumbent) >= pick(best) ? incumbent.design : best.design;
    if (leader !== null && winner !== leader) out.push({ runwayHours, from: leader, to: winner });
    leader = winner;
  }
  return out;
}
