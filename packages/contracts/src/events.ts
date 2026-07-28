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
import { AssistanceLevelSchema, ReasoningOperationSchema, ReviewRatingSchema } from './vocab';
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

/**
 * How the server had to adjust the runner's reported time before using it as a
 * decay clock. `none` means the claim was used verbatim; the other two are the
 * audit record of a claim that could not be trusted as-is.
 */
export const BKT_CLOCK_ADJUSTMENTS = [
  'none',
  /** The claim was ahead of the Authority clock and was pulled back to it. */
  'bounded_to_server_clock',
  /** The claim predated a target grain's `lastPracticedAt` and was held there. */
  'held_at_last_practiced',
] as const;
export const BktClockAdjustmentSchema = z.enum(BKT_CLOCK_ADJUSTMENTS);
export type BktClockAdjustment = z.infer<typeof BktClockAdjustmentSchema>;

/**
 * Why the Authority refused to apply an otherwise-qualified observation to BKT.
 *
 * Distinct from `BKT_QUALIFICATION_REJECTION_CODES`, which is frozen and covers
 * the two upstream gates in lesson-evidence-mastery-contract §5. These codes
 * cover the *application* step, where the server checks claims that only it can
 * check. Allowlist: an observation is applied only when no code fires.
 */
export const BKT_APPLICATION_REJECTION_CODES = [
  /**
   * The reported `occurredAt` is further ahead of the Authority clock than the
   * permitted skew. Clamping alone would silently accept a broken or hostile
   * runner, so an implausible future claim is refused outright.
   */
  'OBSERVATION_TIMESTAMP_IN_FUTURE',
] as const;
export const BktApplicationRejectionCodeSchema = z.enum(BKT_APPLICATION_REJECTION_CODES);
export type BktApplicationRejectionCode = z.infer<typeof BktApplicationRejectionCodeSchema>;

/**
 * Server record of one qualified lesson response reaching (or being refused by)
 * the BKT engine.
 *
 * The runner's `occurredAt` is a runtime FACT, not server time (contract §2), so
 * it may not be used as a decay clock unchecked. This event keeps **both**
 * times: `reportedOccurredAt` is the runner's verbatim claim and is the only
 * surviving evidence that a client misreported, while `appliedOccurredAt` is the
 * bounded, monotonic value state was actually written with. They differ exactly
 * when `clockAdjustment !== 'none'`, so the clamp never destroys the claim it
 * corrected.
 */
export const BktObservationAppliedSchema = EventBaseSchema.extend({
  type: z.literal('bkt_observation_applied'),
  payload: z
    .object({
      observationId: z.string().uuid(),
      /** The observation's own ordering value (contract §12), as reported. */
      observationSequence: z.number().int().nonnegative(),
      /** The two grains this observation targets. Never a lesson. */
      primaryKcId: z.string().min(1),
      reasoningOperation: ReasoningOperationSchema,
      correct: z.boolean(),
      /** VERBATIM runner claim. Never used as the decay clock. */
      reportedOccurredAt: UtcTimestampSchema,
      /** The decay clock actually written, or `null` when nothing was applied. */
      appliedOccurredAt: UtcTimestampSchema.nullable(),
      clockAdjustment: BktClockAdjustmentSchema,
      /** An observation with a higher `sequence` had already been applied. */
      outOfOrder: z.boolean(),
      /** Empty when the observation was applied; otherwise why it was refused. */
      rejectionCodes: z.array(BktApplicationRejectionCodeSchema),
    })
    .strict(),
});
export type BktObservationApplied = z.infer<typeof BktObservationAppliedSchema>;

export const LearnerEventSchema = z.discriminatedUnion('type', [
  AttemptSubmittedSchema,
  CauseSelectedSchema,
  RevealRequestedSchema,
  ReviewRatedSchema,
  BktObservationAppliedSchema,
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
