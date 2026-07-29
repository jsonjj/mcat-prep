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
 * Which write path moved `P(L)`. An allowlist: a new surface that reaches the
 * capability grains has to name itself here before it can write a ledger record,
 * so it cannot arrive unaudited by default.
 *
 * Both members go through the Authority's single `stepDirectGrains` step and so
 * share one bounded decay clock; the distinction is what identifies the attempt.
 * A lesson response carries a `QualifiedBktObservation` with its own id and
 * ordering value, which adaptive practice has neither of — see the correlation
 * enforced on the payload below.
 */
export const BKT_OBSERVATION_SOURCES = [
  /** A qualified lesson response (lesson-evidence-mastery-contract §8.2). */
  'lesson_response',
  /** A first, unassisted adaptive-practice answer (docs/practice-engine.md). */
  'adaptive_practice',
] as const;
export const BktObservationSourceSchema = z.enum(BKT_OBSERVATION_SOURCES);
export type BktObservationSource = z.infer<typeof BktObservationSourceSchema>;

/**
 * Server record of one attempt reaching (or being refused by) the BKT engine.
 *
 * The runner's `occurredAt` is a runtime FACT, not server time (contract §2), so
 * it may not be used as a decay clock unchecked. This event keeps **both**
 * times: `reportedOccurredAt` is the runner's verbatim claim and is the only
 * surviving evidence that a client misreported, while `appliedOccurredAt` is the
 * bounded, monotonic value state was actually written with. They differ exactly
 * when `clockAdjustment !== 'none'`, so the clamp never destroys the claim it
 * corrected.
 *
 * Every write to a capability grain appends one of these, whatever the `source`:
 * a path that moves `P(L)` without a ledger record leaves the clamp with no
 * forensic trail, which is how the practice path's clock bypass stayed invisible.
 */
export const BktObservationAppliedSchema = EventBaseSchema.extend({
  type: z.literal('bkt_observation_applied'),
  payload: z
    .object({
      source: BktObservationSourceSchema,
      /** The observation's id, or `null` on a source that has no observation. */
      observationId: z.string().uuid().nullable(),
      /** The observation's own ordering value (contract §12), as reported. */
      observationSequence: z.number().int().nonnegative().nullable(),
      /** The item attempted, in whichever id space the source serves from. */
      questionId: z.string().min(1),
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
    .strict()
    .superRefine((payload, context) => {
      // The identity fields and the source are two derivations of one fact —
      // whether this write came from an observation — so they are required to
      // agree rather than each being checked alone. Both directions are
      // enforced: a lesson record that has lost its observation id is as broken
      // as a practice record that invented one, and an out-of-order flag on a
      // source with no ordering value is a claim nothing could have decided.
      const fromObservation = payload.source === 'lesson_response';
      const hasIdentity = payload.observationId !== null;
      const hasSequence = payload.observationSequence !== null;
      if (fromObservation !== hasIdentity) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `observationId must be ${fromObservation ? 'present' : 'null'} when source is ${payload.source}.`,
          path: ['observationId'],
        });
      }
      if (fromObservation !== hasSequence) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `observationSequence must be ${fromObservation ? 'present' : 'null'} when source is ${payload.source}.`,
          path: ['observationSequence'],
        });
      }
      if (!hasSequence && payload.outOfOrder) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'outOfOrder cannot be true without an observationSequence to order against.',
          path: ['outOfOrder'],
        });
      }
    }),
});
export type BktObservationApplied = z.infer<typeof BktObservationAppliedSchema>;

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
