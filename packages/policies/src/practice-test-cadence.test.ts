import { describe, expect, it } from 'vitest';
import {
  cadencePhase,
  decidePracticeTest,
  PRACTICE_TEST_CADENCE_CONFIG,
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

describe('practice test cadence — cap of one per week', () => {
  it('refuses a second test within 7 days of the last', () => {
    const d = decide({ testsCompleted: 1, lastTestDate: '2026-02-26', lastTestReviewed: true }); // 3 days ago
    expect(d.due).toBe(false);
    expect(d.reason).toBe('capped_this_week');
    expect(d.nextEligibleDate).toBe('2026-03-05'); // lastTest + 7
  });

  it('never exceeds one per week even if a phase interval were shorter', () => {
    // Weekly phase (near exam), last test 6 days ago → still capped.
    const d = decide({
      testsCompleted: 4,
      lastTestDate: '2026-02-24',
      examDate: '2026-03-20', // 19 days out → weekly phase
    });
    expect(d.phase).toBe('weekly');
    expect(d.due).toBe(false);
    expect(d.reason).toBe('capped_this_week');
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

describe('practice test cadence — phase ramp (monthly → biweekly → weekly)', () => {
  it('is monthly far from the exam', () => {
    expect(cadencePhase(120)).toBe('monthly');
    const d = decide({
      testsCompleted: 2,
      lastTestDate: '2026-02-20', // 9 days ago (< 28)
      examDate: '2026-07-01', // ~122 days out
    });
    expect(d.phase).toBe('monthly');
    expect(d.due).toBe(false);
    expect(d.reason).toBe('not_due_recent');
    expect(d.nextEligibleDate).toBe('2026-03-20'); // lastTest + 28
  });

  it('is biweekly in the mid-range', () => {
    expect(cadencePhase(50)).toBe('biweekly');
    const d = decide({
      testsCompleted: 3,
      lastTestDate: '2026-02-16', // 13 days ago (< 14)
      examDate: '2026-04-20', // ~50 days out
    });
    expect(d.phase).toBe('biweekly');
    expect(d.due).toBe(false);
    expect(d.nextEligibleDate).toBe('2026-03-02'); // lastTest + 14
  });

  it('is weekly in the final stretch and becomes due after 7 days', () => {
    expect(cadencePhase(20)).toBe('weekly');
    const d = decide({
      testsCompleted: 5,
      lastTestDate: '2026-02-22', // 7 days ago
      examDate: '2026-03-18', // ~17 days out → weekly, outside blackout
    });
    expect(d.phase).toBe('weekly');
    expect(d.due).toBe(true);
    expect(d.reason).toBe('cadence_due');
  });

  it('with no exam date set, defaults to the monthly cadence', () => {
    const d = decide({ testsCompleted: 2, lastTestDate: '2026-02-25', examDate: null });
    expect(d.phase).toBe('monthly');
    expect(d.daysToExam).toBeNull();
  });
});

describe('practice test cadence — config sanity', () => {
  it('caps at one per week and blacks out the final days', () => {
    expect(PRACTICE_TEST_CADENCE_CONFIG.minDaysBetweenTests).toBe(7);
    expect(PRACTICE_TEST_CADENCE_CONFIG.blackoutDaysBeforeExam).toBeGreaterThanOrEqual(4);
    expect(PRACTICE_TEST_CADENCE_CONFIG.blackoutDaysBeforeExam).toBeLessThanOrEqual(5);
    // Cadence tightens toward the exam.
    expect(PRACTICE_TEST_CADENCE_CONFIG.intervals.monthly).toBeGreaterThan(
      PRACTICE_TEST_CADENCE_CONFIG.intervals.biweekly,
    );
    expect(PRACTICE_TEST_CADENCE_CONFIG.intervals.biweekly).toBeGreaterThan(
      PRACTICE_TEST_CADENCE_CONFIG.intervals.weekly,
    );
  });
});
