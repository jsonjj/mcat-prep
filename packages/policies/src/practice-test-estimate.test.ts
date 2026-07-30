import { describe, expect, it } from 'vitest';
import {
  estimatePracticeTestScaled,
  practiceReadinessLabel,
  PRACTICE_TEST_SCALED_MAX,
  PRACTICE_TEST_SCALED_MIN,
} from './practice-test-estimate';

describe('practice test estimate — conservative %→scaled RANGE', () => {
  it('anchors the mapping: 0%→472, 50%→~500, 100%→528', () => {
    expect(estimatePracticeTestScaled(0).point).toBe(PRACTICE_TEST_SCALED_MIN);
    expect(estimatePracticeTestScaled(50).point).toBe(500);
    expect(estimatePracticeTestScaled(100).point).toBe(PRACTICE_TEST_SCALED_MAX);
  });

  it('always returns a RANGE (low < high), never a single point', () => {
    const est = estimatePracticeTestScaled(60, 115);
    expect(est.low).toBeLessThan(est.high);
    expect(est.low).toBeLessThanOrEqual(est.point);
    expect(est.point).toBeLessThanOrEqual(est.high);
  });

  it('widens the band on shorter forms (more uncertainty, sampled thinner)', () => {
    const long = estimatePracticeTestScaled(60, 115);
    const short = estimatePracticeTestScaled(60, 30);
    const width = (e: { low: number; high: number }) => e.high - e.low;
    expect(width(short)).toBeGreaterThan(width(long));
  });

  it('clamps to the 472–528 scale at the extremes', () => {
    const top = estimatePracticeTestScaled(100, 30);
    const bottom = estimatePracticeTestScaled(0, 30);
    expect(top.high).toBe(PRACTICE_TEST_SCALED_MAX);
    expect(bottom.low).toBe(PRACTICE_TEST_SCALED_MIN);
  });

  it('labels readiness in three conservative bands', () => {
    expect(practiceReadinessLabel(40)).toBe('building');
    expect(practiceReadinessLabel(60)).toBe('approaching');
    expect(practiceReadinessLabel(75)).toBe('on_track');
  });
});
