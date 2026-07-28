import { z } from 'zod';
import { EventIdSchema, IdempotencyKeySchema, LearnerIdSchema, LessonItemIdSchema } from './ids';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';
import { AssistanceLevelSchema, ReasoningOperationSchema, type ReasoningOperation } from './vocab';

const IdentifierSchema = z.string().min(1);
const OpaqueBindingVersionSchema = z.string().min(1);
const ServerItemVersionSchema = z.number().int().positive();
// Mirrored from `packages/domain/src/evidence.ts` because domain depends on contracts and the
// reverse import would be a cycle; parity is enforced by an architecture test.
const ChangeDimensionSchema = z.enum([
  'domain_context',
  'representation',
  'passage_or_data',
  'required_operation',
  'section_application',
]);
// Mirrored from `packages/domain/src/evidence.ts` because domain depends on contracts and the
// reverse import would be a cycle; parity is enforced by an architecture test.
const EvidenceOutcomeSchema = z.enum(['correct', 'incorrect', 'omitted']);

/** Non-state authoring metadata that must never influence qualification. */
const SemanticStructureSchema = z.record(z.string(), z.string());
const OptionalMetadataTextSchema = z.string().nullable().optional();

const LearnerSafeChoiceSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
  })
  .strict();

const LearnerSafeItemProjectionSchema = z
  .object({
    prompt: z.string().optional(),
    choices: z.array(LearnerSafeChoiceSchema).optional(),
    representationId: z.string().min(1).nullable().optional(),
    responseFieldIds: z.array(IdentifierSchema).readonly().optional(),
  })
  .strict();

const LearnerSafeItemRefSchema = z.union([z.string().min(1), LearnerSafeItemProjectionSchema]);

const ResponseFeatureRouteSchema = z
  .object({
    responseOptionIndex: z.number().int().nonnegative().optional(),
    responseFieldId: IdentifierSchema.optional(),
    responsePatternId: IdentifierSchema.optional(),
    responseFeatureId: IdentifierSchema,
    routeKind: IdentifierSchema,
    repairFeatureId: IdentifierSchema.optional(),
  })
  .strict();

/** Reviewed freshness prose is structured by the authoring spec, not a BKT target. */
const FreshnessDivergenceSchema = z
  .object({
    changedFromItemBindingId: LessonItemIdSchema.optional(),
    stimulusDifference: z.string().optional(),
    solutionPathDifference: z.string().optional(),
    distractorDifference: z.string().optional(),
  })
  .strict();

const MultipleChoiceResponseSchema = z
  .object({
    kind: z.literal('MULTIPLE_CHOICE'),
    chosenChoiceId: z.string().nullable(),
  })
  .strict();

const ConstructedResponseSchema = z
  .object({
    kind: z.literal('CONSTRUCTED'),
    /** Keys are author-defined response_field_id values. */
    fields: z.record(IdentifierSchema, z.string().nullable()),
  })
  .strict();

const RuntimeResponseSchema = z.discriminatedUnion('kind', [
  MultipleChoiceResponseSchema,
  ConstructedResponseSchema,
]);

export const LessonActivityRoleSchema = z.enum([
  'ENTRY_CHECK',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'LIGHT_SUPPORT_PRACTICE',
  'SOLO_PRACTICE',
  'NEAR_EXIT',
  'CHANGED_EXIT',
  'REPAIR_CONFIRMATION',
  'REHEARSAL_ONLY',
]);
export type LessonActivityRole = z.infer<typeof LessonActivityRoleSchema>;

export const CandidateEvidenceModeSchema = z.enum([
  'DIAGNOSTIC',
  'ENTRY',
  'INSTRUCTIONAL',
  'INSTRUCTIONAL_EXIT',
  'INDEPENDENT',
  'TRANSFER',
  'DELAYED',
  'MIXED',
  'PASSAGE',
  'TIMED',
  'PROTECTED',
  'REPAIR_CONFIRMATION',
  'REHEARSAL_ONLY',
]);
export type CandidateEvidenceMode = z.infer<typeof CandidateEvidenceModeSchema>;

const CandidateEvidenceModesSchema = z
  .array(CandidateEvidenceModeSchema)
  .min(1)
  .readonly()
  .default(['INSTRUCTIONAL']);

export const DokLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type DokLevel = z.infer<typeof DokLevelSchema>;

export const RepresentationIdSchema = z.string().min(1).nullable().optional();
export type RepresentationId = z.infer<typeof RepresentationIdSchema>;

const CommonLessonItemBindingShape = {
  lessonId: IdentifierSchema,
  itemBindingId: LessonItemIdSchema,
  bindingVersion: OpaqueBindingVersionSchema.optional(),
  primaryKcId: IdentifierSchema,
  secondaryKcMappings: z.array(IdentifierSchema).readonly().default([]),
  secondaryKcRefs: z.array(IdentifierSchema).readonly().optional(),
  activityRole: LessonActivityRoleSchema,
  semanticFamilyId: IdentifierSchema,
  stimulusLineageId: IdentifierSchema.optional(),
  /**
   * Author-declared affordances are an open set and never determine runtime
   * independence. `assistanceLevel` records assistance actually used.
   */
  authoredAssistanceAffordances: z.array(IdentifierSchema).min(1).readonly(),
  candidateEvidenceModes: CandidateEvidenceModesSchema,
  reasoningOperation: ReasoningOperationSchema.optional(),
  dokLevel: DokLevelSchema.optional(),
  representationId: RepresentationIdSchema,
  representationFamilyId: IdentifierSchema.nullable().optional(),
  changedDimensions: z.array(ChangeDimensionSchema).readonly(),
  changedDimensionDetail: z.string().optional(),
  learnerOperation: z.string().optional(),
  semanticStructure: SemanticStructureSchema.optional(),
  learnerSafeItemRef: LearnerSafeItemRefSchema,
  hintPolicy: OptionalMetadataTextSchema,
  feedbackRelease: OptionalMetadataTextSchema,
  omissionPolicy: OptionalMetadataTextSchema,
  retryPolicy: OptionalMetadataTextSchema,
  invalidItemPolicy: OptionalMetadataTextSchema,
  exitFunction: OptionalMetadataTextSchema,
  freshnessPolicy: OptionalMetadataTextSchema,
  publicationEligibility: OptionalMetadataTextSchema,
  solutionPathLineageId: OptionalMetadataTextSchema,
  decisiveCueId: OptionalMetadataTextSchema,
  distractorLineageId: OptionalMetadataTextSchema,
  responseFeatureRoutes: z.array(ResponseFeatureRouteSchema).readonly().optional(),
  exactReentryFor: OptionalMetadataTextSchema,
  scopeOperationTags: z.array(IdentifierSchema).readonly().optional(),
  freshnessDivergence: FreshnessDivergenceSchema.optional(),
  responseMode: OptionalMetadataTextSchema,
} as const;

const MeasurableLessonItemBindingSchema = z
  .object({
    ...CommonLessonItemBindingShape,
    measurementKind: z.literal('MEASURABLE'),
    questionId: LessonItemIdSchema,
    activityId: IdentifierSchema,
    firstAttemptImmutable: z.literal(true),
    serverScoringAuthorityRef: z.string().min(1),
    serverRationaleAuthorityRef: z.string().min(1).optional(),
  })
  .strict();

const NonMeasurableLessonItemBindingSchema = z
  .object({
    ...CommonLessonItemBindingShape,
    measurementKind: z.literal('NON_MEASURABLE'),
    questionId: z.never().optional(),
    activityId: z.never().optional(),
    firstAttemptImmutable: z.never().optional(),
    serverScoringAuthorityRef: z.never().optional(),
    serverRationaleAuthorityRef: z.never().optional(),
  })
  .strict();

const hasNonInstructionalEvidenceMode = (modes: readonly CandidateEvidenceMode[]): boolean =>
  modes.some((mode) => mode !== 'INSTRUCTIONAL');

const requireReasoningOperationForEligibleModes = (
  binding: {
    readonly candidateEvidenceModes: readonly CandidateEvidenceMode[];
    readonly reasoningOperation?: ReasoningOperation | undefined;
  },
  context: z.RefinementCtx,
): void => {
  if (
    hasNonInstructionalEvidenceMode(binding.candidateEvidenceModes) &&
    binding.reasoningOperation === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ELIGIBLE_BINDING_MISSING_REASONING_OPERATION',
      path: ['reasoningOperation'],
      params: { rejectionCode: 'ELIGIBLE_BINDING_MISSING_REASONING_OPERATION' },
    });
  }
};

const MeasurableLessonItemBindingWithQualificationSchema =
  MeasurableLessonItemBindingSchema.superRefine(requireReasoningOperationForEligibleModes);

export const LessonItemBindingSchema = z
  .discriminatedUnion('measurementKind', [
    MeasurableLessonItemBindingSchema,
    NonMeasurableLessonItemBindingSchema,
  ])
  .superRefine(requireReasoningOperationForEligibleModes);
export type LessonItemBinding = z.infer<typeof LessonItemBindingSchema>;

export const LessonRuntimeResponseFactsSchema = z
  .object({
    questionId: LessonItemIdSchema,
    itemBindingId: LessonItemIdSchema,
    bindingVersion: OpaqueBindingVersionSchema,
    attemptIndex: z.number().int().positive(),
    isRetry: z.boolean(),
    isDiagnosticRetry: z.boolean(),
    response: RuntimeResponseSchema,
    omitted: z.boolean(),
    elapsedMs: z.number().int().nonnegative(),
    answerChanges: z.number().int().nonnegative(),
    assistanceLevel: AssistanceLevelSchema,
    contentBearingHintUsed: z.boolean(),
    revealUsed: z.boolean(),
    occurredAt: UtcTimestampSchema,
  })
  .strict();
export type LessonRuntimeResponseFacts = z.infer<typeof LessonRuntimeResponseFactsSchema>;

export const AcceptedLessonObservationSchema = z
  .object({
    observationId: z.string().uuid(),
    eventId: EventIdSchema,
    learnerId: LearnerIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    /** Exposition bindings cannot create accepted response observations. */
    binding: MeasurableLessonItemBindingWithQualificationSchema,
    response: LessonRuntimeResponseFactsSchema,
    bindingVersion: OpaqueBindingVersionSchema,
    serverItemVersion: ServerItemVersionSchema.optional(),
    outcome: EvidenceOutcomeSchema,
    scoringValid: z.boolean(),
    acceptedAt: UtcTimestampSchema,
    sequence: z.number().int().nonnegative(),
    contentRelease: z.string().min(1),
    policies: z.array(PolicyVersionSchema),
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.scoringValid && observation.serverItemVersion === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'serverItemVersion is required when scoringValid is true.',
        path: ['serverItemVersion'],
      });
    }
    if (!observation.scoringValid && observation.serverItemVersion !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'serverItemVersion must be absent when scoringValid is false.',
        path: ['serverItemVersion'],
      });
    }
  });
export type AcceptedLessonObservation = z.infer<typeof AcceptedLessonObservationSchema>;

export const QualifiedBktObservationSchema = z
  .object({
    observationId: z.string().uuid(),
    questionId: LessonItemIdSchema,
    itemBindingId: LessonItemIdSchema,
    bindingVersion: OpaqueBindingVersionSchema,
    serverItemVersion: ServerItemVersionSchema,
    primaryKcId: IdentifierSchema,
    reasoningOperation: ReasoningOperationSchema,
    correct: z.boolean(),
    dokLevel: DokLevelSchema.optional(),
    occurredAt: UtcTimestampSchema,
    sequence: z.number().int().nonnegative(),
    contentRelease: z.string().min(1),
    policies: z.array(PolicyVersionSchema),
  })
  .strict();
export type QualifiedBktObservation = z.infer<typeof QualifiedBktObservationSchema>;

export const BKT_QUALIFICATION_REJECTION_CODES = [
  'BINDING_NOT_FOUND',
  'BINDING_VERSION_MISMATCH',
  'FIRST_ATTEMPT_NOT_IMMUTABLE',
  'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
  'ELIGIBLE_BINDING_MISSING_REASONING_OPERATION',
  'SERVER_SCORING_INVALID',
  'NOT_FIRST_ATTEMPT',
  'ASSISTANCE_NOT_A0',
  'CONTENT_BEARING_HINT_USED',
  'REVEAL_USED',
  'RETRY_USED',
] as const;

export const BktQualificationRejectionCodeSchema = z.enum(BKT_QUALIFICATION_REJECTION_CODES);
export type BktQualificationRejectionCode = z.infer<typeof BktQualificationRejectionCodeSchema>;

export const BktQualificationResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('qualified'),
      observation: QualifiedBktObservationSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('rejected'),
      rejectionCodes: z.array(BktQualificationRejectionCodeSchema).readonly(),
    })
    .strict(),
]);
export type BktQualificationResult = z.infer<typeof BktQualificationResultSchema>;

export const hasIndependentEvidenceMode = (
  binding: Pick<LessonItemBinding, 'candidateEvidenceModes'>,
): boolean => binding.candidateEvidenceModes.includes('INDEPENDENT');

export const isBktQualificationAccepted = (
  result: BktQualificationResult,
): result is Extract<BktQualificationResult, { status: 'qualified' }> =>
  result.status === 'qualified';
