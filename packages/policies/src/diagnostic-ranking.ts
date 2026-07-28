import { UNLOCK_STRENGTH, leverageOf } from './diagnostic';
import { axisIds, indexAxis, type DiagnosticAxis } from './diagnostic-axis';
import { makeRng, normalCdf, type RetestRecord } from './diagnostic-simulation';

/**
 * How much of the reported plan is the learner, and how much is the unlock
 * weights.
 *
 * The ranking key is `gap × (1 + strength × unlock)`. `gap` is the only term
 * that depends on the learner; `unlock` is a fixed property of the bucket. At
 * full strength a bucket can therefore be named ahead of one the learner is
 * measurably weaker in, which is a house recommendation wearing a measurement's
 * clothes. The counter-argument is real too — a weak prerequisite is worth more
 * study time than an isolated weak area — so the question is not whether the
 * weight belongs but how strong it should be.
 *
 * Everything here answers that by re-ranking sittings that already happened.
 * A {@link RetestRecord} carries each sampled bucket's reported leverage, and
 * leverage is an invertible function of the gap read, so any other strength can
 * be scored on exactly the same responses. That matters: re-running the cohort
 * per strength would also change which items were served, and the two effects
 * would be inseparable.
 *
 * Nothing here runs at runtime.
 */

/** Strengths worth comparing: shipped, two intermediates, and weight-free. */
export const UNLOCK_STRENGTHS: readonly number[] = [1, 0.5, 0.25, 0];

const overlap = (a: readonly string[], b: readonly string[]): number => {
  const inB = new Set(b);
  return a.filter((x) => inB.has(x)).length;
};

/**
 * The gap read behind a recorded leverage.
 *
 * Exact rather than approximate: the harness records `gap × (1 + s·w)` with `s`
 * the strength the sitting ran under, so dividing that factor back out recovers
 * the gap to the last bit. `recordedStrength` must be the strength the records
 * were produced at, which is why it defaults to the shipped constant rather
 * than to 1.
 */
export const gapFromLeverage = (
  leverage: number,
  unlockWeight: number,
  recordedStrength: number = UNLOCK_STRENGTH,
): number => leverage / (1 + recordedStrength * unlockWeight);

export interface StrengthRanking {
  /** Bucket ids, best first. */
  order: readonly string[];
  /** Ranking key per bucket, aligned with `order`. */
  leverage: readonly number[];
}

/**
 * Re-rank one sitting at a different unlock strength.
 *
 * Ties break by unlock weight and then by canonical bucket order, so at
 * strength 0 the weight survives as a tie-break exactly as the "pure gap"
 * option specifies, and the result stays deterministic.
 */
export function rankAtStrength(
  side: RetestRecord['a'],
  axis: DiagnosticAxis,
  strength: number,
  recordedStrength: number = UNLOCK_STRENGTH,
): StrengthRanking {
  const byId = indexAxis(axis);
  const order = new Map(axisIds(axis).map((id, i) => [id, i]));
  const scored = side.map(([bucket, recorded]) => {
    const w = byId.get(bucket)?.unlockWeight ?? 0;
    return {
      bucket,
      w,
      lev: leverageOf(gapFromLeverage(recorded, w, recordedStrength), w, strength),
    };
  });
  scored.sort(
    (a, b) =>
      b.lev - a.lev || b.w - a.w || (order.get(a.bucket) ?? 0) - (order.get(b.bucket) ?? 0),
  );
  return { order: scored.map((x) => x.bucket), leverage: scored.map((x) => x.lev) };
}

/**
 * The ranking an instrument that knew θ exactly would report at a given
 * strength — the target the design is trying to recover.
 *
 * Strength 0 is the special case worth naming: it is the learner's genuinely
 * weakest areas, with no house preference in it at all. Scoring every strength
 * against that as well as against its own matched target is what separates "this
 * strength estimates its own target well" from "this strength names the areas
 * the learner is actually weakest in".
 */
export function trueRankAtStrength(
  rec: RetestRecord,
  axis: DiagnosticAxis,
  strength: number,
): readonly string[] {
  const byId = indexAxis(axis);
  const order = new Map(axisIds(axis).map((id, i) => [id, i]));
  return Object.entries(rec.theta)
    .map(([bucket, theta]) => {
      const w = byId.get(bucket)?.unlockWeight ?? 0;
      return { bucket, w, lev: leverageOf(normalCdf(-theta), w, strength) };
    })
    .sort(
      (a, b) =>
        b.lev - a.lev || b.w - a.w || (order.get(a.bucket) ?? 0) - (order.get(b.bucket) ?? 0),
    )
    .map((x) => x.bucket);
}

export interface RankingStrengthMetrics {
  strength: number;
  learners: number;
  /** Slots the report names — the list `reported*` metrics are measured on. */
  reported: number;

  /**
   * Genericity null: sitting A of one learner against sitting B of a *different*
   * one. Whatever this is, the report gets it without measuring the individual.
   */
  crossLearnerTop3: number;
  crossLearnerReported: number;
  /** The same statistic on ground truth — how generic the truth itself is. */
  crossLearnerTop3True: number;
  crossLearnerReportedTrue: number;

  /** Appearance share per bucket in the reported list, best first. */
  reportedShare: readonly (readonly [string, number])[];
  trueShare: readonly (readonly [string, number])[];
  /** Slot mass the three most-reported buckets hold, out of 3. */
  top3Concentration: number;
  trueTop3Concentration: number;
  /** Slot mass the `reported` most-reported buckets hold, out of `reported`. */
  reportedConcentration: number;
  trueReportedConcentration: number;
  /** Extremes of the reported list's appearance shares — reachability. */
  minReportedShare: number;
  maxReportedShare: number;

  /** Accuracy against this strength's own target. */
  trueTop1InTop3: number;
  trueTwoOfThree: number;
  trueTop1InReported: number;
  /** At least one of the reported buckets is truly in the top `reported`. */
  reportedOneOfTrue: number;

  /** Accuracy against the weakness-only target (strength 0). */
  weakTop1InTop3: number;
  weakTwoOfThree: number;
  weakTop1InReported: number;
  /** At least one reported bucket is among the learner's `reported` weakest. */
  weakOneOfReported: number;

  /** Reproducibility. */
  retestTop3TwoOf3: number;
  retestReportedOneOf: number;
  retestReportedExact: number;
  retestSameTop1: number;
}

/**
 * Score one unlock strength over a set of records.
 *
 * Both an accuracy and a genericity read, because the two move in opposite
 * directions and a strength can only be judged on the pair. The permutation
 * null is drawn once with a fixed seed so that strengths are compared on the
 * same pairing rather than on independent shuffles.
 */
export function rankingStrengthAt(
  records: readonly RetestRecord[],
  axis: DiagnosticAxis,
  strength: number,
  reported: number,
  seed = 24601,
  recordedStrength: number = UNLOCK_STRENGTH,
): RankingStrengthMetrics {
  const rankedA: string[][] = [];
  const rankedB: string[][] = [];
  const truthMatched: readonly (readonly string[])[] = records.map((rec) =>
    trueRankAtStrength(rec, axis, strength),
  );
  const truthWeak: readonly (readonly string[])[] = records.map((rec) =>
    trueRankAtStrength(rec, axis, 0),
  );

  const reportedCount = new Map<string, number>();
  const trueCount = new Map<string, number>();
  const reportedTop3Count = new Map<string, number>();
  const trueTop3Count = new Map<string, number>();

  let trueTop1InTop3 = 0;
  let trueTwoOfThree = 0;
  let trueTop1InReported = 0;
  let reportedOneOfTrue = 0;
  let weakTop1InTop3 = 0;
  let weakTwoOfThree = 0;
  let weakTop1InReported = 0;
  let weakOneOfReported = 0;
  let retestTop3TwoOf3 = 0;
  let retestReportedOneOf = 0;
  let retestReportedExact = 0;
  let retestSameTop1 = 0;

  records.forEach((rec, i) => {
    const a = rankAtStrength(rec.a, axis, strength, recordedStrength).order;
    const b = rankAtStrength(rec.b, axis, strength, recordedStrength).order;
    rankedA.push([...a]);
    rankedB.push([...b]);

    const aTop3 = a.slice(0, 3);
    const aReported = a.slice(0, reported);
    const bTop3 = b.slice(0, 3);
    const bReported = b.slice(0, reported);

    for (const bucket of aReported) {
      reportedCount.set(bucket, (reportedCount.get(bucket) ?? 0) + 1);
    }
    for (const bucket of aTop3) {
      reportedTop3Count.set(bucket, (reportedTop3Count.get(bucket) ?? 0) + 1);
    }

    const matched = truthMatched[i]!;
    const weak = truthWeak[i]!;
    for (const bucket of matched.slice(0, reported)) {
      trueCount.set(bucket, (trueCount.get(bucket) ?? 0) + 1);
    }
    for (const bucket of matched.slice(0, 3)) {
      trueTop3Count.set(bucket, (trueTop3Count.get(bucket) ?? 0) + 1);
    }

    const matchedTop3 = new Set(matched.slice(0, 3));
    const matchedReported = new Set(matched.slice(0, reported));
    const weakTop3 = new Set(weak.slice(0, 3));
    if (matched[0] !== undefined && aTop3.includes(matched[0])) trueTop1InTop3 += 1;
    if (aTop3.filter((x) => matchedTop3.has(x)).length >= 2) trueTwoOfThree += 1;
    if (matched[0] !== undefined && aReported.includes(matched[0])) trueTop1InReported += 1;
    if (aReported.some((x) => matchedReported.has(x))) reportedOneOfTrue += 1;
    if (weak[0] !== undefined && aTop3.includes(weak[0])) weakTop1InTop3 += 1;
    if (aTop3.filter((x) => weakTop3.has(x)).length >= 2) weakTwoOfThree += 1;
    if (weak[0] !== undefined && aReported.includes(weak[0])) weakTop1InReported += 1;
    const weakReported = new Set(weak.slice(0, reported));
    if (aReported.some((x) => weakReported.has(x))) weakOneOfReported += 1;

    if (overlap(aTop3, bTop3) >= 2) retestTop3TwoOf3 += 1;
    if (overlap(aReported, bReported) >= 1) retestReportedOneOf += 1;
    if (
      aReported.length === bReported.length &&
      overlap(aReported, bReported) === aReported.length
    ) {
      retestReportedExact += 1;
    }
    if (a[0] !== undefined && a[0] === b[0]) retestSameTop1 += 1;
  });

  // Each learner's sitting A against a different learner's sitting B.
  const rng = makeRng(seed);
  const order = records.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let crossTop3 = 0;
  let crossReported = 0;
  let crossTop3True = 0;
  let crossReportedTrue = 0;
  for (let i = 0; i < records.length; i += 1) {
    const j = order[i] === i ? (i + 1) % records.length : order[i]!;
    if (overlap(rankedA[i]!.slice(0, 3), rankedB[j]!.slice(0, 3)) >= 2) crossTop3 += 1;
    if (overlap(rankedA[i]!.slice(0, reported), rankedB[j]!.slice(0, reported)) >= 1) {
      crossReported += 1;
    }
    if (overlap(truthMatched[i]!.slice(0, 3), truthMatched[j]!.slice(0, 3)) >= 2) {
      crossTop3True += 1;
    }
    if (
      overlap(truthMatched[i]!.slice(0, reported), truthMatched[j]!.slice(0, reported)) >= 1
    ) {
      crossReportedTrue += 1;
    }
  }

  const n = Math.max(1, records.length);
  const shares = (counts: Map<string, number>): [string, number][] =>
    [...counts].map(([b, c]) => [b, c / n] as [string, number]).sort((x, y) => y[1] - x[1]);
  const mass = (xs: readonly (readonly [string, number])[], k: number): number =>
    xs.slice(0, k).reduce((s, [, share]) => s + share, 0);
  const reportedShare = shares(reportedCount);
  const trueShare = shares(trueCount);
  const reportedTop3Share = shares(reportedTop3Count);
  const trueTop3Share = shares(trueTop3Count);

  // Buckets that never appear are absent from the count map, and "never
  // reported" is exactly the finding the reachability question is looking for.
  const coverable = new Set(records.flatMap((rec) => Object.keys(rec.theta)));
  const minShare = Math.min(
    ...[...coverable].map((b) => (reportedCount.get(b) ?? 0) / n),
  );

  return {
    strength,
    learners: records.length,
    reported,
    crossLearnerTop3: crossTop3 / n,
    crossLearnerReported: crossReported / n,
    crossLearnerTop3True: crossTop3True / n,
    crossLearnerReportedTrue: crossReportedTrue / n,
    reportedShare,
    trueShare,
    top3Concentration: mass(reportedTop3Share, 3),
    trueTop3Concentration: mass(trueTop3Share, 3),
    reportedConcentration: mass(reportedShare, reported),
    trueReportedConcentration: mass(trueShare, reported),
    minReportedShare: Number.isFinite(minShare) ? minShare : Number.NaN,
    maxReportedShare: reportedShare[0]?.[1] ?? Number.NaN,
    trueTop1InTop3: trueTop1InTop3 / n,
    trueTwoOfThree: trueTwoOfThree / n,
    trueTop1InReported: trueTop1InReported / n,
    reportedOneOfTrue: reportedOneOfTrue / n,
    weakTop1InTop3: weakTop1InTop3 / n,
    weakTwoOfThree: weakTwoOfThree / n,
    weakTop1InReported: weakTop1InReported / n,
    weakOneOfReported: weakOneOfReported / n,
    retestTop3TwoOf3: retestTop3TwoOf3 / n,
    retestReportedOneOf: retestReportedOneOf / n,
    retestReportedExact: retestReportedExact / n,
    retestSameTop1: retestSameTop1 / n,
  };
}

/**
 * How evenly a cohort's items were spread across buckets.
 *
 * The contention weighting in item selection existed to move items towards the
 * buckets contesting the reporting cut. An oracle allocator that reads the true
 * leverage to place its items scores no better than an even split, so the only
 * question left about the weighting is whether it moved anything; this is what
 * answers it. `imbalance` is the mean absolute deviation from an even split as a
 * share of it, so 0 is perfectly even and 1 means the typical bucket is off by
 * its entire fair share.
 */
export interface AllocationShape {
  learners: number;
  buckets: number;
  meanItems: number;
  /** Mean items the least- and most-sampled bucket received. */
  meanMin: number;
  meanMax: number;
  imbalance: number;
  /** Items per bucket, pooled across learners, best-sampled first. */
  perBucket: readonly (readonly [string, number])[];
}

export function allocationShape(records: readonly RetestRecord[]): AllocationShape {
  const totals = new Map<string, number>();
  let buckets = 0;
  let itemSum = 0;
  let minSum = 0;
  let maxSum = 0;
  let imbalanceSum = 0;

  for (const rec of records) {
    const ids = Object.keys(rec.theta);
    if (ids.length === 0) continue;
    buckets = Math.max(buckets, ids.length);
    const counts = ids.map((id) => rec.itemsPerBucket[id] ?? 0);
    const total = counts.reduce((s, x) => s + x, 0);
    const even = total / ids.length;
    itemSum += total;
    minSum += Math.min(...counts);
    maxSum += Math.max(...counts);
    imbalanceSum +=
      even > 0
        ? counts.reduce((s, x) => s + Math.abs(x - even), 0) / (counts.length * even)
        : 0;
    ids.forEach((id, i) => totals.set(id, (totals.get(id) ?? 0) + counts[i]!));
  }

  const n = Math.max(1, records.length);
  return {
    learners: records.length,
    buckets,
    meanItems: itemSum / n,
    meanMin: minSum / n,
    meanMax: maxSum / n,
    imbalance: imbalanceSum / n,
    perBucket: [...totals]
      .map(([b, c]) => [b, c / n] as [string, number])
      .sort((x, y) => y[1] - x[1]),
  };
}
