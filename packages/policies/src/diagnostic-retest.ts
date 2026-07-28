import { indexAxis, type DiagnosticAxis } from './diagnostic-axis';
import {
  itemInformation,
  makeRng,
  normalCdf,
  type LearnerModel,
  type RetestRecord,
  type SimItem,
} from './diagnostic-simulation';

/**
 * Why the diagnostic's test-retest bar fails, and whether it could ever pass.
 *
 * The sweep reports test-retest as a single rate and stops there, which cannot
 * distinguish two very different situations:
 *
 *  - the instrument is noisy, and more or better items would fix it; or
 *  - the learner's 3rd and 4th priorities are genuinely near-tied, in which case
 *    the two sittings *should* disagree and no instrument can do better.
 *
 * Everything here exists to separate those. The central quantity is the
 * **agreement ceiling**: the test-retest rate a statistically efficient,
 * correctly-specified estimator would achieve on the same learners with the same
 * item budget. If the measured rate sits at its ceiling, the bar is wrong; if it
 * sits well below, the instrument is.
 *
 * Nothing here runs at runtime. It reads {@link RetestRecord}s a cohort run
 * emitted and does arithmetic on them.
 */

// --- Small helpers ----------------------------------------------------------

/** Box–Muller standard normal, matching the harness's generator. */
const gauss = (rng: () => number): number => {
  const u = Math.max(rng(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
};

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 0; i < k; i += 1) out = (out * (n - i)) / (i + 1);
  return out;
};

/** Overlap between two reported sets. */
const overlap = (a: readonly string[], b: readonly string[]): number => {
  const inB = new Set(b);
  return a.filter((x) => inB.has(x)).length;
};

// --- Chance baselines -------------------------------------------------------

/**
 * What a *useless* instrument scores — two independent uniform random Top 3s
 * drawn from `k` buckets agree on 2 of 3 this often.
 *
 * This is the whole reason axis comparison needs care. A 10-bucket axis is
 * handed 18.3% agreement for free where a 14-bucket axis gets 9.3%, so raw
 * agreement rewards coarseness rather than quality.
 */
export const chanceTwoOfThree = (k: number): number =>
  k < 3 ? 1 : (3 * (k - 3) + 1) / choose(k, 3);

/** Chance rate for reporting the identical Top 3 set. */
export const chanceExactTop3 = (k: number): number => (k < 3 ? 1 : 1 / choose(k, 3));

/** Chance rate for reporting the identical Top 2 set. */
export const chanceExactTop2 = (k: number): number => (k < 2 ? 1 : 1 / choose(k, 2));

/**
 * Agreement above chance, on a 0–1 scale where 0 is a coin flip and 1 is
 * perfect. Cohen's kappa with the agreement/chance pair supplied directly.
 *
 * Quote this, not the raw rate, whenever axes with different bucket counts are
 * being compared.
 */
export const chanceCorrected = (observed: number, chance: number): number =>
  chance >= 1 ? Number.NaN : (observed - chance) / (1 - chance);

// --- Observed agreement, recomputed from records ----------------------------

export interface ObservedAgreement {
  learners: number;
  /** Buckets the axis could actually report on — the `k` in the chance rates. */
  coverableBuckets: number;
  twoOfThree: number;
  exactTop3: number;
  /** Both sittings named the same single top priority. */
  sameTop1: number;
  /** Mean share of sitting A's items that sitting B also served. */
  formOverlap: number;
  meanItems: number;
}

const topN = (ranked: RetestRecord['a'], n: number): string[] =>
  ranked.slice(0, n).map(([bucket]) => bucket);

/**
 * Recompute agreement straight from the records.
 *
 * `twoOfThree` here must equal the cohort's `testRetestTwoOf3` exactly; the
 * analysis is worthless if the records are not the same sittings the bars were
 * scored on, so a test pins the two together.
 */
export function observedAgreement(records: readonly RetestRecord[]): ObservedAgreement {
  let twoOfThree = 0;
  let exact = 0;
  let sameTop1 = 0;
  let overlapSum = 0;
  let itemSum = 0;
  let buckets = 0;

  for (const rec of records) {
    const a = topN(rec.a, 3);
    const b = topN(rec.b, 3);
    if (overlap(a, b) >= 2) twoOfThree += 1;
    if (a.length === b.length && overlap(a, b) === a.length) exact += 1;
    if (a[0] !== undefined && a[0] === b[0]) sameTop1 += 1;
    overlapSum += rec.sharedItems / Math.max(1, rec.itemsA);
    itemSum += rec.itemsA;
    buckets = Math.max(buckets, Object.keys(rec.theta).length);
  }

  const n = Math.max(1, records.length);
  return {
    learners: records.length,
    coverableBuckets: buckets,
    twoOfThree: twoOfThree / n,
    exactTop3: exact / n,
    sameTop1: sameTop1 / n,
    formOverlap: overlapSum / n,
    meanItems: itemSum / n,
  };
}

export interface AccuracyFromRecords {
  /** The true #1 priority appears in the reported Top 3. */
  top1InTop3: number;
  /** At least 2 of the reported Top 3 are truly top 3. */
  twoOfThree: number;
  medianItems: number;
}

/**
 * The accuracy bars, recomputed from records rather than taken from
 * `CohortMetrics`.
 *
 * Needed because a long cell is run in chunks so it can yield to the event
 * loop, which splits `CohortMetrics` but leaves the records a single pool. A
 * test pins these against the cohort's own figures.
 */
export function accuracyFromRecords(
  records: readonly RetestRecord[],
  axis: DiagnosticAxis,
): AccuracyFromRecords {
  let top1 = 0;
  let twoOf3 = 0;
  const lengths: number[] = [];
  for (const rec of records) {
    const truth = trueLeverageOf(rec, axis).map((t) => t.bucket);
    const trueTop3 = new Set(truth.slice(0, 3));
    const reported = topN(rec.a, 3);
    if (truth[0] !== undefined && reported.includes(truth[0])) top1 += 1;
    if (reported.filter((c) => trueTop3.has(c)).length >= 2) twoOf3 += 1;
    lengths.push(rec.itemsA);
  }
  const n = Math.max(1, records.length);
  return {
    top1InTop3: top1 / n,
    twoOfThree: twoOf3 / n,
    medianItems: quantile(lengths, 0.5),
  };
}

// --- True tie structure -----------------------------------------------------

/** True leverage of every coverable bucket for one learner, best first. */
export function trueLeverageOf(
  rec: RetestRecord,
  axis: DiagnosticAxis,
): { bucket: string; leverage: number }[] {
  const buckets = indexAxis(axis);
  return Object.entries(rec.theta)
    .map(([bucket, theta]) => ({
      bucket,
      leverage: normalCdf(-theta) * (1 + (buckets.get(bucket)?.unlockWeight ?? 0)),
    }))
    .sort((x, y) => y.leverage - x.leverage);
}

export interface TieStructure {
  learners: number;
  /** Median true leverage gap between the 3rd and 4th ranked buckets. */
  medianCutGap: number;
  p10CutGap: number;
  p90CutGap: number;
  /** Share of learners whose 3rd/4th true leverage differ by less than the key. */
  cutGapBelow: Readonly<Record<string, number>>;
  /**
   * Of the learners whose two sittings disagreed, the share where the buckets
   * they disagreed *about* differ in true leverage by less than the key.
   */
  disagreementsOverNearTies: Readonly<Record<string, number>>;
  disagreements: number;
  /** Median cut gap among agreeing vs disagreeing learners. */
  medianCutGapAgreed: number;
  medianCutGapDisagreed: number;
}

const THRESHOLDS = [0.02, 0.05, 0.1, 0.2];

/**
 * How close together the buckets at the Top-3 cut line really are, and how much
 * of the observed disagreement lands on buckets that are near-tied in truth.
 *
 * A disagreement between two near-tied buckets is the instrument reporting a
 * real ambiguity, not making an error. This quantifies how much of the failure
 * is that.
 */
export function tieStructure(
  records: readonly RetestRecord[],
  axis: DiagnosticAxis,
): TieStructure {
  const cutGaps: number[] = [];
  const agreedGaps: number[] = [];
  const disagreedGaps: number[] = [];
  const nearTieCounts = new Map<number, number>(THRESHOLDS.map((t) => [t, 0]));
  const belowCounts = new Map<number, number>(THRESHOLDS.map((t) => [t, 0]));
  let disagreements = 0;

  for (const rec of records) {
    const truth = trueLeverageOf(rec, axis);
    const gap = (truth[2]?.leverage ?? 0) - (truth[3]?.leverage ?? 0);
    cutGaps.push(gap);
    for (const t of THRESHOLDS) if (gap < t) belowCounts.set(t, belowCounts.get(t)! + 1);

    const a = topN(rec.a, 3);
    const b = topN(rec.b, 3);
    if (overlap(a, b) >= 2) {
      agreedGaps.push(gap);
      continue;
    }
    disagreements += 1;
    disagreedGaps.push(gap);

    // The buckets the two sittings actually disagreed about. If the closest such
    // pair is near-tied in truth, the disagreement is between two options that
    // genuinely deserve the slot.
    const trueLev = new Map(truth.map((x) => [x.bucket, x.leverage]));
    const onlyA = a.filter((x) => !b.includes(x));
    const onlyB = b.filter((x) => !a.includes(x));
    let closest = Infinity;
    for (const x of onlyA) {
      for (const y of onlyB) {
        closest = Math.min(closest, Math.abs((trueLev.get(x) ?? 0) - (trueLev.get(y) ?? 0)));
      }
    }
    for (const t of THRESHOLDS) if (closest < t) nearTieCounts.set(t, nearTieCounts.get(t)! + 1);
  }

  const asShares = (counts: Map<number, number>, total: number): Record<string, number> =>
    Object.fromEntries([...counts].map(([t, c]) => [t.toFixed(2), total > 0 ? c / total : 0]));

  return {
    learners: records.length,
    medianCutGap: quantile(cutGaps, 0.5),
    p10CutGap: quantile(cutGaps, 0.1),
    p90CutGap: quantile(cutGaps, 0.9),
    cutGapBelow: asShares(belowCounts, records.length),
    disagreementsOverNearTies: asShares(nearTieCounts, disagreements),
    disagreements,
    medianCutGapAgreed: quantile(agreedGaps, 0.5),
    medianCutGapDisagreed: quantile(disagreedGaps, 0.5),
  };
}

// --- How personal is the plan? ----------------------------------------------

export interface Genericity {
  /** Share of learners whose reported Top 3 contains each bucket, best first. */
  reportedAppearance: readonly (readonly [string, number])[];
  /** The same for the ground-truth Top 3, which is the fair comparison. */
  trueAppearance: readonly (readonly [string, number])[];
  /**
   * Total appearance mass held by the three most-reported buckets, out of 3.
   * A value near 3 means almost every learner is handed the same plan.
   */
  reportedConcentration: number;
  trueConcentration: number;
  /**
   * 2-of-3 agreement between sitting A of one learner and sitting B of a
   * *different* learner. Whatever this is, the diagnostic gets it without
   * measuring anything, so it is the floor the real rate must be judged against.
   */
  crossLearnerAgreement: number;
  /** The same statistic computed on ground truth — how generic the truth is. */
  crossLearnerAgreementTrue: number;
}

/**
 * How much of the reported Top 3 is the learner, and how much is the leverage
 * weights.
 *
 * `leverage = severity × (1 + unlock)` multiplies a bounded quantity — severity
 * lives in [0,1] — by a weight that ranges over a factor of nearly two on the
 * cluster axis. A bucket with a high unlock weight therefore enters the Top 3
 * from a much weaker showing than a low-weight one needs, and if the weight
 * spread is large relative to the severity spread the ranking is mostly the
 * weights. That would inflate test-retest for a reason that has nothing to do
 * with measurement quality, which is why this is computed alongside it.
 */
export function genericity(
  records: readonly RetestRecord[],
  axis: DiagnosticAxis,
  seed = 24601,
): Genericity {
  const reported = new Map<string, number>();
  const truth = new Map<string, number>();
  const trueTop3: string[][] = [];

  for (const rec of records) {
    for (const [b] of rec.a.slice(0, 3)) reported.set(b, (reported.get(b) ?? 0) + 1);
    const t = trueLeverageOf(rec, axis)
      .slice(0, 3)
      .map((x) => x.bucket);
    trueTop3.push(t);
    for (const b of t) truth.set(b, (truth.get(b) ?? 0) + 1);
  }

  const n = Math.max(1, records.length);
  const rank = (m: Map<string, number>): [string, number][] =>
    [...m.entries()].map(([b, c]) => [b, c / n] as [string, number]).sort((x, y) => y[1] - x[1]);
  const reportedRanked = rank(reported);
  const trueRanked = rank(truth);
  const top3Mass = (xs: readonly (readonly [string, number])[]): number =>
    xs.slice(0, 3).reduce((s, [, share]) => s + share, 0);

  // Pair each learner's sitting A with a different learner's sitting B.
  const rng = makeRng(seed);
  const order = records.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let cross = 0;
  let crossTrue = 0;
  for (let i = 0; i < records.length; i += 1) {
    const j = order[i] === i ? (i + 1) % records.length : order[i]!;
    if (overlap(topN(records[i]!.a, 3), topN(records[j]!.b, 3)) >= 2) cross += 1;
    if (overlap(trueTop3[i] ?? [], trueTop3[j] ?? []) >= 2) crossTrue += 1;
  }

  return {
    reportedAppearance: reportedRanked,
    trueAppearance: trueRanked,
    reportedConcentration: top3Mass(reportedRanked),
    trueConcentration: top3Mass(trueRanked),
    crossLearnerAgreement: cross / n,
    crossLearnerAgreementTrue: crossTrue / n,
  };
}

// --- The agreement ceiling --------------------------------------------------

/**
 * How the ceiling's hypothetical instrument spends its items.
 *
 * - `observed` — exactly the per-bucket allocation the real engine produced, at
 *   the difficulties it actually served. This is the like-for-like ceiling: same
 *   information, perfect estimator.
 * - `equal` — the budget split evenly across coverable buckets, each bucket
 *   given the most informative items its pool holds at the learner's true
 *   ability. A best-case fixed form.
 * - `oracle-targeted` — the same budget, but concentrated on the buckets whose
 *   TRUE leverage sits nearest the Top-3 cut. Not implementable (it reads the
 *   answer to allocate), which is the point: it bounds what any adaptive
 *   allocation rule could possibly buy.
 */
export type CeilingAllocation = 'observed' | 'equal' | 'oracle-targeted';

export interface CeilingOptions {
  axis: DiagnosticAxis;
  /** Monte-Carlo draws of the measurement error per learner. */
  replicates?: number;
  seed?: number;
  /**
   * Multiplier on the efficient estimator's standard error. 1 is the
   * Cramér–Rao bound. Above 1 models a less efficient instrument; below 1 asks
   * what a physically impossible one would score.
   */
  precision?: number;
  /**
   * How hard the estimator shrinks each bucket towards the learner's own overall
   * level, from 0 (report the raw efficient estimate) to 1 (report no
   * bucket-to-bucket difference at all).
   *
   * This is the knob that trades accuracy for reproducibility, and it is why an
   * unconstrained "maximum achievable agreement" is not a meaningful quantity —
   * see {@link frontier}.
   */
  shrinkage?: number;
  /**
   * Which estimator the hypothetical instrument uses.
   *
   * - `unbiased` — the raw efficient estimate. Simple, and the natural first
   *   guess at a ceiling, but *not* an upper bound: it throws away the fact that
   *   a learner's buckets are correlated, and the real engine does not.
   * - `bayes` — posterior mean under the population structure the cohort was
   *   actually generated from, but still fed the asymptotic normal summary of
   *   the responses. Better, and still not a bound: at four items per bucket
   *   that summary is far noisier than the responses themselves.
   * - `exact-bayes` — the real bound. Simulates the actual binary responses to
   *   the actual items served and forms the exact posterior. See
   *   {@link agreementCeiling}.
   */
  estimator?: 'unbiased' | 'bayes' | 'exact-bayes';
  /**
   * Population structure the `bayes` estimator is given. Defaults to the exact
   * structure measured off the records themselves.
   */
  prior?: PopulationPrior;
  /**
   * The exact model the cohort was generated from. Supplying it lets
   * `exact-bayes` use the true deficit mixture as its prior instead of a fitted
   * normal, which is what makes the result a genuine upper bound rather than the
   * score of one particular well-specified estimator.
   */
  learnerModel?: LearnerModel;
  /**
   * Which functional of the exact posterior the oracle ranks by.
   *
   * - `posterior-mean` — E[Φ(−θ)], the posterior mean of the quantity being
   *   estimated. Optimal under squared error, and it discounts a bucket the
   *   instrument is unsure about.
   * - `plug-in` — Φ(−E[θ]), which is what the production engine does. Not
   *   optimal under squared error, but ranking is not a squared-error problem
   *   and on a set-selection loss it can win, because it keeps the extremes that
   *   the posterior mean shrinks away.
   *
   * - `top3-probability` — rank by P(bucket is in the TRUE top 3) under the
   *   exact posterior. This is the Bayes rule for expected overlap with the true
   *   Top 3, so it is the one to quote as a ceiling; the other two are kept to
   *   show what choosing the functional badly costs.
   * - `top1-probability` — rank by P(bucket is the TRUE #1). The Bayes rule for
   *   the `top1InTop3` bar specifically, and the correct thing to bound that bar
   *   against, since a rule tuned for overlap need not be best at it.
   */
  severityRule?: 'posterior-mean' | 'plug-in' | 'top3-probability' | 'top1-probability';
  /** Posterior samples per sitting for `top3-probability`. */
  posteriorSamples?: number;
  allocation?: CeilingAllocation;
  /** Items per bucket, for the allocation modes that assemble their own form. */
  itemsPerBucket?: number;
  /**
   * How tightly a targeted allocation concentrates on the cut, in leverage
   * units. Small values starve every bucket that is not contesting third place.
   */
  targetingWidth?: number;
  /** Bank the assembled allocations draw from. Required unless `observed`. */
  bank?: readonly SimItem[];
}

export interface Ceiling {
  learners: number;
  allocation: CeilingAllocation;
  precision: number;
  shrinkage: number;
  /** Reproducibility: 2-of-3 agreement between the estimator's two sittings. */
  twoOfThree: number;
  exactTop3: number;
  exactTop2: number;
  sameTop1: number;
  /** Accuracy: the true #1 priority appears in the reported Top 3. */
  trueTop1InTop3: number;
  /** Accuracy: at least 2 of the reported Top 3 are truly top 3. */
  trueTwoOfThree: number;
  /** Mean items the hypothetical instrument spent. */
  meanItems: number;
  /** Mean posterior sd of θ, in logits, the allocation affords per bucket. */
  meanThetaSd: number;
}

/**
 * The structure a cohort's abilities actually have: learners differ from each
 * other, and within a learner buckets differ from their own level.
 *
 * Measured off the records rather than read from the `LearnerModel` that
 * generated them, because the deficit draw makes the realised marginal
 * something other than the model's nominal normal. Handing the oracle the
 * realised structure is the generous choice, and a ceiling should be generous.
 */
export interface PopulationPrior {
  /** Grand mean ability. */
  mean: number;
  /** SD of learner-level ability — how much learners differ from each other. */
  betweenLearnerSd: number;
  /** SD of a bucket around its own learner's level — the signal to be recovered. */
  withinLearnerSd: number;
}

export function measurePrior(records: readonly RetestRecord[]): PopulationPrior {
  const learnerMeans: number[] = [];
  let withinVar = 0;
  let withinCount = 0;
  for (const rec of records) {
    const thetas = Object.values(rec.theta);
    if (thetas.length === 0) continue;
    const m = thetas.reduce((s, x) => s + x, 0) / thetas.length;
    learnerMeans.push(m);
    for (const t of thetas) withinVar += (t - m) ** 2;
    withinCount += thetas.length;
  }
  const grand = learnerMeans.reduce((s, x) => s + x, 0) / Math.max(1, learnerMeans.length);
  const betweenVar =
    learnerMeans.reduce((s, x) => s + (x - grand) ** 2, 0) / Math.max(1, learnerMeans.length);
  return {
    mean: grand,
    betweenLearnerSd: Math.sqrt(Math.max(betweenVar, 1e-6)),
    withinLearnerSd: Math.sqrt(Math.max(withinVar / Math.max(1, withinCount), 1e-6)),
  };
}

// --- The exact oracle -------------------------------------------------------

/**
 * θ grid the exact posterior is evaluated on.
 *
 * ±6 rather than ±4: a learner's deepest deficit can sit past −4, and those are
 * exactly the buckets that decide the Top 3. Clipping the grid there piles the
 * deepest buckets onto the boundary, makes them indistinguishable from one
 * another, and costs the oracle several points of accuracy on the true #1.
 */
const GRID_LO = -6;
const GRID_HI = 6;

/** Widest θ sd worth representing; see the cap in {@link agreementCeiling}. */
const MAX_THETA_SD = 6;
const GRID_STEP = 0.1;
const THETA_GRID: number[] = [];
for (let t = GRID_LO; t <= GRID_HI + 1e-9; t += GRID_STEP) THETA_GRID.push(Number(t.toFixed(4)));

/** Φ(−θ) at each grid point, and the normal density, both hoisted out of the loops. */
const SEVERITY_GRID = THETA_GRID.map((t) => normalCdf(-t));
const normalPdf = (x: number, mean: number, sd: number): number =>
  Math.exp(-0.5 * ((x - mean) / sd) ** 2) / sd;

/**
 * p(θ_b | μ) under the generative model, as a density on the θ grid.
 *
 * The harness does not draw buckets from a single normal: it draws a normal and
 * then subtracts a uniform deficit from a random handful of buckets. The result
 * is a two-component mixture with a long left shoulder, and handing the oracle a
 * single fitted normal instead measurably handicaps it — exactly on the deep
 * buckets that decide the Top 3. Deficits are treated as independent per bucket
 * with the model's expected rate, which the harness's draw-without-replacement
 * makes very slightly conservative.
 */
function conditionalDensity(mu: number, model: LearnerModel, buckets: number): Float64Array {
  const sd = Math.max(model.idiosyncraticSd, 1e-3);
  const expected = model.deficitCountMin + (model.deficitCountSpan - 1) / 2;
  const p = Math.min(1, Math.max(0, expected / Math.max(1, buckets)));
  const lo = model.deficitMin;
  const hi = model.deficitMin + model.deficitSpan;

  const out = new Float64Array(THETA_GRID.length);
  for (let g = 0; g < THETA_GRID.length; g += 1) {
    const t = THETA_GRID[g]!;
    const healthy = normalPdf(t, mu, sd);
    const deficient =
      model.deficitSpan <= 1e-9
        ? normalPdf(t, mu - lo, sd)
        : (normalCdf((t - mu + hi) / sd) - normalCdf((t - mu + lo) / sd)) / (hi - lo);
    out[g] = (1 - p) * healthy + p * deficient;
  }
  return out;
}

/** 3PL probability of a correct response. Mirrors the harness's response model. */
const respondProbability = (theta: number, item: SimItem, guessing = 0.25): number =>
  guessing +
  (1 - guessing) / (1 + Math.exp(-item.trueDiscrimination * (theta - item.trueDifficulty)));

/**
 * Exact per-bucket log-likelihood of one sitting's responses, over the θ grid.
 *
 * The responses are the ones the learner actually gave; only the reading of them
 * is idealised. The oracle knows each item's TRUE difficulty and discrimination,
 * so it suffers the learner's response noise but none of the engine's
 * calibration error.
 */
function bucketLogLikelihoods(
  served: readonly SimItem[],
  correct: readonly boolean[],
): Map<string, Float64Array> {
  const out = new Map<string, Float64Array>();
  for (let i = 0; i < served.length; i += 1) {
    const item = served[i]!;
    const answered = correct[i] === true;
    let ll = out.get(item.bucketId);
    if (ll === undefined) {
      ll = new Float64Array(THETA_GRID.length);
      out.set(item.bucketId, ll);
    }
    for (let g = 0; g < THETA_GRID.length; g += 1) {
      const pg = respondProbability(THETA_GRID[g]!, item);
      ll[g]! += Math.log(Math.max(answered ? pg : 1 - pg, 1e-12));
    }
  }
  return out;
}

/**
 * Posterior mean severity E[Φ(−θ_b)] per bucket, under the exact hierarchical
 * model the cohort was generated from.
 *
 * Two levels, integrated numerically rather than approximated: the learner's own
 * level μ is unknown and shared across their buckets, and each bucket sits
 * around μ. Both integrals are done on the same grid.
 */
function exactPosteriorSeverity(
  logLik: Map<string, Float64Array>,
  prior: PopulationPrior,
  model: LearnerModel | undefined,
  buckets: number,
  transCache: Map<number, Float64Array[]>,
): Map<string, BucketPosterior> {
  const grid = THETA_GRID;
  const n = grid.length;
  const within = Math.max(prior.withinLearnerSd, 1e-3);
  const between = model === undefined ? Math.max(prior.betweenLearnerSd, 1e-3) : model.globalSd;
  const centre = model === undefined ? prior.mean : model.abilityOffset;

  // p(θ | μ) for every μ on the grid. Identical for every learner in a cell, so
  // it is built once and cached rather than per sitting.
  let trans = transCache.get(buckets);
  if (trans === undefined) {
    trans = grid.map((mu) =>
      model === undefined
        ? Float64Array.from(grid, (t) => normalPdf(t, mu, within))
        : conditionalDensity(mu, model, buckets),
    );
    transCache.set(buckets, trans);
  }

  // Likelihoods normalised out of log space, per bucket.
  const scaled = new Map<string, Float64Array>();
  for (const [bucket, ll] of logLik) {
    let max = -Infinity;
    for (let g = 0; g < n; g += 1) if (ll[g]! > max) max = ll[g]!;
    const lik = new Float64Array(n);
    for (let g = 0; g < n; g += 1) lik[g] = Math.exp(ll[g]! - max);
    scaled.set(bucket, lik);
  }

  // p(μ | all responses) ∝ N(μ; grand mean, between) · Π_b Z_b(μ), where
  // Z_b(μ) = ∫ L_b(θ) p(θ | μ) dθ. The Z_b are kept: each bucket's own posterior
  // needs to divide its own factor back out, and recomputing them would double
  // the cost of the most expensive loop here.
  const keys = [...scaled.keys()];
  const norm = new Map<string, Float64Array>(keys.map((b) => [b, new Float64Array(n)]));
  const muPost = new Float64Array(n);
  let muSum = 0;
  for (let m = 0; m < n; m += 1) {
    let logJoint = Math.log(Math.max(normalPdf(grid[m]!, centre, between), 1e-300));
    const row = trans[m]!;
    for (const b of keys) {
      const lik = scaled.get(b)!;
      let marginal = 0;
      for (let g = 0; g < n; g += 1) marginal += lik[g]! * row[g]!;
      norm.get(b)![m] = Math.max(marginal, 1e-300);
      logJoint += Math.log(Math.max(marginal, 1e-300));
    }
    muPost[m] = logJoint;
  }
  let maxMu = -Infinity;
  for (let m = 0; m < n; m += 1) if (muPost[m]! > maxMu) maxMu = muPost[m]!;
  for (let m = 0; m < n; m += 1) {
    muPost[m] = Math.exp(muPost[m]! - maxMu);
    muSum += muPost[m]!;
  }

  // Only the handful of μ values carrying real mass matter, and the mixture
  // below is the hot loop, so the rest are dropped.
  const live: number[] = [];
  for (let m = 0; m < n; m += 1) if (muPost[m]! / muSum > 1e-6) live.push(m);

  const out = new Map<string, BucketPosterior>();
  const mixed = new Float64Array(n);
  for (const [bucket, lik] of scaled) {
    // p(θ_b | data) ∝ L_b(θ_b) · Σ_μ [p(μ | data) / Z_b(μ)] · p(θ_b | μ).
    //
    // Dividing by this bucket's own Z_b is what stops its responses being
    // counted twice — once in deciding where the learner's level sits, and again
    // in placing the bucket around that level. Leaving it out pulls μ towards
    // whichever bucket is being scored, which undoes most of the pooling and
    // costs the oracle several points of accuracy.
    const z = norm.get(bucket)!;
    mixed.fill(0);
    let vSum = 0;
    for (const m of live) {
      const v = muPost[m]! / muSum / z[m]!;
      vSum += v;
      const row = trans[m]!;
      for (let g = 0; g < n; g += 1) mixed[g]! += v * row[g]!;
    }
    if (vSum <= 0 || !Number.isFinite(vSum)) {
      out.set(bucket, { severity: 0.5, plugIn: 0.5, cdf: new Float64Array(n).fill(1) });
      continue;
    }

    let mass = 0;
    let severity = 0;
    let theta = 0;
    const density = new Float64Array(n);
    for (let g = 0; g < n; g += 1) {
      const w = lik[g]! * mixed[g]!;
      density[g] = w;
      mass += w;
      severity += w * SEVERITY_GRID[g]!;
      theta += w * grid[g]!;
    }
    if (mass <= 0) {
      out.set(bucket, { severity: 0.5, plugIn: 0.5, cdf: new Float64Array(n).fill(1) });
      continue;
    }
    // Normalised running sum, so a sample is one binary search away.
    let acc = 0;
    for (let g = 0; g < n; g += 1) {
      acc += density[g]! / mass;
      density[g] = acc;
    }
    out.set(bucket, {
      severity: severity / mass,
      plugIn: normalCdf(-(theta / mass)),
      cdf: density,
    });
  }
  return out;
}

interface BucketPosterior {
  /** E[Φ(−θ)] under the posterior. */
  severity: number;
  /** Φ(−E[θ]) — the functional the production engine uses. */
  plugIn: number;
  /** Cumulative posterior over {@link THETA_GRID}, for sampling. */
  cdf: Float64Array;
}

/** Inverse-CDF sample of θ from a bucket's posterior. */
const sampleTheta = (cdf: Float64Array, u: number): number => {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid]! < u) lo = mid + 1;
    else hi = mid;
  }
  return THETA_GRID[lo]!;
};

/**
 * P(bucket is in the TRUE top 3), estimated from the exact posterior.
 *
 * This is the functional that matters. Reporting the three buckets with the
 * largest such probability maximises the expected number of correctly named
 * priorities, because expected overlap is a sum of per-bucket marginals and the
 * best three-element sum is simply the three largest. Neither posterior-mean
 * severity nor the engine's plug-in has that property, and both lose accuracy
 * to it — which is why the ceiling has to be computed this way rather than by
 * running a "better estimator" and hoping.
 *
 * Buckets are sampled from their marginals rather than jointly. The dependence
 * they retain runs through the learner's shared level μ, which shifts every
 * bucket together and so barely moves a ranking; ignoring it costs a little
 * realism in exchange for making the sampler affordable.
 */
function rankProbabilities(
  posteriors: Map<string, BucketPosterior>,
  unlock: ReadonlyMap<string, { unlockWeight: number }>,
  rng: () => number,
  samples: number,
  /** Count a bucket when it lands in the true top `depth`. 1 gives P(is #1). */
  depth: number,
): Map<string, number> {
  const buckets = [...posteriors.keys()];
  const weight = buckets.map((b) => 1 + (unlock.get(b)?.unlockWeight ?? 0));
  const counts = new Map<string, number>(buckets.map((b) => [b, 0]));
  const scratch: { bucket: string; lev: number }[] = buckets.map((b) => ({ bucket: b, lev: 0 }));

  for (let s = 0; s < samples; s += 1) {
    // Both fields are rewritten because the sort below permutes `scratch`, so
    // slot i no longer holds bucket i once the first sample has been drawn.
    for (let i = 0; i < buckets.length; i += 1) {
      const theta = sampleTheta(posteriors.get(buckets[i]!)!.cdf, rng());
      scratch[i]!.bucket = buckets[i]!;
      scratch[i]!.lev = normalCdf(-theta) * weight[i]!;
    }
    scratch.sort((x, y) => y.lev - x.lev);
    for (let i = 0; i < depth && i < scratch.length; i += 1) {
      counts.set(scratch[i]!.bucket, counts.get(scratch[i]!.bucket)! + 1);
    }
  }
  for (const [b, c] of counts) counts.set(b, c / samples);
  return counts;
}

/** Bank items grouped by bucket, built once per ceiling run rather than per learner. */
const poolsOf = (bank: readonly SimItem[]): Map<string, SimItem[]> => {
  const pools = new Map<string, SimItem[]>();
  for (const item of bank) {
    const list = pools.get(item.bucketId);
    if (list === undefined) pools.set(item.bucketId, [item]);
    else list.push(item);
  }
  return pools;
};

/** Fisher information per bucket under each allocation rule. */
function informationFor(
  rec: RetestRecord,
  opts: CeilingOptions,
  allocation: CeilingAllocation,
  pools: Map<string, SimItem[]> | null,
): { info: Map<string, number>; items: number } {
  if (allocation === 'observed') {
    return { info: new Map(Object.entries(rec.fisherPerBucket)), items: rec.itemsA };
  }
  if (pools === null) {
    throw new Error(`allocation "${allocation}" needs a bank to assemble items from.`);
  }

  const perBucket = opts.itemsPerBucket ?? 8;
  const buckets = Object.keys(rec.theta).filter((b) => (pools.get(b)?.length ?? 0) > 0);

  // Every bucket starts on an even split. The targeted rule then moves half the
  // budget onto the buckets nearest the cut, which is the most any allocation
  // rule could do with the same items.
  const share = new Map<string, number>(buckets.map((b) => [b, perBucket]));
  if (allocation === 'oracle-targeted') {
    const axisBuckets = indexAxis(opts.axis);
    const lev = new Map(
      buckets.map((b) => [
        b,
        normalCdf(-(rec.theta[b] ?? 0)) * (1 + (axisBuckets.get(b)?.unlockWeight ?? 0)),
      ]),
    );
    const sorted = [...buckets].sort((x, y) => (lev.get(y) ?? 0) - (lev.get(x) ?? 0));
    const boundary = ((lev.get(sorted[2] ?? '') ?? 0) + (lev.get(sorted[3] ?? '') ?? 0)) / 2;
    const width = opts.targetingWidth ?? 0.25;
    const weight = new Map(
      buckets.map((b) => [b, Math.exp(-((((lev.get(b) ?? 0) - boundary) / width) ** 2))]),
    );
    const weightSum = [...weight.values()].reduce((s, w) => s + w, 0) || 1;
    const movable = Math.floor((perBucket * buckets.length) / 2);
    for (const b of buckets) {
      share.set(b, Math.round(perBucket / 2 + (movable * (weight.get(b) ?? 0)) / weightSum));
    }
  }

  const info = new Map<string, number>();
  let items = 0;
  for (const b of buckets) {
    const theta = rec.theta[b] ?? 0;
    const want = share.get(b) ?? 0;
    if (want <= 0) continue;
    // The most informative items the pool holds at this learner's ability — an
    // assembler that cannot see θ could not choose these, so this is generous.
    const best = (pools.get(b) ?? [])
      .map((item) => itemInformation(theta, item))
      .sort((x, y) => y - x)
      .slice(0, want);
    if (best.length === 0) continue;
    info.set(
      b,
      best.reduce((s, x) => s + x, 0),
    );
    items += best.length;
  }
  return { info, items };
}

/**
 * What one hypothetical instrument scores, on reproducibility *and* accuracy.
 *
 * Method. Truth is `leverage(b) = Φ(−θ_b) · (1 + unlock_b)` — the same function
 * the engine reports, so an instrument that knew θ exactly would rank buckets by
 * it exactly. A real instrument cannot, because θ_b is estimated from a handful
 * of binary responses. The information available about θ_b is bounded by the
 * Fisher information the served items carry, so the hypothetical instrument is
 * handed exactly that and no more, as a sufficient statistic:
 *
 *   θ̂_b = θ_b + ε,   ε ~ N(0, precision² / I_b),   independent across sittings,
 *
 * where `I_b` is summed over the items actually served, at their TRUE parameters
 * and the learner's TRUE ability. It is then handed the exact leverage function
 * and asked for its Top 3, twice.
 *
 * The `estimator` choice is the part that matters, and two plausible-looking
 * choices are both wrong:
 *
 * `unbiased` reads θ̂ straight off, and Cramér–Rao makes that the best
 * *unbiased* rule — but unbiasedness is not required and is not optimal here. A
 * learner's buckets are correlated, and the production engine already exploits
 * that, so this "ceiling" is one the shipping code walks straight through.
 *
 * `bayes` fixes the estimator but keeps the asymptotic summary, and that is the
 * subtler error. θ̂ ~ N(θ, 1/I) is the *large-sample* distribution of the MLE.
 * At the four-or-so items per bucket this diagnostic actually affords, 1/I
 * implies a θ sd near 2 logits, while the real posterior from those same four
 * responses is far tighter because the prior carries most of the weight. The
 * summary throws away information the responses genuinely contain, and the
 * engine again beats it.
 *
 * `exact-bayes` is the real bound, and the one to quote. It re-reads *the
 * engine's own responses* — the same items, the same answers, both sittings —
 * and forms the exact posterior on a θ grid under the true two-level population
 * model: the learner's level μ is unknown and shared across their buckets, each
 * bucket sits around μ, and both integrals are done numerically.
 *
 * Re-reading rather than redrawing matters more than it looks. The adaptive
 * selector chose each learner's items in response to that learner's actual
 * answers, so a freshly drawn set of answers is one the form was never adapted
 * to. An oracle given the engine's form but somebody else's luck is handicapped,
 * and in this harness the handicap is large enough that the shipping engine
 * out-scores it — which would make the "bound" useless. Holding the data fixed
 * turns the comparison into what it should be: same evidence, better reader.
 *
 * What the oracle is allowed that the engine is not: perfectly calibrated item
 * difficulty and discrimination, no misspecification, exact knowledge of the
 * leverage weights, and exact knowledge of the population the learner was drawn
 * from. What it is not allowed: any escape from the learner's own response
 * noise, which is the thing that actually limits reproducibility. Its agreement
 * rate is therefore an upper bound on what this item budget can deliver.
 *
 * The rule it ranks by is chosen per bar — see `severityRule`, and note that a
 * rule optimal for one bar is not optimal for the others.
 */
export function agreementCeiling(
  records: readonly RetestRecord[],
  options: CeilingOptions,
): Ceiling {
  const {
    axis,
    replicates = 40,
    seed = 90210,
    precision = 1,
    shrinkage = 0,
    allocation = 'observed',
    estimator = 'unbiased',
    prior = measurePrior(records),
    severityRule = 'posterior-mean',
  } = options;
  const unlock = indexAxis(axis);
  const rng = makeRng(seed);
  const pools = options.bank === undefined ? null : poolsOf(options.bank);
  const transCache = new Map<number, Float64Array[]>();

  let twoOfThree = 0;
  let exact3 = 0;
  let exact2 = 0;
  let same1 = 0;
  let trueTop1Hits = 0;
  let trueTwoOf3Hits = 0;
  let draws = 0;
  let itemSum = 0;
  let sdSum = 0;
  let sdCount = 0;

  const byId =
    options.bank === undefined ? null : new Map(options.bank.map((item) => [item.questionId, item]));
  if (estimator === 'exact-bayes') {
    if (byId === null) throw new Error('the exact-bayes ceiling needs the bank the cohort ran on.');
    if (allocation !== 'observed') {
      throw new Error('the exact-bayes ceiling scores the items actually served.');
    }
  }

  for (const rec of records) {
    const { info, items } = informationFor(rec, options, allocation, pools);
    itemSum += items;
    const buckets = [...info.keys()];
    if (buckets.length === 0) continue;
    const sd = new Map(
      buckets.map((b) => {
        // Capped because a bucket with almost no information implies a θ sd of
        // a hundred logits, and Φ then saturates to exactly 0 or 1 for every
        // bucket at once — which silently turns the ranking into whatever order
        // the buckets happen to be listed in. Ability lives within a few logits,
        // so an observation this vague already contributes nothing; the cap
        // removes the arithmetic artefact without changing the statistics.
        const s = Math.min(precision / Math.sqrt(Math.max(info.get(b) ?? 0, 1e-9)), MAX_THETA_SD);
        sdSum += s;
        sdCount += 1;
        return [b, s];
      }),
    );

    // Truth restricted to the buckets this allocation actually measured, which
    // is the same restriction the engine works under.
    const truth = trueLeverageOf(rec, axis)
      .filter((t) => info.has(t.bucket))
      .map((t) => t.bucket);
    const trueTop1 = truth[0];
    const trueTop3 = new Set(truth.slice(0, 3));

    // The two sittings' real data. The posterior given a sitting is fixed, so
    // these are computed once and reused across replicates; only the sampler
    // inside the ranking rule varies.
    const sittings =
      estimator === 'exact-bayes'
        ? ([
            [rec.servedA, rec.correctA],
            [rec.servedB, rec.correctB],
          ] as const).map(([ids, correct]) => {
            const items: SimItem[] = [];
            const answers: boolean[] = [];
            ids.forEach((id, i) => {
              const item = byId!.get(id);
              if (item === undefined) return;
              items.push(item);
              answers.push(correct[i] === true);
            });
            return exactPosteriorSeverity(
              bucketLogLikelihoods(items, answers),
              prior,
              options.learnerModel,
              Object.keys(rec.theta).length,
              transCache,
            );
          })
        : [];

    const sit = (which: 0 | 1): string[] => {
      if (estimator === 'exact-bayes') {
        const posteriors = sittings[which]!;
        if (severityRule === 'top3-probability' || severityRule === 'top1-probability') {
          const depth = severityRule === 'top1-probability' ? 1 : 3;
          const probs = rankProbabilities(
            posteriors,
            unlock,
            rng,
            options.posteriorSamples ?? 400,
            depth,
          );
          return [...probs]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 3)
            .map(([bucket]) => bucket);
        }
        return [...posteriors]
          .map(([bucket, s]) => ({
            bucket,
            lev:
              (severityRule === 'plug-in' ? s.plugIn : s.severity) *
              (1 + (unlock.get(bucket)?.unlockWeight ?? 0)),
          }))
          .sort((x, y) => y.lev - x.lev)
          .slice(0, 3)
          .map((x) => x.bucket);
      }

      const drawn = buckets.map((b) => (rec.theta[b] ?? 0) + gauss(rng) * (sd.get(b) ?? 0));
      let scored: { bucket: string; lev: number }[];

      if (estimator === 'bayes') {
        // Normal-normal conjugate update, in two levels. The learner's own
        // level is estimated from every bucket at once, then each bucket is
        // pulled towards it by an amount set by how thinly IT was measured —
        // which is what makes this rule order-changing, and better than any
        // single global shrinkage.
        const s2 = prior.withinLearnerSd ** 2;
        let wSum = 1 / prior.betweenLearnerSd ** 2;
        let wMean = prior.mean / prior.betweenLearnerSd ** 2;
        buckets.forEach((b, i) => {
          const w = 1 / (s2 + (sd.get(b) ?? 0) ** 2);
          wSum += w;
          wMean += w * drawn[i]!;
        });
        const centre = wMean / wSum;
        scored = buckets.map((b, i) => {
          const noise = (sd.get(b) ?? 0) ** 2;
          const post = 1 / (1 / Math.max(noise, 1e-9) + 1 / s2);
          const m = post * (drawn[i]! / Math.max(noise, 1e-9) + centre / s2);
          // E[Φ(−θ)] under the posterior, not Φ(−E[θ]): a bucket the instrument
          // is unsure about reads closer to the middle, exactly as the engine's
          // posterior-mean severity does.
          return {
            bucket: b,
            lev: normalCdf(-m / Math.sqrt(1 + post)) * (1 + (unlock.get(b)?.unlockWeight ?? 0)),
          };
        });
      } else {
        const centre = drawn.reduce((s, x) => s + x, 0) / drawn.length;
        scored = buckets.map((b, i) => ({
          bucket: b,
          lev:
            normalCdf(-(centre + (1 - shrinkage) * (drawn[i]! - centre))) *
            (1 + (unlock.get(b)?.unlockWeight ?? 0)),
        }));
      }

      return scored
        .sort((x, y) => y.lev - x.lev)
        .slice(0, 3)
        .map((x) => x.bucket);
    };

    // The exact oracle re-reads fixed data, so its only randomness is the
    // posterior sampler; the other estimators redraw their whole observation.
    const rounds = estimator === 'exact-bayes' ? Math.max(1, Math.min(replicates, 8)) : replicates;
    for (let r = 0; r < rounds; r += 1) {
      const a = sit(0);
      const b = sit(1);
      draws += 1;
      if (overlap(a, b) >= 2) twoOfThree += 1;
      if (overlap(a, b) === 3) exact3 += 1;
      if (overlap(a.slice(0, 2), b.slice(0, 2)) === 2) exact2 += 1;
      if (a[0] === b[0]) same1 += 1;
      if (trueTop1 !== undefined && a.includes(trueTop1)) trueTop1Hits += 1;
      if (a.filter((x) => trueTop3.has(x)).length >= 2) trueTwoOf3Hits += 1;
    }
  }

  const n = Math.max(1, draws);
  return {
    learners: records.length,
    allocation,
    precision,
    shrinkage: estimator === 'unbiased' ? shrinkage : Number.NaN,
    twoOfThree: twoOfThree / n,
    exactTop3: exact3 / n,
    exactTop2: exact2 / n,
    sameTop1: same1 / n,
    trueTop1InTop3: trueTop1Hits / n,
    trueTwoOfThree: trueTwoOf3Hits / n,
    meanItems: itemSum / Math.max(1, records.length),
    meanThetaSd: sdCount > 0 ? sdSum / sdCount : Number.NaN,
  };
}

/**
 * Agreement against measurement precision, holding the tie structure fixed.
 *
 * Sweeping the multiplier down towards zero drives agreement to 1 by
 * construction — a noiseless instrument always repeats itself — so the useful
 * reading is the *rate*: how much precision buys how much agreement, and
 * therefore how long a test would have to be to reach a given bar.
 */
export function precisionCurve(
  records: readonly RetestRecord[],
  options: CeilingOptions,
  multipliers: readonly number[] = [2, 1.5, 1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1],
): { precision: number; thetaSd: number; twoOfThree: number; trueTwoOfThree: number }[] {
  return multipliers.map((precision) => {
    const c = agreementCeiling(records, { ...options, precision });
    return {
      precision,
      thetaSd: c.meanThetaSd,
      twoOfThree: c.twoOfThree,
      trueTwoOfThree: c.trueTwoOfThree,
    };
  });
}

// --- The accuracy / reproducibility frontier --------------------------------

export interface FrontierPoint {
  shrinkage: number;
  /** Reproducibility. */
  retestTwoOfThree: number;
  /** Accuracy against the truth. */
  trueTop1InTop3: number;
  trueTwoOfThree: number;
}

/**
 * The attainable trade-off between getting the plan right and getting the same
 * plan twice.
 *
 * **This, not a single number, is the answer to "what is the maximum achievable
 * test-retest agreement".** Asked without qualification the question is
 * ill-posed: reproducibility alone is trivially maximised, because an instrument
 * that ignores the responses and always names the same three buckets scores
 * 100%, and one that shrinks its estimates far enough approaches that. The
 * unconstrained ceiling is 1.0 and it is worthless.
 *
 * What is genuinely bounded is agreement *at a given accuracy*. Sweeping
 * `shrinkage` from 0 — the efficient unbiased estimate, most accurate and least
 * reproducible — to 1, where no bucket-to-bucket signal survives and the ranking
 * is the unlock weights alone, traces the whole attainable set for the item
 * budget these learners were actually given. Read it through
 * {@link maxRetestAtAccuracy}.
 */
export function frontier(
  records: readonly RetestRecord[],
  options: CeilingOptions,
  shrinkages: readonly number[] = [0, 0.2, 0.4, 0.55, 0.7, 0.8, 0.9, 0.95, 1],
): FrontierPoint[] {
  return shrinkages.map((shrinkage) => {
    const c = agreementCeiling(records, { ...options, shrinkage });
    return {
      shrinkage,
      retestTwoOfThree: c.twoOfThree,
      trueTop1InTop3: c.trueTop1InTop3,
      trueTwoOfThree: c.trueTwoOfThree,
    };
  });
}

/**
 * Best reproducibility on the frontier that still clears the accuracy bars.
 *
 * Null when no point is accurate enough, which would mean the accuracy bars and
 * the item budget are themselves in conflict.
 */
export function maxRetestAtAccuracy(
  points: readonly FrontierPoint[],
  minTop1InTop3: number,
  minTwoOfThree: number,
): FrontierPoint | null {
  const feasible = points.filter(
    (p) => p.trueTop1InTop3 >= minTop1InTop3 && p.trueTwoOfThree >= minTwoOfThree,
  );
  if (feasible.length === 0) return null;
  return feasible.reduce((best, p) => (p.retestTwoOfThree > best.retestTwoOfThree ? p : best));
}

/**
 * Items per bucket an efficient instrument would need to reach `target`.
 *
 * Information adds across items, so halving the standard error costs four times
 * the items: an answer of "24 per bucket" on a 14-bucket axis means a 336-item
 * diagnostic. Returns null when the target is out of reach within `maxPerBucket`.
 */
export function itemsNeededFor(
  records: readonly RetestRecord[],
  options: CeilingOptions & { bank: readonly SimItem[] },
  target = 0.8,
  maxPerBucket = 64,
): { itemsPerBucket: number; totalItems: number; achieved: number } | null {
  const buckets = Math.max(
    1,
    ...records.map((r) => Object.keys(r.fisherPerBucket).length),
  );
  for (let n = 2; n <= maxPerBucket; n += n < 16 ? 2 : 4) {
    const c = agreementCeiling(records, {
      ...options,
      allocation: 'equal',
      itemsPerBucket: n,
    });
    if (c.twoOfThree >= target) {
      return { itemsPerBucket: n, totalItems: n * buckets, achieved: c.twoOfThree };
    }
  }
  return null;
}

// --- Remedies ---------------------------------------------------------------

export interface RemedyResult {
  label: string;
  /** Share of learners for whom the remedy reports anything at all. */
  coverage: number;
  /** Agreement between the two sittings, among learners it reports on. */
  agreement: number;
  /**
   * The same rate under a permutation null — sitting A of one learner paired
   * with sitting B of another. This is what the report shape scores when it
   * carries no information about the individual, and it is the only fair way to
   * compare shapes (a 5-wide band and a Top 1 have wildly different free
   * agreement) or axes (a 10-bucket axis is handed twice a 14-bucket axis's).
   */
  chance: number;
  /** Agreement rescaled so 0 is the permutation null and 1 is perfect. */
  aboveChance: number;
  /** How many buckets the learner is told to work on, on average. */
  meanReported: number;
  note: string;
}

/** One report shape: how to derive it from a ranking, and when two agree. */
interface ReportShape {
  label: string;
  note: string;
  pick: (ranked: RetestRecord['a']) => string[];
  /** null = the shape declines to report on this learner, who is then excluded. */
  agrees: (a: string[], b: string[]) => boolean | null;
}

const shapes = (separationThreshold: number): ReportShape[] => [
  {
    label: 'Top 3, 2-of-3 agree (current bar)',
    note: 'the shape shipping today',
    pick: (r) => topN(r, 3),
    agrees: (a, b) => overlap(a, b) >= 2,
  },
  {
    label: 'Top 3, identical set',
    note: 'the plan document original; measures tie-break luck',
    pick: (r) => topN(r, 3),
    agrees: (a, b) => overlap(a, b) === 3,
  },
  {
    label: 'Top 2, identical set',
    note: 'strictly stronger than 2-of-3: the whole plan must match',
    pick: (r) => topN(r, 2),
    agrees: (a, b) => overlap(a, b) === 2,
  },
  {
    label: 'Top 2, 1-of-2 agree',
    note: 'half the plan reproduces, against 2-of-3 asking for two thirds',
    pick: (r) => topN(r, 2),
    agrees: (a, b) => overlap(a, b) >= 1,
  },
  {
    label: 'Top 1 only',
    note: 'name one starting area; the strongest signal the instrument holds',
    pick: (r) => topN(r, 1),
    agrees: (a, b) => a[0] !== undefined && a[0] === b[0],
  },
  {
    label: 'Top 3 within the other sitting’s top 5',
    note: 'report three, promise only that they sit in a five-wide band',
    pick: (r) => topN(r, 5),
    agrees: (a, b) => overlap(a.slice(0, 3), b) === 3 && overlap(b.slice(0, 3), a) === 3,
  },
  {
    label: 'Unordered focus band of 5, 4 must match',
    note: 'drop the rank entirely and hand over a band',
    pick: (r) => topN(r, 5),
    agrees: (a, b) => overlap(a, b) >= 4,
  },
  {
    label: `Separation-gated Top 3 (margin ${separationThreshold})`,
    note: 'only name priorities that clearly outrank the 4th; abstain otherwise',
    pick: (ranked) => {
      const out: string[] = [];
      const next = ranked[3]?.[1] ?? 0;
      for (let i = 0; i < Math.min(3, ranked.length); i += 1) {
        if ((ranked[i]?.[1] ?? 0) - next < separationThreshold) break;
        out.push(ranked[i]![0]);
      }
      return out;
    },
    agrees: (a, b) => (a.length < 3 || b.length < 3 ? null : overlap(a, b) >= 2),
  },
];

/**
 * Report shapes that are cheaper to reproduce than an ordered Top 3, scored on
 * the sittings that already happened.
 *
 * None of these need a new simulation: a sitting's full ranked list is recorded,
 * so any report derivable from it can be evaluated after the fact. What each one
 * costs is reported as coverage and list length, because every one of them buys
 * agreement by saying less — and `chance` shows how much of the gain is just
 * that.
 */
export function remedies(
  records: readonly RetestRecord[],
  separationThreshold = 0.15,
  nullSeed = 5150,
): RemedyResult[] {
  // The permutation null: hold each sitting exactly as it was, but pair sitting
  // A of learner i with sitting B of some other learner. Report shape, leverage
  // spread and bucket count all survive; only the fact that the two sittings
  // describe the same person does not.
  const rng = makeRng(nullSeed);
  const shuffled = records.map((_, i) => i);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  // A learner paired with themselves would leak real agreement into the null.
  for (let i = 0; i < shuffled.length; i += 1) {
    if (shuffled[i] === i && shuffled.length > 1) {
      const j = (i + 1) % shuffled.length;
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
  }

  const rate = (shape: ReportShape, partner: (i: number) => RetestRecord) => {
    let reported = 0;
    let agreed = 0;
    let sizeSum = 0;
    for (let i = 0; i < records.length; i += 1) {
      const a = shape.pick(records[i]!.a);
      const b = shape.pick(partner(i).b);
      const verdict = shape.agrees(a, b);
      if (verdict === null) continue;
      reported += 1;
      sizeSum += (a.length + b.length) / 2;
      if (verdict) agreed += 1;
    }
    return {
      reported,
      agreement: reported > 0 ? agreed / reported : Number.NaN,
      meanReported: reported > 0 ? sizeSum / reported : Number.NaN,
    };
  };

  return shapes(separationThreshold).map((shape) => {
    const real = rate(shape, (i) => records[i]!);
    const nul = rate(shape, (i) => records[shuffled[i]!]!);
    return {
      label: shape.label,
      note: shape.note,
      coverage: real.reported / Math.max(1, records.length),
      agreement: real.agreement,
      chance: nul.agreement,
      aboveChance: chanceCorrected(real.agreement, nul.agreement),
      meanReported: real.meanReported,
    };
  });
}
