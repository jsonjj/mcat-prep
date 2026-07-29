import { z } from 'zod';

/**
 * Stable identifiers. Learner-facing records are keyed by an application-owned
 * `LearnerId` (a UUID) so that linking a Cognito identity later never rewrites
 * events. Client-generated ids (events, idempotency keys) are UUIDs too.
 */

export const uuid = (): string =>
  // Node 18+ and all supported browsers expose crypto.randomUUID.
  globalThis.crypto.randomUUID();

const uuidSchema = z.string().uuid();

export const LearnerIdSchema = uuidSchema.brand<'LearnerId'>();
export type LearnerId = z.infer<typeof LearnerIdSchema>;

export const EventIdSchema = uuidSchema.brand<'EventId'>();
export type EventId = z.infer<typeof EventIdSchema>;

export const IdempotencyKeySchema = uuidSchema.brand<'IdempotencyKey'>();
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export const SessionIdSchema = uuidSchema.brand<'SessionId'>();
export type SessionId = z.infer<typeof SessionIdSchema>;

export const TaskInstanceIdSchema = uuidSchema.brand<'TaskInstanceId'>();
export type TaskInstanceId = z.infer<typeof TaskInstanceIdSchema>;

/** Content ids are stable, lowercase, hyphen/alphanumeric (not UUIDs). */
export const ContentIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase alphanumeric with single hyphens')
  .brand<'ContentId'>();
export type ContentId = z.infer<typeof ContentIdSchema>;

/**
 * Opaque lesson-authored item identifiers. Unlike `ContentId`, these may use
 * legacy casing and punctuation and therefore stay isolated from global bank IDs.
 */
export const LessonItemIdSchema = z.string().min(1).brand<'LessonItemId'>();
export type LessonItemId = z.infer<typeof LessonItemIdSchema>;

export const newLearnerId = (): LearnerId => LearnerIdSchema.parse(uuid());
export const newEventId = (): EventId => EventIdSchema.parse(uuid());
export const newIdempotencyKey = (): IdempotencyKey => IdempotencyKeySchema.parse(uuid());
export const newSessionId = (): SessionId => SessionIdSchema.parse(uuid());
export const newTaskInstanceId = (): TaskInstanceId => TaskInstanceIdSchema.parse(uuid());
