import type { PolicyManifest } from './manifest';
import type { PracticeTestLengthTier } from './practice-test-assembler';

/**
 * Cadence + length guardrails for the periodic practice test (WS5, §6).
 *
 * The testing effect and spacing are only worth as much as the *schedule* that
 * delivers them: too rare and there is no retrieval practice, too frequent and a
 * test crowds out the studying it is meant to measure, and one landed on exam eve
 * is pure fatigue. This decides, for a given day, whether a practice test is due
 * AND how long it should be — and it is deliberately conservative, refusing far
 * more often than it approves.
 *
 * The frequency RAMPS as the exam nears (and as readiness climbs): ~every 5–7
 * days early → ~every 2–3 days mid → near-daily in the final ~3 weeks. It never
 * exceeds one per day, and it blacks out the final days before the exam.
 *
 * Five rules, in strict precedence:
 *
 *  1. **Blackout before the exam.** No test within ~`blackoutDaysBeforeExam` of
 *     test day. The final days are for rest and light review, not a long sitting.
 *  2. **Block until the prior test is reviewed.** The next test is refused while
 *     the last one's review is still open. A test whose misses were never worked
 *     is retrieval practice thrown away; forcing the review first is the whole
 *     point of the loop.
 *  3. **Cap of one per day.** A hard minimum gap, independent of phase, so a
 *     misconfigured phase can never serve two tests in a day.
 *  4. **Phase cadence.** The interval ramps as the exam nears: a baseline first
 *     test, then early (~6d) → mid (~3d) → final (~2d, near-daily).
 *
 * Every decision also carries the LENGTH TIER the due test should be dealt at
 * ({@link practiceTestLengthTier}), blended from mastery, lesson completion, and
 * days-to-exam. Pure functions only, dates as `YYYY-MM-DD` (learner-local day).
 * The Today's-Path engine reads the decision; it does not recompute it.
 */

export const PRACTICE_TEST_CADENCE_MANIFEST: PolicyManifest = {
  policyId: 'practice-test-cadence',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary:
    'Periodic practice-test schedule + length: baseline then a frequency ramp of early (~6d) → mid ' +
    '(~3d) → final (~2d, near-daily) as the exam nears, a hard cap of one per day, a blackout window ' +
    'in the final days before the exam, and a block on the next test until the prior one is reviewed. ' +
    'The due test is sized short / standard / long from a mastery + lesson-completion + days-to-exam ' +
    'stage signal.',
};

/** Cadence ramp phases (frequency), distinct from the length tier the test is dealt at. */
export type PracticeTestPhase = 'baseline' | 'early' | 'mid' | 'final';

export type PracticeTestCadenceReason =
  | 'baseline'
  | 'cadence_due'
  | 'not_due_recent'
  | 'blocked_unreviewed'
  | 'blackout_before_exam'
  | 'capped_today';

export interface PracticeTestCadenceConfig {
  /** Hard minimum gap between two tests (the "cap 1/day"). */
  readonly minDaysBetweenTests: number;
  /** No test within this many days of the exam. */
  readonly blackoutDaysBeforeExam: number;
  /** Days-to-exam at or under which cadence goes to the near-daily `final` ramp (~3 weeks). */
  readonly finalWithinDays: number;
  /** Days-to-exam at or under which cadence goes `mid` (above → `early`). */
  readonly midWithinDays: number;
  /** Interval for each phase, in days (the ramp). */
  readonly intervals: Readonly<Record<PracticeTestPhase, number>>;
}

export const PRACTICE_TEST_CADENCE_CONFIG: PracticeTestCadenceConfig = {
  minDaysBetweenTests: 1, // max one per day
  blackoutDaysBeforeExam: 5,
  finalWithinDays: 21, // final ~3 weeks: near-daily
  midWithinDays: 63, // ~9 → 3 weeks out: every 2–3 days
  // early ~ every 5–7 days, mid ~ every 2–3 days, final ~ near-daily.
  intervals: { baseline: 0, early: 6, mid: 3, final: 2 },
};

/**
 * Reserved minutes in Today's Path per length tier (WS5).
 *
 * A short checkpoint is ~30 items (~40 min), a standard half-length ~59 items
 * (~90 min), a long full-length ~115 items (~3 h). The Today's-Path engine
 * reserves the whole sitting atomically — the test IS the day on a small budget —
 * so these are single scheduling constants rather than per-item sums.
 */
export const PRACTICE_TEST_TIER_MINUTES: Readonly<Record<PracticeTestLengthTier, number>> = {
  short: 40,
  standard: 90,
  long: 180,
};

/**
 * Back-compat default reservation (the `long` tier). Prefer
 * {@link PRACTICE_TEST_TIER_MINUTES} keyed by the decided tier.
 */
export const PRACTICE_TEST_ESTIMATED_MINUTES = PRACTICE_TEST_TIER_MINUTES.long;

/** Stage-signal → length-tier configuration (all weights sum to 1). */
export interface PracticeTestStageConfig {
  /** Days-to-exam at/above which exam-proximity contributes ~0. */
  readonly horizonDays: number;
  /** Blend weights for the readiness signal. */
  readonly weights: { readonly mastery: number; readonly lessons: number; readonly proximity: number };
  /** Proximity used when the learner has set no exam date (a rolling plan). */
  readonly noExamProximity: number;
  /** Readiness below this → short; below `standardBelow` → standard; else → long. */
  readonly shortBelow: number;
  readonly standardBelow: number;
  /** Within this many days of the exam a test is a rehearsal, never the shortest tier. */
  readonly nearExamFloorDays: number;
}

export const PRACTICE_TEST_STAGE_CONFIG: PracticeTestStageConfig = {
  horizonDays: 120,
  weights: { mastery: 0.35, lessons: 0.25, proximity: 0.4 },
  noExamProximity: 0.35,
  shortBelow: 0.34,
  standardBelow: 0.66,
  nearExamFloorDays: 21,
};

export interface PracticeTestStageInput {
  /** Whole days until the exam, or null for a rolling plan. */
  readonly daysToExam: number | null;
  /** Blended current mastery in [0,1] (e.g. mean reasoning-skill P(L)). */
  readonly masteryPct: number;
  /** Fraction of candidate lessons completed in [0,1]. */
  readonly lessonCompletionPct: number;
}

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
  /** Blended current mastery in [0,1] for the length-tier signal (default 0). */
  readonly masteryPct?: number;
  /** Fraction of candidate lessons completed in [0,1] for the length-tier signal (default 0). */
  readonly lessonCompletionPct?: number;
}

export interface PracticeTestCadenceDecision {
  readonly due: boolean;
  readonly reason: PracticeTestCadenceReason;
  readonly phase: PracticeTestPhase;
  /** The length tier the due test should be dealt at (also reported when not due). */
  readonly tier: PracticeTestLengthTier;
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

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * The cadence ramp phase for a given days-to-exam. `baseline` is reserved for the
 * very first test and is decided in {@link decidePracticeTest}, not here.
 */
export function cadencePhase(
  daysToExam: number | null,
  cfg: PracticeTestCadenceConfig = PRACTICE_TEST_CADENCE_CONFIG,
): Exclude<PracticeTestPhase, 'baseline'> {
  if (daysToExam !== null) {
    if (daysToExam <= cfg.finalWithinDays) return 'final';
    if (daysToExam <= cfg.midWithinDays) return 'mid';
  }
  return 'early';
}

/**
 * The stage/readiness signal in [0,1], a weighted blend of current mastery,
 * lesson completion, and exam proximity. Higher = further along, so a longer test
 * is warranted. A rolling plan (no exam date) uses a modest fixed proximity so
 * the signal still leans on mastery + completion.
 */
export function practiceTestReadiness(
  input: PracticeTestStageInput,
  cfg: PracticeTestStageConfig = PRACTICE_TEST_STAGE_CONFIG,
): number {
  const proximity =
    input.daysToExam === null
      ? cfg.noExamProximity
      : clamp01(1 - Math.max(0, input.daysToExam) / cfg.horizonDays);
  const w = cfg.weights;
  return clamp01(
    w.mastery * clamp01(input.masteryPct) +
      w.lessons * clamp01(input.lessonCompletionPct) +
      w.proximity * proximity,
  );
}

/**
 * Map the stage signal to a length tier: early stages get a SHORT checkpoint,
 * mid-prep the STANDARD half-length, the final weeks / high readiness the LONG
 * full-length. Within the final ~3 weeks a test is a rehearsal, so it is never
 * the shortest tier even if the blend would pick it.
 */
export function practiceTestLengthTier(
  input: PracticeTestStageInput,
  cfg: PracticeTestStageConfig = PRACTICE_TEST_STAGE_CONFIG,
): PracticeTestLengthTier {
  const readiness = practiceTestReadiness(input, cfg);
  let tier: PracticeTestLengthTier =
    readiness < cfg.shortBelow ? 'short' : readiness < cfg.standardBelow ? 'standard' : 'long';
  if (input.daysToExam !== null && input.daysToExam <= cfg.nearExamFloorDays && tier === 'short') {
    tier = 'standard';
  }
  return tier;
}

/**
 * Decide whether a practice test is due today, why, and how long it should be.
 * See the file header for the rules and their precedence; the tier is computed
 * independently of due-ness (so a caller can preview the next test's length).
 */
export function decidePracticeTest(
  input: PracticeTestCadenceInput,
  cfg: PracticeTestCadenceConfig = PRACTICE_TEST_CADENCE_CONFIG,
  stageCfg: PracticeTestStageConfig = PRACTICE_TEST_STAGE_CONFIG,
): PracticeTestCadenceDecision {
  const daysToExam = input.examDate !== null ? daysBetween(input.today, input.examDate) : null;
  const isBaseline = input.testsCompleted <= 0 || input.lastTestDate === null;
  const phase: PracticeTestPhase = isBaseline ? 'baseline' : cadencePhase(daysToExam, cfg);
  const tier = practiceTestLengthTier(
    {
      daysToExam,
      masteryPct: input.masteryPct ?? 0,
      lessonCompletionPct: input.lessonCompletionPct ?? 0,
    },
    stageCfg,
  );

  const decision = (
    due: boolean,
    reason: PracticeTestCadenceReason,
    nextEligibleDate: string | null,
  ): PracticeTestCadenceDecision => ({ due, reason, phase, tier, daysToExam, nextEligibleDate });

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

  // 3. Hard cap of one per day, independent of phase.
  if (sinceLast < cfg.minDaysBetweenTests) {
    return decision(false, 'capped_today', addDays(input.lastTestDate, cfg.minDaysBetweenTests));
  }

  // 4. Phase cadence: due once the phase interval has elapsed since the last test.
  const interval = Math.max(cfg.minDaysBetweenTests, cfg.intervals[phase]);
  if (sinceLast >= interval) {
    return decision(true, 'cadence_due', null);
  }
  return decision(false, 'not_due_recent', addDays(input.lastTestDate, interval));
}
