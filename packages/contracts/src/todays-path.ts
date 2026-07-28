import { z } from 'zod';
import { CommandEnvelopeSchema } from './commands';
import { GhostViewSchema, PlannerReasonSchema } from './learner-views';

/**
 * Today's Path — the daily learning-plan engine's wire contract.
 *
 * Today's Path ORCHESTRATES the existing feature engines (CARS Duel, Recall,
 * Lessons, Practice, Review Mistakes) and writes NO mastery itself. It reads the
 * mastery/forgetting/coverage/review-debt state, sizes the day to a minutes
 * budget, and emits an ordered, time-boxed list of activities the client runs
 * one-at-a-time.
 *
 * Because Recall (fact flashcards) and the app-native lesson catalog live on the
 * client, the client feeds a small load summary + candidate-lesson list into the
 * build command; the server does the scoring/sizing/ordering and persists it.
 */

/** Daily time-budget presets: 2 / 3 / 4 / 5 / 6 hours, expressed in minutes. */
export const DAILY_MINUTES_PRESETS = [120, 180, 240, 300, 360] as const;
export type DailyMinutesPreset = (typeof DAILY_MINUTES_PRESETS)[number];

/** Daily time-budget bounds (minutes): learners may pick any value from 2 to 6 hours. */
export const DAILY_MINUTES_MIN = 120; // 2 hr
export const DAILY_MINUTES_MAX = 360; // 6 hr
export const DAILY_MINUTES_DEFAULT = 240; // 4 hr

export const PlanActivityKindSchema = z.enum([
  'cars_duel',
  'recall',
  'review_mistakes',
  'lesson',
  'practice',
]);
export type PlanActivityKind = z.infer<typeof PlanActivityKindSchema>;

export const PlanActivityStatusSchema = z.enum([
  'ready',
  'in_progress',
  'complete',
  'skipped',
  // Bumped to tomorrow when a dynamic Mistakes session displaces the last item.
  'snoozed',
]);
export type PlanActivityStatus = z.infer<typeof PlanActivityStatusSchema>;

/** How full the recall review queue is relative to the day — drives new-work throttling. */
export const ReviewDebtBandSchema = z.enum(['normal', 'reduce_new', 'pause_new']);
export type ReviewDebtBand = z.infer<typeof ReviewDebtBandSchema>;

/** One scheduled activity in the day's plan (already sized + ordered). */
export const PlanActivityViewSchema = z
  .object({
    activityId: z.string().min(1),
    kind: PlanActivityKindSchema,
    title: z.string().min(1),
    detail: z.string().min(1),
    estimatedMinutes: z.number().int().positive(),
    /** Count handed to the launched engine (Practice X / Recall cards / mistakes count); null for CARS. */
    count: z.number().int().nonnegative().nullable(),
    /** Minutes budget handed to Recall (it converts minutes→cards at run time); null otherwise. */
    minutesBudget: z.number().nonnegative().nullable(),
    /** Optional weakness focus token passed to Practice (cluster / reasoning op / cars). */
    focus: z.string().min(1).nullable(),
    /** App-native lesson slug to launch (/app/lesson/:slug); null otherwise. */
    lessonSlug: z.string().min(1).nullable(),
    lessonId: z.string().min(1).nullable(),
    priorityReason: PlannerReasonSchema,
    status: PlanActivityStatusSchema,
    carriedOver: z.boolean(),
  })
  .strict();
export type PlanActivityView = z.infer<typeof PlanActivityViewSchema>;

export const TodaysPathViewSchema = z
  .object({
    /** True once a plan has been built for the current day; false means "call build". */
    built: z.boolean(),
    planDate: z.string(), // YYYY-MM-DD (learner local, 4 AM rollover)
    dailyMinutesPreset: z.number().int().positive(),
    dailyBudgetMinutes: z.number().int().nonnegative(),
    plannedMinutes: z.number().int().nonnegative(),
    capacityLabel: z.enum(['on_track', 'tight', 'goal_plan_mismatch', 'rolling']),
    dayNumber: z.number().int().positive(),
    totalDays: z.number().int().positive().nullable(),
    reviewSharePct: z.number().min(0).max(1),
    reviewDebtBand: ReviewDebtBandSchema,
    activities: z.array(PlanActivityViewSchema),
    currentActivityId: z.string().min(1).nullable(),
    /** Leftover budget after the (bounded) plan — offered as optional free study, not required. */
    freeStudyMinutes: z.number().int().nonnegative(),
    ghost: GhostViewSchema,
  })
  .strict();
export type TodaysPathView = z.infer<typeof TodaysPathViewSchema>;

/** Source of an independent miss that increments the (count-only) mistake tally. */
export const MistakeSourceSchema = z.enum(['practice', 'cars', 'lesson']);
export type MistakeSource = z.infer<typeof MistakeSourceSchema>;

export const RecordMistakeCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    source: MistakeSourceSchema,
  })
  .strict();
export type RecordMistakeCommand = z.infer<typeof RecordMistakeCommandSchema>;

/** Recall load the client reads from its (client-side) FSRS store and feeds up. */
export const RecallLoadInputSchema = z
  .object({
    dueLearning: z.number().int().nonnegative(),
    dueReviews: z.number().int().nonnegative(),
    newAvailable: z.number().int().nonnegative(),
    due: z.number().int().nonnegative(),
    estimatedMinutesForDue: z.number().nonnegative(),
  })
  .strict();
export type RecallLoadInput = z.infer<typeof RecallLoadInputSchema>;

/**
 * A schedulable lesson the client offers as a candidate (app-native catalog).
 * The server scores it using the drivers that have data (section exam-weight,
 * KC count as an unlock proxy, coverage/deadline urgency) + its own mastery
 * reads (to exclude mastered lessons); it never trusts the client for mastery.
 */
export const CandidateLessonInputSchema = z
  .object({
    lessonId: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    section: z.string().min(1).nullable(),
    cluster: z.string().min(1).nullable(),
    kcCount: z.number().int().nonnegative(),
    /** KC ids this lesson teaches (drives per-KC teach-before-test for Practice). */
    kcIds: z.array(z.string().min(1)),
    /**
     * Lesson ids that must be COMPLETED before this one unlocks. Empty today;
     * populated once the authored prerequisite map is provided (the pipeline is
     * ready to honor it: only-unlocked, prereqs-first, score-by-downstream).
     */
    prerequisiteLessonIds: z.array(z.string().min(1)),
    estimatedMinutes: z.number().int().positive(),
  })
  .strict();
export type CandidateLessonInput = z.infer<typeof CandidateLessonInputSchema>;

export const BuildTodaysPathInputSchema = z
  .object({
    recallLoad: RecallLoadInputSchema,
    candidateLessons: z.array(CandidateLessonInputSchema).max(200),
    /** Force a fresh rebuild even if a plan already exists for today. */
    force: z.boolean(),
    /** Client `Date.getTimezoneOffset()` (UTC−local minutes) for a learner-local day boundary. */
    timezoneOffsetMinutes: z.number().int().optional(),
  })
  .strict();
export type BuildTodaysPathInput = z.infer<typeof BuildTodaysPathInputSchema>;

export const BuildTodaysPathCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    input: BuildTodaysPathInputSchema,
  })
  .strict();
export type BuildTodaysPathCommand = z.infer<typeof BuildTodaysPathCommandSchema>;

export const PlanActivityProgressCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    activityId: z.string().min(1),
    status: z.enum(['in_progress', 'complete', 'skipped']),
  })
  .strict();
export type PlanActivityProgressCommand = z.infer<typeof PlanActivityProgressCommandSchema>;

export const DailyBudgetCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    // Any value from 2 to 6 hours (the client offers a free hours+minutes input).
    minutesPerDay: z.number().int().min(DAILY_MINUTES_MIN).max(DAILY_MINUTES_MAX),
  })
  .strict();
export type DailyBudgetCommand = z.infer<typeof DailyBudgetCommandSchema>;

/**
 * Convert a scheduler minutes budget to a question count. Mirrors Recall's
 * `minutesToCardCount`; Practice's locked cost is ~2 minutes/question.
 */
export const DEFAULT_MINUTES_PER_QUESTION = 2;
export function minutesToQuestionCount(
  minutes: number,
  minutesPerQuestion: number = DEFAULT_MINUTES_PER_QUESTION,
): number {
  const per = minutesPerQuestion > 0 ? minutesPerQuestion : DEFAULT_MINUTES_PER_QUESTION;
  return Math.max(0, Math.floor(minutes / per));
}
