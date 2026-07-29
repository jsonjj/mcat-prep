import { describe, expect, it } from 'vitest';
import { REVIEW_LINE } from './forgetting';
import {
  CALIBRATION_CONFIG,
  classifyCalibration,
  classifyResponseSpeed,
  type ItemResponseTime,
} from './calibration';

/**
 * WS1 calibration classifier. Pure: every case is a table row of inputs → band,
 * plus the fallback branch and the "not captured" (null) handling the WS0 NULL
 * columns exist to preserve.
 */

/** An item with a trusted median (>= the sample floor). */
const median = (medianMs: number, sampleSize = CALIBRATION_CONFIG.minMedianSamples): ItemResponseTime => ({
  medianMs,
  sampleSize,
});

describe('classifyCalibration — confidently_wrong (fast + wrong)', () => {
  it('flags a fast miss against a trusted item median', () => {
    // 40s median, answered in 15s (< 50% of 40s = 20s) → fast.
    expect(classifyCalibration(false, 15_000, 0, null, median(40_000))).toBe('confidently_wrong');
  });

  it('flags a fast miss against the fixed fallback when no median is known', () => {
    // < fastFallbackMs (15s) and no median → fast via fallback.
    expect(classifyCalibration(false, 10_000, 0, null, null)).toBe('confidently_wrong');
  });

  it('falls back to the fixed threshold when the median has too few samples', () => {
    // The 40s median would make 10s fast anyway, but with n<20 it is not trusted,
    // so the FIXED fast cutoff (15s) is what applies here — 10s < 15s → fast.
    const thin: ItemResponseTime = { medianMs: 40_000, sampleSize: 19 };
    expect(classifyCalibration(false, 10_000, 0, null, thin)).toBe('confidently_wrong');
  });

  it('does not call a fast miss confident once answer-changes exceed the tolerance', () => {
    // Fast, but flip-flopped 3 times (> maxConfidentAnswerChanges = 2) → not confident.
    expect(classifyCalibration(false, 5_000, 3, null, null)).toBe('normal');
    // At the tolerance it still counts as confident.
    expect(classifyCalibration(false, 5_000, 2, null, null)).toBe('confidently_wrong');
  });
});

describe('classifyCalibration — shaky_win (correct + slow or weak KC)', () => {
  it('flags a slow win against a trusted item median', () => {
    // 40s median, took 70s (> 150% of 40s = 60s) → slow → shaky even in a strong KC.
    expect(classifyCalibration(true, 70_000, 0, 0.99, median(40_000))).toBe('shaky_win');
  });

  it('flags a slow win against the fixed fallback (diagnostic SLOW_MS analog)', () => {
    // > slowFallbackMs (90s), no median → slow via fallback.
    expect(classifyCalibration(true, 95_000, 0, 0.99, null)).toBe('shaky_win');
  });

  it('flags a normal-speed win when the KC is still below the review line', () => {
    const weak = REVIEW_LINE - 0.2;
    expect(classifyCalibration(true, 40_000, 0, weak, median(40_000))).toBe('shaky_win');
  });

  it('does not flag a normal-speed win in a solid KC', () => {
    expect(classifyCalibration(true, 40_000, 0, REVIEW_LINE, median(40_000))).toBe('normal');
    expect(classifyCalibration(true, 40_000, 0, 0.99, median(40_000))).toBe('normal');
  });
});

describe('classifyCalibration — normal', () => {
  it('returns normal for a wrong answer taken at a normal pace', () => {
    expect(classifyCalibration(false, 40_000, 0, 0.5, median(40_000))).toBe('normal');
  });

  it('returns normal for a slow miss (not fast, so not confidently wrong)', () => {
    expect(classifyCalibration(false, 95_000, 0, null, null)).toBe('normal');
  });
});

describe('classifyCalibration — "not captured" nulls are no signal, never zero', () => {
  it('treats a null elapsedMs as neither fast nor slow', () => {
    // Wrong + no timing → cannot be confidently wrong.
    expect(classifyCalibration(false, null, 0, null, null)).toBe('normal');
    // Correct + no timing + solid KC → nothing shaky about it.
    expect(classifyCalibration(true, null, 0, 0.99, null)).toBe('normal');
    // Correct + no timing but a weak KC → still shaky (the KC signal stands alone).
    expect(classifyCalibration(true, null, 0, REVIEW_LINE - 0.1, null)).toBe('shaky_win');
  });

  it('treats a null kcMastery as not-weak', () => {
    expect(classifyCalibration(true, 40_000, 0, null, median(40_000))).toBe('normal');
  });

  it('treats a null answerChanges as not disqualifying for confidence', () => {
    expect(classifyCalibration(false, 5_000, null, null, null)).toBe('confidently_wrong');
  });
});

describe('classifyResponseSpeed', () => {
  it('buckets around the trusted median', () => {
    const m = median(60_000);
    expect(classifyResponseSpeed(20_000, m)).toBe('fast'); // < 30s
    expect(classifyResponseSpeed(60_000, m)).toBe('normal');
    expect(classifyResponseSpeed(100_000, m)).toBe('slow'); // > 90s
  });

  it('uses the fixed fallbacks when the median is absent or a zero', () => {
    expect(classifyResponseSpeed(10_000, null)).toBe('fast');
    expect(classifyResponseSpeed(95_000, null)).toBe('slow');
    expect(classifyResponseSpeed(50_000, null)).toBe('normal');
    // A degenerate zero median is not trusted; fall back rather than divide into it.
    expect(classifyResponseSpeed(10_000, { medianMs: 0, sampleSize: 999 })).toBe('fast');
  });

  it('honours an A/B override of the thresholds', () => {
    // Halve the fast fallback: 10s is no longer fast.
    expect(classifyResponseSpeed(10_000, null, { ...CALIBRATION_CONFIG, fastFallbackMs: 5_000 })).toBe(
      'normal',
    );
  });
});
