import type { SkillCluster } from '@mcat/contracts';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
import {
  UNLOCK_WEIGHT,
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
   * Read confidence in [0,1]. Derived from *decisiveness* — how far the
   * posterior mass has committed to one side of the weakness threshold — rather
   * than raw spread, so a few consistent responses can resolve a cluster (and
   * mixed responses stay unresolved). 0 = a coin flip, 1 = fully committed.
   */
  certainty: number;
  itemsSeen: number;
  correct: number;
}

/** Weakness threshold on the ability scale. θ below this leans "needs work". */
const WEAK_TAU = 0;
/**
 * How close a cluster's leverage must be to the third priority's before it
 * counts as still contending for a Top 3 slot.
 */
const CONTENTION_MARGIN = 0.85;
/** Decisiveness (max side mass) at/above which `certainty` saturates to 1. */
const CERTAINTY_SATURATION = 0.9;

/**
 * Graded weakness at a single ability point: 1 when far below the bar, 0 when
 * far above, crossing 0.5 at the threshold. The 1.702 scaling makes the
 * logistic track the normal CDF, so severity reads on the same scale as the
 * ability prior.
 */
const weaknessAt = (theta: number): number => 1 / (1 + Math.exp(1.702 * (theta - WEAK_TAU)));

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
  // Decisiveness: mass on the committed side (0.5 = undecided, 1 = certain).
  const decisiveness = Math.max(pWeak, 1 - pWeak);
  const certainty = Math.max(0, Math.min(1, (decisiveness - 0.5) / (CERTAINTY_SATURATION - 0.5)));
  return {
    dist,
    mean,
    sd,
    pWeak,
    severity,
    severitySd: Math.sqrt(Math.max(0, severityVar)),
    certainty,
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
): Map<SkillCluster, Posterior> => {
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
  const out = new Map<SkillCluster, Posterior>();
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
  /** Read is "resolved" once certainty reaches this. */
  minCertainty: number;
  /**
   * Stop early only after the reported Top 3 has survived this many additional
   * items unchanged. This is the plan's "Top 3 stops changing" rule.
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
 * ceiling 60. Length varies between the two as the Top 3 settles.
 */
export const BAYES_DIAGNOSTIC_CONFIG: BayesDiagnosticConfig = {
  minItems: 30,
  maxItems: 60,
  minItemsPerCluster: 2,
  minCertainty: 0.5,
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
 * Minimum share of an item's information value retained by a non-contender.
 * Focusing entirely on the Top-3 boundary measurably hurts the rest of the map,
 * so settled clusters keep a substantial share of their pull.
 */
const CONTENTION_FLOOR = 0.4;

/**
 * How much each cluster still matters to the Top-3 decision, in [0,1].
 *
 * A cluster is contested when the distance from its leverage to the cut line is
 * small relative to how far that leverage could still move given the evidence
 * so far. Settled clusters — whether comfortably in the Top 3 or comfortably
 * out — score near zero and stop attracting items.
 */
const contentionByCluster = (
  result: DiagnosticResult,
  posteriors: Map<SkillCluster, Posterior>,
): Map<SkillCluster, number> => {
  const out = new Map<SkillCluster, number>();
  const ranked = [...result.perCluster]
    .filter((s) => s.itemsSeen > 0)
    .map((s) => {
      const unlock = 1 + (UNLOCK_WEIGHT[s.cluster] ?? 0);
      return {
        cluster: s.cluster,
        lev: s.gap * unlock,
        // Same uncertainty measure the confidence score uses, so selection and
        // stopping agree about which clusters are still in doubt.
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

const top3Key = (result: DiagnosticResult): string =>
  result.topPriorities
    .map((p) => p.cluster)
    .sort()
    .join('|');

/**
 * The plan's smart stop: end early once the Top 3 has stopped changing AND each
 * of the three has solid evidence AND the hidden plan-confidence number clears
 * its bar. All three must hold; any one alone stops too eagerly.
 */
const planIsSettled = (
  responses: readonly DiagnosticResponse[],
  current: DiagnosticResult,
  cfg: BayesDiagnosticConfig,
): boolean => {
  if (current.topPriorities.length < 3) return false;
  if (current.internalConfidence < cfg.stopConfidence) return false;

  const byCluster = new Map(current.perCluster.map((s) => [s.cluster, s]));
  for (const p of current.topPriorities) {
    if ((byCluster.get(p.cluster)?.certainty ?? 0) < cfg.minCertainty) return false;
  }

  // Has the plan actually held still? Compare against the Top 3 we would have
  // reported a window ago; if the last several items changed it, keep going.
  const back = responses.length - cfg.stabilityWindow;
  if (back < cfg.minItemsPerCluster) return false;
  const earlier = envelopeFrom(
    posteriorsByCluster(responses.slice(0, back)),
    back,
    cfg,
  );
  return top3Key(earlier) === top3Key(current);
};

/**
 * Select the next item by expected information gain, after guaranteeing a
 * breadth floor across populated clusters. Returns `done` when the plan is
 * settled, the ceiling is hit, or the pool is exhausted.
 */
export function selectNextBayes(
  responses: readonly DiagnosticResponse[],
  candidates: readonly DiagnosticCandidate[],
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  seed = '',
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
  const envelope = envelopeFrom(posteriors, responses.length, cfg);
  if (needFloor.length > 0) {
    const need = new Set(needFloor);
    pool = feasible.filter((c) => need.has(c.cluster));
  } else if (responses.length >= cfg.minItems && planIsSettled(responses, envelope, cfg)) {
    return { done: true };
  }

  // Information is only worth buying where it can still change the plan. Weight
  // each cluster by how close it sits to the Top-3 cut line, measured against
  // how far its own leverage could still move. Clusters that are safely in or
  // safely out are cheap to leave alone; the contest is at the boundary.
  const contention = contentionByCluster(envelope, posteriors);

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
    const weight = CONTENTION_FLOOR + (1 - CONTENTION_FLOOR) * (contention.get(cand.cluster) ?? 1);
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
  if (post.certainty < cfg.minCertainty) return 'unresolved';
  if (post.pWeak >= cfg.weakMinPWeak) return 'likely_weak';
  if (post.pWeak <= cfg.readyMaxPWeak) return 'provisionally_ready';
  return 'unresolved';
};

const recommend = (
  cluster: SkillCluster,
  classification: DiagnosticClassification,
): DiagnosticRecommendation => {
  switch (classification) {
    case 'provisionally_ready':
      return 'CONCISE_INSTRUCTION';
    case 'likely_weak':
      return (UNLOCK_WEIGHT[cluster] ?? 0) >= 0.8
        ? 'PREREQUISITE_SUPPORT_CANDIDATE'
        : 'STANDARD_INSTRUCTION';
    case 'unresolved':
    case 'unsampled':
      return 'DIAGNOSTIC_PROBE';
  }
};

const clusterSignal = (cluster: SkillCluster, post: Posterior, cfg: BayesDiagnosticConfig): ClusterSignal => {
  const classification = classify(post, cfg);
  return {
    cluster,
    section: CLUSTER_INFO[cluster].section,
    itemsSeen: post.itemsSeen,
    correct: post.correct,
    // Never invent weakness from absence: an untouched cluster reads zero gap.
    gap: post.itemsSeen === 0 ? 0 : post.severity,
    certainty: post.certainty,
    classification,
    recommendation: recommend(cluster, classification),
    slow: false,
  };
};

/**
 * Internal 0–100 plan confidence (never shown as a number).
 *
 * This is confidence in the PLAN, not in any individual skill, so it measures
 * the two things that decide whether the reported Top 3 is right: how cleanly
 * the third priority separates from the fourth, and how much evidence sits
 * behind the three we are about to recommend.
 */
const planConfidence = (
  perCluster: readonly ClusterSignal[],
  priorities: readonly LeveragePriority[],
  posteriors: Map<SkillCluster, Posterior>,
): number => {
  const top3 = priorities.slice(0, 3);
  if (top3.length < 3) return 0;

  const byCluster = new Map(perCluster.map((s) => [s.cluster, s]));
  const evidence =
    top3.reduce((s, p) => s + (byCluster.get(p.cluster)?.certainty ?? 0), 0) / top3.length;

  // Decision margin: how sure are we the third priority really outranks the
  // fourth? Measured in units of the two clusters' own leverage uncertainty, so
  // a small gap between two well-measured clusters can still be decisive while
  // a large gap between two barely-sampled ones is not.
  const third = priorities[2];
  const fourth = priorities[3];
  let separation = 1;
  if (third !== undefined && fourth !== undefined) {
    const sd = (p: LeveragePriority): number =>
      (posteriors.get(p.cluster)?.severitySd ?? 0.5) * (1 + (UNLOCK_WEIGHT[p.cluster] ?? 0));
    const noise = Math.sqrt(sd(third) ** 2 + sd(fourth) ** 2);
    const z = noise > 1e-9 ? (third.leverage - fourth.leverage) / noise : 6;
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
  posteriors: Map<SkillCluster, Posterior>,
  itemsScored: number,
  cfg: BayesDiagnosticConfig,
): DiagnosticResult {
  const empty = summarize([...PRIOR], 0, 0);
  const perCluster = SKILL_CLUSTERS.map((c) =>
    clusterSignal(c, posteriors.get(c) ?? empty, cfg),
  );

  // Rank every sampled cluster by expected leverage. The plan asks for three
  // starting priorities, so we always name three when there is evidence to rank
  // them; uncertainty is expressed through `stillConfirming`, not by returning a
  // short list. Unsampled clusters are excluded — we cannot recommend studying
  // something we never looked at.
  const priorities: LeveragePriority[] = perCluster
    .filter((s) => s.itemsSeen > 0)
    .map((s) => ({
      cluster: s.cluster,
      title: CLUSTER_INFO[s.cluster].title,
      leverage: s.gap * (1 + (UNLOCK_WEIGHT[s.cluster] ?? 0)),
      classification: s.classification,
      recommendation: s.recommendation,
    }))
    .sort((a, b) =>
      b.leverage !== a.leverage
        ? b.leverage - a.leverage
        : SKILL_CLUSTERS.indexOf(a.cluster) - SKILL_CLUSTERS.indexOf(b.cluster),
    );
  const topPriorities = priorities.slice(0, 3);

  // A cluster is "still being confirmed" when it missed the cut but is close
  // enough — and unresolved enough — that more evidence could promote it.
  const thirdLeverage = topPriorities[topPriorities.length - 1]?.leverage ?? 0;
  const byCluster = new Map(perCluster.map((s) => [s.cluster, s]));
  const stillConfirming = priorities
    .slice(3)
    .filter((p) => {
      const signal = byCluster.get(p.cluster);
      if (signal === undefined) return false;
      return signal.certainty < cfg.minCertainty && p.leverage >= CONTENTION_MARGIN * thirdLeverage;
    })
    .map((p) => p.cluster);

  const internalConfidence = planConfidence(perCluster, priorities, posteriors);
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

/** Compute the diagnostic decision envelope from scored responses (Bayesian). */
export function computeBayesResult(
  responses: readonly DiagnosticResponse[],
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
): DiagnosticResult {
  return envelopeFrom(posteriorsByCluster(responses), responses.length, cfg);
}
