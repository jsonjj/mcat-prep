import type { SkillCluster } from '@mcat/contracts';
import { SKILL_CLUSTERS } from '@mcat/contracts';
import { BANK_PROFILES, type BankProfileAxisId } from './data/bank-profiles.generated';
import {
  REPORTED_PRIORITY_COUNT,
  leverageOf,
  type DiagnosticCandidate,
  type DiagnosticResponse,
} from './diagnostic';
import {
  CLUSTER_AXIS,
  FC_AXIS,
  FC_PLUS_AXIS,
  axisIds,
  indexAxis,
  type DiagnosticAxis,
} from './diagnostic-axis';
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
  /**
   * Bucket on the axis under test. Equals `cluster` on the 15-cluster axis, but
   * differs on the Foundational Concept axes, which is why form assembly reads
   * this rather than `cluster`.
   */
  bucketId: string;
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

/**
 * How wrong the engine's assumed item parameters are.
 *
 * - `calibrated` — the engine's assumptions are exactly right. Isolates the
 *   algorithm; an unreachable ceiling, not a forecast.
 * - `misspecified` — parameters jittered *randomly* around the assumption.
 *   Models DOK labels being a noisy stand-in for calibration.
 * - `systematic` — parameters wrong in a *consistent direction* for an
 *   identifiable subpopulation. This is the honest worst case and the one the
 *   other two modes cannot express: random error averages out across a block,
 *   directional error does not.
 */
export type CalibrationMode = 'calibrated' | 'misspecified' | 'systematic';

/** Discrimination the engine assumes for every item. */
const CALIBRATED_DISCRIMINATION = 1.5;

/**
 * Share of DOK1 items carrying near-neighbour distractor lures, from the audit in
 * `docs/design/diagnostic-clean-slate-proposal.md` (~71% of IDENTIFY items). These
 * are genuinely hard items sitting inside a population the labels call easy, so
 * the error has a direction rather than a variance.
 */
const SYSTEMATIC_LURE_SHARE = 0.71;
/** How much harder a lure-bearing item really is than its DOK label implies (logits). */
const SYSTEMATIC_LURE_BIAS = 1.2;

/**
 * The three axes the harness can measure on, keyed by the id their generated
 * bank profile uses. `axis.id` and the profile key are the same string, which is
 * what lets a sweep name an axis and get a matching bank.
 */
export const SWEEP_AXES: Readonly<Record<BankProfileAxisId, DiagnosticAxis>> = {
  'cluster-15': CLUSTER_AXIS,
  'fc-10': FC_AXIS,
  'fc-15': FC_PLUS_AXIS,
};

/**
 * Build a bank matching the real corpus's bucket × DOK shape on a given axis.
 *
 * On `CLUSTER_AXIS` this reproduces {@link REAL_BANK_PROFILE} bucket-for-bucket
 * and consumes RNG in exactly the original order, so `calibrated` and
 * `misspecified` results remain directly comparable to every figure previously
 * reported. Other axes count the same corpus differently — see the header of
 * `data/bank-profiles.generated.ts` — so their totals differ on purpose.
 */
export function buildSimBankFor(
  rng: () => number,
  mode: CalibrationMode,
  axis: DiagnosticAxis = CLUSTER_AXIS,
): SimItem[] {
  const profile = BANK_PROFILES[axis.id as BankProfileAxisId];
  if (profile === undefined) {
    throw new Error(
      `no generated bank profile for axis "${axis.id}"; expected one of ${Object.keys(BANK_PROFILES).join(', ')}.`,
    );
  }
  const items: SimItem[] = [];
  for (const bucketId of axisIds(axis)) {
    const counts = profile[bucketId] ?? [0, 0, 0];
    for (let dok = 1; dok <= 3; dok += 1) {
      for (let i = 0; i < counts[dok - 1]!; i += 1) {
        const assumed = MODEL_DIFFICULTY[dok]!;
        let trueDifficulty: number;
        let trueDiscrimination: number;
        if (mode === 'calibrated') {
          trueDifficulty = assumed;
          trueDiscrimination = CALIBRATED_DISCRIMINATION;
        } else if (mode === 'misspecified') {
          trueDifficulty = assumed + gauss(rng) * 0.7;
          trueDiscrimination = 0.7 + rng() * 1.4;
        } else {
          const carriesLure = dok === 1 && rng() < SYSTEMATIC_LURE_SHARE;
          trueDifficulty = assumed + (carriesLure ? SYSTEMATIC_LURE_BIAS : 0);
          trueDiscrimination = CALIBRATED_DISCRIMINATION;
        }
        items.push({
          questionId: `${bucketId}-d${dok}-${i}`,
          // Bucket ids ride in the `cluster` field all the way through the
          // engine; `asCluster` in diagnostic-bayes documents that boundary.
          cluster: bucketId as SkillCluster,
          bucketId,
          dokLevel: dok,
          trueDifficulty,
          trueDiscrimination,
        });
      }
    }
  }
  return items;
}

/** The 15-skill-cluster bank. Positional form, kept for existing callers. */
export const buildSimBank = (rng: () => number, mode: CalibrationMode): SimItem[] =>
  buildSimBankFor(rng, mode, CLUSTER_AXIS);

// --- Learners ---------------------------------------------------------------

export interface SimLearner {
  id: string;
  /** True latent ability per axis bucket. */
  theta: Record<string, number>;
  /** Buckets deliberately made deficient — the "known weak spots". */
  deficits: string[];
}

/**
 * The generative model for a cohort. **These are assumptions, not measurements** —
 * no real learner data has ever been fitted to them. Every one is a candidate
 * explanation for why a swept result might not survive contact with a real cohort,
 * which is why they are parameters rather than constants.
 */
export interface LearnerModel {
  /**
   * Cohort mean ability, in logits, relative to the difficulty the engine assumes
   * for its items. Zero means the bank is centred on the cohort.
   *
   * This exists because a cut-score design is most likely to fail when the bank is
   * mis-centred, and the harness cannot express that otherwise: `makeLearner`
   * subtracts deficits from a standard-normal base, so the default cohort already
   * measures around −0.38 rather than the N(0,1) that routing cuts assume. Sweeping
   * this is what distinguishes a routing rule that is genuinely robust from one that
   * happens to suit this particular cohort.
   */
  abilityOffset: number;
  /** SD of the shared ability term. Drives how correlated concepts are. */
  globalSd: number;
  /** SD of the per-concept term. */
  idiosyncraticSd: number;
  /** Fewest deliberately weak concepts. */
  deficitCountMin: number;
  /** Number of distinct deficit counts drawn from (min .. min+span-1). */
  deficitCountSpan: number;
  /** Smallest deficit, in logits. */
  deficitMin: number;
  /** Width of the deficit range, in logits. */
  deficitSpan: number;
}

/**
 * Reproduces the original harness exactly. Implied inter-concept correlation is
 * 0.49 / (0.49 + 0.81) ≈ **0.38**, and deficits are a 1.5–2.3 logit hole, which is
 * a large and unambiguous weakness. Both figures are guesses; sweep them.
 */
export const DEFAULT_LEARNER_MODEL: LearnerModel = {
  abilityOffset: 0,
  globalSd: 0.7,
  idiosyncraticSd: 0.9,
  deficitCountMin: 2,
  deficitCountSpan: 3,
  deficitMin: 1.5,
  deficitSpan: 0.8,
};

/** Inter-concept ability correlation implied by a model: g² / (g² + s²). */
export const impliedAbilityCorrelation = (m: LearnerModel): number =>
  m.globalSd ** 2 / (m.globalSd ** 2 + m.idiosyncraticSd ** 2);

/**
 * A learner model with a chosen inter-concept correlation, holding **total ability
 * variance fixed** so that sweeping correlation changes only how alike a learner's
 * concepts are — not how spread out the cohort is. Without holding total variance
 * constant, a correlation sweep silently confounds the two.
 */
export function learnerModelForCorrelation(
  correlation: number,
  base: LearnerModel = DEFAULT_LEARNER_MODEL,
): LearnerModel {
  const totalVariance = base.globalSd ** 2 + base.idiosyncraticSd ** 2;
  const rho = Math.min(0.999, Math.max(0, correlation));
  return {
    ...base,
    globalSd: Math.sqrt(totalVariance * rho),
    idiosyncraticSd: Math.sqrt(totalVariance * (1 - rho)),
  };
}

/** A learner model with a different deficit depth, all else equal. */
export const learnerModelWithDeficit = (
  deficitMin: number,
  deficitSpan: number,
  base: LearnerModel = DEFAULT_LEARNER_MODEL,
): LearnerModel => ({ ...base, deficitMin, deficitSpan });

/** A learner model centred somewhere other than the bank's assumed difficulty. */
export const learnerModelWithOffset = (
  abilityOffset: number,
  base: LearnerModel = DEFAULT_LEARNER_MODEL,
): LearnerModel => ({ ...base, abilityOffset });

/**
 * Cohort mean ability actually realised by a model, measured rather than derived.
 *
 * The deficit draw pulls the mean below `abilityOffset` by an amount that depends
 * on deficit depth and count, so the two knobs interact. Reporting the realised
 * mean alongside sweep results keeps that interaction visible instead of letting
 * an offset sweep quietly double as a deficit sweep.
 */
export function realisedCohortMean(model: LearnerModel, learners = 2000, seed = 4242): number {
  let total = 0;
  let n = 0;
  for (let i = 0; i < learners; i += 1) {
    const l = makeLearner(`probe-${i}`, makeRng(seed + i * 7919), model);
    for (const c of SKILL_CLUSTERS) {
      total += l.theta[c] ?? 0;
      n += 1;
    }
  }
  return total / n;
}

/**
 * Correlated abilities plus deliberate deficits. A shared global term keeps
 * concepts correlated so the cohort isn't 15 independent coin flips.
 *
 * RNG consumption is unchanged from the original, so the default model reproduces
 * previously reported figures exactly.
 */
export function makeLearnerOn(
  bucketIds: readonly string[],
  id: string,
  rng: () => number,
  model: LearnerModel = DEFAULT_LEARNER_MODEL,
): SimLearner {
  const global = model.abilityOffset + gauss(rng) * model.globalSd;
  const theta: Record<string, number> = {};
  for (const b of bucketIds) theta[b] = global + gauss(rng) * model.idiosyncraticSd;

  const nDeficits = model.deficitCountMin + Math.floor(rng() * model.deficitCountSpan);
  const pool = [...bucketIds];
  const deficits: string[] = [];
  for (let i = 0; i < nDeficits && pool.length > 0; i += 1) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    theta[pick]! -= model.deficitMin + rng() * model.deficitSpan;
    deficits.push(pick);
  }
  return { id, theta, deficits };
}

/** A learner on the 15 skill clusters. Positional form, kept for existing callers. */
export const makeLearner = (
  id: string,
  rng: () => number,
  model: LearnerModel = DEFAULT_LEARNER_MODEL,
): SimLearner => makeLearnerOn(SKILL_CLUSTERS, id, rng, model);

/** A bucket's ground-truth leverage — the quantity the reported ranking estimates. */
export interface TrueLeverage {
  bucket: string;
  leverage: number;
}

/**
 * Ground-truth leverage ranking, best first, using the same weakness × unlock
 * shape the engine reports.
 *
 * This shares the engine's leverage *definition* on purpose: "truth" here means
 * the ranking the engine would produce if it knew θ exactly, so the harness
 * measures estimation error rather than disagreement about what to optimise.
 * The consequence is that these figures cannot speak to whether leverage is the
 * right target — only to whether it is recovered.
 */
export function trueLeverages(
  learner: SimLearner,
  axis: DiagnosticAxis,
  coverable: ReadonlySet<string>,
): TrueLeverage[] {
  const order = new Map(axisIds(axis).map((id, i) => [id, i]));
  return axis.buckets
    .filter((b) => coverable.has(b.id))
    .map((b) => ({
      bucket: b.id,
      leverage: leverageOf(normalCdf(-(learner.theta[b.id] ?? 0)), b.unlockWeight),
    }))
    .sort((a, b) =>
      b.leverage !== a.leverage
        ? b.leverage - a.leverage
        : (order.get(a.bucket) ?? 0) - (order.get(b.bucket) ?? 0),
    );
}

/** Ground-truth ranking on the 15-cluster axis. Kept for existing callers. */
export const trueRanking = (
  learner: SimLearner,
  coverable: ReadonlySet<SkillCluster>,
): SkillCluster[] =>
  trueLeverages(learner, CLUSTER_AXIS, coverable).map((x) => x.bucket as SkillCluster);

// --- One simulated sitting --------------------------------------------------

export interface SimRunOptions {
  /** Probability the learner answers carelessly (uniform random guess). */
  carelessRate?: number;
  /** Extra ability decay applied linearly across the sitting, modelling fatigue. */
  fatigue?: number;
}

export interface SimRun {
  itemsServed: number;
  /** The priorities the report actually names — `REPORTED_PRIORITY_COUNT` of them. */
  reported: SkillCluster[];
  confidenceLabel: string;
  internalConfidence: number;
  /** Clusters the engine left unresolved or never sampled. */
  unresolved: number;
  /**
   * Every sampled bucket ranked by reported leverage, best first — the same list
   * `reported` is the head of. Remedies that report fewer, more, or differently
   * grouped priorities are all read off this, so they can be scored without
   * re-running a sitting; the top-3 metrics kept as telemetry come from here
   * rather than from the report, which no longer names three.
   */
  ranked: readonly { bucket: string; leverage: number }[];
  /** Every item served, in order. Lets a caller ask how much two sittings overlap. */
  servedItemIds: readonly string[];
  /** Whether each served item was answered correctly, aligned with the ids above. */
  servedCorrect: readonly boolean[];
}

export function simulateSitting(
  learner: SimLearner,
  bank: readonly SimItem[],
  rng: () => number,
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  opts: SimRunOptions = {},
  axis: DiagnosticAxis = CLUSTER_AXIS,
): SimRun {
  const careless = opts.carelessRate ?? 0;
  const fatigue = opts.fatigue ?? 0;

  const buckets = indexAxis(axis);
  const order = new Map(axisIds(axis).map((id, i) => [id, i]));
  const sectionOf = (bucketId: string): DiagnosticCandidate['section'] => {
    const bucket = buckets.get(bucketId);
    if (bucket === undefined) {
      throw new Error(`bank item in bucket "${bucketId}", which axis "${axis.id}" does not contain.`);
    }
    return bucket.section;
  };

  const byId = new Map(bank.map((i) => [i.questionId, i]));
  const candidates: DiagnosticCandidate[] = bank.map((i) => ({
    questionId: i.questionId,
    cluster: i.bucketId as SkillCluster,
    section: sectionOf(i.bucketId),
    familyId: i.questionId,
    format: 'discrete_mcq',
    eligible: true,
    dokLevel: i.dokLevel,
  }));

  const responses: DiagnosticResponse[] = [];
  for (;;) {
    const pick = selectNextBayes(responses, candidates, cfg, learner.id, axis);
    if (pick.done || pick.questionId === undefined) break;
    const item = byId.get(pick.questionId);
    if (item === undefined) break;

    const drift = fatigue * (responses.length / Math.max(1, cfg.maxItems));
    const theta = (learner.theta[item.bucketId] ?? 0) - drift;
    const logistic = 1 / (1 + Math.exp(-item.trueDiscrimination * (theta - item.trueDifficulty)));
    const p = 0.25 + 0.75 * logistic;
    const correct = rng() < careless ? rng() < 0.25 : rng() < p;

    responses.push({
      questionId: item.questionId,
      cluster: item.bucketId as SkillCluster,
      section: sectionOf(item.bucketId),
      familyId: item.questionId,
      correct,
      elapsedMs: 60_000,
      dokLevel: item.dokLevel,
    });
  }

  const result = computeBayesResult(responses, cfg, axis);
  return {
    itemsServed: responses.length,
    reported: result.topPriorities.map((p) => p.cluster),
    confidenceLabel: result.confidenceLabel,
    internalConfidence: result.internalConfidence,
    unresolved: result.perCluster.filter(
      (s) => s.classification === 'unresolved' || s.classification === 'unsampled',
    ).length,
    // Reproduces `envelopeFrom`'s ordering, tie-break included, so that the head
    // of `ranked` is exactly `reported` rather than merely usually equal, and the
    // top-3 telemetry is the ranking the report was cut from.
    ranked: result.perCluster
      .filter((s) => s.itemsSeen > 0)
      .map((s) => ({
        bucket: s.cluster as string,
        leverage: leverageOf(s.gap, buckets.get(s.cluster)?.unlockWeight ?? 0),
      }))
      .sort((a, b) =>
        b.leverage !== a.leverage
          ? b.leverage - a.leverage
          : (order.get(a.bucket) ?? 0) - (order.get(b.bucket) ?? 0),
      ),
    servedItemIds: responses.map((r) => r.questionId),
    servedCorrect: responses.map((r) => r.correct),
  };
}

// --- Cohort metrics ---------------------------------------------------------

export interface CohortMetrics {
  learners: number;
  /**
   * Accuracy of the top three of the ranking, whether or not three are reported.
   *
   * Telemetry, not a bar: the report names `REPORTED_PRIORITY_COUNT`, so these
   * are kept only because every figure measured before that decision was stated
   * on them and a change of criterion should not silently rewrite the series.
   */
  top1InTop3: number;
  twoOfThree: number;
  /** Plan bar: median length ≤ the design's own ceiling. */
  medianItems: number;
  /**
   * Accuracy on the sittings the badge says something positive about — labelled
   * Medium or High.
   *
   * This is the badge-calibration bar. It used to be stated on "High" alone,
   * which the reported-cut confidence rule fires on 2.5% of production-shape
   * sittings: as few as one of a 250-learner cell, so the rate moved between
   * 60% and 100% on one sitting's luck and passed or failed on nothing. The
   * criterion is the same — when the badge claims the plan is settled, it should
   * be right — measured on the 62.1% of runs where the badge actually claims it.
   */
  confidentCorrect: number;
  confidentShare: number;
  /**
   * The old pair, kept as telemetry rather than deleted. `highConfidenceShare`
   * is the number that condemns `highConfidenceCorrect`, and dropping both
   * would make the rarity invisible to whoever next proposes gating on "High".
   */
  highConfidenceCorrect: number;
  highConfidenceShare: number;
  /**
   * Reproducibility of the top three of the ranking. `testRetestExact` demands
   * the identical set and `testRetestOrdered` the identical order; both are
   * reported for information only, and none of the three gates.
   */
  testRetestExact: number;
  testRetestOrdered: number;
  testRetestTwoOf3: number;
  /**
   * Plan bar: the same learner re-sat has at least one of the reported
   * priorities recur. This is the criterion the report is actually stated on —
   * see `PLAN_BARS.testRetestReportedAt140`.
   */
  testRetestReportedOneOf: number;
  /** The identical reported set on both sittings. Strictly stronger; telemetry. */
  testRetestReportedExact: number;
  /** Diagnostics beyond the plan's bars. */
  meanItems: number;
  /** Length at the 25th percentile — how short the early stop gets when it fires. */
  p25Items: number;
  /** Share of learners handed fewer than `REPORTED_PRIORITY_COUNT` priorities. */
  shortReportRate: number;
  meanUnresolved: number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface CohortOptions {
  learners: number;
  mode: CalibrationMode;
  cfg?: BayesDiagnosticConfig;
  run?: SimRunOptions;
  seed?: number;
  /** Generative assumptions about the cohort. Defaults to the original harness. */
  learnerModel?: LearnerModel;
  /** Reporting partition. Defaults to the 15 skill clusters. */
  axis?: DiagnosticAxis;
  /**
   * Index of the first learner to simulate. Every learner's abilities and both
   * their sittings are seeded from this index alone, so running `[0, 250)` in
   * one call and as chunks of 50 gives identical learners; only the aggregate
   * metrics are then per-chunk. Exists so a long cell can yield to the event
   * loop partway through — see the note in `diagnostic-sweep.test.ts`.
   */
  firstLearner?: number;
}

/**
 * Everything one simulated learner's pair of sittings produced, kept so that
 * test-retest can be interrogated after the fact instead of only counted.
 *
 * Deliberately plain data: a sweep shard serialises these to JSON and the
 * analysis runs over the merged file, so nothing here may be a Map, a Set or a
 * function.
 */
export interface RetestRecord {
  learner: string;
  axisId: string;
  /** True ability per coverable bucket. Truth's leverage is derived from this. */
  theta: Readonly<Record<string, number>>;
  /** Reported ranking from each sitting, best first, as [bucketId, leverage]. */
  a: readonly (readonly [string, number])[];
  b: readonly (readonly [string, number])[];
  itemsA: number;
  itemsB: number;
  /** Items sitting A spent on each bucket. */
  itemsPerBucket: Readonly<Record<string, number>>;
  /**
   * Fisher information about the learner's TRUE θ accumulated per bucket in
   * sitting A, under the items' true parameters. This is what an efficient
   * estimator would have had to work with, and it is what the agreement ceiling
   * is computed from.
   */
  fisherPerBucket: Readonly<Record<string, number>>;
  /**
   * The items each sitting served and how the learner answered them.
   *
   * Kept so the agreement ceiling can re-score *the engine's own data* with a
   * different estimator. Redrawing responses instead would quietly favour the
   * engine: the adaptive selector chose these items in response to these
   * answers, so any other realisation is one the form was not adapted to.
   */
  servedA: readonly string[];
  correctA: readonly boolean[];
  servedB: readonly string[];
  correctB: readonly boolean[];
  /** How many item ids the two sittings had in common. */
  sharedItems: number;
  confidenceA: string;
  confidenceB: string;
}

/**
 * Fisher information a single 3PL item carries about θ.
 *
 * I(θ) = a² · (1−P)/P · ((P−c)/(1−c))². Standard result; the (P−c)/(1−c) factor
 * is what makes a guessable item worth less than its discrimination suggests.
 */
export function itemInformation(theta: number, item: SimItem, guessing = 0.25): number {
  const logistic = 1 / (1 + Math.exp(-item.trueDiscrimination * (theta - item.trueDifficulty)));
  const p = guessing + (1 - guessing) * logistic;
  if (p <= guessing || p >= 1) return 0;
  return item.trueDiscrimination ** 2 * ((1 - p) / p) * ((p - guessing) / (1 - guessing)) ** 2;
}

/** Positional form, kept for existing callers. Prefer {@link runCohortWith}. */
export function runCohort(
  learners: number,
  mode: CalibrationMode,
  cfg: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
  opts: SimRunOptions = {},
  seed = 20260725,
): CohortMetrics {
  return runCohortWith({ learners, mode, cfg, run: opts, seed });
}

export function runCohortWith(options: CohortOptions): CohortMetrics {
  return runCohortDetailed(options).metrics;
}

/**
 * Assemble every learner's pair of sittings for a cohort, without scoring them.
 *
 * Split out of {@link runCohortDetailed} so a caller can build one cohort in
 * chunks that yield to the event loop between them — a 250-learner run is a
 * single uninterrupted synchronous span long enough to trip Vitest's worker
 * heartbeat (the birpc `onTaskUpdate` timeout) and report a passing run as
 * failed. Every learner is seeded from its index alone (see
 * {@link CohortOptions.firstLearner}), so the pairs a chunk `[first, first+n)`
 * produces are exactly the same slice a whole-cohort run would; concatenating
 * the chunks in index order and scoring the union once with
 * {@link summariseCohort} reproduces the whole run bit-for-bit. The bank and
 * axis the pairs were built against are returned so the caller can score them
 * without rebuilding either.
 */
export function collectCohortPairs(options: CohortOptions): {
  pairs: CohortPair[];
  bank: SimItem[];
  axis: DiagnosticAxis;
} {
  const {
    learners,
    mode,
    cfg = BAYES_DIAGNOSTIC_CONFIG,
    run: opts = {},
    seed = 20260725,
    learnerModel = DEFAULT_LEARNER_MODEL,
    axis = CLUSTER_AXIS,
    firstLearner = 0,
  } = options;
  const bank = buildSimBankFor(makeRng(seed), mode, axis);
  const bucketIds = axisIds(axis);

  const pairs: CohortPair[] = [];
  for (let i = firstLearner; i < firstLearner + learners; i += 1) {
    const learner = makeLearnerOn(bucketIds, `sim-${i}`, makeRng(seed + i * 7919), learnerModel);
    pairs.push({
      learner,
      a: simulateSitting(learner, bank, makeRng(seed + i * 104729), cfg, opts, axis),
      b: simulateSitting(learner, bank, makeRng(seed + i * 104729 + 1), cfg, opts, axis),
    });
  }
  return { pairs, bank, axis };
}

/**
 * The cohort run, plus one {@link RetestRecord} per learner.
 *
 * `runCohortWith` is this function's `metrics` field and nothing else, so the
 * two can never drift apart: any question asked of the records is being asked of
 * the same sittings the bars were scored on.
 */
export function runCohortDetailed(options: CohortOptions): {
  metrics: CohortMetrics;
  records: RetestRecord[];
} {
  const { pairs, bank, axis } = collectCohortPairs(options);
  return summariseCohort(pairs, bank, axis);
}

/**
 * One sitting, in the shape cohort scoring needs. Both delivery arms produce
 * this, which is what makes their figures comparable: the arms differ in item
 * selection, and must not differ in how the resulting plan is scored.
 */
export interface SittingLike {
  itemsServed: number;
  reported: readonly string[];
  confidenceLabel: string;
  internalConfidence: number;
  unresolved: number;
  ranked: readonly { bucket: string; leverage: number }[];
  servedItemIds: readonly string[];
  servedCorrect: readonly boolean[];
}

/** A learner and the two sittings they gave. */
export interface CohortPair {
  learner: SimLearner;
  a: SittingLike;
  b: SittingLike;
}

/**
 * Score a set of learner × sitting-pair records into {@link CohortMetrics}.
 *
 * Exported so an alternative delivery arm can be scored by exactly this code
 * rather than by a transcription of it. Every previously reported adaptive-arm
 * figure comes from here, so a change to it moves both arms at once — which is
 * the property that keeps the two comparable.
 */
export function summariseCohort(
  pairs: readonly CohortPair[],
  bank: readonly SimItem[],
  axis: DiagnosticAxis,
): { metrics: CohortMetrics; records: RetestRecord[] } {
  const bankById = new Map(bank.map((i) => [i.questionId, i]));
  const coverable = new Set(bank.map((i) => i.bucketId));
  const learners = pairs.length;
  const records: RetestRecord[] = [];

  let top1Hits = 0;
  let twoOf3Hits = 0;
  let highTotal = 0;
  let highHits = 0;
  let confidentTotal = 0;
  let confidentHits = 0;
  let retestExact = 0;
  let retestOrdered = 0;
  let retestTwoOf3 = 0;
  let retestReportedOneOf = 0;
  let retestReportedExact = 0;
  let shortReport = 0;
  let unresolvedSum = 0;
  const lengths: number[] = [];

  for (const { learner, a, b } of pairs) {
    const truth = trueLeverages(learner, axis, coverable).map((x) => x.bucket);
    const trueTop3 = new Set(truth.slice(0, 3));
    const trueTop1 = truth[0]!;

    const itemsPerBucket: Record<string, number> = {};
    const fisherPerBucket: Record<string, number> = {};
    for (const id of a.servedItemIds) {
      const item = bankById.get(id)!;
      itemsPerBucket[item.bucketId] = (itemsPerBucket[item.bucketId] ?? 0) + 1;
      fisherPerBucket[item.bucketId] =
        (fisherPerBucket[item.bucketId] ?? 0) +
        itemInformation(learner.theta[item.bucketId] ?? 0, item);
    }
    const seenInB = new Set(b.servedItemIds);
    records.push({
      learner: learner.id,
      axisId: axis.id,
      theta: Object.fromEntries([...coverable].map((id) => [id, learner.theta[id] ?? 0])),
      a: a.ranked.map((r) => [r.bucket, r.leverage] as const),
      b: b.ranked.map((r) => [r.bucket, r.leverage] as const),
      itemsA: a.itemsServed,
      itemsB: b.itemsServed,
      itemsPerBucket,
      fisherPerBucket,
      servedA: a.servedItemIds,
      correctA: a.servedCorrect,
      servedB: b.servedItemIds,
      correctB: b.servedCorrect,
      sharedItems: a.servedItemIds.filter((id) => seenInB.has(id)).length,
      confidenceA: a.confidenceLabel,
      confidenceB: b.confidenceLabel,
    });

    lengths.push(a.itemsServed);
    unresolvedSum += a.unresolved;
    if (a.reported.length < REPORTED_PRIORITY_COUNT) shortReport += 1;

    // Top-3 telemetry comes off the ranking rather than the report, which names
    // two; the two series would otherwise be silently incomparable.
    const top3A = a.ranked.slice(0, 3).map((r) => r.bucket);
    const top3B = b.ranked.slice(0, 3).map((r) => r.bucket);
    const hit = top3A.includes(trueTop1);
    if (hit) top1Hits += 1;
    if (top3A.filter((c) => trueTop3.has(c)).length >= 2) twoOf3Hits += 1;
    if (a.confidenceLabel === 'High') {
      highTotal += 1;
      if (hit) highHits += 1;
    }
    if (a.confidenceLabel === 'High' || a.confidenceLabel === 'Medium') {
      confidentTotal += 1;
      if (hit) confidentHits += 1;
    }
    const sameSet = top3A.length === top3B.length && top3A.every((c) => top3B.includes(c));
    if (sameSet) retestExact += 1;
    if (top3A.length === top3B.length && top3A.every((c, idx) => c === top3B[idx])) {
      retestOrdered += 1;
    }
    if (top3A.filter((c) => top3B.includes(c)).length >= 2) retestTwoOf3 += 1;

    const shared = a.reported.filter((c) => b.reported.includes(c)).length;
    if (shared >= 1) retestReportedOneOf += 1;
    if (a.reported.length === b.reported.length && shared === a.reported.length) {
      retestReportedExact += 1;
    }
  }

  const metrics: CohortMetrics = {
    learners,
    top1InTop3: top1Hits / learners,
    twoOfThree: twoOf3Hits / learners,
    medianItems: median(lengths),
    confidentCorrect: confidentTotal > 0 ? confidentHits / confidentTotal : Number.NaN,
    confidentShare: confidentTotal / learners,
    highConfidenceCorrect: highTotal > 0 ? highHits / highTotal : Number.NaN,
    highConfidenceShare: highTotal / learners,
    testRetestExact: retestExact / learners,
    testRetestOrdered: retestOrdered / learners,
    testRetestTwoOf3: retestTwoOf3 / learners,
    testRetestReportedOneOf: retestReportedOneOf / learners,
    testRetestReportedExact: retestReportedExact / learners,
    meanItems: lengths.reduce((s, x) => s + x, 0) / learners,
    p25Items: [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length * 0.25)] ?? 0,
    shortReportRate: shortReport / learners,
    meanUnresolved: unresolvedSum / learners,
  };
  return { metrics, records };
}

// --- Pre-registered bars ----------------------------------------------------

/**
 * Declared here, ahead of any run, so a sweep cannot be scored against bars
 * chosen after seeing which configuration happened to win. Changing these is a
 * deliberate act with a diff, not an analysis choice.
 *
 * Two of the diagnostic plan's original bars were restated after the first
 * measured sweep — see `diagnostic-simulation.test.ts` for the derivation.
 */
export const PLAN_BARS = {
  top1InTop3: 0.85,
  twoOfThree: 0.75,
  medianItems: 60,
  /**
   * Badge calibration: when the report says the plan is settled, the true #1
   * priority is in the reported top three at least this often.
   *
   * Replaces `highConfidenceCorrect: 0.9`, which was scored on the "High" badge
   * alone. On the production design that badge fires on 2.5% of sittings: 1 to
   * 15 learners of a 250-learner cell across the 24 worlds, over which the rate
   * ran from 60.0% to 100.0%. It could neither fail a bad instrument nor pass a
   * good one, and on the cells where the badge never fired at all it was NaN and
   * `evaluateBars` had to skip it. Restated on "Medium or better" rather than
   * deleted, because the claim being checked is real and only the denominator
   * was not: a learner is shown a badge on every sitting, and the 62.1% of them
   * the badge speaks positively about are the ones the claim is about.
   *
   * Measured on the adaptive arm at 92.1% pooled and 86.8% in the worst world,
   * 24 worlds x 250 learners. A cell's confident denominator is around 155
   * sittings, so one standard error is 2.7 points; the bar sits that far under
   * the worst world, on the same rule as the reproducibility bars. Both MST arms
   * measure above the adaptive arm here — 87.2% and 88.9% worst-world — because
   * a badge that fires on fewer sittings fires on safer ones.
   */
  confidentCorrect: 0.84,
  /**
   * Reproducibility of the ADAPTIVE arm, stated on the criterion the report is
   * actually made on and at the length it is actually served at: on `fc-10` at
   * 140 items, at least one of the two named priorities recurs when the same
   * learner re-sits, in the worst of the 24 assumption worlds.
   *
   * The length is in the name because the figure does not travel. The same
   * instrument at 60 items is a different instrument, and a bar quoted without
   * its budget invites exactly the substitution that produced the number this
   * replaced: 0.80 was set against a top-*three* criterion, which the report no
   * longer uses, and the 95.1%/89.6% pair that justified naming two was measured
   * at 200 items, which the design no longer serves.
   *
   * Measured at 94.6% pooled and 88.0% in the worst world — rho 0.7, deficit 0.6,
   * offset +0.5, misspecified — over 24 worlds x 250 learners. Set just under the
   * worst world rather than at the pooled mean, so it is a constraint a degraded
   * instrument fails rather than one nothing can pass. The headroom is about one
   * standard error of a 250-learner cell (2.1 points at p=0.88), which is the
   * least that keeps the bar from failing on sampling noise alone.
   *
   * This is now telemetry rather than a promise about the shipped form: no
   * learner meets this selector. Read it as the ceiling item-level selection
   * reaches at this budget, and read `testRetestReportedMstAt140` for what is
   * delivered.
   */
  testRetestReportedAt140: 0.86,
  /**
   * The same criterion on the arm a learner is actually served: multistage
   * delivery on `fc-10` at 140 items, worst of the 24 worlds.
   *
   * Exists because the adaptive bar above described a selector nobody meets.
   * `runMstCohortDetailed` runs the same learners, the same seeds and the same
   * `summariseCohort` scoring, so the two bars differ in delivery and in nothing
   * else.
   *
   * Set on the design a learner meets *today* — `MST_140_RECOMMENDED`, 7 x 20
   * with contention-allocated slots, which `diagnostic-engine.ts` now serves.
   * A bar aimed at a form no learner sits is the defect this one was added to
   * fix, so it moves when the served form moves and not before.
   *
   * Measured at 85.2% worst-of-24 and 91.3% pooled at 250 learners a cell, and
   * at 84.7% over the three worlds every arm fails in at 1500 a cell — the
   * deeper figure is the one the bar is set under, because a worst-of-24 at 250
   * carries a 2.4-point standard error and a downward selection bias on top of
   * it. One standard error of a 250-learner cell below 84.7% puts this at 0.82.
   *
   * The 0.78 it replaces was set on `MST_DESIGNS[2]`, 50 + 3 x 30, which the
   * sweep superseded. See `diagnostic-mst-sweep.test.ts` for the attribution:
   * MST's deficit is not the number of routing decisions. Doubling them, three
   * routes to six, is worth 0.3 points, and the whole family from 2 to 20 stages
   * sits inside a point of itself. It is allocation adaptivity, which routing
   * does not buy at any stage count.
   */
  testRetestReportedMstAt140: 0.82,
} as const;

export type BarName = keyof typeof PLAN_BARS;

/**
 * Which delivery arm a cohort came from. The two reproducibility bars measure
 * the same quantity on different instruments, so scoring a cell against the
 * wrong one is the mistake this parameter exists to make impossible.
 */
export type DeliveryArm = 'adaptive' | 'mst';

/**
 * Which pre-registered bars a cohort clears. NaN (bar never exercised) counts as
 * passing.
 *
 * The reproducibility bar is named for a length, and a cell run at some other
 * length is therefore not being scored against a bar that describes it. Nothing
 * enforces that here: the sweep exists to compare lengths, so refusing to score
 * the others would empty the table. Read the 140-item row as the pass/fail and
 * the rest as the comparison.
 *
 * `lengthBar` exists because the length bar is the one bar that is not
 * comparable across designs: scoring a 200-item design against "median ≤ 60"
 * only restates its budget. Pass the design's own ceiling and the bar becomes a
 * real question — *did early stopping ever fire, or does every learner run to
 * the cap?* Cross-design time cost is a trade-off to read off `medianItems`
 * directly, not a pass/fail.
 */
export function evaluateBars(
  m: CohortMetrics,
  lengthBar: number = PLAN_BARS.medianItems,
  arm: DeliveryArm = 'adaptive',
): Record<BarName, boolean> {
  const retest = m.testRetestReportedOneOf;
  return {
    top1InTop3: m.top1InTop3 >= PLAN_BARS.top1InTop3,
    twoOfThree: m.twoOfThree >= PLAN_BARS.twoOfThree,
    medianItems: m.medianItems <= lengthBar,
    confidentCorrect:
      Number.isNaN(m.confidentCorrect) || m.confidentCorrect >= PLAN_BARS.confidentCorrect,
    // The arm that did not produce this cell is not scored on it. Reporting it
    // as passed keeps `worldsClearingAllBars` meaning "cleared every bar that
    // applies" rather than silently failing every cell on the other arm's bar.
    testRetestReportedAt140:
      arm !== 'adaptive' || retest >= PLAN_BARS.testRetestReportedAt140,
    testRetestReportedMstAt140:
      arm !== 'mst' || retest >= PLAN_BARS.testRetestReportedMstAt140,
  };
}

// --- Assumption sweep -------------------------------------------------------

/**
 * One plausible world. The point of sweeping these is *not* to find the world we
 * live in — synthetic data cannot tell us that — but to find which design choices
 * hold up across all of them. A design that wins only at correlation 0.38 and a
 * 1.5-logit deficit has been tuned to an assumption, not validated.
 */
export interface SweepAssumptions {
  /** Inter-concept ability correlation. */
  correlation: number;
  /** Deficit depth in logits, as [min, span]. */
  deficit: readonly [number, number];
  /** Cohort centring relative to the bank, in logits. */
  offset: number;
  mode: CalibrationMode;
}

/**
 * The default grid: 2 correlations × 2 deficit depths × 3 cohort offsets × 2
 * non-ideal calibration modes = 24 worlds.
 *
 * `calibrated` is deliberately excluded — it is a ceiling, and including it in a
 * worst-case summary would flatter every design equally.
 *
 * Correlation dropped from three levels to two when the offset dimension was
 * added, to hold the cell count down. The endpoints are what matter: 0.7 is the
 * pessimistic case where strong learners are strong nearly everywhere and the
 * spread the diagnostic must detect is small, and the interior value never
 * changed a verdict in the first sweep.
 */
export const DEFAULT_ASSUMPTION_GRID: readonly SweepAssumptions[] = (() => {
  const out: SweepAssumptions[] = [];
  for (const correlation of [0.3, 0.7]) {
    // [1.5, 0.8] is the original, unambiguous hole. [0.6, 0.6] is a subtler,
    // more realistic weakness and is the harder case.
    for (const deficit of [[1.5, 0.8], [0.6, 0.6]] as const) {
      // A bank calibrated on a different population than it is served to is the
      // ordinary case, not an edge case, and it is what breaks fixed cut scores.
      for (const offset of [-0.5, 0, 0.5]) {
        for (const mode of ['misspecified', 'systematic'] as const) {
          out.push({ correlation, deficit, offset, mode });
        }
      }
    }
  }
  return out;
})();

/** A named design under test — whatever engine configuration the sweep is comparing. */
export interface SweepDesign {
  label: string;
  cfg: BayesDiagnosticConfig;
  /**
   * Reporting partition, defaulting to the 15 skill clusters. A design carries
   * its own axis because axis and length are compared in the same sweep, and a
   * bucket count is as much part of a design as an item budget is.
   */
  axis?: DiagnosticAxis;
}

export interface SweepPoint {
  design: string;
  assumptions: SweepAssumptions;
  metrics: CohortMetrics;
  barsMet: Record<BarName, boolean>;
}

export interface SweepOptions {
  learners?: number;
  run?: SimRunOptions;
  seed?: number;
  grid?: readonly SweepAssumptions[];
}

/** The learner model one world of the grid describes. */
export const learnerModelFor = (assumptions: SweepAssumptions): LearnerModel =>
  learnerModelWithOffset(
    assumptions.offset,
    learnerModelWithDeficit(
      assumptions.deficit[0],
      assumptions.deficit[1],
      learnerModelForCorrelation(assumptions.correlation),
    ),
  );

/** Run every design against every world. Cost is designs × grid × learners sittings. */
export function runSweep(
  designs: readonly SweepDesign[],
  options: SweepOptions = {},
): SweepPoint[] {
  return runSweepDetailed(designs, options).points;
}

/** {@link runSweep}, keeping the per-learner records each cell produced. */
export function runSweepDetailed(
  designs: readonly SweepDesign[],
  options: SweepOptions = {},
): { points: SweepPoint[]; records: RetestRecord[] } {
  const {
    learners = 250,
    run = {},
    seed = 20260725,
    grid = DEFAULT_ASSUMPTION_GRID,
  } = options;

  const points: SweepPoint[] = [];
  const records: RetestRecord[] = [];
  for (const design of designs) {
    for (const assumptions of grid) {
      const cell = runCohortDetailed({
        learners,
        mode: assumptions.mode,
        cfg: design.cfg,
        run,
        seed,
        learnerModel: learnerModelFor(assumptions),
        ...(design.axis === undefined ? {} : { axis: design.axis }),
      });
      points.push({
        design: design.label,
        assumptions,
        metrics: cell.metrics,
        // Scored against this design's own ceiling — see evaluateBars.
        barsMet: evaluateBars(cell.metrics, design.cfg.maxItems),
      });
      records.push(...cell.records);
    }
  }
  return { points, records };
}

/**
 * Worst, median and best across the assumption grid for one design.
 *
 * **Read the worst column.** The spread between worst and best is how much of a
 * result is real versus an artefact of assumptions, and a design should be chosen
 * on the floor it guarantees rather than the ceiling it can reach.
 */
export interface SweepSummary {
  design: string;
  worlds: number;
  top1InTop3: { worst: number; median: number; best: number };
  twoOfThree: { worst: number; median: number; best: number };
  medianItems: { worst: number; median: number; best: number };
  /** The gating criterion: at least one reported priority recurs on a re-sit. */
  testRetestReportedOneOf: { worst: number; median: number; best: number };
  /** Top-3 telemetry, kept comparable with every figure measured before the cut. */
  testRetestTwoOf3: { worst: number; median: number; best: number };
  /** Worlds in which every pre-registered bar was cleared. */
  worldsClearingAllBars: number;
  /** Bars that failed in at least one world. */
  barsFailedSomewhere: BarName[];
}

const spread = (xs: number[], higherIsBetter = true) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    worst: higherIsBetter ? s[0]! : s[s.length - 1]!,
    median: median(s),
    best: higherIsBetter ? s[s.length - 1]! : s[0]!,
  };
};

export function summariseSweep(points: readonly SweepPoint[]): SweepSummary[] {
  const byDesign = new Map<string, SweepPoint[]>();
  for (const p of points) {
    const list = byDesign.get(p.design) ?? [];
    list.push(p);
    byDesign.set(p.design, list);
  }

  return [...byDesign.entries()].map(([design, ps]) => {
    const failed = new Set<BarName>();
    let clearingAll = 0;
    for (const p of ps) {
      const names = Object.keys(p.barsMet) as BarName[];
      const anyFailed = names.filter((n) => !p.barsMet[n]);
      anyFailed.forEach((n) => failed.add(n));
      if (anyFailed.length === 0) clearingAll += 1;
    }
    return {
      design,
      worlds: ps.length,
      top1InTop3: spread(ps.map((p) => p.metrics.top1InTop3)),
      twoOfThree: spread(ps.map((p) => p.metrics.twoOfThree)),
      medianItems: spread(ps.map((p) => p.metrics.medianItems), false),
      testRetestReportedOneOf: spread(ps.map((p) => p.metrics.testRetestReportedOneOf)),
      testRetestTwoOf3: spread(ps.map((p) => p.metrics.testRetestTwoOf3)),
      worldsClearingAllBars: clearingAll,
      barsFailedSomewhere: [...failed],
    };
  });
}
