import { z } from 'zod';
import { AssistanceLevelSchema } from './vocab';
import { EventIdSchema, LearnerIdSchema, V3KcIdSchema, V3LessonIdSchema } from './ids';
import {
  LessonDefinitionVersionSchema,
  Sha256DigestSchema,
  V3RegistryPinSchema,
} from './lesson-pins';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';

export const PLANNER_INSTRUCTION_RESOLUTION_SCHEMA_VERSION = '1.0' as const;

export const PlannerInstructionTaskKindSchema = z.enum([
  'lesson_initial_instruction',
  'lesson_resume',
  'exact_kc_repair',
  'sequence_reentry',
  'predecessor_support',
  'diagnostic_probe',
]);
export type PlannerInstructionTaskKind = z.infer<typeof PlannerInstructionTaskKindSchema>;

export const PlannerInstructionRouteSchema = z.enum([
  'concise',
  'standard',
  'misconception',
  'prerequisite_support',
]);
export type PlannerInstructionRoute = z.infer<typeof PlannerInstructionRouteSchema>;

export const PlannerDiagnosticDecisionClassSchema = z.enum([
  'concise_eligible',
  'standard_required',
  'misconception_hypothesis',
  'prerequisite_gap',
  'unresolved',
]);

export const PlannerRecommendedActionSchema = z.enum([
  'deliver_concise_instruction',
  'deliver_standard_instruction',
  'deliver_misconception_repair',
  'deliver_bounded_prerequisite_bridge',
  'pause_for_predecessor',
  'collect_more_evidence',
]);

export const PlannerDiagnosticProvenanceSchema = z
  .object({
    decisionId: EventIdSchema,
    decisionClass: PlannerDiagnosticDecisionClassSchema,
    recommendedAction: PlannerRecommendedActionSchema,
    sourceEventIds: z.array(EventIdSchema),
    observedAt: UtcTimestampSchema,
    freshness: z.enum(['fresh', 'stale']),
    conflict: z.boolean(),
    diagnosticPolicy: PolicyVersionSchema,
    modelVersions: z.array(PolicyVersionSchema),
  })
  .strict()
  .superRefine((provenance, ctx) => {
    if (new Set(provenance.sourceEventIds).size !== provenance.sourceEventIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceEventIds'],
        message: 'diagnostic provenance source event IDs must be unique',
      });
    }
  });

export const PlannerEvidencePolicyQualificationSchema = z
  .object({
    policy: PolicyVersionSchema,
    status: z.enum(['qualified', 'not_qualified', 'unknown']),
    requiredDistinctFamilies: z.number().int().min(2),
    observedDistinctFamilies: z.number().int().nonnegative(),
    freshnessWindowSeconds: z.number().int().positive(),
    allEvidenceValid: z.boolean(),
    sameFamilyExcluded: z.literal(true),
    indirectEvidenceExcluded: z.literal(true),
  })
  .strict();

export const PlannerPrerequisiteCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    predecessorKcId: V3KcIdSchema,
    edgeId: z.string().min(1),
    edgeKind: z.enum(['hard_prerequisite', 'helpful_prerequisite']),
    pointOfUseId: z.string().min(1),
    gapId: z.string().min(1),
    gapClass: z.enum(['narrow_bridge', 'blocking_predecessor']),
    qualification: PlannerEvidencePolicyQualificationSchema,
  })
  .strict();
export type PlannerPrerequisiteCandidate = z.infer<typeof PlannerPrerequisiteCandidateSchema>;

export const PlannerPointOfUseObservationSchema = z
  .object({
    observationId: EventIdSchema,
    predecessorKcId: V3KcIdSchema,
    edgeId: z.string().min(1),
    pointOfUseId: z.string().min(1),
    familyId: z.string().min(1),
    outcome: z.enum(['satisfied', 'failed', 'uncertain']),
    observedAt: UtcTimestampSchema,
    valid: z.boolean(),
    assistanceLevel: AssistanceLevelSchema,
    contentBearingHintUsed: z.boolean(),
  })
  .strict();

export const PlannerInstructionCoordinateSchema = z
  .object({
    sequenceRelationId: z.string().min(1),
    lessonId: V3LessonIdSchema,
    kcId: V3KcIdSchema,
    checkpointId: z.string().min(1),
    state: z.enum([
      'not_started',
      'in_progress',
      'exit_checks_pending',
      'repair_in_progress',
      'blocked_for_predecessor',
      'exited',
    ]),
  })
  .strict();

export const PlannerReentryCoordinateSchema = PlannerInstructionCoordinateSchema.extend({
  failedExitFunction: z.enum(['near_use', 'changed_task']).nullable(),
  preservedExitFunctions: z.array(z.enum(['near_use', 'changed_task'])),
}).strict();

export const PlannerResolutionSupersessionSchema = z
  .object({
    rootResolutionId: EventIdSchema,
    supersedesResolutionId: EventIdSchema.nullable(),
    generation: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Authority-private instruction selection issued by the planner. It is never a
 * learner action and deliberately carries no diagnostic posterior.
 */
export const PlannerInstructionResolutionSchema = z
  .object({
    schemaVersion: z.literal(PLANNER_INSTRUCTION_RESOLUTION_SCHEMA_VERSION),
    resolutionId: EventIdSchema,
    learnerId: LearnerIdSchema,
    lessonId: V3LessonIdSchema,
    kcId: V3KcIdSchema,
    taskKind: PlannerInstructionTaskKindSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    reviewedContentHash: Sha256DigestSchema,
    requestedRoute: PlannerInstructionRouteSchema,
    diagnosticProvenance: PlannerDiagnosticProvenanceSchema,
    prerequisiteCandidate: PlannerPrerequisiteCandidateSchema.nullable(),
    blockingCandidates: z.array(PlannerPrerequisiteCandidateSchema),
    selectedBlockingCandidateId: z.string().min(1).nullable(),
    directPointOfUseObservations: z.array(PlannerPointOfUseObservationSchema),
    origin: PlannerInstructionCoordinateSchema,
    reentry: PlannerReentryCoordinateSchema.nullable(),
    evidenceCutoff: UtcTimestampSchema,
    issuedAt: UtcTimestampSchema,
    expiresAt: UtcTimestampSchema,
    registry: V3RegistryPinSchema,
    policies: z.array(PolicyVersionSchema).min(1),
    supersession: PlannerResolutionSupersessionSchema,
  })
  .strict()
  .superRefine((resolution, ctx) => {
    const allCandidates = [
      ...(resolution.prerequisiteCandidate ? [resolution.prerequisiteCandidate] : []),
      ...resolution.blockingCandidates,
    ];
    const candidateIds = allCandidates.map((candidate) => candidate.candidateId);
    if (new Set(candidateIds).size !== candidateIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prerequisiteCandidate'],
        message: 'prerequisite candidate IDs must be unique across the resolution',
      });
    }
    const observationIds = resolution.directPointOfUseObservations.map(
      (observation) => observation.observationId,
    );
    if (new Set(observationIds).size !== observationIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['directPointOfUseObservations'],
        message: 'point-of-use observation IDs must be unique',
      });
    }
    if (Date.parse(resolution.expiresAt) <= Date.parse(resolution.issuedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'planner resolution expiry must follow issuance',
      });
    }
    if (
      Date.parse(resolution.diagnosticProvenance.observedAt) >
        Date.parse(resolution.evidenceCutoff) ||
      Date.parse(resolution.evidenceCutoff) > Date.parse(resolution.issuedAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidenceCutoff'],
        message: 'diagnostic observation and evidence cutoff must not follow resolution issuance',
      });
    }
    if (
      resolution.origin.lessonId !== resolution.lessonId ||
      resolution.origin.kcId !== resolution.kcId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['origin'],
        message: 'planner resolution origin must identify its lesson and KC target',
      });
    }
    if (
      resolution.selectedBlockingCandidateId !== null &&
      !resolution.blockingCandidates.some(
        (candidate) => candidate.candidateId === resolution.selectedBlockingCandidateId,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedBlockingCandidateId'],
        message: 'selected blocking candidate must be declared',
      });
    }
    if (
      resolution.reentry !== null &&
      (resolution.reentry.lessonId !== resolution.lessonId ||
        resolution.reentry.kcId !== resolution.kcId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reentry'],
        message: 'planner reentry coordinates must identify the resolution target',
      });
    }
    if (resolution.taskKind === 'lesson_initial_instruction' && resolution.reentry !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reentry'],
        message: 'initial lesson instruction cannot carry a reentry coordinate',
      });
    }
    if (
      ['exact_kc_repair', 'sequence_reentry'].includes(resolution.taskKind) &&
      resolution.reentry === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reentry'],
        message: 'repair and sequence reentry instructions require an exact coordinate',
      });
    }
    if (
      resolution.reentry !== null &&
      new Set(resolution.reentry.preservedExitFunctions).size !==
        resolution.reentry.preservedExitFunctions.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reentry', 'preservedExitFunctions'],
        message: 'preserved exit functions must be unique',
      });
    }
    const pinnedPolicies = new Set(
      resolution.policies.map((policy) => `${policy.policyId}\u0000${policy.version}`),
    );
    const requiredPolicies = [
      resolution.diagnosticProvenance.diagnosticPolicy,
      ...allCandidates.map((candidate) => candidate.qualification.policy),
    ];
    requiredPolicies.forEach((policy) => {
      if (!pinnedPolicies.has(`${policy.policyId}\u0000${policy.version}`)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['policies'],
          message: `planner policy ${policy.policyId}@${policy.version} is not pinned`,
        });
      }
    });
  });
export type PlannerInstructionResolution = z.infer<typeof PlannerInstructionResolutionSchema>;
