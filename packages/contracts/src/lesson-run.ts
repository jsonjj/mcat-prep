import { z } from 'zod';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  LessonRunIdSchema,
  TaskInstanceIdSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
} from './ids';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';
import { AssistanceLevelSchema } from './vocab';
import {
  LessonDefinitionVersionSchema,
  Sha256DigestSchema,
  V3RegistryPinSchema,
} from './lesson-pins';
import { PlannerInstructionResolutionSchema } from './planner-instruction';
import { CanonicalPlannerResolutionReasonCodeSchema } from './lesson-wire';

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

export const LessonRunPinsSchema = z
  .object({
    runId: LessonRunIdSchema,
    learnerId: LearnerIdSchema,
    streamId: z.string().uuid(),
    taskInstanceId: TaskInstanceIdSchema,
    taskKind: z.enum([
      'lesson_initial_instruction',
      'lesson_resume',
      'exact_kc_repair',
      'sequence_reentry',
      'predecessor_support',
    ]),
    targetKcId: V3KcIdSchema,
    plannerResolutionId: EventIdSchema,
    evidenceCutoff: UtcTimestampSchema,
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
  'awaiting_planner_resolution',
  'awaiting_exit_feedback',
  'awaiting_repair',
  'awaiting_reentry',
  'awaiting_delivery_completion',
  'paused',
  'blocked_for_predecessor',
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
  .strict()
  .superRefine((exposure, ctx) => {
    if (new Set(exposure.activityIds).size !== exposure.activityIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activityIds'],
        message: 'family exposure activity IDs must be unique',
      });
    }
  });
export type FamilyExposure = z.infer<typeof FamilyExposureSchema>;

export const ReviewedLessonContentPinSchema = z
  .object({
    lessonId: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    reviewedContentHash: Sha256DigestSchema,
  })
  .strict();
export type ReviewedLessonContentPin = z.infer<typeof ReviewedLessonContentPinSchema>;

export const InheritedLessonExposureEnvelopeSchema = z
  .object({
    sourceRunIds: z.array(LessonRunIdSchema),
    families: z.array(FamilyExposureSchema),
  })
  .strict()
  .superRefine((envelope, ctx) => {
    if (new Set(envelope.sourceRunIds).size !== envelope.sourceRunIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceRunIds'],
        message: 'inherited exposure source run IDs must be unique',
      });
    }
    const familyIds = envelope.families.map((exposure) => exposure.familyId);
    if (new Set(familyIds).size !== familyIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['families'],
        message: 'inherited exposure families must be unique',
      });
    }
  });
export type InheritedLessonExposureEnvelope = z.infer<typeof InheritedLessonExposureEnvelopeSchema>;

export const LessonReentryHistoryEntrySchema = z
  .object({
    runId: LessonRunIdSchema,
    targetKcId: V3KcIdSchema,
  })
  .strict();
export type LessonReentryHistoryEntry = z.infer<typeof LessonReentryHistoryEntrySchema>;

export const LessonKcReentryCountSchema = z
  .object({
    kcId: V3KcIdSchema,
    count: z.number().int().positive(),
  })
  .strict();
export type LessonKcReentryCount = z.infer<typeof LessonKcReentryCountSchema>;

export const LessonRunLineageSchema = z
  .object({
    rootRunId: LessonRunIdSchema,
    parentRunId: LessonRunIdSchema.nullable(),
    generation: z.number().int().nonnegative(),
    reentryHistory: z.array(LessonReentryHistoryEntrySchema),
    kcReentryCounts: z.array(LessonKcReentryCountSchema),
    inheritedFromRunIds: z.array(LessonRunIdSchema),
    inheritedExposure: InheritedLessonExposureEnvelopeSchema,
    reviewedContentPins: z.array(ReviewedLessonContentPinSchema).min(1),
  })
  .strict()
  .superRefine((lineage, ctx) => {
    if (new Set(lineage.inheritedFromRunIds).size !== lineage.inheritedFromRunIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inheritedFromRunIds'],
        message: 'inherited lesson run IDs must be unique',
      });
    }
    const historyRunIds = lineage.reentryHistory.map((entry) => entry.runId);
    if (new Set(historyRunIds).size !== historyRunIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reentryHistory'],
        message: 'reentry history run IDs must be unique',
      });
    }
    if (
      lineage.generation !== lineage.reentryHistory.length ||
      lineage.generation !== lineage.inheritedFromRunIds.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['generation'],
        message: 'global generation must exactly equal immutable reentry history length',
      });
    }
    const expectedCounts: { kcId: string; count: number }[] = [];
    lineage.reentryHistory.forEach((entry) => {
      const existing = expectedCounts.find((candidate) => candidate.kcId === entry.targetKcId);
      if (existing) existing.count += 1;
      else expectedCounts.push({ kcId: entry.targetKcId, count: 1 });
    });
    if (
      expectedCounts.length !== lineage.kcReentryCounts.length ||
      expectedCounts.some(
        (expected, index) =>
          expected.kcId !== lineage.kcReentryCounts[index]?.kcId ||
          expected.count !== lineage.kcReentryCounts[index]?.count,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kcReentryCounts'],
        message: 'per-KC reentry counts must be the exact projection of immutable history',
      });
    }
    if (
      lineage.inheritedFromRunIds.length !== lineage.inheritedExposure.sourceRunIds.length ||
      lineage.inheritedFromRunIds.some(
        (runId, index) => runId !== lineage.inheritedExposure.sourceRunIds[index],
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inheritedExposure', 'sourceRunIds'],
        message: 'inherited exposure sources must exactly match run lineage',
      });
    }
    if (
      lineage.generation === 0 &&
      (lineage.parentRunId !== null ||
        lineage.reentryHistory.length > 0 ||
        lineage.kcReentryCounts.length > 0 ||
        lineage.inheritedFromRunIds.length > 0 ||
        lineage.inheritedExposure.families.length > 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'root lesson runs cannot claim inherited exposure',
      });
    }
    if (
      lineage.generation > 0 &&
      (lineage.parentRunId === null ||
        lineage.inheritedFromRunIds[0] !== lineage.rootRunId ||
        lineage.inheritedFromRunIds[lineage.inheritedFromRunIds.length - 1] !==
          lineage.parentRunId ||
        lineage.reentryHistory
          .slice(0, -1)
          .some((entry, index) => entry.runId !== lineage.inheritedFromRunIds[index + 1]))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reentry ancestry, history, root, and parent identities must remain contiguous',
      });
    }
  });
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
    attemptId: EventIdSchema,
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

export const ValidatedPlannerInstructionSchema = z
  .object({
    resolution: PlannerInstructionResolutionSchema,
    disposition: z.enum(['accepted', 'downgraded']),
    effectiveRoute: LessonRouteSchema,
    reasonCodes: z.array(CanonicalPlannerResolutionReasonCodeSchema).min(1),
    supportReturnedToPlanner: z.boolean(),
    blockedForPredecessor: z.boolean(),
  })
  .strict();
export type ValidatedPlannerInstruction = z.infer<
  typeof ValidatedPlannerInstructionSchema
>;

export const LessonOmissionTypeSchema = z.enum([
  'intentional_skip',
  'valid_timeout',
  'abandonment',
  'technical',
  'inaccessible',
  'telemetry_missing',
]);
export type LessonOmissionType = z.infer<typeof LessonOmissionTypeSchema>;

export const LessonAttemptRecordSchema = z
  .object({
    attemptId: EventIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    administration: z.enum(['first', 'retry']),
    retryOf: EventIdSchema.nullable(),
    responseDigest: Sha256DigestSchema,
    responseKind: z.enum([
      'choice',
      'text',
      'numeric',
      'ordered_steps',
      'not_sure',
      'omission',
    ]),
    outcome: LessonResponseOutcomeSchema.nullable(),
    omissionType: LessonOmissionTypeSchema.nullable(),
    assistanceLevel: AssistanceLevelSchema,
    hinted: z.boolean(),
    revealed: z.boolean(),
    validForEvidence: z.boolean(),
    invalidated: z.boolean(),
    committedSequence: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative().nullable(),
    canCloseRepair: z.literal(false).optional(),
  })
  .strict()
  .superRefine((attempt, ctx) => {
    if (
      (attempt.administration === 'first' && attempt.retryOf !== null) ||
      (attempt.administration === 'retry' &&
        (attempt.retryOf === null || attempt.canCloseRepair !== false))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'retry lineage must be explicit and retries can never close repair',
      });
    }
    if ((attempt.responseKind === 'omission') !== (attempt.omissionType !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['omissionType'],
        message: 'omission responses require exactly one omission type',
      });
    }
    if (
      ['technical', 'inaccessible', 'telemetry_missing'].includes(
        attempt.omissionType ?? '',
      ) &&
      attempt.validForEvidence
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validForEvidence'],
        message: 'technical, inaccessible, and telemetry omissions are validity incidents',
      });
    }
  });
export type LessonAttemptRecord = z.infer<typeof LessonAttemptRecordSchema>;

export const LessonConfidenceRecordSchema = z
  .object({
    attemptId: EventIdSchema,
    confidence: z.number().min(0).max(1),
    sequence: z.number().int().nonnegative(),
  })
  .strict();

export const LessonLearnerCauseRecordSchema = z
  .object({
    attemptId: EventIdSchema,
    cause: z.string().min(1),
    sequence: z.number().int().nonnegative(),
  })
  .strict();

export const LessonInvalidatedItemSchema = z
  .object({
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    attemptId: EventIdSchema.nullable(),
    reason: z.enum([
      'technical',
      'inaccessible',
      'telemetry_missing',
      'content_defect',
      'administration_error',
    ]),
    exposureRetained: z.literal(true),
    learnerPenalty: z.literal('none'),
    substitutionRequired: z.boolean(),
    sequence: z.number().int().nonnegative(),
  })
  .strict();
export type LessonInvalidatedItem = z.infer<typeof LessonInvalidatedItemSchema>;

export const LessonFailedExitFunctionSchema = z.enum(['near_use', 'changed_task']);
export type LessonFailedExitFunction = z.infer<typeof LessonFailedExitFunctionSchema>;

export const PreservedExitSuccessSchema = z
  .object({
    exitFunction: LessonFailedExitFunctionSchema,
    attemptId: EventIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    sourcePairId: z.string().min(1),
  })
  .strict();
export type PreservedExitSuccess = z.infer<typeof PreservedExitSuccessSchema>;

export const LessonRepairReentrySchema = z
  .object({
    failedExitFunction: LessonFailedExitFunctionSchema.nullable(),
    originState: z.enum(['exit_checks_pending', 'repair_in_progress']).nullable(),
    originCheckpointId: z.string().min(1).nullable(),
    originExitPairId: z.string().min(1).nullable(),
    preservedSuccesses: z.array(PreservedExitSuccessSchema),
    preservationDecision: z
      .enum(['preserve_valid_successes', 'invalidate_and_restart_near_use'])
      .nullable(),
    invalidationReason: z.string().min(1).nullable(),
    reentryState: z.enum(['exit_checks_pending', 'repair_in_progress']).nullable(),
    reentryCheckpointId: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((reentry, ctx) => {
    if (
      reentry.preservationDecision === 'invalidate_and_restart_near_use' &&
      reentry.invalidationReason === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invalidationReason'],
        message: 'generic near-use restart requires an explicit invalidation reason',
      });
    }
    if (
      reentry.preservationDecision !== 'invalidate_and_restart_near_use' &&
      reentry.invalidationReason !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invalidationReason'],
        message: 'invalidation reasons belong only to explicit near-use restarts',
      });
    }
  });
export type LessonRepairReentry = z.infer<typeof LessonRepairReentrySchema>;

export const LessonDurationObservationSchema = z
  .object({
    scope: z.enum(['uninterrupted_segment', 'kc_microcycle', 'lesson_shell']),
    kcId: V3KcIdSchema.nullable(),
    activityId: V3ActivityIdSchema.nullable(),
    startedAt: UtcTimestampSchema,
    endedAt: UtcTimestampSchema,
    durationMs: z.number().int().nonnegative(),
    observationKind: z.literal('wall_clock'),
    completionThresholdApplied: z.literal(false),
  })
  .strict();
export type LessonDurationObservation = z.infer<
  typeof LessonDurationObservationSchema
>;

export const LessonRuntimeCheckpointSchema = z
  .object({
    checkpointId: z.string().min(1),
    definitionHash: Sha256DigestSchema,
    lessonId: V3LessonIdSchema,
    kcId: V3KcIdSchema.nullable(),
    kcOrdinal: z.number().int().positive().nullable(),
    shellState: z.enum([
      'not_started',
      'in_progress',
      'paused',
      'blocked_for_predecessor',
      'delivery_complete',
    ]),
    kcState: z
      .enum([
        'not_started',
        'in_progress',
        'exit_checks_pending',
        'repair_in_progress',
        'blocked_for_predecessor',
        'exited',
      ])
      .nullable(),
    nodeId: V3ActivityIdSchema.nullable(),
    actualAssistanceLevel: AssistanceLevelSchema,
    validatedPlannerInstruction: ValidatedPlannerInstructionSchema.nullable(),
    attempts: z.array(LessonAttemptRecordSchema),
    exposedFamilies: z.array(FamilyExposureSchema),
    openFeedback: z
      .object({
        sealedEntryActivityIds: z.array(V3ActivityIdSchema),
        sealedExitActivityIds: z.array(V3ActivityIdSchema),
        visibleActivityIds: z.array(V3ActivityIdSchema),
      })
      .strict(),
    repairCycle: z.number().int().min(0).max(2),
    repairReentry: LessonRepairReentrySchema,
    originCoordinate: z.string().min(1).nullable(),
    reentryCoordinate: z.string().min(1).nullable(),
    eventStreamSequence: z.number().int().min(-1),
    committedByEventId: EventIdSchema.nullable(),
    committedAt: UtcTimestampSchema,
  })
  .strict();
export type LessonRuntimeCheckpoint = z.infer<typeof LessonRuntimeCheckpointSchema>;

export const LessonCheckpointCommitSchema = z
  .object({
    shell: LessonRuntimeCheckpointSchema,
    kc: LessonRuntimeCheckpointSchema.nullable(),
  })
  .strict()
  .superRefine((commit, ctx) => {
    if (
      commit.kc !== null &&
      (commit.shell.eventStreamSequence !== commit.kc.eventStreamSequence ||
        commit.shell.committedByEventId !== commit.kc.committedByEventId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'shell and KC checkpoints must commit in the same event transaction',
      });
    }
  });
export type LessonCheckpointCommit = z.infer<typeof LessonCheckpointCommitSchema>;

export const LessonRunStateSchema = z
  .object({
    schemaVersion: z.literal('2.0'),
    pins: LessonRunPinsSchema,
    lineage: LessonRunLineageSchema,
    status: LessonRunStatusSchema,
    currentKcId: V3KcIdSchema.nullable(),
    currentActivityId: V3ActivityIdSchema.nullable(),
    phase: LessonActivityPhaseSchema.nullable(),
    route: LessonRouteSchema.nullable(),
    validatedPlannerInstruction: ValidatedPlannerInstructionSchema.nullable(),
    plannerResolutionHistory: z.array(PlannerInstructionResolutionSchema).default([]),
    plannerResolutionRejectionCodes: z
      .array(CanonicalPlannerResolutionReasonCodeSchema)
      .default([]),
    returnSupportToPlanner: z.boolean().default(false),
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
    repairReentry: LessonRepairReentrySchema,
    exitedKcIds: z.array(V3KcIdSchema),
    signals: z.array(SignalEvidenceSchema),
    objectiveFeatures: z.array(ObjectiveFeatureEvidenceSchema),
    exposures: z.array(FamilyExposureSchema),
    activePresentation: z
      .object({
        activityId: V3ActivityIdSchema,
        familyId: z.string().min(1),
        freshAtPresentation: z.boolean(),
        presentedAt: UtcTimestampSchema,
        attemptSlot: z.enum(['first', 'retry', 'substitute']),
      })
      .strict()
      .nullable(),
    lastResponse: z
      .object({
        attemptId: EventIdSchema,
        activityId: V3ActivityIdSchema,
        outcome: LessonResponseOutcomeSchema,
        assisted: z.boolean(),
        revealed: z.boolean(),
      })
      .strict()
      .nullable(),
    attempts: z.array(LessonAttemptRecordSchema).default([]),
    confidenceRecords: z.array(LessonConfidenceRecordSchema).default([]),
    learnerCauseRecords: z.array(LessonLearnerCauseRecordSchema).default([]),
    invalidatedItems: z.array(LessonInvalidatedItemSchema).default([]),
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
    currentCheckpoint: LessonRuntimeCheckpointSchema.nullable(),
    kcCheckpoints: z.array(LessonRuntimeCheckpointSchema).default([]),
    checkpointCommits: z.array(LessonCheckpointCommitSchema).default([]),
    timing: z
      .object({
        shellStartedAt: UtcTimestampSchema.nullable(),
        currentKcStartedAt: UtcTimestampSchema.nullable(),
        observations: z.array(LessonDurationObservationSchema),
      })
      .strict(),
    resumeStatus: z
      .enum([
        'active',
        'awaiting_planner_resolution',
        'awaiting_exit_feedback',
        'awaiting_repair',
        'awaiting_reentry',
      ])
      .nullable(),
    pauseReason: z
      .enum([
        'learner',
        'interruption',
        'repair_exhausted',
        'entry_pool_exhausted',
        'completion_exhausted',
        'exit_pool_exhausted',
        'blocked_for_predecessor',
      ])
      .nullable(),
    plannerReentryRequired: z.boolean(),
    handoffRunId: LessonRunIdSchema.nullable(),
    handoffPins: LessonRunPinsSchema.nullable(),
    handoffLineage: LessonRunLineageSchema.nullable(),
    handoffResolution: PlannerInstructionResolutionSchema.nullable(),
    appliedEventIds: z.array(EventIdSchema),
    appliedIdempotencyKeys: z.array(IdempotencyKeySchema),
    lastSequence: z.number().int().min(-1),
    invalidIssues: z.array(z.string().min(1)),
    transitionErrors: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((state, ctx) => {
    const resolutionIds = state.plannerResolutionHistory.map(
      (resolution) => resolution.resolutionId,
    );
    if (new Set(resolutionIds).size !== resolutionIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plannerResolutionHistory'],
        message: 'accepted planner resolution identities must be immutable and unique',
      });
    }
    state.plannerResolutionHistory.forEach((resolution, index) => {
      const previous = state.plannerResolutionHistory[index - 1];
      if (
        index === 0
          ? resolution.supersession.generation !== 0
          : resolution.supersession.generation !==
              previous!.supersession.generation + 1 ||
            resolution.supersession.rootResolutionId !==
              previous!.supersession.rootResolutionId ||
            resolution.supersession.supersedesResolutionId !== previous!.resolutionId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['plannerResolutionHistory', index],
          message: 'planner resolution supersession lineage must be replayable',
        });
      }
    });
    const attemptIds = state.attempts.map((attempt) => attempt.attemptId);
    if (new Set(attemptIds).size !== attemptIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attempts'],
        message: 'lesson attempt identities are immutable and unique',
      });
    }
    const firstActivityIds = state.attempts
      .filter((attempt) => attempt.administration === 'first')
      .map((attempt) => attempt.activityId);
    if (new Set(firstActivityIds).size !== firstActivityIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attempts'],
        message: 'an item can have only one immutable first attempt',
      });
    }
    state.attempts
      .filter((attempt) => attempt.administration === 'retry')
      .forEach((retry, index) => {
        const original = state.attempts.find(
          (attempt) =>
            attempt.attemptId === retry.retryOf && attempt.administration === 'first',
        );
        if (
          !original ||
          original.activityId !== retry.activityId ||
          original.familyId !== retry.familyId
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attempts', index],
            message: 'retry records must reference their immutable first attempt',
          });
        }
      });
    for (const [path, records] of [
      ['confidenceRecords', state.confidenceRecords],
      ['learnerCauseRecords', state.learnerCauseRecords],
    ] as const) {
      const recordAttemptIds = records.map((record) => record.attemptId);
      if (
        new Set(recordAttemptIds).size !== recordAttemptIds.length ||
        recordAttemptIds.some(
          (attemptId) => !state.attempts.some((attempt) => attempt.attemptId === attemptId),
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must reference unique immutable attempts`,
        });
      }
    }
    const exposureFamilyIds = state.exposures.map((exposure) => exposure.familyId);
    if (new Set(exposureFamilyIds).size !== exposureFamilyIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exposures'],
        message: 'lesson run exposure families must be unique',
      });
    }
    const currentLineageRunId =
      state.lineage.generation === 0
        ? state.lineage.rootRunId
        : state.lineage.reentryHistory[state.lineage.reentryHistory.length - 1]?.runId;
    if (currentLineageRunId !== state.pins.runId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineage'],
        message: 'run state pins must identify the immutable lineage tip',
      });
    }
    if (
      state.validatedPlannerInstruction !== null &&
      state.route !== null &&
      state.route !== state.validatedPlannerInstruction.effectiveRoute
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['route'],
        message: 'the lesson route must remain planner-resolution owned',
      });
    }
    const latestCommit = state.checkpointCommits.at(-1);
    if (
      latestCommit &&
      (latestCommit.shell.eventStreamSequence > state.lastSequence ||
        (state.currentCheckpoint !== null &&
          state.currentCheckpoint.eventStreamSequence > state.lastSequence))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['checkpointCommits'],
        message: 'a checkpoint cannot lead the accepted lesson event stream',
      });
    }
    state.lineage.inheritedExposure.families.forEach((inherited) => {
      const current = state.exposures.find((exposure) => exposure.familyId === inherited.familyId);
      if (
        !current ||
        current.activityIds.length !== inherited.activityIds.length ||
        current.activityIds.some(
          (activityId, activityIndex) => activityId !== inherited.activityIds[activityIndex],
        ) ||
        current.firstSeenSequence !== inherited.firstSeenSequence ||
        current.revealed !== inherited.revealed ||
        current.feedbackSeen !== inherited.feedbackSeen ||
        current.answerKeySeen !== inherited.answerKeySeen
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exposures'],
          message: `run state must preserve inherited exposure family ${inherited.familyId}`,
        });
      }
    });
  });
export type LessonRunState = z.infer<typeof LessonRunStateSchema>;

const LessonRunEventBaseSchema = z
  .object({
    schemaVersion: z.literal('2.0'),
    eventId: EventIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    runId: LessonRunIdSchema,
    learnerId: LearnerIdSchema,
    streamId: z.string().uuid(),
    taskInstanceId: TaskInstanceIdSchema,
    taskKind: LessonRunPinsSchema.shape.taskKind,
    targetKcId: V3KcIdSchema,
    plannerResolutionId: EventIdSchema,
    evidenceCutoff: UtcTimestampSchema,
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
    attemptSlot: z.enum(['first', 'retry', 'substitute']),
  }),
);

export const LessonResponseEvaluatedEventSchema = withEvent(
  'lesson_response_evaluated',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    outcome: LessonResponseOutcomeSchema,
    responseDigest: Sha256DigestSchema,
    responseKind: z.enum([
      'choice',
      'text',
      'numeric',
      'ordered_steps',
      'not_sure',
      'omission',
    ]),
    omissionType: LessonOmissionTypeSchema.nullable(),
    validForEvidence: z.boolean(),
    elapsedMs: z.number().int().nonnegative().nullable(),
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

export const LessonConfidenceRecordedEventSchema = withEvent(
  'lesson_confidence_recorded',
  z.object({
    kcId: V3KcIdSchema,
    attemptId: EventIdSchema,
    confidence: z.number().min(0).max(1),
  }),
);

export const LessonLearnerCauseRecordedEventSchema = withEvent(
  'lesson_learner_cause_recorded',
  z.object({
    kcId: V3KcIdSchema,
    attemptId: EventIdSchema,
    cause: z.string().min(1),
  }),
);

export const LessonRouteSelectedEventSchema = withEvent(
  'lesson_route_selected',
  z.object({
    kcId: V3KcIdSchema,
    validatedInstruction: ValidatedPlannerInstructionSchema,
  }),
);

export const LessonPlannerResolutionRejectedEventSchema = withEvent(
  'lesson_planner_resolution_rejected',
  z.object({
    resolutionId: EventIdSchema.nullable(),
    kcId: V3KcIdSchema.nullable(),
    reasonCodes: z.array(CanonicalPlannerResolutionReasonCodeSchema).min(1),
  }),
);

export const LessonHintRequestedEventSchema = withEvent(
  'lesson_hint_requested',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    hintId: z.string().min(1),
    level: AssistanceLevelSchema,
  }),
);

export const LessonRevealRequestedEventSchema = withEvent(
  'lesson_reveal_requested',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
  }),
);

export const LessonAssistanceRevealedEventSchema = withEvent(
  'lesson_assistance_revealed',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    fromLevel: AssistanceLevelSchema,
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
    failedExitFunction: LessonFailedExitFunctionSchema,
    preservationDecision: z.enum([
      'preserve_valid_successes',
      'invalidate_and_restart_near_use',
    ]),
    invalidationReason: z.string().min(1).nullable(),
  }),
);

export const LessonRetryObservedEventSchema = withEvent(
  'lesson_retry_observed',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    retryOf: EventIdSchema,
    responseDigest: Sha256DigestSchema,
    responseKind: z.enum([
      'choice',
      'text',
      'numeric',
      'ordered_steps',
      'not_sure',
    ]),
    outcome: LessonResponseOutcomeSchema,
    assistanceLevel: AssistanceLevelSchema,
    elapsedMs: z.number().int().nonnegative().nullable(),
  }),
);

export const LessonItemInvalidatedEventSchema = withEvent(
  'lesson_item_invalidated',
  z.object({
    kcId: V3KcIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    attemptId: EventIdSchema.nullable(),
    reason: z.enum([
      'technical',
      'inaccessible',
      'telemetry_missing',
      'content_defect',
      'administration_error',
    ]),
    substitutionRequired: z.boolean(),
  }),
);

export const KcResumedAtReentryEventSchema = withEvent(
  'kc_resumed_at_reentry',
  z.object({
    kcId: V3KcIdSchema,
    failedExitFunction: LessonFailedExitFunctionSchema,
    originCheckpointId: z.string().min(1),
    reentryCheckpointId: z.string().min(1),
    preservationDecision: z.enum([
      'preserve_valid_successes',
      'invalidate_and_restart_near_use',
    ]),
    invalidationReason: z.string().min(1).nullable(),
  }),
);

export const KcInstructionalExitEventSchema = withEvent(
  'kc_instructional_exit',
  z.object({
    kcId: V3KcIdSchema,
    nearUseAttemptId: EventIdSchema,
    changedTaskAttemptId: EventIdSchema,
  }),
);

export const LessonDeliveryCompletedEventSchema = withEvent(
  'lesson_delivery_completed',
  z.object({
    orderedRequiredKcIds: z.array(V3KcIdSchema).min(1),
    instructionalExitKcIds: z.array(V3KcIdSchema).min(1),
    derivedByAuthority: z.literal(true),
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
    nextResolution: PlannerInstructionResolutionSchema,
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
  LessonConfidenceRecordedEventSchema,
  LessonLearnerCauseRecordedEventSchema,
  LessonRouteSelectedEventSchema,
  LessonPlannerResolutionRejectedEventSchema,
  LessonHintRequestedEventSchema,
  LessonRevealRequestedEventSchema,
  LessonAssistanceRevealedEventSchema,
  LessonExitFeedbackReleasedEventSchema,
  LessonRepairStartedEventSchema,
  LessonRetryObservedEventSchema,
  LessonItemInvalidatedEventSchema,
  KcResumedAtReentryEventSchema,
  KcInstructionalExitEventSchema,
  LessonDeliveryCompletedEventSchema,
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
  z
    .object({
      kind: z.literal('omission'),
      omissionType: LessonOmissionTypeSchema,
    })
    .strict(),
]);
export type LessonActivityResponseInput = z.infer<typeof LessonActivityResponseInputSchema>;
