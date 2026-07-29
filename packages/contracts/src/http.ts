import { z } from 'zod';
import { GuestBootstrapResponseSchema, SyncSubmitRequestSchema } from './api';
import { AttemptCommandSchema, GoalCommandSchema } from './commands';
import { ErrorCodeSchema } from './errors';
import { EventIdSchema } from './ids';
import {
  ErrorEntryViewSchema,
  MasteryMapEntrySchema,
  MistakePatternViewSchema,
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
    response: GuestBootstrapResponseSchema,
  },
  goal: { method: 'PUT', path: '/v1/profile/goal', body: GoalCommandSchema },
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
