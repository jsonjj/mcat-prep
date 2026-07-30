/**
 * Calibration classifier (WS1) — a PURE, read-only behavioural band for one
 * scored first attempt. It is the signal the Mistakes surface ranks by: a miss
 * the learner answered fast and wrong is the best hypercorrection target (a
 * confident error, best retained once corrected), while a win that came slowly or
 * lands in a still-weak KC is "shaky" and worth another rep.
 *
 * WRITES NO MASTERY. Every input is read from records the attempt already
 * produced (WS0 timing, the KC's current P(L)); nothing here feeds BKT, evidence,
 * or the review queue. It is deliberately kept out of `packages/authority-core`'s
 * one mastery door for exactly that reason.
 *
 * Thresholds are A/B-TUNABLE consts on `CALIBRATION_CONFIG`, per the spec:
 * - "fast" = `elapsedMs` below `fastMedianFraction` (0.5) of the item's median
 *   response time; "slow" = above `slowMedianFraction` (1.5) of it.
 * - The median is only trusted once the item has `minMedianSamples` (20)
 *   timing samples; below that, or when no median is known at all, speed falls
 *   back to FIXED thresholds (`fastFallbackMs`, `slowFallbackMs`). The slow
 *   fallback mirrors the diagnostic's `SLOW_MS` (90 s).
 * - "weak KC" = the KC's current mastery below `weakKcLine`, a DEDICATED low cut
 *   (`WEAK_KC_LINE`), NOT the 0.9 BKT review line — see that constant for why.
 *
 * BANDS (spec §11.2):
 * - `confidently_wrong` = wrong AND fast. The two WS0 confidence proxies are read
 *   together: a fast answer the learner flip-flopped on more than
 *   `maxConfidentAnswerChanges` times was not "confident", so it demotes to
 *   `normal`. `answerChanges` is only ever a demoter here; it never promotes a
 *   slow miss to confident.
 * - `shaky_win` = correct AND (slow OR weak KC). The spec also lists "a still-open
 *   miss in that KC" as an equivalent weakness signal; v1 represents weakness by
 *   the KC's P(L) against the dedicated weak-KC line (a KC with an open miss is
 *   below it in practice), and the normalized still-open-miss axis is deferred.
 * - `normal` otherwise.
 *
 * A `null` input means "not captured" and is treated as no signal, NOT as zero:
 * a null `elapsedMs` is neither fast nor slow, and a null `kcMastery` is not weak.
 * This is the distinction WS0 preserved by storing timing NULL rather than 0.
 */
import type { CalibrationBand } from '@mcat/contracts';

export type { CalibrationBand };

/**
 * KC mastery below this counts as "genuinely weak" for the shaky-win arm.
 *
 * DELIBERATELY DECOUPLED from the 0.9 BKT review/decay line (`REVIEW_LINE`). The
 * review line marks where an already-MASTERED unit has decayed far enough to be
 * worth a spaced rep; borrowing it here as the weakness cut was a category error.
 * A KC climbs from the `0.2` cold-start prior (`PRIOR_PL0`) and stays below `0.9`
 * for essentially its whole learning curve, so `kcMastery < 0.9` held for almost
 * every pre-mastery correct answer — nearly every early science win banded
 * `shaky_win`, drowning the worst-first signal the Mistakes surface ranks by.
 *
 * `0.35` sits just above the `0.2` prior and far below the `0.95` mastery cut: a
 * single clean correct answer lifts a fresh KC's P(L) past it (~0.55 after one
 * correct from the prior), so an unaided win no longer reads as shaky, while a KC
 * still dragging below `0.35` after real practice — the genuinely weak case —
 * still does. It is an A/B knob on `CALIBRATION_CONFIG`, and it must never be
 * re-coupled to `REVIEW_LINE`.
 *
 * A fresh KC with NO recorded observations is weak on nothing — the prior is not
 * evidence — so its weakness is expressed to the classifier as a `null` mastery
 * input (no signal), not as a value below this line. See the null-handling
 * contract below and `Authority.calibrationFor`.
 */
export const WEAK_KC_LINE = 0.35;

/**
 * The item's population response-time summary, or null when none is available.
 * `medianMs` is the median deliberation time across learners; `sampleSize` is how
 * many timed attempts that median rests on. Below `minMedianSamples` the median
 * is not trusted and the fixed fallback thresholds are used instead.
 */
export interface ItemResponseTime {
  readonly medianMs: number | null;
  readonly sampleSize: number;
}

export interface CalibrationConfig {
  /** "fast" cutoff as a fraction of the item median (default 0.5 = 50%). */
  readonly fastMedianFraction: number;
  /** "slow" cutoff as a fraction of the item median (default 1.5 = 150%). */
  readonly slowMedianFraction: number;
  /** Minimum timed samples before the item median is trusted (default 20). */
  readonly minMedianSamples: number;
  /** Fixed "fast" cutoff (ms) when no trusted median exists (default 15 s). */
  readonly fastFallbackMs: number;
  /** Fixed "slow" cutoff (ms) when no trusted median exists (default 90 s). */
  readonly slowFallbackMs: number;
  /** KC mastery below this counts as "weak" (default `WEAK_KC_LINE`, a dedicated
   * low cut — NOT the BKT review line). */
  readonly weakKcLine: number;
  /** Above this many pre-commit selection changes, a fast miss is not "confident". */
  readonly maxConfidentAnswerChanges: number;
}

/**
 * Defaults per docs/master-build-spec.md §11.2. Every field is an A/B knob: a
 * cohort override supplies a partial config and the classifier reads it instead.
 */
export const CALIBRATION_CONFIG: CalibrationConfig = {
  fastMedianFraction: 0.5,
  slowMedianFraction: 1.5,
  minMedianSamples: 20,
  fastFallbackMs: 15_000,
  slowFallbackMs: 90_000,
  weakKcLine: WEAK_KC_LINE,
  maxConfidentAnswerChanges: 2,
};

/** Deliberation-time band for one attempt. `normal` also covers "not captured". */
export type ResponseSpeed = 'fast' | 'slow' | 'normal';

/**
 * Bucket one attempt's deliberation time. Uses the item median once it has enough
 * samples, otherwise the fixed fallback thresholds. A null/negative `elapsedMs` is
 * "not captured" → `normal` (no speed signal), never treated as an instant `0`.
 */
export function classifyResponseSpeed(
  elapsedMs: number | null,
  itemMedianTime: ItemResponseTime | null,
  cfg: CalibrationConfig = CALIBRATION_CONFIG,
): ResponseSpeed {
  if (elapsedMs === null || elapsedMs < 0) return 'normal';
  const median = itemMedianTime?.medianMs ?? null;
  const trustMedian =
    median !== null && median > 0 && (itemMedianTime?.sampleSize ?? 0) >= cfg.minMedianSamples;
  if (trustMedian) {
    if (elapsedMs < cfg.fastMedianFraction * median) return 'fast';
    if (elapsedMs > cfg.slowMedianFraction * median) return 'slow';
    return 'normal';
  }
  if (elapsedMs < cfg.fastFallbackMs) return 'fast';
  if (elapsedMs > cfg.slowFallbackMs) return 'slow';
  return 'normal';
}

/**
 * The calibration band for one scored first attempt.
 *
 * @param correct         whether the first attempt was correct
 * @param elapsedMs       deliberation time to submit, ms; null when not captured
 * @param answerChanges   pre-commit selection changes; null when not captured
 * @param kcMastery       the KC's current P(L) in [0,1]; null when unknown
 * @param itemMedianTime  the item's population RT summary; null when unavailable
 */
export function classifyCalibration(
  correct: boolean,
  elapsedMs: number | null,
  answerChanges: number | null,
  kcMastery: number | null,
  itemMedianTime: ItemResponseTime | null,
  cfg: CalibrationConfig = CALIBRATION_CONFIG,
): CalibrationBand {
  const speed = classifyResponseSpeed(elapsedMs, itemMedianTime, cfg);
  const weakKc = kcMastery !== null && kcMastery < cfg.weakKcLine;

  if (correct) {
    return speed === 'slow' || weakKc ? 'shaky_win' : 'normal';
  }

  // A miss. Confident = fast, and not flip-flopped past the tolerance. Answer
  // changes only ever weaken the confidence claim; they cannot manufacture one.
  const confident =
    speed === 'fast' &&
    (answerChanges === null || answerChanges <= cfg.maxConfidentAnswerChanges);
  return confident ? 'confidently_wrong' : 'normal';
}
