/**
 * Forgetting layer for the mastery engine (mastery-bkt).
 *
 * Each unit carries a memory half-life `H` (days). `P(L)` decays as
 * `P(L) * 2^(-elapsedDays / H)`. Decay is computed **lazily** from
 * `lastPracticedAt` (no cron): the stored `pL` is always the value as-of the last
 * practice, and callers read the current value via `currentPL`.
 *
 * A "due review" is a practice that happens *after* the decayed `P(L)` has fallen
 * below the review line. A successful due review doubles `H` (7 → 14 → 28 …);
 * a failed one resets `H` to `H_0`. See docs/mastery-pipeline.md §4.4.
 *
 * Pure functions only.
 */
import type { UtcTimestamp } from '@mcat/contracts';
import { bktUpdate, type BktConfig, type BktObservation, BKT_CONFIG } from './bkt';

/** Initial memory half-life (days). */
export const INITIAL_HALF_LIFE = 7;
/** Practicing below this decayed `P(L)` counts as a due (spaced) review. */
export const REVIEW_LINE = 0.9;
/** Half-life multiplier on a successful due review. */
export const HALF_LIFE_GROWTH = 2;

const DAY_MS = 86_400_000;

export interface ForgettingConfig {
  initialHalfLife: number;
  reviewLine: number;
  halfLifeGrowth: number;
}

export const FORGETTING_CONFIG: ForgettingConfig = {
  initialHalfLife: INITIAL_HALF_LIFE,
  reviewLine: REVIEW_LINE,
  halfLifeGrowth: HALF_LIFE_GROWTH,
};

/** Per-unit memory state persisted per learner. `pL` is the value as-of `lastPracticedAt`. */
export interface MemoryState {
  pL: number;
  halfLifeDays: number;
  /** Null until the unit has ever been practiced (no decay applies before then). */
  lastPracticedAt: UtcTimestamp | null;
  /** Last time a due (spaced) review occurred, for auditing. */
  lastDueReviewAt: UtcTimestamp | null;
}

/** A fresh memory state at a given prior (defaults to the BKT prior). */
export const initialMemoryState = (pL: number = BKT_CONFIG.priorPL0): MemoryState => ({
  pL,
  halfLifeDays: INITIAL_HALF_LIFE,
  lastPracticedAt: null,
  lastDueReviewAt: null,
});

const fractionalDaysBetween = (from: UtcTimestamp, to: UtcTimestamp): number =>
  Math.max(0, (Date.parse(to) - Date.parse(from)) / DAY_MS);

/** Decay `pL` over `elapsedDays` given half-life `H`: `pL * 2^(-elapsedDays/H)`. */
export function decayPL(pL: number, elapsedDays: number, halfLifeDays: number): number {
  if (elapsedDays <= 0 || halfLifeDays <= 0) return pL;
  return pL * Math.pow(2, -elapsedDays / halfLifeDays);
}

/** The unit's `P(L)` right now, applying lazy decay since it was last practiced. */
export function currentPL(state: MemoryState, now: UtcTimestamp): number {
  if (state.lastPracticedAt === null) return state.pL;
  return decayPL(state.pL, fractionalDaysBetween(state.lastPracticedAt, now), state.halfLifeDays);
}

/** Whether a practice at this decayed value counts as a due (spaced) review. */
export const isDueReview = (decayedPL: number, cfg: ForgettingConfig = FORGETTING_CONFIG): boolean =>
  decayedPL < cfg.reviewLine;

export interface StepInput {
  observation: BktObservation;
  now: UtcTimestamp;
  /**
   * Net performance to judge the half-life change on a due review. Defaults to the
   * observation's correctness; the authority can override with the session net so a
   * single mid-session miss does not reset `H`.
   */
  dueReviewNetCorrect?: boolean;
}

export interface StepResult {
  state: MemoryState;
  /** True if this practice was a due (spaced) review (decayed `P(L)` < review line). */
  wasDueReview: boolean;
}

/**
 * Apply one independent practice to a unit's memory: lazy-decay to `now`, run the
 * BKT update, and grow/reset the half-life if it was a due review. The returned
 * `pL` is stored as-of `now` (the new `lastPracticedAt`).
 */
export function stepMemory(
  state: MemoryState,
  input: StepInput,
  bkt: BktConfig = BKT_CONFIG,
  cfg: ForgettingConfig = FORGETTING_CONFIG,
): StepResult {
  const decayed = currentPL(state, input.now);
  const wasDueReview = state.lastPracticedAt !== null && isDueReview(decayed, cfg);

  const updatedPL = bktUpdate(decayed, input.observation, bkt);

  let halfLifeDays = state.halfLifeDays;
  if (wasDueReview) {
    const netCorrect = input.dueReviewNetCorrect ?? input.observation.correct;
    halfLifeDays = netCorrect ? state.halfLifeDays * cfg.halfLifeGrowth : cfg.initialHalfLife;
  }

  return {
    state: {
      pL: updatedPL,
      halfLifeDays,
      lastPracticedAt: input.now,
      lastDueReviewAt: wasDueReview ? input.now : state.lastDueReviewAt,
    },
    wasDueReview,
  };
}
