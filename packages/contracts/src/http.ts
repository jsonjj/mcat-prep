import { z } from 'zod';
import { BootstrapEnvelopeSchema, SyncSubmitRequestSchema } from './api';
import {
  SessionExchangeRequestSchema,
  SessionExchangeResponseSchema,
  SignOutResponseSchema,
} from './auth';
import { AttemptCommandSchema, GoalCommandSchema, GoalViewSchema } from './commands';
import { ErrorCodeSchema } from './errors';
import { EventIdSchema } from './ids';
import {
  CarsReasoningPatternViewSchema,
  ErrorEntryViewSchema,
  LessonWarrantViewSchema,
  MasteryMapEntrySchema,
  MistakePatternViewSchema,
  RepairQueueViewSchema,
  StudyStepViewSchema,
  TodayViewSchema,
} from './learner-views';
import {
  CarsReadinessViewSchema,
  LessonMasteryViewSchema,
  SkillMasteryViewSchema,
} from './mastery';
import {
  PracticeAttemptCommandSchema,
  PracticeAttemptResultSchema,
  PracticeQueueViewSchema,
} from './practice';
import { PracticeTestSummaryViewSchema } from './practice-test';
import {
  BuildTodaysPathCommandSchema,
  DailyBudgetCommandSchema,
  PlanActivityProgressCommandSchema,
  TodaysPathViewSchema,
} from './todays-path';
import { UtcTimestampSchema } from './time';
import {
  VectorLessonCommandSchema,
  VectorLessonRunViewSchema,
  VectorLessonStartCommandSchema,
  VectorLessonStartResponseSchema,
  VectorLessonStatusViewSchema,
} from './v3-vector-lesson';

export const HttpErrorCodeSchema = z.enum([...ErrorCodeSchema.options, 'stream_conflict']);
export type HttpErrorCode = z.infer<typeof HttpErrorCodeSchema>;

/** Error body safe for client display and telemetry. Arbitrary detail bags are forbidden. */
export const HttpApiErrorSchema = z
  .object({
    code: HttpErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    retryable: z.boolean(),
    path: z.string().min(1).optional(),
    currentStreamVersion: z.number().int().nonnegative().optional(),
  })
  .strict();
export type HttpApiError = z.infer<typeof HttpApiErrorSchema>;

export const LearnerSnapshotSchema = z
  .object({
    streamVersion: z.number().int().nonnegative(),
    contentRelease: z.string().min(1),
    today: TodayViewSchema.nullable(),
    session: StudyStepViewSchema,
    masteryMap: z.array(MasteryMapEntrySchema),
    errorLog: z.array(ErrorEntryViewSchema),
    errorPatterns: z.array(MistakePatternViewSchema),
    /**
     * Correct-but-shaky first attempts (WS3): wins that came slowly or landed in
     * a still-weak KC and are worth another rep. Same `ErrorEntryView` shape as
     * `errorLog`, but always `calibration: 'shaky_win'`; kept SEPARATE from
     * `errorLog` so misses-only readers (open-mistakes count, Today's Path repair
     * scheduling) never treat a win as a miss.
     */
    shakyWins: z.array(ErrorEntryViewSchema),
  })
  .strict();
export type LearnerSnapshot = z.infer<typeof LearnerSnapshotSchema>;

export const AcceptedCommandResponseSchema = z
  .object({
    eventId: EventIdSchema,
    sequence: z.number().int().positive(),
    streamVersion: z.number().int().nonnegative(),
    acceptedAt: UtcTimestampSchema,
  })
  .strict();
export type AcceptedCommandResponse = z.infer<typeof AcceptedCommandResponseSchema>;

export const HTTP_API = {
  bootstrap: {
    method: 'POST',
    path: '/v1/bootstrap',
    response: BootstrapEnvelopeSchema,
  },
  // Session exchange. The only route callable without a session. Credentials
  // never reach this API — the browser authenticates against Supabase and sends
  // only the resulting access token here.
  authSessionExchange: {
    method: 'POST',
    path: '/v1/auth/session',
    body: SessionExchangeRequestSchema,
    response: SessionExchangeResponseSchema,
  },
  authSignOut: {
    method: 'POST',
    path: '/v1/auth/signout',
    response: SignOutResponseSchema,
  },
  goal: { method: 'PUT', path: '/v1/profile/goal', body: GoalCommandSchema },
  // Read-only goal projection so the Account/Profile editor can prefill (WS8).
  // Same path as the PUT writer, distinguished by method.
  goalView: { method: 'GET', path: '/v1/profile/goal', response: GoalViewSchema },
  today: { method: 'GET', path: '/v1/plan/today', response: TodayViewSchema },
  // Today's Path — the daily learning-plan engine (orchestrates the other engines).
  todaysPath: { method: 'GET', path: '/v1/plan/today/path', response: TodaysPathViewSchema },
  todaysPathBuild: {
    method: 'POST',
    path: '/v1/plan/today/build',
    body: BuildTodaysPathCommandSchema,
    response: TodaysPathViewSchema,
  },
  todaysPathActivity: {
    method: 'POST',
    path: '/v1/plan/today/activity',
    body: PlanActivityProgressCommandSchema,
    response: AcceptedCommandResponseSchema,
  },
  dailyBudget: {
    method: 'PUT',
    path: '/v1/profile/daily-budget',
    body: DailyBudgetCommandSchema,
    response: AcceptedCommandResponseSchema,
  },
  session: { method: 'GET', path: '/v1/learning/session', response: StudyStepViewSchema },
  errors: { method: 'GET', path: '/v1/errors', response: z.array(ErrorEntryViewSchema) },
  /** Recurring-miss patterns at KC / cluster grain (never misconception grain). */
  errorPatterns: {
    method: 'GET',
    path: '/v1/errors/patterns',
    response: z.array(MistakePatternViewSchema),
  },
  /** Correct-but-shaky wins worth another rep (WS3); same view shape as errors. */
  shakyWins: {
    method: 'GET',
    path: '/v1/errors/shaky-wins',
    response: z.array(ErrorEntryViewSchema),
  },
  /** CARS reasoning-pattern repairs from weak duels (WS7); a distinct sub-skill surface. */
  carsReasoningPatterns: {
    method: 'GET',
    path: '/v1/errors/cars-reasoning',
    response: z.array(CarsReasoningPatternViewSchema),
  },
  /**
   * The guided repair queue for the Review-Mistakes runner — a prioritized,
   * servability-filtered, capped subset of the four Mistakes buckets. Path-
   * parameterized (`/v1/mistakes/repair/{limit}`) for the same reason the practice
   * queue is (the authority edge rejects query strings; the client appends the
   * segment).
   */
  mistakesRepair: {
    method: 'GET',
    path: '/v1/mistakes/repair',
    response: RepairQueueViewSchema,
  },
  progressSkills: {
    method: 'GET',
    path: '/v1/progress/skills',
    response: z.array(SkillMasteryViewSchema),
  },
  progressLessons: {
    method: 'GET',
    path: '/v1/progress/lessons',
    response: z.array(LessonMasteryViewSchema),
  },
  /**
   * The lesson-grain evidence warrant, beside `progressLessons` rather than on
   * it: one payload may not carry a capability estimate and the warrant. See
   * `LessonWarrantViewSchema`.
   */
  progressLessonWarrants: {
    method: 'GET',
    path: '/v1/progress/lesson-warrants',
    response: z.array(LessonWarrantViewSchema),
  },
  progressCars: {
    method: 'GET',
    path: '/v1/progress/cars',
    response: CarsReadinessViewSchema,
  },
  attempt: { method: 'POST', path: '/v1/attempts', body: AttemptCommandSchema },
  sync: { method: 'POST', path: '/v1/sync', body: SyncSubmitRequestSchema },
  // Adaptive Practice (count-based test-out). The queue is path-parameterized
  // (`/v1/practice/queue/{x}` and `/v1/practice/queue/{x}/{focus}`) because the
  // authority edge rejects query strings; the client appends the segments. The
  // adaptive attempt is deliberately namespaced so it never collides with the
  // single-item Passage-of-the-Day `POST /v1/practice/attempts`.
  practiceQueue: { method: 'GET', path: '/v1/practice/queue', response: PracticeQueueViewSchema },
  practiceAdaptiveAttempt: {
    method: 'POST',
    path: '/v1/practice/attempts/adaptive',
    body: PracticeAttemptCommandSchema,
    response: PracticeAttemptResultSchema,
  },
  /**
   * Practice-TEST dashboard summary (the amber card on Practice). The scored
   * full/half-length engine is deferred, so the deployed backend does not serve
   * this yet: a client treats the missing route as `null` (graceful data path),
   * and the card shows its existing "coming soon" states. `null` is also the
   * honest response once the engine ships but the learner has taken no test.
   */
  practiceTestSummary: {
    method: 'GET',
    path: '/v1/practice-test/summary',
    response: PracticeTestSummaryViewSchema.nullable(),
  },
  vectorLessonStatus: {
    method: 'GET',
    path: '/v1/lessons/vectors-and-trigonometry/status',
    response: VectorLessonStatusViewSchema,
  },
  vectorLessonStart: {
    method: 'POST',
    path: '/v1/lessons/vectors-and-trigonometry/start',
    body: VectorLessonStartCommandSchema,
    response: VectorLessonStartResponseSchema,
  },
  vectorLessonRun: {
    method: 'GET',
    path: '/v1/lessons/vectors-and-trigonometry/run',
    response: VectorLessonRunViewSchema,
  },
  vectorLessonCommand: {
    method: 'POST',
    path: '/v1/lessons/vectors-and-trigonometry/commands',
    body: VectorLessonCommandSchema,
    response: AcceptedCommandResponseSchema,
  },
} as const;
