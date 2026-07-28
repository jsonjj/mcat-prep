import { z } from 'zod';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  TaskInstanceIdSchema,
  ContentIdSchema,
} from './ids';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';
import { AssistanceLevelSchema, ReviewRatingSchema } from './vocab';

/**
 * Immutable, append-only learner events. The client generates `eventId` and
 * `idempotencyKey`; the server assigns an authoritative monotonic `sequence`
 * on acceptance. Derived state is recomputed from accepted events.
 */

const EventBaseSchema = z.object({
  eventId: EventIdSchema,
  learnerId: LearnerIdSchema,
  idempotencyKey: IdempotencyKeySchema,
  /** Client-perceived occurrence time (UTC). Authoritative ordering is `sequence`. */
  occurredAt: UtcTimestampSchema,
  contentRelease: z.string().min(1),
  policies: z.array(PolicyVersionSchema),
  taskInstanceId: TaskInstanceIdSchema.optional(),
});

export const AttemptSubmittedSchema = EventBaseSchema.extend({
  type: z.literal('attempt_submitted'),
  payload: z.object({
    questionId: ContentIdSchema,
    itemVersion: z.number().int().positive(),
    /** Chosen choice id (A–D) or null if omitted. Correctness is decided server-side. */
    chosenChoiceId: z.string().max(1).nullable(),
    elapsedMs: z.number().int().nonnegative(),
    assistanceLevel: AssistanceLevelSchema,
    /** Whether any content-bearing hint was consumed on this item. */
    contentBearingHintUsed: z.boolean(),
    /** Number of times the learner changed their selection before submitting. */
    answerChanges: z.number().int().nonnegative().default(0),
    /** Optional self-reported confidence 0..1 (fallible; never awards mastery). */
    confidence: z.number().min(0).max(1).optional(),
    /** Whether this is a diagnose-before-reveal retry (never independent evidence). */
    isDiagnosticRetry: z.boolean().default(false),
    protectedBlockId: z.string().optional(),
  }),
});
export type AttemptSubmitted = z.infer<typeof AttemptSubmittedSchema>;

export const RevealRequestedSchema = EventBaseSchema.extend({
  type: z.literal('reveal_requested'),
  payload: z.object({
    questionId: ContentIdSchema,
    /** Reveal Now marks the solution as shown; later success is not independent evidence. */
    revealNow: z.boolean(),
  }),
});
export type RevealRequested = z.infer<typeof RevealRequestedSchema>;

export const ReviewRatedSchema = EventBaseSchema.extend({
  type: z.literal('review_rated'),
  payload: z.object({
    reviewObjectId: ContentIdSchema,
    /** Incorrect/revealed/content-bearing-hinted responses are forced to `again` server-side. */
    rating: ReviewRatingSchema,
    elapsedMs: z.number().int().nonnegative(),
  }),
});
export type ReviewRated = z.infer<typeof ReviewRatedSchema>;

/**
 * There is no `cause_selected` member. Self-reported error cause is not a fact we
 * store: experts naming which bias produced an error agree at κ = 0.000–0.063 and
 * learner self-report is biased worst in the weakest learners
 * (docs/design/error-handling-design.md §2.3).
 *
 * Historical `cause_selected` rows in `accepted_events` are unaffected. That table
 * types `event_type` as plain `text` with no CHECK constraint, its `payload` is
 * opaque JSONB, and the learner projection is rehydrated by an unchecked cast
 * (`learnerStateFromProjection`) rather than parsed through this union — so
 * removing the member cannot fail a replay or a deserialization.
 */
export const LearnerEventSchema = z.discriminatedUnion('type', [
  AttemptSubmittedSchema,
  RevealRequestedSchema,
  ReviewRatedSchema,
]);
export type LearnerEvent = z.infer<typeof LearnerEventSchema>;
export type LearnerEventType = LearnerEvent['type'];

/** Server-accepted event: base event plus authoritative sequence + acceptance time. */
export const AcceptedEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  acceptedAt: UtcTimestampSchema,
  event: LearnerEventSchema,
});
export type AcceptedEvent = z.infer<typeof AcceptedEventSchema>;

export const makeIdempotencyKey = IdempotencyKeySchema.parse;
export const makeEventId = EventIdSchema.parse;
