/**
 * CARS ability tracking for the mastery engine (mastery-bkt / provisional-v1).
 *
 * CARS is a skill, not knowledge: it uses IRT ability tracking (no BKT, no
 * forgetting). Each of the three CARS sub-skills carries an ability `V`. Two
 * sources update the same `V` so both influence readiness (owner decision), with
 * very different step sizes: Passage of the Day *measures* (K=0.3), the CARS Duel
 * *trains* and is formative (K=0.08). See docs/mastery-pipeline.md §4.6.
 *
 * Pure functions only.
 */

/** Starting CARS ability (0 = average). */
export const CARS_V0 = 0;
/** Step size when the signal is a real measurement (Passage of the Day). */
export const CARS_K_POTD = 0.3;
/** Step size for the formative CARS Duel (low weight — trains, never carries readiness alone). */
export const CARS_K_DUEL = 0.08;
/** On-track readiness (85% rule). Aim ~2.5 for a top score. */
export const CARS_READINESS_TARGET = 1.7;

/** Predicted chance of a correct response: `1 / (1 + e^{-(V - b)})`. */
export const predictedCorrect = (v: number, b: number): number => 1 / (1 + Math.exp(-(v - b)));

export interface CarsUpdateInput {
  /** Observed result in [0,1]: 1/0 for PotD; the rubric score for the Duel. */
  r: number;
  /** Item difficulty (0 if unknown/uncalibrated). */
  b: number;
  /** Step size (CARS_K_POTD or CARS_K_DUEL). */
  k: number;
}

/** IRT ability update: `V = V + K * (R - Q)`. */
export function carsUpdate(v: number, input: CarsUpdateInput): number {
  const q = predictedCorrect(v, input.b);
  return v + input.k * (input.r - q);
}

/** CARS Duel rubric (each criterion scored 0–3 on what the response exercised). */
export interface DuelRubric {
  position?: number;
  argument?: number;
  application?: number;
}

const RUBRIC_WEIGHTS = { position: 0.25, argument: 0.4, application: 0.35 } as const;

/**
 * Convert a Duel rubric to `R` in [0,1]. Only criteria the duel exercised count,
 * normalized by their weights: `R = Σ(w·score) / (3·Σw)`. Returns null if nothing
 * was scored (no update should be applied).
 */
export function rubricToR(rubric: DuelRubric): number | null {
  let weighted = 0;
  let weightSum = 0;
  for (const key of ['position', 'argument', 'application'] as const) {
    const score = rubric[key];
    if (score === undefined) continue;
    weighted += RUBRIC_WEIGHTS[key] * score;
    weightSum += RUBRIC_WEIGHTS[key];
  }
  if (weightSum === 0) return null;
  return weighted / (3 * weightSum);
}

/** Overall CARS readiness = mean of the three sub-skill abilities. */
export const overallCarsReadiness = (foc: number, rwt: number, rbt: number): number =>
  (foc + rwt + rbt) / 3;

/** Whether overall CARS ability is on-track. */
export const isCarsOnTrack = (overallV: number): boolean => overallV >= CARS_READINESS_TARGET;
