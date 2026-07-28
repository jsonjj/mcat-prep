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
import {
  AcceptedLessonObservationSchema,
  type AcceptedLessonObservation,
} from './lesson-observation';

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

export const ProbableCauseSchema = z.enum([
  'did_not_know_content',
  'knew_but_misapplied',
  'misread_question_or_passage',
  'missed_condition_unit_sign',
  'misinterpreted_graph_or_experiment',
  'calculation_error',
  'outside_passage_scope',
  'rushing_or_time',
  'changed_from_better_reasoning',
  'not_sure',
]);
export type ProbableCause = z.infer<typeof ProbableCauseSchema>;

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

export const CauseSelectedSchema = EventBaseSchema.extend({
  type: z.literal('cause_selected'),
  payload: z.object({
    questionId: ContentIdSchema,
    cause: ProbableCauseSchema,
  }),
});
export type CauseSelected = z.infer<typeof CauseSelectedSchema>;

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

export const LearnerEventSchema = z.discriminatedUnion('type', [
  AttemptSubmittedSchema,
  CauseSelectedSchema,
  RevealRequestedSchema,
  ReviewRatedSchema,
]);
export type LearnerEvent = z.infer<typeof LearnerEventSchema>;
export type LearnerEventType = LearnerEvent['type'];

/** Preserves the original non-strict behavior: unknown producer metadata is stripped. */
const AcceptedLearnerEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  acceptedAt: UtcTimestampSchema,
  event: LearnerEventSchema,
});

/** Authoritative accepted-event union, including server-only lesson observations. */
export const AcceptedEventSchema = z.union([
  AcceptedLearnerEventSchema,
  AcceptedLessonObservationSchema,
]);
export type AcceptedEvent = z.infer<typeof AcceptedEventSchema>;

export const isAcceptedLessonObservation = (
  acceptedEvent: AcceptedEvent,
): acceptedEvent is AcceptedLessonObservation => 'binding' in acceptedEvent;

export const makeIdempotencyKey = IdempotencyKeySchema.parse;
export const makeEventId = EventIdSchema.parse;
