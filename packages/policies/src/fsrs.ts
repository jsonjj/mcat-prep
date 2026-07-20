import type { ReviewRating, UtcTimestamp } from '@mcat/contracts';
import type { PolicyManifest } from './manifest';

/**
 * FSRS-compatible spaced-repetition scheduler (provisional-v1).
 *
 * Pinned implementation + parameter vector. Desired retention 0.90. FSRS only
 * decides *when* a memory object returns; it never awards mastery. Learner-specific
 * parameter optimization is disabled until >= 400 graded reviews (enforced upstream).
 *
 * Formulas follow the published FSRS-4.5 model. Values below are proposals to be
 * replaced by calibrated parameters; they are versioned, not scientific truth.
 */

export const FSRS_MANIFEST: PolicyManifest = {
  policyId: 'fsrs',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary: 'FSRS-4.5 scheduler with pinned default weights; desired retention 0.90.',
};

/** Pinned FSRS-4.5 default weight vector (19 params). */
export const FSRS_DEFAULT_WEIGHTS: readonly number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824, 1.9813,
  0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

export interface FsrsConfig {
  weights: readonly number[];
  requestRetention: number; // 0.90
  maximumIntervalDays: number;
}

export const FSRS_CONFIG: FsrsConfig = {
  weights: FSRS_DEFAULT_WEIGHTS,
  requestRetention: 0.9,
  maximumIntervalDays: 3650,
};

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2345679

const RATING_INDEX: Record<ReviewRating, number> = { again: 1, hard: 2, good: 3, easy: 4 };

const clampDifficulty = (d: number): number => Math.min(10, Math.max(1, d));

export interface ReviewState {
  stability: number;
  difficulty: number;
  due: UtcTimestamp;
  lastReviewedAt: UtcTimestamp;
  reps: number;
  lapses: number;
}

/** Probability of recall after `elapsedDays` given stability. */
export const retrievability = (stability: number, elapsedDays: number): number =>
  Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);

/** Interval (days) to reach the requested retention from a given stability. */
export const intervalDays = (stability: number, cfg: FsrsConfig = FSRS_CONFIG): number => {
  const raw = (stability / FACTOR) * (Math.pow(cfg.requestRetention, 1 / DECAY) - 1);
  return Math.min(cfg.maximumIntervalDays, Math.max(1, Math.round(raw)));
};

const initialStability = (w: readonly number[], rating: ReviewRating): number =>
  Math.max(0.1, w[RATING_INDEX[rating] - 1]!);

const initialDifficulty = (w: readonly number[], rating: ReviewRating): number =>
  clampDifficulty(w[4]! - Math.exp(w[5]! * (RATING_INDEX[rating] - 1)) + 1);

const nextDifficulty = (w: readonly number[], d: number, rating: ReviewRating): number => {
  const delta = d - w[6]! * (RATING_INDEX[rating] - 3);
  const target = initialDifficulty(w, 'easy');
  return clampDifficulty(w[7]! * target + (1 - w[7]!) * delta);
};

const stabilityAfterRecall = (
  w: readonly number[],
  d: number,
  s: number,
  r: number,
  rating: ReviewRating,
): number => {
  const hardPenalty = rating === 'hard' ? w[15]! : 1;
  const easyBonus = rating === 'easy' ? w[16]! : 1;
  const inc =
    Math.exp(w[8]!) *
    (11 - d) *
    Math.pow(s, -w[9]!) *
    (Math.exp(w[10]! * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return s * (1 + inc);
};

const stabilityAfterForget = (w: readonly number[], d: number, s: number, r: number): number => {
  const forget =
    w[11]! * Math.pow(d, -w[12]!) * (Math.pow(s + 1, w[13]!) - 1) * Math.exp(w[14]! * (1 - r));
  // Post-lapse stability never exceeds pre-lapse stability.
  return Math.max(0.1, Math.min(forget, s));
};

const addDays = (from: UtcTimestamp, days: number): UtcTimestamp =>
  new Date(Date.parse(from) + days * 86_400_000).toISOString() as UtcTimestamp;

/**
 * Schedule the next review. `state` is null for a first review. `now` is the
 * review time; `elapsedDays` is time since last review (ignored on first).
 */
export function schedule(
  state: ReviewState | null,
  rating: ReviewRating,
  now: UtcTimestamp,
  cfg: FsrsConfig = FSRS_CONFIG,
): ReviewState {
  const w = cfg.weights;

  if (state === null) {
    const stability = initialStability(w, rating);
    const difficulty = initialDifficulty(w, rating);
    return {
      stability,
      difficulty,
      due: addDays(now, intervalDays(stability, cfg)),
      lastReviewedAt: now,
      reps: 1,
      lapses: rating === 'again' ? 1 : 0,
    };
  }

  const elapsedDays = Math.max(0, (Date.parse(now) - Date.parse(state.lastReviewedAt)) / 86_400_000);
  const r = retrievability(state.stability, elapsedDays);
  const difficulty = nextDifficulty(w, state.difficulty, rating);
  const stability =
    rating === 'again'
      ? stabilityAfterForget(w, state.difficulty, state.stability, r)
      : stabilityAfterRecall(w, state.difficulty, state.stability, r, rating);

  return {
    stability,
    difficulty,
    due: addDays(now, intervalDays(stability, cfg)),
    lastReviewedAt: now,
    reps: state.reps + 1,
    lapses: state.lapses + (rating === 'again' ? 1 : 0),
  };
}

/** Bound a due date so a "mature" memory cannot next surface after the exam. */
export function clampDueToExam(due: UtcTimestamp, examDate: UtcTimestamp | null): UtcTimestamp {
  if (examDate === null) return due;
  // Latest scheduled callback is exam minus 2 days (provisional).
  const latest = new Date(Date.parse(examDate) - 2 * 86_400_000).toISOString() as UtcTimestamp;
  return Date.parse(due) > Date.parse(latest) ? latest : due;
}
