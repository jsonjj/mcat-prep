import type { PolicyManifest } from './manifest';

/**
 * Cadence guardrails for the periodic practice test (WS5, §6).
 *
 * The testing effect and spacing are only worth as much as the *schedule* that
 * delivers them: too rare and there is no retrieval practice, too frequent and a
 * half-length test crowds out the studying it is meant to measure, and one landed
 * on exam eve is pure fatigue. This decides, for a given day, whether a practice
 * test is due — and it is deliberately conservative, refusing far more often than
 * it approves.
 *
 * Four rules, in strict precedence:
 *
 *  1. **Blackout before the exam.** No test within ~`blackoutDaysBeforeExam` of
 *     test day. The final days are for rest and light review, not a 3-hour sitting.
 *  2. **Block until the prior test is reviewed.** The next test is refused while
 *     the last one's review is still open. A test whose misses were never worked
 *     is retrieval practice thrown away; forcing the review first is the whole
 *     point of the loop.
 *  3. **Cap of one per week.** A hard minimum gap, independent of phase, so a
 *     misconfigured phase can never exceed it.
 *  4. **Phase cadence.** The interval ramps as the exam nears: a baseline first
 *     test, then monthly, then biweekly, then weekly in the final stretch.
 *
 * Pure functions only, dates as `YYYY-MM-DD` (learner-local day). The
 * Today's-Path engine reads the decision; it does not recompute it.
 */

export const PRACTICE_TEST_CADENCE_MANIFEST: PolicyManifest = {
  policyId: 'practice-test-cadence',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Periodic practice-test schedule: baseline then monthly → biweekly → weekly as the exam nears, ' +
    'a hard cap of one per week, a blackout window in the final days before the exam, and a block on ' +
    'the next test until the prior one has been reviewed.',
};

export type PracticeTestPhase = 'baseline' | 'monthly' | 'biweekly' | 'weekly';

export type PracticeTestCadenceReason =
  | 'baseline'
  | 'cadence_due'
  | 'not_due_recent'
  | 'blocked_unreviewed'
  | 'blackout_before_exam'
  | 'capped_this_week';

export interface PracticeTestCadenceConfig {
  /** Hard minimum gap between two tests (the "cap 1/week"). */
  readonly minDaysBetweenTests: number;
  /** No test within this many days of the exam. */
  readonly blackoutDaysBeforeExam: number;
  /** Days-to-exam at or under which cadence goes weekly. */
  readonly weeklyWithinDays: number;
  /** Days-to-exam at or under which cadence goes biweekly (above → monthly). */
  readonly biweeklyWithinDays: number;
  /** Interval for each phase, in days. */
  readonly intervals: Readonly<Record<PracticeTestPhase, number>>;
}

export const PRACTICE_TEST_CADENCE_CONFIG: PracticeTestCadenceConfig = {
  minDaysBetweenTests: 7,
  blackoutDaysBeforeExam: 5,
  weeklyWithinDays: 28, // final ~4 weeks: weekly
  biweeklyWithinDays: 70, // ~10 → 4 weeks out: biweekly
  intervals: { baseline: 0, monthly: 28, biweekly: 14, weekly: 7 },
};

/**
 * How long a half-length sitting is reserved for in Today's Path, in minutes.
 *
 * A scored MCAT is 230 items over ~6¼ hours of testing time; a half-length form
 * is ~115 items ({@link HALF_LENGTH_BLUEPRINT}), so ~3 hours end to end. The
 * Today's-Path engine reserves this atomically — the test IS the day on a small
 * budget — so it is a single scheduling constant rather than a per-item sum.
 */
export const PRACTICE_TEST_ESTIMATED_MINUTES = 180;

export interface PracticeTestCadenceInput {
  /** Today, learner-local, `YYYY-MM-DD`. */
  readonly today: string;
  /** Exam day, `YYYY-MM-DD`, or null when the learner has set no date. */
  readonly examDate: string | null;
  /** The last practice test's date, or null if none has been taken. */
  readonly lastTestDate: string | null;
  /** Whether the last test's review has been completed. Ignored when none exists. */
  readonly lastTestReviewed: boolean;
  /** How many practice tests the learner has completed (drives the baseline case). */
  readonly testsCompleted: number;
}

export interface PracticeTestCadenceDecision {
  readonly due: boolean;
  readonly reason: PracticeTestCadenceReason;
  readonly phase: PracticeTestPhase;
  /** Whole days until the exam, or null when no date is set. */
  readonly daysToExam: number | null;
  /**
   * The earliest date a test could next be due, `YYYY-MM-DD`, or null when it is
   * due now or cannot be computed (no prior test / blocked on review).
   */
  readonly nextEligibleDate: string | null;
}

const DAY_MS = 86_400_000;

/** Parse a `YYYY-MM-DD` (or ISO) day to a UTC-midnight epoch. */
const dayMs = (date: string): number => {
  const iso = date.length > 10 ? date.slice(0, 10) : date;
  return Date.parse(`${iso}T00:00:00.000Z`);
};

/** Whole days from `a` to `b` (positive when `b` is later). */
const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / DAY_MS);

/** `YYYY-MM-DD` of `date` shifted by `days`. */
const addDays = (date: string, days: number): string =>
  new Date(dayMs(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The cadence phase for a given days-to-exam. `baseline` is reserved for the very
 * first test and is decided in {@link decidePracticeTest}, not here.
 */
export function cadencePhase(
  daysToExam: number | null,
  cfg: PracticeTestCadenceConfig = PRACTICE_TEST_CADENCE_CONFIG,
): Exclude<PracticeTestPhase, 'baseline'> {
  if (daysToExam !== null) {
    if (daysToExam <= cfg.weeklyWithinDays) return 'weekly';
    if (daysToExam <= cfg.biweeklyWithinDays) return 'biweekly';
  }
  return 'monthly';
}

/**
 * Decide whether a practice test is due today, and why. See the file header for
 * the four rules and their precedence.
 */
export function decidePracticeTest(
  input: PracticeTestCadenceInput,
  cfg: PracticeTestCadenceConfig = PRACTICE_TEST_CADENCE_CONFIG,
): PracticeTestCadenceDecision {
  const daysToExam = input.examDate !== null ? daysBetween(input.today, input.examDate) : null;
  const isBaseline = input.testsCompleted <= 0 || input.lastTestDate === null;
  const phase: PracticeTestPhase = isBaseline ? 'baseline' : cadencePhase(daysToExam, cfg);

  const decision = (
    due: boolean,
    reason: PracticeTestCadenceReason,
    nextEligibleDate: string | null,
  ): PracticeTestCadenceDecision => ({ due, reason, phase, daysToExam, nextEligibleDate });

  // 1. Blackout: never within the final days before the exam (nor on/after it).
  if (daysToExam !== null && daysToExam <= cfg.blackoutDaysBeforeExam) {
    return decision(false, 'blackout_before_exam', null);
  }

  // 2. Block the next test until the prior one's review is done.
  if (input.lastTestDate !== null && !input.lastTestReviewed) {
    return decision(false, 'blocked_unreviewed', null);
  }

  // Baseline: the first test, due as soon as nothing blocks it.
  if (input.lastTestDate === null) {
    return decision(true, 'baseline', null);
  }

  const sinceLast = daysBetween(input.lastTestDate, input.today);

  // 3. Hard weekly cap, independent of phase.
  if (sinceLast < cfg.minDaysBetweenTests) {
    return decision(false, 'capped_this_week', addDays(input.lastTestDate, cfg.minDaysBetweenTests));
  }

  // 4. Phase cadence: due once the phase interval has elapsed since the last test.
  const interval = Math.max(cfg.minDaysBetweenTests, cfg.intervals[phase]);
  if (sinceLast >= interval) {
    return decision(true, 'cadence_due', null);
  }
  return decision(false, 'not_due_recent', addDays(input.lastTestDate, interval));
}
