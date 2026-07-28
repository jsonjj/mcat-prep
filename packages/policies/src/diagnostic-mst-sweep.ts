import { FC_AXIS, axisIds, type DiagnosticAxis } from './diagnostic-axis';
import {
  BAYES_DIAGNOSTIC_CONFIG,
  type BayesDiagnosticConfig,
} from './diagnostic-bayes';
import { guaranteedPerBucket, simulateMstSitting, type MstDesign } from './diagnostic-mst';
import {
  DEFAULT_LEARNER_MODEL,
  buildSimBankFor,
  makeLearnerOn,
  makeRng,
  simulateSitting,
  summariseCohort,
  type CalibrationMode,
  type CohortMetrics,
  type CohortPair,
  type LearnerModel,
  type RetestRecord,
  type SimRunOptions,
} from './diagnostic-simulation';

/**
 * The MST delivery arm as a cohort, so the shipped selector carries its own
 * bars instead of borrowing the adaptive arm's.
 *
 * `runCohortDetailed` only ever runs item-level adaptive selection, which is
 * why every figure in `PLAN_BARS` used to describe a selector no learner meets.
 * `PLAN_BARS.testRetestReportedMstAt140` is set from this. It
 * runs the same learners, the same seeds and the same scoring through
 * {@link summariseCohort}, differing from the adaptive arm in exactly one
 * respect: which items get served.
 *
 * Nothing here runs at runtime.
 */

export interface MstCohortOptions {
  learners: number;
  design: MstDesign;
  mode: CalibrationMode;
  cfg?: BayesDiagnosticConfig;
  run?: SimRunOptions;
  seed?: number;
  learnerModel?: LearnerModel;
  axis?: DiagnosticAxis;
  firstLearner?: number;
}

/**
 * Both sittings of an MST cohort, scored exactly as the adaptive arm is.
 *
 * Learner and sitting seeds are the adaptive arm's, item for item, so a
 * difference between the two arms is a difference in delivery rather than in
 * who was measured or how their luck fell.
 */
export function runMstCohortDetailed(options: MstCohortOptions): {
  metrics: CohortMetrics;
  records: RetestRecord[];
} {
  const {
    learners,
    design,
    mode,
    cfg = BAYES_DIAGNOSTIC_CONFIG,
    run: opts = {},
    seed = 20260725,
    learnerModel = DEFAULT_LEARNER_MODEL,
    axis = FC_AXIS,
    firstLearner = 0,
  } = options;
  const bank = buildSimBankFor(makeRng(seed), mode, axis);
  const bucketIds = axisIds(axis);

  const pairs: CohortPair[] = [];
  for (let i = firstLearner; i < firstLearner + learners; i += 1) {
    const learner = makeLearnerOn(bucketIds, `sim-${i}`, makeRng(seed + i * 7919), learnerModel);
    pairs.push({
      learner,
      a: simulateMstSitting(learner, bank, design, axis, makeRng(seed + i * 104729), cfg, opts),
      b: simulateMstSitting(learner, bank, design, axis, makeRng(seed + i * 104729 + 1), cfg, opts),
    });
  }
  return summariseCohort(pairs, bank, axis);
}

export const runMstCohort = (options: MstCohortOptions): CohortMetrics =>
  runMstCohortDetailed(options).metrics;

// --- Attribution arms -------------------------------------------------------

/**
 * The adaptive arm with its allocation adaptivity removed, at equal length.
 *
 * `selectNextBayes` serves the breadth floor before it considers anything else,
 * so a floor of `total / buckets` consumes the entire budget and forces an even
 * split — while item-level *difficulty* choice inside each bucket, and the
 * per-item re-decision that goes with it, are untouched. Sitting between the
 * shipped adaptive arm and MST, it separates the two things MST gives up at
 * once: where items are spent, and how often the engine may change its mind.
 */
export const evenSplitConfig = (
  total: number,
  buckets: number,
  base: BayesDiagnosticConfig = BAYES_DIAGNOSTIC_CONFIG,
): BayesDiagnosticConfig => ({
  ...base,
  minItems: total,
  maxItems: total,
  minItemsPerCluster: Math.floor(total / buckets),
});

export interface AdaptiveCohortOptions {
  learners: number;
  cfg: BayesDiagnosticConfig;
  mode: CalibrationMode;
  run?: SimRunOptions;
  seed?: number;
  learnerModel?: LearnerModel;
  axis?: DiagnosticAxis;
  firstLearner?: number;
}

/**
 * The adaptive arm, run through the same entry point the MST arm uses.
 *
 * `runCohortDetailed` would do, but routing both arms through one signature
 * keeps a sweep from having to special-case which function to call per arm.
 */
export function runAdaptiveCohortDetailed(options: AdaptiveCohortOptions): {
  metrics: CohortMetrics;
  records: RetestRecord[];
} {
  const {
    learners,
    cfg,
    mode,
    run: opts = {},
    seed = 20260725,
    learnerModel = DEFAULT_LEARNER_MODEL,
    axis = FC_AXIS,
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
  return summariseCohort(pairs, bank, axis);
}

// --- The granularity grid ---------------------------------------------------

/**
 * Smallest block the review window survives.
 *
 * MST was chosen over item-level adaptive because a learner may revise answers
 * within a block before submitting it, and a block small enough to be routed
 * off is not necessarily large enough to be worth revisiting. This is a product
 * constraint rather than a measured one, so the sweep runs designs below it and
 * labels them, rather than refusing to measure them.
 *
 * Nothing measured here argues for going under it. Stage count is worth almost
 * nothing on its own — 2 stages to 20 moves reproducibility by under a point —
 * so the designs that would breach the floor buy nothing to trade the review
 * window against. The recommended design sits at 20, comfortably clear.
 */
export const REVIEW_BLOCK_FLOOR = 15;

export interface UniformMstOptions {
  modulesPerStage?: number;
  routingQuantiles?: readonly number[];
  allocation?: MstDesign['allocation'];
}

/** An MST design at a fixed total length, `stages` equal blocks wide. */
export function uniformMstDesign(
  total: number,
  stages: number,
  buckets: number,
  options: UniformMstOptions = {},
): MstDesign {
  const { modulesPerStage = 3, routingQuantiles, allocation = 'balanced' } = options;
  const base = Math.floor(total / stages);
  const remainder = total - base * stages;
  // The routing stage absorbs the remainder: it is the highest-leverage block
  // in the panel, and a longer one buys a more reliable first route.
  const itemsPerStage = Array.from({ length: stages }, (_, i) => (i === 0 ? base + remainder : base));
  const design: MstDesign = {
    label: `${stages}x${base}`,
    stages,
    itemsPerStage,
    modulesPerStage,
    minItemsPerBucket: 0,
    allocation,
    ...(routingQuantiles === undefined ? {} : { routingQuantiles }),
  };
  // Asserted rather than assumed: what a contention-allocated form guarantees
  // per bucket is well below an even share, and a design that quoted the even
  // share would be promising coverage it does not deliver.
  return { ...design, minItemsPerBucket: guaranteedPerBucket(itemsPerStage, buckets, design) };
}

/** Smallest block a design serves — the review window it leaves the learner. */
export const minBlockSize = (design: MstDesign): number =>
  typeof design.itemsPerStage === 'number'
    ? design.itemsPerStage
    : Math.min(...design.itemsPerStage);

/** Routing decisions a design makes: one per stage boundary. */
export const adaptationPoints = (design: MstDesign): number => design.stages - 1;
