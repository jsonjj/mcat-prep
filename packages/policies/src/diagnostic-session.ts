import type { DiagnosticAxis } from './diagnostic-axis';

/**
 * Production surface for the multistage diagnostic.
 *
 * The simulation model in `diagnostic-mst.ts` and the production runtime assemble
 * forms and route learners by the same rules; only the item source differs. These
 * types are the seam that lets one implementation serve both, so that what ships
 * is what was swept rather than a reimplementation of it.
 */

/**
 * The minimum an item must expose to be placed in a form. Deliberately narrower
 * than either `SimItem` or `DiagnosticCandidate` so both satisfy it — form
 * assembly must not be able to see a simulated item's true parameters.
 */
export interface FormItem {
  questionId: string;
  /** Which axis bucket this item measures. */
  bucketId: string;
  /** Author-assigned depth of knowledge, the difficulty proxy until calibration exists. */
  dokLevel: number;
}

/** A block of items at one difficulty level within a stage. */
export interface FormModule {
  /** 0 = easiest. Index into the stage's difficulty ladder. */
  difficultyRank: number;
  itemIds: readonly string[];
}

export interface FormStage {
  /** Modules a learner could be routed into. Stage 0 has exactly one. */
  modules: readonly FormModule[];
  /**
   * Ascending number-correct thresholds applied to the PRECEDING stage to choose
   * a module here. Length is `modules.length - 1`. Empty for stage 0.
   */
  cutScores: readonly number[];
}

export interface MstForm {
  formId: string;
  axisId: string;
  stages: readonly FormStage[];
  /** Buckets with too few items to meet the floor, excluded rather than under-served. */
  uncoverableBuckets: readonly string[];
}

export interface MstResponse {
  questionId: string;
  correct: boolean;
  elapsedMs: number;
}

/** Everything needed to resume a part-finished sitting. */
export interface MstSessionState {
  formId: string;
  /** Difficulty rank taken at each completed stage, in order. */
  routePath: readonly number[];
  responses: readonly MstResponse[];
}

/** What the diagnostic concluded about one axis bucket. */
export interface BucketRead {
  bucketId: string;
  /** Probability-scale need for work, 0 = no evidence of weakness. */
  gap: number;
  /** How much to trust `gap`, 0–1. Drives how far a downstream prior may move. */
  certainty: number;
  itemsSeen: number;
}

export interface MstResult {
  axisId: string;
  perBucket: readonly BucketRead[];
  /** Buckets to start with, most valuable first. */
  topPriorities: readonly string[];
  itemsServed: number;
}

/**
 * A diagnostic read attached to the unit the mastery system actually tracks.
 *
 * The diagnostic measures on coarse buckets but mastery is tracked per knowledge
 * component, so a bucket read is distributed down to the KCs beneath it. Every KC
 * under a bucket therefore inherits the same read, which is why `certainty` must
 * fall as a bucket covers more KCs — one bucket-level observation is weaker
 * evidence about each of forty KCs than about each of four.
 */
export interface KcSeed {
  kcId: string;
  gap: number;
  certainty: number;
}

export interface MstBuildRequest {
  axis: DiagnosticAxis;
  items: readonly FormItem[];
  /** Total items across all stages a learner will see. */
  budget: number;
  stages: number;
  modulesPerStage: number;
  minItemsPerBucket: number;
  /** Ascending, length `modulesPerStage - 1`. Set from the sweep. */
  routingQuantiles: readonly number[];
  /** Deterministic assembly requires a seed; forms must be reproducible. */
  seed: number;
}
