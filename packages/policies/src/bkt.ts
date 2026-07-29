/**
 * Bayesian Knowledge Tracing — the main mastery engine (mastery-bkt).
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
import type { BktObservationSource } from '@mcat/contracts';
import type { PolicyManifest } from './manifest';

/**
 * Manifest for the whole BKT/IRT/forgetting/CARS mastery engine. Provisional:
 * constants are defaults to be refit from real data; item difficulty is
 * uncalibrated (DOK cold-start) until items accumulate attempts.
 *
 * THE ONLY PLACE THIS ENGINE'S VERSION IS SPELLED. Every ledger record cites it
 * through `activePolicyVersions()`, so the citation is only worth anything if it
 * describes what actually ran — a second copy in a comment or a fixture is a
 * second answer to the same question, and the drift `v2` exists to close was
 * exactly that. `tests/architecture/policy-version-single-source.test.ts` keeps
 * it a single copy.
 *
 * `v2` because `669fbcf` changed the engine's behaviour under `v1`: a
 * lesson-exit observation is now discounted through a raised guess
 * (`LESSON_EXIT_GUESS_G`), and `mastered` is no longer `P(L) >= 0.95` alone but
 * that conjoined with an `independent`-tier evidence warrant. Both are visible
 * in the output, so a record stamped `v1` and a record stamped `v2` are not
 * comparable, which is what a version is for.
 */
export const MASTERY_BKT_MANIFEST: PolicyManifest = {
  policyId: 'mastery-bkt',
  version: 'provisional-v2',
  status: 'provisional_active',
  summary:
    'Sole owner of the learner-facing capability estimate: BKT P(L) per unit with IRT difficulty-aware slip; forgetting half-life decay and review-due; 1-hop prerequisite reinforcement; separate CARS IRT ability. Direct observations update exactly two grains (primary KC, primary reasoning operation); lesson views are derived rollups. A lesson-exit observation is discounted through a raised guess, never a capped value. P(L) >= 0.95 is the capability half of mastery; the claim also requires a sufficient warrant from the separate evidence-warrant policy, which owns quality/freshness/gaps. Constants provisional; difficulty uncalibrated.',
};

/** Prior mastery before any data (low = conservative, fail-closed). */
export const PRIOR_PL0 = 0.2;
/** Per-observation learning nudge. */
export const LEARN_RATE_T = 0.15;
/** Guess probability, fixed for 4-option MCQ (difficulty lives in slip, not guess). */
export const GUESS_G = 0.25;
/** Mastered when `P(L) >= 0.95` (Corbett & Anderson). */
export const MASTERY_THRESHOLD = 0.95;

/**
 * Guess for an observation taken at a lesson exit: the same evidence, BELIEVED
 * LESS.
 *
 * `guess` is `P(correct | not mastered)`. `GUESS_G` is the blind-guessing rate
 * of a 4-option item met cold. A lesson-exit check is not met cold: the learner
 * has just been shown the method, on this exact content, and knows which idea
 * is being asked about because the lesson only just taught it. A learner
 * without durable capability can therefore reproduce the just-demonstrated
 * procedure from working memory far more often than one in {4} — and being
 * correct without mastery is exactly what `guess` names. So the honest repair
 * is a higher `guess` on this channel, not a smaller number written on top of
 * the result.
 *
 * `0.5` is chosen so that `LR = (1 - slip) / guess` is exactly HALF the
 * likelihood ratio a correct practice answer carries: one correct lesson exit
 * is worth half a correct practice answer as evidence. `slip` cancels out of
 * that ratio, so the discount is exactly one half at every item difficulty
 * rather than a figure that drifts with the DOK label. Read directly, it says a
 * learner who has not mastered the KC gets a just-taught changed-task exit
 * right about half the time.
 *
 * WHY NOT A CAP ON THE VALUE. Capping `P(L)` for lesson-sourced movement PINS
 * the grain at the cap: the planner then sees permanent unmet learning need and
 * re-teaches material the learner already knows, and decay — which multiplies
 * the stored value — can only ever push a pinned grain down, so the grain can
 * never express genuine mastery again. A raised guess has neither property.
 * `P(L)` still converges to 1 under repeated correct exits; it just takes more
 * of them (5 rather than 3 from the `0.2` prior, measured). There is no
 * ceiling, no maximum delta and no soft cap anywhere on this path, by
 * construction: the only thing that changes is one term inside Bayes' rule.
 */
export const LESSON_EXIT_GUESS_G = 0.5;

/**
 * The guess each observation source is scored with.
 *
 * TOTAL over `BktObservationSource` on purpose: a fourth source fails the build
 * until someone decides how much its evidence is worth, rather than silently
 * inheriting the undiscounted rate. Lesson responses reach BKT only from
 * terminal exit checks (every other binding resolves contextual-only and never
 * qualifies), so the source is a faithful stand-in for "this was a lesson exit"
 * and no second classification is needed to find them.
 */
export const GUESS_BY_OBSERVATION_SOURCE: Readonly<Record<BktObservationSource, number>> = {
  lesson_response: LESSON_EXIT_GUESS_G,
  adaptive_practice: GUESS_G,
  synthetic_study: GUESS_G,
};

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

/**
 * The BKT config one observation source is scored with.
 *
 * `GUESS_BY_OBSERVATION_SOURCE` is authoritative over `cfg.guess`; every other
 * term is the caller's, so the discount composes with a config that varies the
 * prior, the learning rate or the threshold.
 */
export const bktConfigForSource = (
  source: BktObservationSource,
  cfg: BktConfig = BKT_CONFIG,
): BktConfig => {
  const guess = GUESS_BY_OBSERVATION_SOURCE[source];
  return guess === cfg.guess ? cfg : { ...cfg, guess };
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
