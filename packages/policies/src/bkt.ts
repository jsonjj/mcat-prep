/**
 * Bayesian Knowledge Tracing — the main mastery engine (mastery-bkt / provisional-v1).
 *
 * `P(L)` is the probability the learner has mastered a unit. It is updated by the
 * Bayes rule after every *independent* observation (assistance/reveal/retry are
 * filtered out upstream in the authority — see docs/mastery-pipeline.md §4.1), with
 * the item's difficulty entering through the IRT `slip` term (see ./irt.ts).
 *
 * Formulas are implemented exactly as specified in MCAT_MASTERY_PLAN.md §2.4
 * (owner-approved literal), including the learning nudge on both right and wrong.
 * Pure functions only.
 */
import type { PolicyManifest } from './manifest';

/**
 * Manifest for the whole BKT/IRT/forgetting/CARS mastery engine. Provisional:
 * constants are defaults to be refit from real data; item difficulty is
 * uncalibrated (DOK cold-start) until items accumulate attempts.
 */
export const MASTERY_BKT_MANIFEST: PolicyManifest = {
  policyId: 'mastery-bkt',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Sole owner of the learner-facing capability estimate: BKT P(L) per unit with IRT difficulty-aware slip; forgetting half-life decay and review-due; 1-hop prerequisite reinforcement; separate CARS IRT ability. Direct observations update exactly two grains (primary KC, primary reasoning operation); lesson views are derived rollups. Mastered at P(L) >= 0.95. Evidence quality/freshness/gaps belong to the separate evidence-warrant policy. Constants provisional; difficulty uncalibrated.',
};

/** Prior mastery before any data (low = conservative, fail-closed). */
export const PRIOR_PL0 = 0.2;
/** Per-observation learning nudge. */
export const LEARN_RATE_T = 0.15;
/** Guess probability, fixed for 4-option MCQ (difficulty lives in slip, not guess). */
export const GUESS_G = 0.25;
/** Mastered when `P(L) >= 0.95` (Corbett & Anderson). */
export const MASTERY_THRESHOLD = 0.95;

export interface BktConfig {
  priorPL0: number;
  learnRate: number;
  guess: number;
  masteryThreshold: number;
}

export const BKT_CONFIG: BktConfig = {
  priorPL0: PRIOR_PL0,
  learnRate: LEARN_RATE_T,
  guess: GUESS_G,
  masteryThreshold: MASTERY_THRESHOLD,
};

export interface BktObservation {
  correct: boolean;
  /** Difficulty-aware slip for this item (from ./irt.ts `slip`). */
  slip: number;
}

/**
 * One BKT update. Applies the posterior from the observation, then a learning
 * nudge. Returns the new `P(L)` clamped to (0, 1).
 */
export function bktUpdate(pL: number, obs: BktObservation, cfg: BktConfig = BKT_CONFIG): number {
  const g = cfg.guess;
  const s = obs.slip;

  let a: number;
  let b: number;
  if (obs.correct) {
    a = pL * (1 - s);
    b = a + (1 - pL) * g;
  } else {
    a = pL * s;
    b = a + (1 - pL) * (1 - g);
  }
  // Posterior P(mastered | observation). Guard against a zero denominator.
  const posterior = b > 0 ? a / b : pL;

  // Learning nudge: some learning happens from the feedback either way.
  const nudged = posterior + (1 - posterior) * cfg.learnRate;

  return Math.min(1, Math.max(0, nudged));
}

/** Whether a unit's `P(L)` has crossed the mastery threshold. */
export const isMastered = (pL: number, cfg: BktConfig = BKT_CONFIG): boolean =>
  pL >= cfg.masteryThreshold;
