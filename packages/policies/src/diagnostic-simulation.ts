import type { SkillCluster } from '@mcat/contracts';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
import { UNLOCK_WEIGHT, type DiagnosticCandidate, type DiagnosticResponse } from './diagnostic';
import {
  BAYES_DIAGNOSTIC_CONFIG,
  computeBayesResult,
  selectNextBayes,
  type BayesDiagnosticConfig,
} from './diagnostic-bayes';

/**
 * Track-1 validation harness — simulated students with known weak spots.
 *
 * The diagnostic plan requires this before the adaptive engine can be trusted:
 * invent learners whose true ability per cluster we control, let them answer
 * with an IRT response model, run the real selection/stopping/scoring code
 * against them, and measure how often the reported plan recovers the truth.
 *
 * Nothing here is used at runtime. It exists so changes to the engine can be
 * judged against the plan's success bars instead of by eyeballing a click-through.
 */

// --- Deterministic RNG ------------------------------------------------------

/** mulberry32 — small, fast, seedable. Reproducibility matters more than quality. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal. */
const gauss = (rng: () => number): number => {
  const u = Math.max(rng(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

/** Standard normal CDF via an Abramowitz–Stegun erf approximation. */
export const normalCdf = (x: number): number => {
  const z = x / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? y : -y));
};

// --- Item bank --------------------------------------------------------------

export interface SimItem {
  questionId: string;
  cluster: SkillCluster;
  dokLevel: number;
  /** True IRT parameters used to generate responses (may differ from the model's). */
  trueDifficulty: number;
  trueDiscrimination: number;
}

/**
 * Per-cluster DOK 1/2/3 counts measured from the 2,108-item production_candidate
 * corpus. PS1 is genuinely empty in the real bank, so the simulation inherits
 * that hole rather than pretending the cluster is coverable.
 */
export const REAL_BANK_PROFILE: Readonly<Record<SkillCluster, readonly [number, number, number]>> = {
  R1: [24, 33, 6],
  R2: [11, 21, 8],
  R3: [13, 6, 15],
  CP1: [20, 101, 16],
  CP2: [52, 184, 29],
  CP3: [45, 143, 31],
  BB1: [43, 163, 31],
  BB2: [54, 122, 29],
  BB3: [26, 86, 16],
  BB4: [25, 59, 12],
  PS1: [0, 0, 0],
  PS2: [49, 162, 46],
  PS3: [51, 172, 44],
  CA1: [17, 44, 12],
  CA2: [12, 37, 38],
};

/** The model's own DOK→difficulty map, mirrored from diagnostic-bayes. */
const MODEL_DIFFICULTY: Readonly<Record<number, number>> = { 1: -1, 2: 0, 3: 1, 4: 1.8 };

export type CalibrationMode = 'calibrated' | 'misspecified';

/**
 * Build a bank matching the real corpus's cluster × DOK shape.
 *
 * `calibrated` gives every item exactly the parameters the engine assumes, which
 * isolates the algorithm. `misspecified` jitters the true parameters around the
 * assumption, modelling the fact that DOK labels are an invented stand-in for
 * real calibration — this is the honest setting for the current bank.
 */
export function buildSimBank(rng: () => number, mode: CalibrationMode): SimItem[] {
  const items: SimItem[] = [];
  for (const cluster of SKILL_CLUSTERS) {
    const counts = REAL_BANK_PROFILE[cluster];
    for (let dok = 1; dok <= 3; dok += 1) {
      for (let i = 0; i < counts[dok - 1]!; i += 1) {
        const assumed = MODEL_DIFFICULTY[dok]!;
        items.push({
          questionId: `${cluster}-d${dok}-${i}`,
          cluster,
          dokLevel: dok,
          trueDifficulty: mode === 'calibrated' ? assumed : assumed + gauss(rng) * 0.7,
          trueDiscrimination: mode === 'calibrated' ? 1.5 : 0.7 + rng() * 1.4,
        });
      }
    }
  }
  return items;
}

// --- Learners ---------------------------------------------------------------

export interface SimLearner {
  id: string;
  /** True latent ability per cluster. */
  theta: Record<SkillCluster, number>;
  /** Clusters deliberately made deficient — the "known weak spots". */
  deficits: SkillCluster[];
}

/**
 * Correlated abilities plus 2–4 deliberate deficits, per the plan's "realistic
 * archetypes + correlated skills". A shared global term keeps clusters
 * correlated so the cohort isn't 15 independent coin flips.
 */
export function makeLearner(id: string, rng: () => number): SimLearner {
  const global = gauss(rng) * 0.7;
  const theta = {} as Record<SkillCluster, number>;
  for (const c of SKILL_CLUSTERS) theta[c] = global + gauss(rng) * 0.9;

  const nDeficits = 2 + Math.floor(rng() * 3);
  const pool = [...SKILL_CLUSTERS];
  const deficits: SkillCluster[] = [];
  for (let i = 0; i < nDeficits && pool.length > 0; i += 1) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    theta[pick] -= 1.5 + rng() * 0.8;
    deficits.push(pick);
  }
  return { id, theta, deficits };
}

/** Ground-truth leverage ranking, using the same weakness × unlock shape the engine reports. */
export function trueRanking(learner: SimLearner, coverable: ReadonlySet<SkillCluster>): SkillCluster[] {
  return [...coverable]
    .map((c) => ({ c, lev: normalCdf(-learner.theta[c]) * (1 + (UNLOCK_WEIGHT[c] ?? 0)) }))
    .sort((a, b) => (b.lev !== a.lev ? b.lev - a.lev : SKILL_CLUSTERS.indexOf(a.c) - SKILL_CLUSTERS.indexOf(b.c)))
    .map((x) => x.c);
}

// --- One simulated sitting --------------------------------------------------

export interface SimRunOptions {
  /** Probability the learner answers carelessly (uniform random guess). */
  carelessRate?: number;
  /** Extra ability decay applied linearly across the sitting, modelling fatigue. */
  fatigue?: number;
}

export interface SimRun {
  itemsServed: number;
  top3: SkillCluster[];
  confidenceLabel: string;
  internalConfidence: number;
  /** Clusters the engine left unresolved or never sampled. */
  unresolved: number;
}

export function simulateSitting(
  learner: SimLearner,
  bank: readonly SimItem[],
  rng: () => number,
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  opts: SimRunOptions = {},
): SimRun {
  const careless = opts.carelessRate ?? 0;
  const fatigue = opts.fatigue ?? 0;

  const byId = new Map(bank.map((i) => [i.questionId, i]));
  const candidates: DiagnosticCandidate[] = bank.map((i) => ({
    questionId: i.questionId,
    cluster: i.cluster,
    section: CLUSTER_INFO[i.cluster].section,
    familyId: i.questionId,
    format: 'discrete_mcq',
    eligible: true,
    dokLevel: i.dokLevel,
  }));

  const responses: DiagnosticResponse[] = [];
  for (;;) {
    const pick = selectNextBayes(responses, candidates, cfg, learner.id);
    if (pick.done || pick.questionId === undefined) break;
    const item = byId.get(pick.questionId);
    if (item === undefined) break;

    const drift = fatigue * (responses.length / Math.max(1, cfg.maxItems));
    const theta = learner.theta[item.cluster] - drift;
    const logistic = 1 / (1 + Math.exp(-item.trueDiscrimination * (theta - item.trueDifficulty)));
    const p = 0.25 + 0.75 * logistic;
    const correct = rng() < careless ? rng() < 0.25 : rng() < p;

    responses.push({
      questionId: item.questionId,
      cluster: item.cluster,
      section: CLUSTER_INFO[item.cluster].section,
      familyId: item.questionId,
      correct,
      elapsedMs: 60_000,
      dokLevel: item.dokLevel,
    });
  }

  const result = computeBayesResult(responses, cfg);
  return {
    itemsServed: responses.length,
    top3: result.topPriorities.map((p) => p.cluster),
    confidenceLabel: result.confidenceLabel,
    internalConfidence: result.internalConfidence,
    unresolved: result.perCluster.filter(
      (s) => s.classification === 'unresolved' || s.classification === 'unsampled',
    ).length,
  };
}

// --- Cohort metrics ---------------------------------------------------------

export interface CohortMetrics {
  learners: number;
  /** Plan bar: true #1 priority appears in the reported Top 3 ≥ 85%. */
  top1InTop3: number;
  /** Plan bar: at least 2 of the reported Top 3 are truly top-3 ≥ 90%. */
  twoOfThree: number;
  /** Plan bar: median length ≤ 48. */
  medianItems: number;
  /** Plan bar: when the label says High, it's right ≥ 90%. */
  highConfidenceCorrect: number;
  highConfidenceShare: number;
  /**
   * Plan bar: same learner re-sat gives the same Top 3 ≥ 80%. The plan means the
   * same three areas, so this compares them as a set; `testRetestOrdered` is the
   * stricter same-order variant, reported for information only.
   */
  testRetestExact: number;
  testRetestOrdered: number;
  testRetestTwoOf3: number;
  /** Diagnostics beyond the plan's bars. */
  meanItems: number;
  /** Length at the 25th percentile — how short the early stop gets when it fires. */
  p25Items: number;
  shortTop3Rate: number;
  meanUnresolved: number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function runCohort(
  learners: number,
  mode: CalibrationMode,
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  opts: SimRunOptions = {},
  seed = 20260725,
): CohortMetrics {
  const bankRng = makeRng(seed);
  const bank = buildSimBank(bankRng, mode);
  const coverable = new Set(bank.map((i) => i.cluster));

  let top1Hits = 0;
  let twoOf3Hits = 0;
  let highTotal = 0;
  let highHits = 0;
  let retestExact = 0;
  let retestOrdered = 0;
  let retestTwoOf3 = 0;
  let shortTop3 = 0;
  let unresolvedSum = 0;
  const lengths: number[] = [];

  for (let i = 0; i < learners; i += 1) {
    const learner = makeLearner(`sim-${i}`, makeRng(seed + i * 7919));
    const truth = trueRanking(learner, coverable);
    const trueTop3 = new Set(truth.slice(0, 3));
    const trueTop1 = truth[0]!;

    const a = simulateSitting(learner, bank, makeRng(seed + i * 104729), cfg, opts);
    const b = simulateSitting(learner, bank, makeRng(seed + i * 104729 + 1), cfg, opts);

    lengths.push(a.itemsServed);
    unresolvedSum += a.unresolved;
    if (a.top3.length < 3) shortTop3 += 1;

    const hit = a.top3.includes(trueTop1);
    if (hit) top1Hits += 1;
    if (a.top3.filter((c) => trueTop3.has(c)).length >= 2) twoOf3Hits += 1;
    if (a.confidenceLabel === 'High') {
      highTotal += 1;
      if (hit) highHits += 1;
    }
    const sameSet =
      a.top3.length === b.top3.length && a.top3.every((c) => b.top3.includes(c));
    if (sameSet) retestExact += 1;
    if (a.top3.length === b.top3.length && a.top3.every((c, idx) => c === b.top3[idx])) {
      retestOrdered += 1;
    }
    if (a.top3.filter((c) => b.top3.includes(c)).length >= 2) retestTwoOf3 += 1;
  }

  return {
    learners,
    top1InTop3: top1Hits / learners,
    twoOfThree: twoOf3Hits / learners,
    medianItems: median(lengths),
    highConfidenceCorrect: highTotal > 0 ? highHits / highTotal : Number.NaN,
    highConfidenceShare: highTotal / learners,
    testRetestExact: retestExact / learners,
    testRetestOrdered: retestOrdered / learners,
    testRetestTwoOf3: retestTwoOf3 / learners,
    meanItems: lengths.reduce((s, x) => s + x, 0) / learners,
    p25Items: [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length * 0.25)] ?? 0,
    shortTop3Rate: shortTop3 / learners,
    meanUnresolved: unresolvedSum / learners,
  };
}
