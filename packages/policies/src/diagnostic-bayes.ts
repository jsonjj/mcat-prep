import type { SkillCluster } from '@mcat/contracts';
import { CLUSTER_AXIS, axisIds, indexAxis, type AxisBucket, type DiagnosticAxis } from './diagnostic-axis';
import {
  REPORTED_PRIORITY_COUNT,
  UNLOCK_STRENGTH,
  leverageOf,
  type ClusterSignal,
  type ConfidenceLabel,
  type DiagnosticCandidate,
  type DiagnosticClassification,
  type DiagnosticRecommendation,
  type DiagnosticResponse,
  type DiagnosticResult,
  type LeveragePriority,
} from './diagnostic';

/**
 * Stage-1 adaptive diagnostic — a real Bayesian item-response engine.
 *
 * Per the companion measurement spec (01-BAYESIAN-DIAGNOSTIC-DECISION-MODEL),
 * this maintains a posterior over a latent ability θ for each skill cluster,
 * updates it after every scored response with a 3PL-style likelihood, selects
 * the next item by expected information gain (EIG), and stops early once the
 * plan is settled. Output is the same decision envelope the planner consumes.
 *
 * CALIBRATION STATUS — IMPORTANT: the item bank is well-classified but NOT
 * psychometrically calibrated. Item difficulty here is derived from the author
 * DOK label as an UNCALIBRATED prior, and discrimination/guessing are fixed
 * constants. The machinery is genuine; its *accuracy* depends on replacing these
 * priors with empirically calibrated item parameters. Treat results as a
 * provisional starting plan, never as a measured ability.
 */

// --- Reporting axis --------------------------------------------------------
//
// The engine measures over whatever partition it is handed. Every entry point
// takes one and defaults to `CLUSTER_AXIS`, which reproduces the previously
// hard-wired 15-skill-cluster behaviour exactly; the sweep passes others.

/** Per-axis lookup tables. */
interface AxisIndex {
  buckets: readonly AxisBucket[];
  byId: ReadonlyMap<string, AxisBucket>;
  /** Canonical position of each bucket, for the deterministic tie-break. */
  orderOf: ReadonlyMap<string, number>;
}

// `envelopeFrom` runs once per served item (and again per stability check), so
// the per-axis lookup tables are built once per axis rather than per call.
const axisIndexCache = new WeakMap<DiagnosticAxis, AxisIndex>();

const axisIndex = (axis: DiagnosticAxis): AxisIndex => {
  const cached = axisIndexCache.get(axis);
  if (cached !== undefined) return cached;
  const index: AxisIndex = {
    buckets: axis.buckets,
    byId: indexAxis(axis),
    orderOf: new Map(axisIds(axis).map((id, i) => [id, i])),
  };
  axisIndexCache.set(axis, index);
  return index;
};

const unlockOf = (byId: ReadonlyMap<string, AxisBucket>, id: string): number =>
  byId.get(id)?.unlockWeight ?? 0;

/**
 * The result envelope's `cluster` fields are typed `SkillCluster` in
 * `@mcat/contracts`, but a bucket id is any string — an off-cluster axis is a
 * simulation concern that does not justify a contracts migration. This is the
 * single place the two meet.
 */
const asCluster = (bucketId: string): SkillCluster => bucketId as SkillCluster;

// --- Ability grid + priors -------------------------------------------------

const GRID_MIN = -4;
const GRID_MAX = 4;
const GRID_N = 41;
const STEP = (GRID_MAX - GRID_MIN) / (GRID_N - 1);
const GRID: readonly number[] = Array.from(
  { length: GRID_N },
  (_, i) => GRID_MIN + STEP * i,
);

const normalPdf = (x: number, mu: number, sd: number): number =>
  Math.exp(-((x - mu) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));

/** Standard normal CDF (Abramowitz–Stegun erf approximation). */
const normalCdf = (x: number): number => {
  const z = x / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? y : -y));
};

const normalize = (w: readonly number[]): number[] => {
  const sum = w.reduce((s, x) => s + x, 0);
  return sum > 0 ? w.map((x) => x / sum) : w.map(() => 1 / w.length);
};

/** Weakly-informative standard-normal prior on θ (mean 0, sd 1). */
const PRIOR: readonly number[] = normalize(GRID.map((t) => normalPdf(t, 0, 1)));

// --- Item-response model (3PL with fixed, UNCALIBRATED parameters) ---------

/** Fixed discrimination (a). Uncalibrated placeholder pending real item params. */
const DISCRIMINATION = 1.5;
/** Guessing floor (c) for a 4-option MCQ. */
const GUESSING = 0.25;

/** Author DOK → difficulty (b) proxy. NOT a calibrated IRT difficulty. */
const DOK_DIFFICULTY: Readonly<Record<number, number>> = { 1: -1, 2: 0, 3: 1, 4: 1.8 };
const difficultyFor = (dok: number | undefined): number =>
  dok !== undefined && DOK_DIFFICULTY[dok] !== undefined ? DOK_DIFFICULTY[dok]! : 0;

/** P(correct | θ) under the 3PL model. */
const probCorrect = (theta: number, dok: number | undefined): number => {
  const b = difficultyFor(dok);
  const logistic = 1 / (1 + Math.exp(-DISCRIMINATION * (theta - b)));
  return GUESSING + (1 - GUESSING) * logistic;
};

// --- Posterior summaries ---------------------------------------------------

interface Posterior {
  dist: number[];
  mean: number;
  sd: number;
  /** P(θ < τ): probability the learner is below the weakness threshold. */
  pWeak: number;
  /**
   * Graded weakness in [0,1] — the posterior expectation of how far below the
   * bar the learner sits, not merely whether they are.
   *
   * `pWeak` answers "is this cluster weak?" and saturates: once the evidence is
   * clear, θ = -0.1 and θ = -3 both report ~1.0. Prioritisation needs magnitude,
   * so ranking uses this instead.
   */
  severity: number;
  /** Posterior sd of `severity` — how far the ranking read could still move. */
  severitySd: number;
  /**
   * How far the posterior mass has committed to one side of the weakness
   * threshold, in [0,1]. 0 = a coin flip, 1 = fully committed.
   *
   * This answers "is this cluster resolved?", which is what stopping and
   * classification ask, and it saturates by design: past the 0.1–0.9 corridor
   * on `pWeak` the question is settled and there is nothing left to say. It is
   * therefore useless as a trust signal — see `certainty`.
   */
  decisiveness: number;
  /**
   * Read confidence in [0,1]: the share of the prior's uncertainty about this
   * bucket's gap that the evidence has removed. 0 = the responses say nothing
   * the prior did not, 1 = the gap is pinned exactly.
   *
   * Both consumers of this number — the reported uncertainty whisker and the
   * step size a mastery seed is allowed to take — ask how far the *magnitude*
   * could still move, so it is derived from `severitySd`, which is exactly
   * that. Deriving it from `decisiveness` instead pinned 76% of production-shape
   * reads to exactly 1.0 and stopped the channel discriminating at all.
   */
  certainty: number;
  itemsSeen: number;
  correct: number;
}

/** Weakness threshold on the ability scale. θ below this leans "needs work". */
const WEAK_TAU = 0;
/**
 * How close a cluster's leverage must be to the last reported priority's before
 * it counts as still contending for a reported slot.
 */
const CONTENTION_MARGIN = 0.85;
/** Side mass at/above which a read counts as fully decided. */
const DECISIVENESS_SATURATION = 0.9;

/**
 * Graded weakness at a single ability point: 1 when far below the bar, 0 when
 * far above, crossing 0.5 at the threshold. The 1.702 scaling makes the
 * logistic track the normal CDF, so severity reads on the same scale as the
 * ability prior.
 */
const weaknessAt = (theta: number): number => 1 / (1 + Math.exp(1.702 * (theta - WEAK_TAU)));

/**
 * Spread of the gap read under the engine's own prior, before any evidence.
 *
 * This is the scale `certainty` is measured against, and it is derived rather
 * than tuned: it moves with the prior instead of having to be recalibrated
 * whenever the prior does. Under N(0,1) the gap read is close to uniform on
 * [0,1], so it lands near 1/sqrt(12).
 */
const PRIOR_SEVERITY_SD = ((): number => {
  let mean = 0;
  for (let i = 0; i < GRID_N; i += 1) mean += PRIOR[i]! * weaknessAt(GRID[i]!);
  let variance = 0;
  for (let i = 0; i < GRID_N; i += 1) variance += PRIOR[i]! * (weaknessAt(GRID[i]!) - mean) ** 2;
  return Math.sqrt(variance);
})();

/**
 * Reliability of a gap read: the fraction of the prior's variance in it that
 * the responses have removed, clipped to [0,1].
 *
 * Squared because it is a ratio of variances, which is what makes 0 mean "no
 * more informative than the prior" and 1 mean "pinned". The shape matters as
 * much as the scale: posterior spread shrinks roughly as 1/sqrt(items), so a
 * mapping linear in the spread would still bunch every adequately-sampled
 * bucket together near the top, while the variance ratio keeps the last few
 * items' worth of evidence visible. Measured over 3,200 simulated reads at the
 * production shape — 140 items over the ten Foundational Concepts, drawn from
 * the real bank — it runs 0.45 to 0.99 with a median of 0.80 and no mass at
 * either endpoint; `diagnostic-certainty.test.ts` pins that shape.
 */
const certaintyFromSpread = (severitySd: number): number =>
  Math.max(0, Math.min(1, 1 - (severitySd / PRIOR_SEVERITY_SD) ** 2));

const entropy = (dist: readonly number[]): number => {
  let h = 0;
  for (const p of dist) if (p > 0) h -= p * Math.log(p);
  return h;
};

const summarize = (
  dist: number[],
  itemsSeen: number,
  correct: number,
): Posterior => {
  let mean = 0;
  for (let i = 0; i < GRID_N; i += 1) mean += GRID[i]! * dist[i]!;
  let variance = 0;
  for (let i = 0; i < GRID_N; i += 1) variance += (GRID[i]! - mean) ** 2 * dist[i]!;
  const sd = Math.sqrt(Math.max(0, variance));
  let pWeak = 0;
  let severity = 0;
  for (let i = 0; i < GRID_N; i += 1) {
    if (GRID[i]! < WEAK_TAU) pWeak += dist[i]!;
    severity += dist[i]! * weaknessAt(GRID[i]!);
  }
  let severityVar = 0;
  for (let i = 0; i < GRID_N; i += 1) {
    severityVar += dist[i]! * (weaknessAt(GRID[i]!) - severity) ** 2;
  }
  // Mass on the committed side (0.5 = undecided, 1 = certain).
  const sideMass = Math.max(pWeak, 1 - pWeak);
  const severitySd = Math.sqrt(Math.max(0, severityVar));
  return {
    dist,
    mean,
    sd,
    pWeak,
    severity,
    severitySd,
    decisiveness: Math.max(
      0,
      Math.min(1, (sideMass - 0.5) / (DECISIVENESS_SATURATION - 0.5)),
    ),
    certainty: certaintyFromSpread(severitySd),
    itemsSeen,
    correct,
  };
};

/** Fold one cluster's responses into a posterior over θ, starting from `prior`. */
const posteriorForResponses = (
  responses: readonly DiagnosticResponse[],
  prior: readonly number[],
): Posterior => {
  const w = [...prior];
  let correct = 0;
  for (const r of responses) {
    for (let i = 0; i < GRID_N; i += 1) {
      const p = probCorrect(GRID[i]!, r.dokLevel);
      w[i]! *= r.correct ? p : 1 - p;
    }
    if (r.correct) correct += 1;
  }
  return summarize(normalize(w), responses.length, correct);
};

const groupByCluster = (
  responses: readonly DiagnosticResponse[],
): Map<SkillCluster, DiagnosticResponse[]> => {
  const map = new Map<SkillCluster, DiagnosticResponse[]>();
  for (const r of responses) {
    const list = map.get(r.cluster) ?? [];
    list.push(r);
    map.set(r.cluster, list);
  }
  return map;
};

/** Least between-cluster spread we will assume, so pooling can never erase real differences. */
const MIN_POOLING_SPREAD = 0.55;

/**
 * Hierarchical (partially pooled) posteriors — the "hierarchical" half of the
 * Stage-1 hierarchical Bayesian IRT the measurement spec asks for.
 *
 * A learner's clusters are not 15 unrelated abilities: someone strong in one
 * area tends to be stronger across the board. Estimating each cluster in
 * isolation against a fixed N(0,1) prior throws that away and leaves every
 * cluster read at the mercy of its own four items. Instead we estimate the
 * learner's overall level from all responses, then re-fit each cluster against
 * a prior centred there. Thinly-sampled clusters shrink toward the learner's
 * own level rather than toward the population's, which cuts noise without
 * flattening genuine differences.
 *
 * Empirical Bayes: one independent pass to estimate the hyper-parameters, one
 * pooled pass to produce the posteriors actually used.
 */
const posteriorsByCluster = (
  responses: readonly DiagnosticResponse[],
): Map<string, Posterior> => {
  const grouped = [...groupByCluster(responses)];
  if (grouped.length === 0) return new Map();

  const independent = grouped.map(([cluster, list]) => ({
    cluster,
    list,
    post: posteriorForResponses(list, PRIOR),
  }));

  // Learner-level centre: precision-weighted mean of the per-cluster means.
  let wSum = 0;
  let wMean = 0;
  for (const { post } of independent) {
    const w = 1 / Math.max(post.sd ** 2, 1e-6);
    wSum += w;
    wMean += w * post.mean;
  }
  const centre = wSum > 0 ? wMean / wSum : 0;

  // Between-cluster spread by method of moments: observed scatter of the
  // cluster means minus the measurement noise that scatter already contains.
  const meanVar =
    independent.reduce((s, { post }) => s + (post.mean - centre) ** 2, 0) / independent.length;
  const noiseVar =
    independent.reduce((s, { post }) => s + post.sd ** 2, 0) / independent.length;
  const spread = Math.max(MIN_POOLING_SPREAD, Math.sqrt(Math.max(0, meanVar - noiseVar)));

  const pooledPrior = normalize(GRID.map((t) => normalPdf(t, centre, spread)));
  const out = new Map<string, Posterior>();
  for (const { cluster, list } of independent) {
    out.set(cluster, posteriorForResponses(list, pooledPrior));
  }
  return out;
};

/** Expected information gain (reduction in posterior entropy) for one item. */
const expectedInfoGain = (post: Posterior, dok: number | undefined): number => {
  const { dist } = post;
  const pc = dist.reduce((s, p, i) => s + p * probCorrect(GRID[i]!, dok), 0);
  if (pc <= 0 || pc >= 1) return 0;
  const wc = normalize(dist.map((p, i) => p * probCorrect(GRID[i]!, dok)));
  const ww = normalize(dist.map((p, i) => p * (1 - probCorrect(GRID[i]!, dok))));
  return entropy(dist) - (pc * entropy(wc) + (1 - pc) * entropy(ww));
};

// --- Configuration ---------------------------------------------------------

export interface BayesDiagnosticConfig {
  /** Never stop before this many items (breadth guarantee). */
  minItems: number;
  /** Hard ceiling — never exceed. */
  maxItems: number;
  /** Each populated cluster must be sampled at least this many times. */
  minItemsPerCluster: number;
  /**
   * Decisiveness at which a read counts as "resolved", for classification and
   * for the early stop. Deliberately not `ClusterSignal.certainty`: stopping
   * asks whether the cluster has landed on a side of the weakness threshold,
   * not how precisely its magnitude is known.
   */
  minResolution: number;
  /**
   * Stop early only after the reported priorities have survived this many
   * additional items unchanged. This is the plan's "plan stops changing" rule.
   */
  stabilityWindow: number;
  /**
   * Internal 0–100 plan confidence required to stop early. The plan specifies
   * that this hidden number drives the stopping decision.
   */
  stopConfidence: number;
  /** Classification thresholds on P(weak). */
  readyMaxPWeak: number;
  weakMinPWeak: number;
}

/**
 * Plan-conformant config: floor 30 (~2 per cluster so every area is touched),
 * ceiling 60. Length varies between the two as the reported plan settles.
 */
export const BAYES_DIAGNOSTIC_CONFIG: BayesDiagnosticConfig = {
  minItems: 30,
  maxItems: 60,
  minItemsPerCluster: 2,
  minResolution: 0.5,
  stabilityWindow: 8,
  stopConfidence: 70,
  readyMaxPWeak: 0.3,
  weakMinPWeak: 0.7,
};

// Deterministic FNV-1a tie-break (matches the balanced-coverage selector).
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export interface BayesSelection {
  done: boolean;
  questionId?: string;
}

const countByCluster = (
  responses: readonly DiagnosticResponse[],
): Map<SkillCluster, number> => {
  const c = new Map<SkillCluster, number>();
  for (const r of responses) c.set(r.cluster, (c.get(r.cluster) ?? 0) + 1);
  return c;
};

/**
 * How contested each cluster's place in the ranking is, in [0,1].
 *
 * Weighting item selection by this is the one adaptive behaviour in the selector
 * that survived measurement, and it survived against the prediction. An oracle
 * allocator handed the TRUE leverage scores 68.1% against 68.2% for an even
 * split, which says information about a bucket is fungible *to an estimator that
 * already extracts all of it*. This engine is not that estimator: at four to
 * fourteen items a bucket it makes ordering errors an oracle would not, and
 * those errors concentrate where the ranking is close. Against an even split
 * over 24 worlds it is worth 3.5 points of true #1 (92.6% against 89.1%) and 3.6
 * of reported reproducibility (95.5% against 91.9%) on `fc-10` at 140 items, and
 * 5.2 and 6.2 of true 2-of-3 on the 15-cluster axis at 60. The oracle bound is
 * insensitive to allocation, the instrument is not, and the bound cannot see the
 * difference — so "adaptive allocation is worthless" holds only of the bound.
 *
 * The boundary is the third-vs-fourth gap, not the reported cut, and stays there
 * deliberately: the reported names are two, but the seeded mastery priors and
 * the lesson ordering read the whole head of the ranking, and aiming at the
 * reported cut instead measured worse on every accuracy figure (worst-world
 * true #1 80.0% against 87.0%) while stopping 15 items earlier.
 */
export const CONTENTION_FLOOR = 0.4;
const contentionByCluster = (
  result: DiagnosticResult,
  posteriors: Map<string, Posterior>,
  axis: DiagnosticAxis = CLUSTER_AXIS,
): Map<string, number> => {
  const { byId } = axisIndex(axis);
  const out = new Map<string, number>();
  const ranked = [...result.perCluster]
    .filter((s) => s.itemsSeen > 0)
    .map((s) => {
      const unlock = 1 + UNLOCK_STRENGTH * unlockOf(byId, s.cluster);
      return {
        cluster: s.cluster,
        lev: s.gap * unlock,
        sd: (posteriors.get(s.cluster)?.severitySd ?? 0.5) * unlock,
      };
    })
    .sort((a, b) => b.lev - a.lev);
  if (ranked.length === 0) return out;
  const third = ranked[2]?.lev ?? ranked[ranked.length - 1]!.lev;
  const fourth = ranked[3]?.lev ?? third;
  const boundary = (third + fourth) / 2;
  for (const r of ranked) {
    const z = (r.lev - boundary) / Math.max(r.sd, 0.02);
    out.set(r.cluster, Math.exp(-z * z));
  }
  return out;
};

/**
 * {@link contentionByCluster} from responses alone.
 *
 * Exported so a delivery design that fixes a whole block of content at once can
 * aim that block at the same boundary the item-level selector aims each item
 * at. Without it a staged design can only adapt difficulty, and the measured
 * cost of that is most of its deficit — see `diagnostic-mst-sweep.test.ts`.
 */
export function contentionFromResponses(
  responses: readonly DiagnosticResponse[],
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  axis: DiagnosticAxis = CLUSTER_AXIS,
): Map<string, number> {
  const posteriors = posteriorsByCluster(responses);
  const envelope = envelopeFrom(posteriors, responses.length, cfg, axis);
  return contentionByCluster(envelope, posteriors, axis);
}

const reportedKey = (result: DiagnosticResult): string =>
  result.topPriorities
    .map((p) => p.cluster)
    .sort()
    .join('|');

/**
 * The plan's smart stop: end early once the reported priorities have stopped
 * changing AND each of them has solid evidence AND the hidden plan-confidence
 * number clears its bar. All three must hold; any one alone stops too eagerly.
 */
const planIsSettled = (
  responses: readonly DiagnosticResponse[],
  current: DiagnosticResult,
  posteriors: Map<string, Posterior>,
  cfg: BayesDiagnosticConfig,
  axis: DiagnosticAxis = CLUSTER_AXIS,
): boolean => {
  if (current.topPriorities.length < REPORTED_PRIORITY_COUNT) return false;
  if (current.internalConfidence < cfg.stopConfidence) return false;

  for (const p of current.topPriorities) {
    if ((posteriors.get(p.cluster)?.decisiveness ?? 0) < cfg.minResolution) return false;
  }

  // Has the plan actually held still? Compare against the priorities we would
  // have reported a window ago; if the last several items changed them, keep
  // going.
  const back = responses.length - cfg.stabilityWindow;
  if (back < cfg.minItemsPerCluster) return false;
  const earlier = envelopeFrom(
    posteriorsByCluster(responses.slice(0, back)),
    back,
    cfg,
    axis,
  );
  return reportedKey(earlier) === reportedKey(current);
};

/**
 * Select the next item by expected information gain, after guaranteeing a
 * breadth floor across populated clusters. Returns `done` when the plan is
 * settled, the ceiling is hit, or the pool is exhausted.
 *
 * Items are then weighted by {@link contentionByCluster}, so a cluster whose
 * place in the ranking is already settled keeps only the floor share of its
 * information value. That is a real divergence from MST delivery, which serves
 * fixed balanced blocks: side by side on `fc-10` at 140 items over 24 worlds at
 * 250 learners, this selector reaches 88.0% worst-world reported reproducibility
 * against MST's 82.0%, and 86.8% worst-world true #1 against 80.0%. Read the
 * adaptive arm as what the design could deliver, not as what a learner receives.
 */
export function selectNextBayes(
  responses: readonly DiagnosticResponse[],
  candidates: readonly DiagnosticCandidate[],
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  seed = '',
  axis: DiagnosticAxis = CLUSTER_AXIS,
): BayesSelection {
  if (responses.length >= cfg.maxItems) return { done: true };

  const seen = new Set(responses.map((r) => r.questionId));
  const eligible = candidates.filter((c) => c.eligible);
  const feasible = eligible.filter((c) => !seen.has(c.questionId));
  if (feasible.length === 0) return { done: true };

  const populated = new Set(eligible.map((c) => c.cluster));
  const sampled = countByCluster(responses);
  const posteriors = posteriorsByCluster(responses);

  // Breadth floor: any populated cluster still under the floor (and still has
  // an unseen item) must be sampled before we consider stopping.
  const feasibleClusters = new Set(feasible.map((c) => c.cluster));
  const needFloor = [...populated].filter(
    (c) => (sampled.get(c) ?? 0) < cfg.minItemsPerCluster && feasibleClusters.has(c),
  );

  let pool = feasible;
  let contention = new Map<string, number>();
  if (needFloor.length > 0) {
    const need = new Set(needFloor);
    pool = feasible.filter((c) => need.has(c.cluster));
  } else {
    const envelope = envelopeFrom(posteriors, responses.length, cfg, axis);
    if (responses.length >= cfg.minItems && planIsSettled(responses, envelope, posteriors, cfg, axis)) {
      return { done: true };
    }
    contention = contentionByCluster(envelope, posteriors, axis);
  }

  // EIG depends only on (cluster, dok), so cache it.
  const eigCache = new Map<string, number>();
  const eigFor = (cluster: SkillCluster, dok: number | undefined): number => {
    const key = `${cluster}:${dok ?? 'x'}`;
    const cached = eigCache.get(key);
    if (cached !== undefined) return cached;
    const post = posteriors.get(cluster) ?? summarize([...PRIOR], 0, 0);
    const eig = expectedInfoGain(post, dok);
    eigCache.set(key, eig);
    return eig;
  };

  let best: DiagnosticCandidate | null = null;
  let bestScore = -Infinity;
  for (const cand of pool) {
    const weight =
      contention.size > 0
        ? CONTENTION_FLOOR + (1 - CONTENTION_FLOOR) * (contention.get(cand.cluster) ?? 1)
        : 1;
    // Tiny deterministic jitter breaks ties among equal-value items reproducibly.
    const score =
      eigFor(cand.cluster, cand.dokLevel) * weight +
      (hash(seed + cand.questionId) / 2 ** 32) * 1e-6;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best ? { done: false, questionId: best.questionId } : { done: true };
}

// --- Result envelope -------------------------------------------------------

const classify = (post: Posterior, cfg: BayesDiagnosticConfig): DiagnosticClassification => {
  if (post.itemsSeen === 0) return 'unsampled';
  if (post.decisiveness < cfg.minResolution) return 'unresolved';
  if (post.pWeak >= cfg.weakMinPWeak) return 'likely_weak';
  if (post.pWeak <= cfg.readyMaxPWeak) return 'provisionally_ready';
  return 'unresolved';
};

const recommend = (
  bucket: AxisBucket,
  classification: DiagnosticClassification,
): DiagnosticRecommendation => {
  switch (classification) {
    case 'provisionally_ready':
      return 'CONCISE_INSTRUCTION';
    case 'likely_weak':
      return bucket.unlockWeight >= 0.8
        ? 'PREREQUISITE_SUPPORT_CANDIDATE'
        : 'STANDARD_INSTRUCTION';
    case 'unresolved':
    case 'unsampled':
      return 'DIAGNOSTIC_PROBE';
  }
};

const clusterSignal = (bucket: AxisBucket, post: Posterior, cfg: BayesDiagnosticConfig): ClusterSignal => {
  const classification = classify(post, cfg);
  return {
    cluster: asCluster(bucket.id),
    section: bucket.section,
    itemsSeen: post.itemsSeen,
    correct: post.correct,
    // Never invent weakness from absence: an untouched cluster reads zero gap.
    gap: post.itemsSeen === 0 ? 0 : post.severity,
    certainty: post.certainty,
    classification,
    recommendation: recommend(bucket, classification),
    slow: false,
  };
};

/**
 * Internal 0–100 plan confidence (never shown as a number, but it drives the
 * learner-visible word label and the early stop).
 *
 * This is confidence in the PLAN, not in any individual skill, so it measures
 * the two things that decide whether the reported priorities are right: how
 * cleanly the last reported priority separates from the first unreported one,
 * and how much evidence sits behind the ones we are about to recommend.
 *
 * The boundary has to be the one the report actually draws. Deriving it from the
 * 3rd-vs-4th gap while naming two priorities scored the least reproducible
 * boundary in the instrument and then labelled a plan that did not depend on it.
 *
 * Moving it to the reported cut made the badge more cautious rather than less,
 * because the selector aims its items at the 3rd-vs-4th gap and so resolves that
 * boundary best. On `fc-10` at 140 items the labels went 31.9/64.3/3.8 percent
 * "Still building"/"Medium"/"High" to 36.7/60.3/3.0, and the early stop fired on
 * 57.9% of sittings against 64.0%. The badge is now harder to earn and describes
 * the decision it is attached to; "High" is rare enough either way that the bar
 * on its correctness rests on a few percent of runs.
 */
const planConfidence = (
  priorities: readonly LeveragePriority[],
  posteriors: Map<string, Posterior>,
  byId: ReadonlyMap<string, AxisBucket>,
): number => {
  const reported = priorities.slice(0, REPORTED_PRIORITY_COUNT);
  if (reported.length < REPORTED_PRIORITY_COUNT) return 0;

  const evidence =
    reported.reduce((s, p) => s + (posteriors.get(p.cluster)?.decisiveness ?? 0), 0) /
    reported.length;

  // Decision margin: how sure are we the last reported priority really outranks
  // the first one left out? Measured in units of the two clusters' own leverage
  // uncertainty, so a small gap between two well-measured clusters can still be
  // decisive while a large gap between two barely-sampled ones is not.
  const last = priorities[REPORTED_PRIORITY_COUNT - 1];
  const next = priorities[REPORTED_PRIORITY_COUNT];
  let separation = 1;
  if (last !== undefined && next !== undefined) {
    const sd = (p: LeveragePriority): number =>
      (posteriors.get(p.cluster)?.severitySd ?? 0.5) *
      (1 + UNLOCK_STRENGTH * unlockOf(byId, p.cluster));
    const noise = Math.sqrt(sd(last) ** 2 + sd(next) ** 2);
    const z = noise > 1e-9 ? (last.leverage - next.leverage) / noise : 6;
    separation = Math.max(0, Math.min(1, 2 * normalCdf(z) - 1));
  }

  const score = 100 * (0.5 * separation + 0.5 * evidence);
  return Math.round(Math.max(0, Math.min(100, score)));
};

/**
 * Build the decision envelope from already-computed posteriors.
 *
 * Shared by the public result and by the selector's stopping rule, so the test
 * stops on exactly the plan the learner will be shown rather than on a
 * separate internal proxy.
 */
function envelopeFrom(
  posteriors: Map<string, Posterior>,
  itemsScored: number,
  cfg: BayesDiagnosticConfig,
  axis: DiagnosticAxis = CLUSTER_AXIS,
): DiagnosticResult {
  const { buckets, byId, orderOf } = axisIndex(axis);
  const empty = summarize([...PRIOR], 0, 0);
  const signals = buckets.map((bucket) => ({
    bucket,
    signal: clusterSignal(bucket, posteriors.get(bucket.id) ?? empty, cfg),
  }));
  const perCluster = signals.map(({ signal }) => signal);

  // Rank every sampled cluster by expected leverage. We always name
  // `REPORTED_PRIORITY_COUNT` when there is evidence to rank them; uncertainty is
  // expressed through `stillConfirming`, not by returning a short list.
  // Unsampled clusters are excluded — we cannot recommend studying something we
  // never looked at.
  const priorities: LeveragePriority[] = signals
    .filter(({ signal }) => signal.itemsSeen > 0)
    .map(({ bucket, signal }) => ({
      cluster: signal.cluster,
      title: bucket.title,
      leverage: leverageOf(signal.gap, bucket.unlockWeight),
      classification: signal.classification,
      recommendation: signal.recommendation,
    }))
    .sort((a, b) =>
      b.leverage !== a.leverage
        ? b.leverage - a.leverage
        : (orderOf.get(a.cluster) ?? 0) - (orderOf.get(b.cluster) ?? 0),
    );
  const topPriorities = priorities.slice(0, REPORTED_PRIORITY_COUNT);

  // A cluster is "still being confirmed" when it missed the cut but is close
  // enough — and unresolved enough — that more evidence could promote it. Both
  // conditions are load-bearing: a bucket demoted by the reported count alone is
  // well measured, and this list means the opposite of that.
  const cutLeverage = topPriorities[topPriorities.length - 1]?.leverage ?? 0;
  const stillConfirming = priorities
    .slice(REPORTED_PRIORITY_COUNT)
    .filter((p) => {
      const post = posteriors.get(p.cluster);
      if (post === undefined) return false;
      return (
        post.decisiveness < cfg.minResolution && p.leverage >= CONTENTION_MARGIN * cutLeverage
      );
    })
    .map((p) => p.cluster);

  const internalConfidence = planConfidence(priorities, posteriors, byId);
  const confidenceLabel: ConfidenceLabel =
    internalConfidence >= 82 ? 'High' : internalConfidence >= 65 ? 'Medium' : 'Still building';

  return {
    perCluster,
    topPriorities,
    stillConfirming,
    confidenceLabel,
    internalConfidence,
    itemsScored,
  };
}

/**
 * Posterior spread of each sampled bucket's gap read.
 *
 * Exported because `certainty` is calibrated against this quantity's measured
 * distribution rather than against a guess, and that calibration has to stay
 * re-derivable from the shipping code — see `diagnostic-certainty.test.ts`.
 * Nothing at runtime reads it; the envelope reports the mapped value.
 */
export function severitySdByBucket(
  responses: readonly DiagnosticResponse[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [bucket, post] of posteriorsByCluster(responses)) {
    out.set(bucket, post.severitySd);
  }
  return out;
}

/** Compute the diagnostic decision envelope from scored responses (Bayesian). */
export function computeBayesResult(
  responses: readonly DiagnosticResponse[],
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  axis: DiagnosticAxis = CLUSTER_AXIS,
): DiagnosticResult {
  return envelopeFrom(posteriorsByCluster(responses), responses.length, cfg, axis);
}
