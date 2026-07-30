import { describe, expect, it } from 'vitest';
import {
  cadencePhase,
  decidePracticeTest,
  practiceTestLengthTier,
  practiceTestReadiness,
  PRACTICE_TEST_CADENCE_CONFIG,
  PRACTICE_TEST_TIER_MINUTES,
  type PracticeTestCadenceInput,
} from './practice-test-cadence';

const base: PracticeTestCadenceInput = {
  today: '2026-03-01',
  examDate: null,
  lastTestDate: null,
  lastTestReviewed: true,
  testsCompleted: 0,
};

const decide = (over: Partial<PracticeTestCadenceInput>) => decidePracticeTest({ ...base, ...over });

describe('practice test cadence — baseline', () => {
  it('schedules a baseline test when none has been taken', () => {
    const d = decide({ testsCompleted: 0, lastTestDate: null });
    expect(d.due).toBe(true);
    expect(d.reason).toBe('baseline');
    expect(d.phase).toBe('baseline');
  });

  it('does not schedule a baseline inside the pre-exam blackout', () => {
    const d = decide({ testsCompleted: 0, lastTestDate: null, examDate: '2026-03-04' }); // 3 days out
    expect(d.due).toBe(false);
    expect(d.reason).toBe('blackout_before_exam');
  });
});

describe('practice test cadence — cap of one per day', () => {
  it('refuses a second test on the same day as the last', () => {
    const d = decide({ testsCompleted: 1, lastTestDate: '2026-03-01', lastTestReviewed: true }); // today
    expect(d.due).toBe(false);
    expect(d.reason).toBe('capped_today');
    expect(d.nextEligibleDate).toBe('2026-03-02'); // lastTest + 1
  });

  it('is not capped once a day has passed (the ramp then decides)', () => {
    // A day ago clears the 1/day cap; the early ramp (~6d) then holds it back.
    const d = decide({ testsCompleted: 2, lastTestDate: '2026-02-28', lastTestReviewed: true });
    expect(d.reason).not.toBe('capped_today');
  });
});

describe('practice test cadence — blackout window before the exam', () => {
  it('refuses any test within ~5 days of test day', () => {
    const d = decide({
      testsCompleted: 3,
      lastTestDate: '2026-02-01',
      examDate: '2026-03-05', // 4 days out
    });
    expect(d.due).toBe(false);
    expect(d.reason).toBe('blackout_before_exam');
  });

  it('allows a test just outside the blackout window', () => {
    const d = decide({
      testsCompleted: 3,
      lastTestDate: '2026-01-20', // well over a week ago
      examDate: '2026-03-10', // 9 days out → outside 5-day blackout, weekly phase
    });
    expect(d.reason).not.toBe('blackout_before_exam');
    expect(d.due).toBe(true);
  });
});

describe('practice test cadence — block until the prior test is reviewed', () => {
  it('refuses the next test while the last one is unreviewed', () => {
    const d = decide({
      testsCompleted: 1,
      lastTestDate: '2026-01-01', // long ago, cadence would otherwise be due
      lastTestReviewed: false,
    });
    expect(d.due).toBe(false);
    expect(d.reason).toBe('blocked_unreviewed');
  });

  it('the block outranks a due cadence AND a weekly-cap pass', () => {
    const d = decide({
      testsCompleted: 3,
      lastTestDate: '2026-01-01',
      lastTestReviewed: false,
      examDate: '2026-03-25', // weekly-ish, way past interval
    });
    expect(d.due).toBe(false);
    expect(d.reason).toBe('blocked_unreviewed');
  });

  it('releases the next test once the prior is reviewed', () => {
    const d = decide({
      testsCompleted: 1,
      lastTestDate: '2026-01-01',
      lastTestReviewed: true,
    });
    expect(d.due).toBe(true);
    expect(d.reason).toBe('cadence_due');
  });
});

describe('practice test cadence — frequency ramp (early → mid → final)', () => {
  it('is early (~every 6 days) far from the exam', () => {
    expect(cadencePhase(120)).toBe('early');
    const d = decide({
      testsCompleted: 2,
      lastTestDate: '2026-02-26', // 3 days ago (< 6)
      examDate: '2026-07-01', // ~122 days out
    });
    expect(d.phase).toBe('early');
    expect(d.due).toBe(false);
    expect(d.reason).toBe('not_due_recent');
    expect(d.nextEligibleDate).toBe('2026-03-04'); // lastTest + 6
  });

  it('becomes due in the early ramp once ~6 days have passed', () => {
    const d = decide({
      testsCompleted: 2,
      lastTestDate: '2026-02-22', // 7 days ago (>= 6)
      examDate: '2026-07-01',
    });
    expect(d.phase).toBe('early');
    expect(d.due).toBe(true);
    expect(d.reason).toBe('cadence_due');
  });

  it('is mid (~every 3 days) in the mid-range', () => {
    expect(cadencePhase(50)).toBe('mid');
    const d = decide({
      testsCompleted: 3,
      lastTestDate: '2026-02-27', // 2 days ago (< 3)
      examDate: '2026-04-20', // ~50 days out
    });
    expect(d.phase).toBe('mid');
    expect(d.due).toBe(false);
    expect(d.nextEligibleDate).toBe('2026-03-02'); // lastTest + 3
  });

  it('is final (near-daily, ~every 2 days) in the last ~3 weeks', () => {
    expect(cadencePhase(20)).toBe('final');
    const d = decide({
      testsCompleted: 5,
      lastTestDate: '2026-02-27', // 2 days ago (>= 2)
      examDate: '2026-03-18', // ~17 days out → final, outside blackout
    });
    expect(d.phase).toBe('final');
    expect(d.due).toBe(true);
    expect(d.reason).toBe('cadence_due');
  });

  it('with no exam date set, defaults to the early cadence', () => {
    const d = decide({ testsCompleted: 2, lastTestDate: '2026-02-25', examDate: null });
    expect(d.phase).toBe('early');
    expect(d.daysToExam).toBeNull();
  });
});

describe('practice test cadence — config sanity', () => {
  it('caps at one per day and blacks out the final days', () => {
    expect(PRACTICE_TEST_CADENCE_CONFIG.minDaysBetweenTests).toBe(1);
    expect(PRACTICE_TEST_CADENCE_CONFIG.blackoutDaysBeforeExam).toBeGreaterThanOrEqual(4);
    expect(PRACTICE_TEST_CADENCE_CONFIG.blackoutDaysBeforeExam).toBeLessThanOrEqual(5);
    // The ramp tightens toward the exam: early is least frequent, final most.
    expect(PRACTICE_TEST_CADENCE_CONFIG.intervals.early).toBeGreaterThan(
      PRACTICE_TEST_CADENCE_CONFIG.intervals.mid,
    );
    expect(PRACTICE_TEST_CADENCE_CONFIG.intervals.mid).toBeGreaterThan(
      PRACTICE_TEST_CADENCE_CONFIG.intervals.final,
    );
    // Every ramp interval respects the one-per-day floor.
    expect(PRACTICE_TEST_CADENCE_CONFIG.intervals.final).toBeGreaterThanOrEqual(
      PRACTICE_TEST_CADENCE_CONFIG.minDaysBetweenTests,
    );
  });
});

describe('practice test length tier — stage signal (mastery + lessons + days-to-exam)', () => {
  it('is SHORT early: low mastery, few lessons, far from the exam', () => {
    expect(
      practiceTestLengthTier({ daysToExam: 120, masteryPct: 0, lessonCompletionPct: 0 }),
    ).toBe('short');
    // A rolling plan (no exam date) with nothing learned yet is also short.
    expect(
      practiceTestLengthTier({ daysToExam: null, masteryPct: 0.05, lessonCompletionPct: 0.05 }),
    ).toBe('short');
  });

  it('is STANDARD mid-prep', () => {
    expect(
      practiceTestLengthTier({ daysToExam: 60, masteryPct: 0.4, lessonCompletionPct: 0.6 }),
    ).toBe('standard');
  });

  it('is LONG in the final weeks with high readiness', () => {
    expect(
      practiceTestLengthTier({ daysToExam: 14, masteryPct: 0.7, lessonCompletionPct: 0.9 }),
    ).toBe('long');
  });

  it('never serves the shortest tier inside the final ~3 weeks (rehearsal floor)', () => {
    // Blend alone would pick short (low mastery/lessons), but ≤21 days floors it up.
    expect(
      practiceTestLengthTier({ daysToExam: 21, masteryPct: 0, lessonCompletionPct: 0 }),
    ).toBe('standard');
  });

  it('readiness rises monotonically with mastery, completion, and proximity', () => {
    const early = practiceTestReadiness({ daysToExam: 120, masteryPct: 0.1, lessonCompletionPct: 0.1 });
    const mid = practiceTestReadiness({ daysToExam: 60, masteryPct: 0.4, lessonCompletionPct: 0.5 });
    const late = practiceTestReadiness({ daysToExam: 10, masteryPct: 0.8, lessonCompletionPct: 0.9 });
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(late);
  });

  it('decidePracticeTest carries the length tier alongside the schedule', () => {
    const shortDue = decidePracticeTest({
      today: '2026-03-01',
      examDate: '2026-08-01', // far out
      lastTestDate: null,
      lastTestReviewed: true,
      testsCompleted: 0,
      masteryPct: 0,
      lessonCompletionPct: 0,
    });
    expect(shortDue.due).toBe(true);
    expect(shortDue.tier).toBe('short');

    const longDue = decidePracticeTest({
      today: '2026-03-01',
      examDate: '2026-03-18', // ~17 days out → final ramp
      lastTestDate: '2026-02-26',
      lastTestReviewed: true,
      testsCompleted: 4,
      masteryPct: 0.75,
      lessonCompletionPct: 0.9,
    });
    expect(longDue.tier).toBe('long');
    expect(PRACTICE_TEST_TIER_MINUTES[longDue.tier]).toBe(180);
  });
});
