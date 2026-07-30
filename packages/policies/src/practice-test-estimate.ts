import type { PolicyManifest } from './manifest';

/**
 * Conservative %-correct → scaled-score ESTIMATE for the periodic practice test
 * (WS5, §6).
 *
 * A practice test is scored as a plain %-correct (`practice-test-scorer.ts`), but
 * the learner-facing dashboard wants a scaled-score feel (472–528). There is no
 * validated concordance from a synthetic-bank %-correct to an official scaled
 * score, and pretending otherwise is exactly the kind of fabricated number the
 * product refuses — so this returns a deliberately WIDE RANGE, never a single
 * point, and it is always labelled "estimate, not a single score" where shown.
 *
 * The mapping is a straight, conservative line: 0% → 472, 50% → 500 (the ~median
 * scaled score), 100% → 528. The uncertainty band widens on shorter forms, which
 * sample capability more thinly, so a 30-item checkpoint carries a visibly looser
 * estimate than a 115-item full-length. Pure functions only.
 */

export const PRACTICE_TEST_ESTIMATE_MANIFEST: PolicyManifest = {
  policyId: 'practice-test-estimate',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Conservative %-correct → scaled-score RANGE (472–528) for the practice-test dashboard: a straight ' +
    'line through 50%→500, widened into a band that loosens on shorter forms. Never a single score; ' +
    'no validated concordance is claimed.',
};

/** MCAT scaled-score bounds: 472–528 total across the four sections. */
export const PRACTICE_TEST_SCALED_MIN = 472;
export const PRACTICE_TEST_SCALED_MAX = 528;

export interface PracticeTestEstimateConfig {
  /** Base ± half-width of the range, in scaled points. */
  readonly baseBand: number;
  /** Extra ± half-width added when the form served fewer than `standardItems`. */
  readonly shortFormBand: number;
  /** Extra ± half-width added again when the form served fewer than `shortItems`. */
  readonly veryShortFormBand: number;
  readonly standardItems: number;
  readonly shortItems: number;
  /** %-correct thresholds for the three readiness bands. */
  readonly approachingAtPct: number;
  readonly onTrackAtPct: number;
}

export const PRACTICE_TEST_ESTIMATE_CONFIG: PracticeTestEstimateConfig = {
  baseBand: 5,
  shortFormBand: 3,
  veryShortFormBand: 2,
  standardItems: 59,
  shortItems: 35,
  approachingAtPct: 55,
  onTrackAtPct: 70,
};

export type PracticeReadinessLabel = 'building' | 'approaching' | 'on_track';

export interface EstimatedScaled {
  /** Single midpoint (for a past test's stored `scaledScore`). */
  readonly point: number;
  /** Range bounds — what the dashboard shows. */
  readonly low: number;
  readonly high: number;
}

const clampScaled = (n: number): number =>
  Math.max(PRACTICE_TEST_SCALED_MIN, Math.min(PRACTICE_TEST_SCALED_MAX, Math.round(n)));

/**
 * Estimate a scaled-score midpoint + range from a whole-test %-correct (0–100).
 * `itemsScored` only widens the band on shorter forms; it never moves the center.
 */
export function estimatePracticeTestScaled(
  pctCorrect: number,
  itemsScored = 0,
  cfg: PracticeTestEstimateConfig = PRACTICE_TEST_ESTIMATE_CONFIG,
): EstimatedScaled {
  const pct = Math.max(0, Math.min(100, pctCorrect));
  const span = PRACTICE_TEST_SCALED_MAX - PRACTICE_TEST_SCALED_MIN;
  const center = PRACTICE_TEST_SCALED_MIN + (pct / 100) * span;
  let band = cfg.baseBand;
  if (itemsScored > 0 && itemsScored < cfg.standardItems) band += cfg.shortFormBand;
  if (itemsScored > 0 && itemsScored < cfg.shortItems) band += cfg.veryShortFormBand;
  const low = clampScaled(center - band);
  const high = clampScaled(center + band);
  return { point: clampScaled(center), low, high: Math.max(low, high) };
}

/** Three-band readiness label from a whole-test %-correct (0–100). */
export function practiceReadinessLabel(
  pctCorrect: number,
  cfg: PracticeTestEstimateConfig = PRACTICE_TEST_ESTIMATE_CONFIG,
): PracticeReadinessLabel {
  if (pctCorrect >= cfg.onTrackAtPct) return 'on_track';
  if (pctCorrect >= cfg.approachingAtPct) return 'approaching';
  return 'building';
}
