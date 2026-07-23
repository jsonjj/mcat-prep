import { z } from 'zod';
import {
  ContentIdSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  LessonRunIdSchema,
  TaskInstanceIdSchema,
  V3ActivityIdSchema,
} from './ids';
import { LessonActivityResponseInputSchema } from './lesson-run';
import { DateOnlySchema, UtcTimestampSchema } from './time';
import { AssistanceLevelSchema } from './vocab';

/**
 * Client-authored metadata for a consequential command. Learner ownership is
 * deliberately absent: the server derives it from the authenticated session.
 */
export const CommandEnvelopeSchema = z
  .object({
    eventId: EventIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    occurredAt: UtcTimestampSchema,
    expectedStreamVersion: z.number().int().nonnegative(),
    contentRelease: z.string().min(1),
    taskInstanceId: TaskInstanceIdSchema,
  })
  .strict();
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;

export const GoalInputSchema = z
  .object({
    testDate: DateOnlySchema.nullable(),
    targetScore: z.number().int().min(472).max(528).nullable(),
    minutesPerWeek: z.number().int().positive().max(10_080),
  })
  .strict();
export type GoalInput = z.infer<typeof GoalInputSchema>;

export const GoalCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    goal: GoalInputSchema,
  })
  .strict();
export type GoalCommand = z.infer<typeof GoalCommandSchema>;

export const ChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);
export type ChoiceId = z.infer<typeof ChoiceIdSchema>;

export const AttemptCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    questionId: ContentIdSchema,
    /** Null represents an omitted response. Correctness is server-authoritative. */
    choiceId: ChoiceIdSchema.nullable(),
    elapsedMs: z.number().int().nonnegative(),
    assistanceLevel: AssistanceLevelSchema,
    contentBearingHintUsed: z.boolean(),
    answerChanges: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
    isDiagnosticRetry: z.boolean(),
    protectedBlockId: z.string().min(1).optional(),
  })
  .strict();
export type AttemptCommand = z.infer<typeof AttemptCommandSchema>;

export const LessonActionInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('present'),
      activityId: V3ActivityIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('submit_response'),
      activityId: V3ActivityIdSchema,
      response: LessonActivityResponseInputSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('continue'),
      activityId: V3ActivityIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('request_assistance'),
      activityId: V3ActivityIdSchema,
    })
    .strict(),
  z.object({ type: z.literal('pause') }).strict(),
  z.object({ type: z.literal('resume') }).strict(),
]);
export type LessonActionInput = z.infer<typeof LessonActionInputSchema>;

export const LessonActionCommandSchema = z
  .object({
    envelope: CommandEnvelopeSchema,
    runId: LessonRunIdSchema,
    action: LessonActionInputSchema,
  })
  .strict();
export type LessonActionCommand = z.infer<typeof LessonActionCommandSchema>;

export const LearnerCommandSchema = z.union([GoalCommandSchema, AttemptCommandSchema]);
export type LearnerCommand = z.infer<typeof LearnerCommandSchema>;
