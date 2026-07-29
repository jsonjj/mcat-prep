import { BKT_CONFIG, bktUpdate, isAtCapabilityCut, PRIOR_PL0, type BktConfig, type BktObservation } from './bkt';
import type { DiagnosticResponse } from './diagnostic';
import { FC_AXIS, axisIds, indexAxis } from './diagnostic-axis';
import { lessonsByFc } from './diagnostic-axis-fc';
import {
  BAYES_DIAGNOSTIC_CONFIG,
  computeBayesResult,
  type BayesDiagnosticConfig,
} from './diagnostic-bayes';
import { MST_140_RECOMMENDED, simulateMstSitting, type MstDesign } from './diagnostic-mst';
import {
  DEFAULT_LEARNER_MODEL,
  buildSimBankFor,
  makeLearnerOn,
  makeRng,
  type CalibrationMode,
  type LearnerModel,
  type SimItem,
} from './diagnostic-simulation';
import { coldStartB, slip } from './irt';
import { lessonSeedsFromDiagnostic, SEED_PRIOR_CAP, SEED_PRIOR_FLOOR } from './mastery-seed';

/**
 * What the diagnostic's mastery seed is worth, measured in the currency it is
 * justified by: items of practice a learner spends before the mastery decision
 * fires, and how often that decision is wrong.
 *
 * The seed write is one of the diagnostic's stated justifications — a finished
 * sitting hands the BKT engine a per-lesson prior instead of the flat 0.2
 * default — and the claim it rests on is that a learner who already knows a
 * lesson reaches the mastery decision sooner. That claim is arithmetic about
 * BKT, not an opinion, and it is checkable.
 *
 * The central quantity is **items-to-mastery-decision**: how many independent
 * attempts pass before `P(L)` crosses `MASTERY_THRESHOLD`. Everything here
 * exists to compare its distribution under the flat prior against the seeded
 * one, on the same learners answering the same items, and to price whatever
 * difference there is against the false-mastery it buys or costs.
 *
 * Two things make the comparison honest and are easy to get wrong:
 *
 *  - **Pairing.** The response stream for a lesson is generated once and both
 *    arms are run over it. Responses do not depend on `P(L)`, so this is exact
 *    rather than an approximation, and it removes the sampling noise that would
 *    otherwise swamp a difference of one item.
 *  - **Coupling.** A prior helps only insofar as it correlates with the truth,
 *    so the seed and the learner's true ability have to come from the same
 *    simulated person. Trials are therefore built by running real MST sittings
 *    through the real seeder, not by drawing priors from the measured band.
 *
 * Nothing here runs at runtime, and nothing here changes product behaviour: the
 * threshold, the seeding formula and the BKT constants are all read, never
 * written. Two generative learner models are offered because the results differ
 * in kind between them — see {@link ResponseModel} — and neither has been
 * fitted to a real learner.
 */

// --- Analytic: what one item of evidence is worth ---------------------------

/**
 * Log-odds a correct answer adds, in nats: `ln((1 - slip) / guess)`.
 *
 * The BKT posterior is a likelihood-ratio update on the odds of mastery, so
 * before the learning nudge this is the entire value of a correct answer. It is
 * also the unit a prior band has to be measured in. A band narrower than one of
 * these carries less than one item's worth of information, and since the thing
 * it is supposed to move is an integer count of items, it will usually move it
 * by nothing at all.
 */
export const correctEvidence = (slipValue: number, guess: number = BKT_CONFIG.guess): number =>
  Math.log((1 - slipValue) / guess);

/**
 * Log-odds an incorrect answer adds, which is negative and much larger in
 * magnitude: `ln(slip / (1 - guess))`.
 *
 * The asymmetry is the whole story of how quickly a seeded prior is forgotten.
 * `slip` is bounded by `MAX_SLIP_SM` = 0.1 and cold-starts well below it, while
 * `1 - guess` is 0.75, so a single miss is worth several correct answers in the
 * other direction and lands every prior in the same narrow place.
 */
export const incorrectEvidence = (slipValue: number, guess: number = BKT_CONFIG.guess): number =>
  Math.log(slipValue / (1 - guess));

/** Slip a fresh practice item carries, cold-started from DOK exactly as production does. */
export const slipForDok = (dokLevel: number): number => slip(coldStartB(dokLevel));

/**
 * Items of all-correct evidence needed to reach the threshold from `prior`.
 *
 * The all-correct path is the best case and therefore the one that bounds what
 * a prior can buy: no prior can do better than shortening an unbroken run.
 */
export function itemsToDecisionAllCorrect(
  prior: number,
  slipValue: number,
  bkt: BktConfig = BKT_CONFIG,
  cap = 64,
): number {
  if (isAtCapabilityCut(prior, bkt)) return 0;
  let pL = prior;
  for (let n = 1; n <= cap; n += 1) {
    pL = bktUpdate(pL, { correct: true, slip: slipValue }, bkt);
    if (isAtCapabilityCut(pL, bkt)) return n;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Lowest prior from which `items` all-correct answers reach the threshold.
 *
 * These boundaries are where a seed can matter and nowhere else: two priors on
 * the same side of every boundary produce the identical decision, however far
 * apart they are. Reading them off is what turns "does the seed help?" from a
 * simulation question into an arithmetic one.
 */
export function decisionBoundaryPrior(
  items: number,
  slipValue: number,
  bkt: BktConfig = BKT_CONFIG,
): number {
  if (itemsToDecisionAllCorrect(1 - 1e-12, slipValue, bkt) > items) return Number.NaN;
  let lo = 0;
  let hi = 1;
  // `itemsToDecisionAllCorrect` is monotone non-increasing in the prior, so the
  // boundary is a single crossing and 60 halvings pin it past double precision.
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (itemsToDecisionAllCorrect(mid, slipValue, bkt) <= items) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Items until the mastery decision fires on a fixed response stream, or null if
 * it never does within the stream. Zero means the prior already cleared the
 * threshold, which only an unbounded prior can do.
 *
 * `minItems` is not a shipped behaviour — it exists so an evidence-dependent
 * threshold can be measured as an option without changing the engine.
 */
export function itemsToDecision(
  prior: number,
  stream: readonly BktObservation[],
  bkt: BktConfig = BKT_CONFIG,
  minItems = 0,
): number | null {
  if (minItems <= 0 && isAtCapabilityCut(prior, bkt)) return 0;
  let pL = prior;
  for (let i = 0; i < stream.length; i += 1) {
    pL = bktUpdate(pL, stream[i]!, bkt);
    if (i + 1 >= minItems && isAtCapabilityCut(pL, bkt)) return i + 1;
  }
  return null;
}

export interface BandCollapse {
  /** Width of the prior band before any practice. */
  before: number;
  /** Width after the shared observations. */
  after: number;
  /** Share of the band that survived, in [0,1]. */
  retained: number;
}

/**
 * How much of a prior band survives a shared run of observations.
 *
 * `bktUpdate` is monotone in `P(L)`, so tracking the two endpoints tracks the
 * whole band. This is the direct measurement of "the first few real attempts
 * overwhelm the seed", which `mastery-seed.ts` asserts as the property that
 * makes an imperfect read safe to act on.
 */
export function bandCollapse(
  low: number,
  high: number,
  observations: readonly BktObservation[],
  bkt: BktConfig = BKT_CONFIG,
): BandCollapse {
  let a = low;
  let b = high;
  for (const obs of observations) {
    a = bktUpdate(a, obs, bkt);
    b = bktUpdate(b, obs, bkt);
  }
  const before = high - low;
  const after = Math.abs(b - a);
  return { before, after, retained: before > 0 ? after / before : 0 };
}

// --- The generative learner --------------------------------------------------

/**
 * Which learner the responses come from. The two answer different questions and
 * disagree about the level (not the ordering) of every accuracy figure, so a
 * result quoted without naming one is not a result.
 *
 * - `graded` — the harness's own learner: a latent ability θ per bucket and 3PL
 *   responses, with truth defined as expected accuracy on the lesson's own item
 *   pool clearing a bar. This is the learner every other diagnostic figure in
 *   this package was measured on, and it is *misspecified* for BKT, which
 *   assumes a two-state learner. Under it "mastery" is a continuum that the
 *   0.95 threshold does not correspond to any particular point of, so read its
 *   false-mastery numbers as sensitive to where the bar is put.
 * - `latent` — BKT's own model: the learner is either mastered or not, answers
 *   at `1 - slip` when mastered and at `guess` when not, and transitions with
 *   probability `learnRate` after each item. BKT is then *correctly specified*,
 *   the 0.95 threshold means literally what it says, and false mastery is
 *   exactly "the decision fired while the learner was not mastered". This is
 *   the model to quote the accuracy trade on; its weakness is that it is the
 *   engine's own assumption, so it cannot expose the engine being wrong about
 *   the shape of learning.
 */
export type ResponseModel = 'graded' | 'latent';

export interface PracticeModel {
  /** Independent attempts a learner spends on one lesson before moving on. */
  cap: number;
  /**
   * Ability at which a learner under the `latent` model is as likely as not to
   * already know a lesson, and the logistic slope around it. Together these are
   * what makes the diagnostic's read informative about the initial state: a
   * bucket the learner is strong on seeds a prior *and* is more likely to be
   * already mastered.
   */
  latentCut: number;
  latentSlope: number;
  /** Guessing floor of a 4-option MCQ. Shared by both response models. */
  guessing: number;
}

/**
 * Defaults. `cap` is a per-lesson practice budget rather than a measured
 * quantity: it decides how much of the distribution is censored, and it is the
 * one parameter here that a false-mastery rate is strongly sensitive to, since
 * a long enough stream lets any learner stumble into a lucky run.
 */
export const DEFAULT_PRACTICE_MODEL: PracticeModel = {
  cap: 20,
  latentCut: 0.5,
  latentSlope: 1,
  guessing: BKT_CONFIG.guess,
};

/**
 * Expected accuracy over a lesson's own item pool that counts as mastery under
 * the `graded` model. 0.85 is the mastery cut `irt.ts` names when it anchors
 * slip ("the 85% rule"); it is a convention, not a measurement.
 *
 * A scoring parameter rather than part of {@link PracticeModel}, because trials
 * carry the accuracy itself and the bar can therefore be swept without
 * re-running any sittings — which matters, since every `graded` false-mastery
 * rate is sensitive to where it is put.
 */
export const DEFAULT_MASTERY_BAR = 0.85;

/** 3PL probability of a correct response. Mirrors the harness's response model. */
const respond = (theta: number, item: SimItem, guessing: number): number =>
  guessing +
  (1 - guessing) / (1 + Math.exp(-item.trueDiscrimination * (theta - item.trueDifficulty)));

/** Expected accuracy over a whole pool at one ability — the `graded` truth's basis. */
export const poolAccuracy = (
  theta: number,
  pool: readonly SimItem[],
  guessing: number = BKT_CONFIG.guess,
): number =>
  pool.length === 0
    ? Number.NaN
    : pool.reduce((s, item) => s + respond(theta, item, guessing), 0) / pool.length;

/** One lesson of one learner: the seed it received, the truth, and both streams. */
export interface SeedTrial {
  learner: string;
  bucketId: string;
  lessonId: string;
  /** True ability on the bucket the lesson sits under. */
  theta: number;
  /** Prior the shipped seeder actually produced for this lesson. */
  seededPrior: number;
  /** Read confidence after attenuation, as the seeder saw it. */
  seededCertainty: number;
  /** The bucket read the seed came from, kept so an option can reseed from it. */
  gap: number;
  /** Read confidence *before* `attenuateCertainty` divided it across lessons. */
  bucketCertainty: number;
  /** Lessons the bucket read was spread over — the attenuation's divisor. */
  unitsInBucket: number;
  /** BKT slip of each practice item in order, shared by both response models. */
  slips: readonly number[];
  /** `graded` responses. */
  gradedCorrect: readonly boolean[];
  /**
   * Expected accuracy on the lesson's pool at the learner's true ability. The
   * `graded` truth is this against a bar, and the bar is a scoring parameter
   * rather than a trial field so it can be swept without re-running sittings.
   */
  gradedAccuracy: number;
  /** `latent` responses. */
  latentCorrect: readonly boolean[];
  /**
   * `latent` truth: mastery state *before* each item, plus the final state, so
   * index `n` is the state at the moment a decision after `n` items fires.
   */
  latentMasteredBefore: readonly boolean[];
}

export interface TrialOptions {
  learners?: number;
  seed?: number;
  mode?: CalibrationMode;
  learnerModel?: LearnerModel;
  /** Delivery design. Defaults to the form a learner is actually served. */
  design?: MstDesign;
  cfg?: BayesDiagnosticConfig;
  practice?: PracticeModel;
}

/**
 * Build one trial per (learner, lesson) by running the real pipeline end to end:
 * an MST sitting on the served design, scored by the real posterior, seeded by
 * the real seeder, then a practice stream on each seeded lesson.
 *
 * Learner and sitting seeds are `runMstCohortDetailed`'s, so these are the same
 * simulated people the reproducibility bars were measured on.
 */
export function seedTrials(options: TrialOptions = {}): SeedTrial[] {
  const {
    learners = 100,
    seed = 20260725,
    mode = 'misspecified',
    learnerModel = DEFAULT_LEARNER_MODEL,
    design = MST_140_RECOMMENDED,
    cfg = BAYES_DIAGNOSTIC_CONFIG,
    practice = DEFAULT_PRACTICE_MODEL,
  } = options;

  const bank = buildSimBankFor(makeRng(seed), mode, FC_AXIS);
  const byId = new Map(bank.map((item) => [item.questionId, item]));
  const pools = new Map<string, SimItem[]>();
  for (const item of bank) {
    const list = pools.get(item.bucketId);
    if (list === undefined) pools.set(item.bucketId, [item]);
    else list.push(item);
  }
  const sections = indexAxis(FC_AXIS);
  const bucketIds = axisIds(FC_AXIS);
  const lessons = lessonsByFc();
  const accuracyCache = new Map<string, number>();

  const trials: SeedTrial[] = [];
  for (let i = 0; i < learners; i += 1) {
    const learner = makeLearnerOn(bucketIds, `sim-${i}`, makeRng(seed + i * 7919), learnerModel);
    const run = simulateMstSitting(learner, bank, design, FC_AXIS, makeRng(seed + i * 104729), cfg);

    // The seeder consumes a `DiagnosticResult`, which the MST run does not
    // return, so it is recomputed from the items served and the answers given —
    // the same responses, read by the same scorer.
    const responses: DiagnosticResponse[] = run.servedItemIds.map((id, k) => {
      const item = byId.get(id)!;
      return {
        questionId: id,
        cluster: item.cluster,
        section: sections.get(item.bucketId)!.section,
        familyId: id,
        correct: run.servedCorrect[k] === true,
        elapsedMs: 60_000,
        dokLevel: item.dokLevel,
      };
    });
    const result = computeBayesResult(responses, cfg, FC_AXIS);

    const reads = new Map(result.perCluster.map((s) => [s.cluster as string, s]));

    const rng = makeRng(seed + i * 15485863);
    for (const unit of lessonSeedsFromDiagnostic(result, lessons)) {
      const pool = pools.get(unit.bucketId);
      if (pool === undefined || pool.length === 0) continue;
      const read = reads.get(unit.bucketId);
      if (read === undefined) continue;
      const theta = learner.theta[unit.bucketId] ?? 0;

      const items = Array.from(
        { length: practice.cap },
        () => pool[Math.floor(rng() * pool.length)]!,
      );
      const slips = items.map((item) => slipForDok(item.dokLevel));
      const gradedCorrect = items.map((item) => rng() < respond(theta, item, practice.guessing));

      // The `latent` learner: respond from the current state, then transition,
      // which is the order `bktUpdate` assumes (posterior, then nudge).
      let mastered = rng() < 1 / (1 + Math.exp(-practice.latentSlope * (theta - practice.latentCut)));
      const latentMasteredBefore: boolean[] = [];
      const latentCorrect: boolean[] = [];
      for (let k = 0; k < items.length; k += 1) {
        latentMasteredBefore.push(mastered);
        latentCorrect.push(rng() < (mastered ? 1 - slips[k]! : practice.guessing));
        if (!mastered && rng() < BKT_CONFIG.learnRate) mastered = true;
      }
      latentMasteredBefore.push(mastered);

      const key = `${unit.bucketId}:${theta.toFixed(6)}`;
      let accuracy = accuracyCache.get(key);
      if (accuracy === undefined) {
        accuracy = poolAccuracy(theta, pool, practice.guessing);
        accuracyCache.set(key, accuracy);
      }

      trials.push({
        learner: learner.id,
        bucketId: unit.bucketId,
        lessonId: unit.unitId,
        theta,
        seededPrior: unit.prior,
        seededCertainty: unit.certainty,
        gap: read.gap,
        bucketCertainty: read.certainty,
        unitsInBucket: lessons.get(unit.bucketId)?.length ?? 1,
        slips,
        gradedCorrect,
        gradedAccuracy: accuracy,
        latentCorrect,
        latentMasteredBefore,
      });
    }
  }
  return trials;
}

// --- Arms -------------------------------------------------------------------

/**
 * One way of starting a lesson. An arm is a prior *and* the constants it runs
 * under, because several of the options worth pricing — a lower threshold,
 * seeded transition parameters — are not priors at all, and pricing them
 * against the same trials is the only way the comparison stays paired.
 */
export interface Arm {
  label: string;
  prior: (trial: SeedTrial) => number;
  /** BKT constants. Defaults to the shipped ones; an option may vary them. */
  bkt?: (trial: SeedTrial) => BktConfig;
  /** Items of evidence required before the decision may fire at all. */
  minItems?: number;
}

export const FLAT_ARM: Arm = { label: `flat ${PRIOR_PL0} prior`, prior: () => PRIOR_PL0 };
export const SEEDED_ARM: Arm = { label: 'diagnostic-seeded prior', prior: (t) => t.seededPrior };

export interface SeedBounds {
  floor: number;
  cap: number;
  /** False seeds the bucket read undiluted — the coarser-grain option. */
  attenuate: boolean;
}

export const SHIPPED_BOUNDS: SeedBounds = {
  floor: SEED_PRIOR_FLOOR,
  cap: SEED_PRIOR_CAP,
  attenuate: true,
};

/**
 * `seedPriorFromRead` with the bounds and the attenuation as parameters.
 *
 * A deliberate transcription of the shipped formula rather than a call into it,
 * because the shipped one closes over `SEED_PRIOR_FLOOR`/`SEED_PRIOR_CAP` and
 * the whole point of the options below is to vary them. A guard test pins the
 * two equal at the shipped bounds, so the copy cannot quietly drift.
 */
export function reseed(trial: SeedTrial, bounds: SeedBounds = SHIPPED_BOUNDS): number {
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
  const strength = 1 - clamp01(trial.gap);
  const certainty = clamp01(
    bounds.attenuate
      ? trial.bucketCertainty / Math.sqrt(Math.max(1, trial.unitsInBucket))
      : trial.bucketCertainty,
  );
  if (strength < 0.5) {
    const weakness = 1 - strength * 2;
    return Math.max(bounds.floor, PRIOR_PL0 - (PRIOR_PL0 - bounds.floor) * weakness * certainty);
  }
  if (strength > 0.5) {
    const strong = strength * 2 - 1;
    return Math.min(bounds.cap, PRIOR_PL0 + (bounds.cap - PRIOR_PL0) * strong * certainty);
  }
  return PRIOR_PL0;
}

/** An arm that reseeds every trial under different bounds. */
export const reseededArm = (label: string, bounds: SeedBounds): Arm => ({
  label,
  prior: (t) => reseed(t, bounds),
});

/**
 * Whether the learner was in fact mastered at the moment a decision after
 * `items` items fired. Null items means the decision never fired, and the truth
 * is then read at the end of the stream.
 */
const truthAt = (
  trial: SeedTrial,
  which: ResponseModel,
  items: number | null,
  masteryBar: number,
): boolean =>
  which === 'latent'
    ? trial.latentMasteredBefore[items ?? trial.latentMasteredBefore.length - 1] === true
    : trial.gradedAccuracy >= masteryBar;

/**
 * The best a prior confined to the shipped seeding bounds could possibly do:
 * `SEED_PRIOR_CAP` for a learner who is truly mastered, `SEED_PRIOR_FLOOR` for
 * one who is not.
 *
 * This is the like-for-like ceiling on the seed, and the row to read when asking
 * whether a *better diagnostic* would help. It reads the answer, so it is not
 * implementable; that is the point.
 */
export const boundedOracleArm = (which: ResponseModel, masteryBar = DEFAULT_MASTERY_BAR): Arm => ({
  label: 'oracle prior, inside seeding bounds',
  prior: (t) => (truthAt(t, which, 0, masteryBar) ? SEED_PRIOR_CAP : SEED_PRIOR_FLOOR),
});

/**
 * The same oracle with the bounds removed — a prior of 1 for a mastered learner.
 *
 * Degenerate on purpose: it fires the decision before any practice at all, which
 * is what a prior is worth when nothing caps it, and so it separates "the seed
 * carries too little information" from "the seed is not allowed to act on the
 * information it has".
 */
export const unboundedOracleArm = (which: ResponseModel, masteryBar = DEFAULT_MASTERY_BAR): Arm => ({
  label: 'oracle prior, unbounded',
  prior: (t) => (truthAt(t, which, 0, masteryBar) ? 1 : SEED_PRIOR_FLOOR),
});

const observationsOf = (trial: SeedTrial, which: ResponseModel): BktObservation[] => {
  const correct = which === 'latent' ? trial.latentCorrect : trial.gradedCorrect;
  return trial.slips.map((slipValue, k) => ({ correct: correct[k] === true, slip: slipValue }));
};

interface Decision {
  items: number | null;
  masteredAtDecision: boolean;
}

const decisionFor = (
  trial: SeedTrial,
  arm: Arm,
  which: ResponseModel,
  masteryBar: number,
): Decision => {
  const items = itemsToDecision(
    arm.prior(trial),
    observationsOf(trial, which),
    arm.bkt?.(trial) ?? BKT_CONFIG,
    arm.minItems ?? 0,
  );
  return { items, masteredAtDecision: truthAt(trial, which, items, masteryBar) };
};

export interface ArmScore {
  label: string;
  responseModel: ResponseModel;
  trials: number;
  /** `histogram[n]` = trials whose decision fired after exactly `n` items. */
  histogram: readonly number[];
  /** Share of trials where the decision ever fired within the practice cap. */
  fired: number;
  /** Median items among the trials that fired. */
  medianItems: number;
  meanItems: number;
  p90Items: number;
  /** Share of all trials where the decision fired on a learner who was not mastered. */
  falseMastery: number;
  /** Share of all trials where a mastered learner never got the decision. */
  missedMastery: number;
}

const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
};

export function scoreArm(
  trials: readonly SeedTrial[],
  arm: Arm,
  which: ResponseModel,
  masteryBar = DEFAULT_MASTERY_BAR,
): ArmScore {
  const cap = trials[0]?.slips.length ?? 0;
  const histogram = new Array<number>(cap + 1).fill(0);
  const fired: number[] = [];
  let falseMastery = 0;
  let missed = 0;

  for (const trial of trials) {
    const { items, masteredAtDecision } = decisionFor(trial, arm, which, masteryBar);
    if (items === null) {
      if (truthAt(trial, which, null, masteryBar)) missed += 1;
      continue;
    }
    histogram[Math.min(items, cap)] = (histogram[Math.min(items, cap)] ?? 0) + 1;
    fired.push(items);
    if (!masteredAtDecision) falseMastery += 1;
  }

  const n = Math.max(1, trials.length);
  return {
    label: arm.label,
    responseModel: which,
    trials: trials.length,
    histogram,
    fired: fired.length / n,
    medianItems: quantile(fired, 0.5),
    meanItems: fired.length > 0 ? fired.reduce((s, x) => s + x, 0) / fired.length : Number.NaN,
    p90Items: quantile(fired, 0.9),
    falseMastery: falseMastery / n,
    missedMastery: missed / n,
  };
}

export interface ArmDelta {
  baseline: string;
  candidate: string;
  responseModel: ResponseModel;
  trials: number;
  /** Share of trials where the two arms decided after a different number of items. */
  changed: number;
  /** Share where the candidate decided sooner, and where it decided later. */
  faster: number;
  slower: number;
  /**
   * Signed change histogram, keyed by items saved (positive = candidate sooner).
   * Trials where only one arm fired are counted under `firingChanged` instead.
   */
  deltas: Readonly<Record<string, number>>;
  /** Mean items the candidate saved, over trials where both arms fired. */
  meanItemsSaved: number;
  /** Share of trials where one arm fired within the cap and the other did not. */
  firingChanged: number;
  falseMasteryBaseline: number;
  falseMasteryCandidate: number;
}

/**
 * Paired comparison of two arms on the same trials.
 *
 * The pairing is what makes a difference of one item legible: both arms read the
 * identical response stream, so every difference reported here is caused by the
 * arm and by nothing else.
 */
export function compareArms(
  trials: readonly SeedTrial[],
  baseline: Arm,
  candidate: Arm,
  which: ResponseModel,
  masteryBar = DEFAULT_MASTERY_BAR,
): ArmDelta {
  const deltas = new Map<number, number>();
  let changed = 0;
  let faster = 0;
  let slower = 0;
  let firingChanged = 0;
  let savedSum = 0;
  let bothFired = 0;
  let falseBase = 0;
  let falseCand = 0;

  for (const trial of trials) {
    const a = decisionFor(trial, baseline, which, masteryBar);
    const b = decisionFor(trial, candidate, which, masteryBar);
    if (a.items !== null && !a.masteredAtDecision) falseBase += 1;
    if (b.items !== null && !b.masteredAtDecision) falseCand += 1;

    if (a.items === null || b.items === null) {
      if (a.items !== b.items) {
        firingChanged += 1;
        changed += 1;
        if (b.items !== null) faster += 1;
        else slower += 1;
      }
      continue;
    }
    const saved = a.items - b.items;
    bothFired += 1;
    savedSum += saved;
    deltas.set(saved, (deltas.get(saved) ?? 0) + 1);
    if (saved !== 0) changed += 1;
    if (saved > 0) faster += 1;
    if (saved < 0) slower += 1;
  }

  const n = Math.max(1, trials.length);
  return {
    baseline: baseline.label,
    candidate: candidate.label,
    responseModel: which,
    trials: trials.length,
    changed: changed / n,
    faster: faster / n,
    slower: slower / n,
    deltas: Object.fromEntries([...deltas].sort((x, y) => x[0] - y[0]).map(([d, c]) => [String(d), c])),
    meanItemsSaved: bothFired > 0 ? savedSum / bothFired : Number.NaN,
    firingChanged: firingChanged / n,
    falseMasteryBaseline: falseBase / n,
    falseMasteryCandidate: falseCand / n,
  };
}

// --- Does the seed carry any signal at all? ---------------------------------

export interface SeedSignal {
  trials: number;
  /** Share of trials where the learner is truly mastered before any practice. */
  trueRate: number;
  /**
   * Area under the ROC of the seeded prior against that truth: the probability
   * that a truly-mastered lesson was seeded above a truly-unmastered one. 0.5 is
   * no signal, 1.0 is perfect ordering.
   *
   * This is the question that decides how to read the no-op finding. A seed that
   * carries no signal is a broken read; a seed that carries plenty and still
   * changes nothing is a mechanism that cannot act on it, and only the second is
   * fixable by anything other than a better diagnostic.
   */
  auc: number;
  meanPriorMastered: number;
  meanPriorNot: number;
}

/**
 * Mann–Whitney AUC of the seeded prior against the truth, with ties credited a
 * half as usual.
 */
export function seedSignal(
  trials: readonly SeedTrial[],
  which: ResponseModel,
  masteryBar = DEFAULT_MASTERY_BAR,
): SeedSignal {
  const yes: number[] = [];
  const no: number[] = [];
  for (const trial of trials) {
    (truthAt(trial, which, 0, masteryBar) ? yes : no).push(trial.seededPrior);
  }
  const sortedNo = [...no].sort((a, b) => a - b);
  let concordant = 0;
  for (const p of yes) {
    // Count of `no` priors strictly below, plus half the ties.
    let lo = 0;
    let hi = sortedNo.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedNo[mid]! < p) lo = mid + 1;
      else hi = mid;
    }
    const below = lo;
    let ties = 0;
    while (below + ties < sortedNo.length && sortedNo[below + ties] === p) ties += 1;
    concordant += below + ties / 2;
  }
  const pairs = yes.length * no.length;
  const mean = (xs: readonly number[]): number =>
    xs.length === 0 ? Number.NaN : xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    trials: trials.length,
    trueRate: yes.length / Math.max(1, trials.length),
    auc: pairs > 0 ? concordant / pairs : Number.NaN,
    meanPriorMastered: mean(yes),
    meanPriorNot: mean(no),
  };
}

// --- The seed band itself ---------------------------------------------------

export interface SeedBand {
  seeds: number;
  min: number;
  p01: number;
  median: number;
  p99: number;
  max: number;
  /**
   * Width of the band in nats of log-odds, and the same width divided by what
   * one correct answer is worth. The second number is the finding: a band worth
   * less than one item cannot move an integer item count by more than one.
   */
  natsWide: number;
  itemsOfEvidence: number;
  /**
   * Share of seeds strictly below the 3-item boundary. Only these decide
   * differently from the flat default under an all-correct run, and they decide
   * *later*, not sooner.
   */
  belowThreeItemBoundary: number;
  /** Share at or above the boundary that would let two items suffice. */
  atTwoItemBoundary: number;
}

const odds = (p: number): number => p / (1 - p);

/**
 * Summarise the priors a cohort's seeds actually landed on, and price the band
 * in items of evidence.
 *
 * `slipValue` defaults to the middle of the cold-start range, DOK 2. The
 * pricing barely moves across the whole DOK range — see the guard test — because
 * slip is small next to the 0.25 guessing floor.
 */
export function seedBand(
  trials: readonly SeedTrial[],
  slipValue: number = slipForDok(2),
  bkt: BktConfig = BKT_CONFIG,
): SeedBand {
  const priors = trials.map((t) => t.seededPrior);
  const three = decisionBoundaryPrior(3, slipValue, bkt);
  const two = decisionBoundaryPrior(2, slipValue, bkt);
  const lo = priors.length === 0 ? Number.NaN : Math.min(...priors);
  const hi = priors.length === 0 ? Number.NaN : Math.max(...priors);
  const nats = Math.log(odds(hi) / odds(lo));
  return {
    seeds: priors.length,
    min: lo,
    p01: quantile(priors, 0.01),
    median: quantile(priors, 0.5),
    p99: quantile(priors, 0.99),
    max: hi,
    natsWide: nats,
    itemsOfEvidence: nats / correctEvidence(slipValue, bkt.guess),
    belowThreeItemBoundary:
      priors.filter((p) => p < three).length / Math.max(1, priors.length),
    atTwoItemBoundary:
      Number.isNaN(two) ? 0 : priors.filter((p) => p >= two).length / Math.max(1, priors.length),
  };
}
