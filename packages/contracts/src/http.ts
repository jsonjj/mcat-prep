import { z } from 'zod';
import { GuestBootstrapResponseSchema, SyncSubmitRequestSchema } from './api';
import { AttemptCommandSchema, GoalCommandSchema } from './commands';
import { ErrorCodeSchema } from './errors';
import { EventIdSchema } from './ids';
import {
  ErrorEntryViewSchema,
  MasteryMapEntrySchema,
  StudyStepViewSchema,
  TodayViewSchema,
} from './learner-views';
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
  session: { method: 'GET', path: '/v1/learning/session', response: StudyStepViewSchema },
  attempt: { method: 'POST', path: '/v1/attempts', body: AttemptCommandSchema },
  sync: { method: 'POST', path: '/v1/sync', body: SyncSubmitRequestSchema },
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
