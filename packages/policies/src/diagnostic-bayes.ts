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
/** Decisiveness (max side mass) at/above which `certainty` saturates to 1. */
const CERTAINTY_SATURATION = 0.9;

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
  for (let i = 0; i < GRID_N; i += 1) if (GRID[i]! < WEAK_TAU) pWeak += dist[i]!;
  // Decisiveness: mass on the committed side (0.5 = undecided, 1 = certain).
  const decisiveness = Math.max(pWeak, 1 - pWeak);
  const certainty = Math.max(0, Math.min(1, (decisiveness - 0.5) / (CERTAINTY_SATURATION - 0.5)));
  return { dist, mean, sd, pWeak, certainty, itemsSeen, correct };
};

/** Fold one cluster's responses into a posterior over θ. */
const posteriorForResponses = (responses: readonly DiagnosticResponse[]): Posterior => {
  const w = [...PRIOR];
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

const posteriorsByCluster = (
  responses: readonly DiagnosticResponse[],
): Map<SkillCluster, Posterior> => {
  const out = new Map<SkillCluster, Posterior>();
  for (const [cluster, list] of groupByCluster(responses)) {
    out.set(cluster, posteriorForResponses(list));
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
  /** Stop early once this share of populated clusters is resolved. */
  stopResolvedShare: number;
  /** Classification thresholds on P(weak). */
  readyMaxPWeak: number;
  weakMinPWeak: number;
}

/**
 * Demo-tuned config. Plan targets are floor 30 / ceiling 60; these are shorter
 * so the adaptive early-stop is visible in a live click-through. Length still
 * varies with response consistency.
 */
export const BAYES_DIAGNOSTIC_CONFIG: BayesDiagnosticConfig = {
  minItems: 16,
  maxItems: 40,
  minItemsPerCluster: 1,
  minCertainty: 0.5,
  stopResolvedShare: 0.7,
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

const planIsSettled = (
  posteriors: Map<SkillCluster, Posterior>,
  populated: ReadonlySet<SkillCluster>,
  cfg: BayesDiagnosticConfig,
): boolean => {
  if (populated.size === 0) return true;
  let resolved = 0;
  for (const cluster of populated) {
    if ((posteriors.get(cluster)?.certainty ?? 0) >= cfg.minCertainty) resolved += 1;
  }
  return resolved / populated.size >= cfg.stopResolvedShare;
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
  if (needFloor.length > 0) {
    const need = new Set(needFloor);
    pool = feasible.filter((c) => need.has(c.cluster));
  } else if (responses.length >= cfg.minItems && planIsSettled(posteriors, populated, cfg)) {
    return { done: true };
  }

  // Pick the maximum-EIG item; EIG depends only on (cluster, dok) so cache it.
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
    // Tiny deterministic jitter breaks ties among equal-EIG items reproducibly.
    const score = eigFor(cand.cluster, cand.dokLevel) + (hash(seed + cand.questionId) / 2 ** 32) * 1e-6;
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
    gap: post.pWeak,
    certainty: post.certainty,
    classification,
    recommendation: recommend(cluster, classification),
    slow: false,
  };
};

/** Internal 0–100 plan confidence (never shown as a number). */
const planConfidence = (
  perCluster: readonly ClusterSignal[],
  priorities: readonly LeveragePriority[],
  cfg: BayesDiagnosticConfig,
): number => {
  const sampled = perCluster.filter((s) => s.itemsSeen > 0).length;
  const resolved = perCluster.filter((s) => s.certainty >= cfg.minCertainty).length;
  const coverage = sampled / SKILL_CLUSTERS.length;
  const resolvedShare = resolved / SKILL_CLUSTERS.length;
  const top = priorities[0]?.leverage ?? 0;
  const third = priorities[2]?.leverage ?? 0;
  const fourth = priorities[3]?.leverage ?? 0;
  const separation = top > 0 ? Math.min(1, (third - fourth) / top + 0.5) : 0.5;
  const score = 100 * (0.45 * coverage + 0.35 * resolvedShare + 0.2 * separation);
  return Math.round(Math.max(0, Math.min(100, score)));
};

/** Compute the diagnostic decision envelope from scored responses (Bayesian). */
export function computeBayesResult(
  responses: readonly DiagnosticResponse[],
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
): DiagnosticResult {
  const posteriors = posteriorsByCluster(responses);
  const empty = summarize([...PRIOR], 0, 0);
  const perCluster = SKILL_CLUSTERS.map((c) =>
    clusterSignal(c, posteriors.get(c) ?? empty, cfg),
  );

  const priorities: LeveragePriority[] = perCluster
    .filter((s) => s.certainty >= 0.45 && s.gap >= 0.5)
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

  const topSet = new Set(topPriorities.map((p) => p.cluster));
  const stillConfirming = perCluster
    .filter(
      (s) =>
        !topSet.has(s.cluster) &&
        s.itemsSeen > 0 &&
        s.gap >= 0.5 &&
        (s.certainty < 0.5 || priorities.some((p) => p.cluster === s.cluster)),
    )
    .map((s) => s.cluster);

  const internalConfidence = planConfidence(perCluster, priorities, cfg);
  const confidenceLabel: ConfidenceLabel =
    internalConfidence >= 82 ? 'High' : internalConfidence >= 65 ? 'Medium' : 'Still building';

  return {
    perCluster,
    topPriorities,
    stillConfirming,
    confidenceLabel,
    internalConfidence,
    itemsScored: responses.length,
  };
}
