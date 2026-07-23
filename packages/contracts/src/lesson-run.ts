import { z } from 'zod';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LessonRunIdSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
} from './ids';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';
import { AssistanceLevelSchema } from './vocab';

/** Version pin for a canonical lesson definition, not a publication claim. */
export const LessonDefinitionVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/, 'semantic lesson definition version');
export type LessonDefinitionVersion = z.infer<typeof LessonDefinitionVersionSchema>;

export const LessonRouteSchema = z.enum(['concise', 'standard', 'prerequisite', 'misconception']);
export type LessonRoute = z.infer<typeof LessonRouteSchema>;

export const LessonActivityPhaseSchema = z.enum([
  'enter_routing',
  'orient_elicit',
  'build_model',
  'show_expert_decisions',
  'completion',
  'contrast_bound',
  'exit_near',
  'exit_changed',
  'targeted_repair',
  'handoff',
]);
export type LessonActivityPhase = z.infer<typeof LessonActivityPhaseSchema>;

export const LessonResponseOutcomeSchema = z.enum(['correct', 'incorrect', 'not_sure']);
export type LessonResponseOutcome = z.infer<typeof LessonResponseOutcomeSchema>;

export const Sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/, 'lowercase SHA-256 digest');
export type Sha256Digest = z.infer<typeof Sha256DigestSchema>;

export const V3RegistryPinSchema = z
  .object({
    manifestSchemaVersion: z.literal('mcat-v3-lesson-authoring-manifest-2'),
    artifactId: z.string().min(1),
    sha256: Sha256DigestSchema,
    phase0FreezeId: z.string().min(1),
    canonicalFreezeId: z.string().min(1),
    graphFreezeId: z.string().min(1),
    sequenceFreezeId: z.string().min(1),
  })
  .strict();
export type V3RegistryPin = z.infer<typeof V3RegistryPinSchema>;

export const LessonRunPinsSchema = z
  .object({
    runId: LessonRunIdSchema,
    lessonId: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    reviewedContentHash: Sha256DigestSchema,
    contentRelease: z.string().min(1),
    registry: V3RegistryPinSchema,
    policies: z.array(PolicyVersionSchema).min(1),
  })
  .strict();
export type LessonRunPins = z.infer<typeof LessonRunPinsSchema>;

export const LessonFeedbackEntrySchema = z
  .object({
    activityId: V3ActivityIdSchema,
    tone: z.enum(['correct', 'incorrect', 'information']),
    message: z.string().min(1),
  })
  .strict();
export type LessonFeedbackEntry = z.infer<typeof LessonFeedbackEntrySchema>;

export const LessonRunStatusSchema = z.enum([
  'ready',
  'active',
  'awaiting_route',
  'awaiting_exit_feedback',
  'awaiting_repair',
  'paused',
  'complete',
  'handoff',
  'invalid_content',
  'blocked',
]);
export type LessonRunStatus = z.infer<typeof LessonRunStatusSchema>;

export const FamilyExposureSchema = z
  .object({
    familyId: z.string().min(1),
    activityIds: z.array(V3ActivityIdSchema).min(1),
    firstSeenSequence: z.number().int().nonnegative(),
    revealed: z.boolean(),
    feedbackSeen: z.boolean(),
    answerKeySeen: z.boolean(),
  })
  .strict();
export type FamilyExposure = z.infer<typeof FamilyExposureSchema>;

export const ReviewedLessonContentPinSchema = z
  .object({
    lessonId: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    reviewedContentHash: Sha256DigestSchema,
  })
  .strict();
export type ReviewedLessonContentPin = z.infer<typeof ReviewedLessonContentPinSchema>;

export const LessonRunLineageSchema = z
  .object({
    rootRunId: LessonRunIdSchema,
    parentRunId: LessonRunIdSchema.nullable(),
    generation: z.number().int().nonnegative(),
    inheritedFromRunIds: z.array(LessonRunIdSchema),
    reviewedContentPins: z.array(ReviewedLessonContentPinSchema).min(1),
  })
  .strict();
export type LessonRunLineage = z.infer<typeof LessonRunLineageSchema>;

export const SignalEvidenceSchema = z
  .object({
    signalId: z.string().min(1),
    familyIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type SignalEvidence = z.infer<typeof SignalEvidenceSchema>;

export const ObjectiveFeatureEvidenceSchema = z
  .object({
    featureId: z.string().min(1),
    familyIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ObjectiveFeatureEvidence = z.infer<typeof ObjectiveFeatureEvidenceSchema>;

export const ExitCheckResultSchema = z
  .object({
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    role: z.enum(['near', 'changed']),
    outcome: LessonResponseOutcomeSchema,
    passedUnsupported: z.boolean(),
    contamination: z
      .enum([
        'none',
        'prior_family_exposure',
        'paired_family_reuse',
        'revealed',
        'assisted',
        'support_not_a0',
      ])
      .nullable(),
  })
  .strict();
export type ExitCheckResult = z.infer<typeof ExitCheckResultSchema>;

export const LessonSequencePurposeSchema = z
  .enum(['entry', 'route_instruction', 'repair_instruction', 'post_completion'])
  .nullable();
export type LessonSequencePurpose = z.infer<typeof LessonSequencePurposeSchema>;

export const LessonCompletionContextSchema = z.enum(['initial', 'repair']).nullable();
export type LessonCompletionContext = z.infer<typeof LessonCompletionContextSchema>;

export const LessonCompletionAttemptCountsSchema = z
  .object({
    A3: z.number().int().nonnegative(),
    A2: z.number().int().nonnegative(),
    A1: z.number().int().nonnegative(),
    A0: z.number().int().nonnegative(),
  })
  .strict();
export type LessonCompletionAttemptCounts = z.infer<typeof LessonCompletionAttemptCountsSchema>;

export const GroupedLessonFeedbackSchema = z
  .object({
    kind: z.enum(['entry', 'exit']),
    entries: z.array(LessonFeedbackEntrySchema).min(1),
  })
  .strict();
export type GroupedLessonFeedback = z.infer<typeof GroupedLessonFeedbackSchema>;

/**
 * Persisted only inside the authority event stream/state store. Learner DTO
 * schemas deliberately have no field capable of representing this buffer.
 */
export const AuthorityPrivateLessonFeedbackSchema = z
  .object({
    sealedEntry: z.array(LessonFeedbackEntrySchema),
    sealedExit: z.array(LessonFeedbackEntrySchema).max(2),
  })
  .strict();
export type AuthorityPrivateLessonFeedback = z.infer<typeof AuthorityPrivateLessonFeedbackSchema>;

export const LessonRunStateSchema = z
  .object({
    schemaVersion: z.literal('1.1'),
    pins: LessonRunPinsSchema,
    lineage: LessonRunLineageSchema,
    status: LessonRunStatusSchema,
    currentKcId: V3KcIdSchema.nullable(),
    currentActivityId: V3ActivityIdSchema.nullable(),
    phase: LessonActivityPhaseSchema.nullable(),
    route: LessonRouteSchema.nullable(),
    sequenceActivityIds: z.array(V3ActivityIdSchema),
    sequencePosition: z.number().int().nonnegative(),
    sequencePurpose: LessonSequencePurposeSchema,
    assistanceLevel: AssistanceLevelSchema,
    consecutiveUnsupportedSuccesses: z.number().int().nonnegative(),
    completionContext: LessonCompletionContextSchema,
    completionAttemptCounts: LessonCompletionAttemptCountsSchema,
    completionUsedActivityIds: z.array(V3ActivityIdSchema),
    completionA0Successes: z.number().int().nonnegative(),
    completionReadyForExit: z.boolean(),
    repairCycles: z.number().int().min(0).max(2),
    exitedKcIds: z.array(V3KcIdSchema),
    signals: z.array(SignalEvidenceSchema),
    objectiveFeatures: z.array(ObjectiveFeatureEvidenceSchema),
    exposures: z.array(FamilyExposureSchema),
    activePresentation: z
      .object({
        activityId: V3ActivityIdSchema,
        familyId: z.string().min(1),
        freshAtPresentation: z.boolean(),
      })
      .strict()
      .nullable(),
    lastResponse: z
      .object({
        activityId: V3ActivityIdSchema,
        outcome: LessonResponseOutcomeSchema,
        assisted: z.boolean(),
        revealed: z.boolean(),
      })
      .strict()
      .nullable(),
    sealedExitResults: z.array(ExitCheckResultSchema).max(2),
    activeExitPairId: z.string().min(1).nullable(),
    usedExitPairIds: z.array(z.string().min(1)),
    visibleAssistanceLevel: AssistanceLevelSchema.nullable(),
    feedback: z
      .object({
        sealed: z.boolean(),
        entries: z.array(LessonFeedbackEntrySchema),
      })
      .strict()
      .nullable(),
    groupedFeedback: GroupedLessonFeedbackSchema.nullable(),
    authorityPrivateFeedback: AuthorityPrivateLessonFeedbackSchema,
    resumeStatus: z
      .enum(['active', 'awaiting_route', 'awaiting_exit_feedback', 'awaiting_repair'])
      .nullable(),
    pauseReason: z
      .enum([
        'learner',
        'interruption',
        'repair_exhausted',
        'entry_pool_exhausted',
        'completion_exhausted',
        'exit_pool_exhausted',
      ])
      .nullable(),
    plannerReentryRequired: z.boolean(),
    handoffRunId: LessonRunIdSchema.nullable(),
    handoffPins: LessonRunPinsSchema.nullable(),
    handoffLineage: LessonRunLineageSchema.nullable(),
    appliedEventIds: z.array(EventIdSchema),
    appliedIdempotencyKeys: z.array(IdempotencyKeySchema),
    lastSequence: z.number().int().min(-1),
    invalidIssues: z.array(z.string().min(1)),
    transitionErrors: z.array(z.string().min(1)),
  })
  .strict();
export type LessonRunState = z.infer<typeof LessonRunStateSchema>;

const LessonRunEventBaseSchema = z
  .object({
    schemaVersion: z.literal('1.1'),
    eventId: EventIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    runId: LessonRunIdSchema,
    lessonId: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    reviewedContentHash: Sha256DigestSchema,
    contentRelease: z.string().min(1),
    registry: V3RegistryPinSchema,
    policies: z.array(PolicyVersionSchema).min(1),
    sequence: z.number().int().nonnegative(),
    occurredAt: UtcTimestampSchema,
  })
  .strict();

const withEvent = <TType extends string, T extends z.ZodRawShape>(
  type: TType,
  payload: z.ZodObject<T>,
) =>
  LessonRunEventBaseSchema.extend({
    type: z.literal(type),
    payload: payload.strict(),
  }).strict();

export const LessonRunStartedEventSchema = withEvent('lesson_run_started', z.object({}));

export const LessonActivityPresentedEventSchema = withEvent(
  'lesson_activity_presented',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
  }),
);

export const LessonResponseEvaluatedEventSchema = withEvent(
  'lesson_response_evaluated',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    outcome: LessonResponseOutcomeSchema,
    assistanceLevel: AssistanceLevelSchema,
    assisted: z.boolean(),
    revealed: z.boolean(),
    diagnosticSignalIds: z.array(z.string().min(1)),
    objectiveFeatureIds: z.array(z.string().min(1)),
    authorityFeedback: z.array(LessonFeedbackEntrySchema).min(1),
  }),
);

export const LessonActivityCompletedEventSchema = withEvent(
  'lesson_activity_completed',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
  }),
);

export const LessonRouteSelectedEventSchema = withEvent(
  'lesson_route_selected',
  z.object({
    kcId: V3KcIdSchema,
    route: LessonRouteSchema,
  }),
);

export const LessonAssistanceRevealedEventSchema = withEvent(
  'lesson_assistance_revealed',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    level: AssistanceLevelSchema,
  }),
);

export const LessonExitFeedbackReleasedEventSchema = withEvent(
  'lesson_exit_feedback_released',
  z.object({
    kcId: V3KcIdSchema,
  }),
);

export const LessonRepairStartedEventSchema = withEvent(
  'lesson_repair_started',
  z.object({
    kcId: V3KcIdSchema,
    repairRouteId: z.string().min(1),
  }),
);

export const KcInstructionalExitEventSchema = withEvent(
  'kc_instructional_exit',
  z.object({
    kcId: V3KcIdSchema,
  }),
);

export const LessonRunPausedEventSchema = withEvent(
  'lesson_run_paused',
  z.object({
    reason: z.enum(['learner', 'interruption']),
  }),
);

export const LessonRunResumedEventSchema = withEvent('lesson_run_resumed', z.object({}));

export const LessonPlannerReentryHandoffEventSchema = withEvent(
  'lesson_planner_reentry_handoff',
  z.object({
    nextRunPins: LessonRunPinsSchema,
    nextLineage: LessonRunLineageSchema,
  }),
);

export const LessonInvalidContentDetectedEventSchema = withEvent(
  'lesson_invalid_content_detected',
  z.object({
    issueCodes: z.array(z.string().min(1)).min(1),
  }),
);

export const LessonRunEventSchema = z.discriminatedUnion('type', [
  LessonRunStartedEventSchema,
  LessonActivityPresentedEventSchema,
  LessonResponseEvaluatedEventSchema,
  LessonActivityCompletedEventSchema,
  LessonRouteSelectedEventSchema,
  LessonAssistanceRevealedEventSchema,
  LessonExitFeedbackReleasedEventSchema,
  LessonRepairStartedEventSchema,
  KcInstructionalExitEventSchema,
  LessonRunPausedEventSchema,
  LessonRunResumedEventSchema,
  LessonPlannerReentryHandoffEventSchema,
  LessonInvalidContentDetectedEventSchema,
]);
export type LessonRunEvent = z.infer<typeof LessonRunEventSchema>;

/** Raw learner response accepted only by the authority command boundary. */
export const LessonActivityResponseInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), choiceId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(10_000) }).strict(),
  z
    .object({
      kind: z.literal('numeric'),
      value: z.number().finite(),
      unit: z.string().min(1).max(40).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ordered_steps'),
      steps: z.array(z.string().min(1).max(1_000)).min(1).max(20),
    })
    .strict(),
  z.object({ kind: z.literal('not_sure') }).strict(),
]);
export type LessonActivityResponseInput = z.infer<typeof LessonActivityResponseInputSchema>;
