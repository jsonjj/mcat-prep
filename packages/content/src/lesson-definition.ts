import { sha256 } from 'js-sha256';
import { z } from 'zod';
import {
  AssistanceLevelSchema,
  LearnerLessonRepresentationSchema,
  LessonActivityPhaseSchema,
  LessonDefinitionVersionSchema,
  LessonRouteSchema,
  Sha256DigestSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
  V3RepresentationIdSchema,
} from '@mcat/contracts';
import { ChangeDimensionSchema } from '@mcat/domain';
import {
  CanonicalLessonRegistryBindingSchema,
  type CanonicalLessonAuthoringManifest,
  validateCanonicalLessonBinding,
} from './canonical-manifest';
import { ContentStatusSchema } from './schema';

export const LESSON_DEFINITION_SCHEMA_VERSION = '3.1.0' as const;

const TimedRangeSchema = z
  .object({
    minimumSeconds: z.number().int().nonnegative(),
    targetSeconds: z.number().int().positive(),
    maximumSeconds: z.number().int().positive(),
  })
  .strict()
  .superRefine((timing, ctx) => {
    if (
      timing.minimumSeconds > timing.targetSeconds ||
      timing.targetSeconds > timing.maximumSeconds
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Timing must satisfy minimumSeconds <= targetSeconds <= maximumSeconds.',
      });
    }
  });

/**
 * Content and learner views intentionally share the same closed representation
 * union. It permits structured data and reviewed local assets, never HTML or JS.
 */
export const RepresentationDefinitionSchema = LearnerLessonRepresentationSchema;
export type RepresentationDefinition = z.infer<typeof RepresentationDefinitionSchema>;

const ChoiceDefinitionSchema = z
  .object({
    id: z.string().min(1).max(32),
    label: z.string().min(1),
    feedback: z.string().min(1),
    diagnosticSignalIds: z.array(z.string().min(1)).default([]),
    objectiveFeatureIds: z.array(z.string().min(1)).default([]),
  })
  .strict();

const NormalizationSchema = z
  .object({
    trim: z.literal(true),
    collapseWhitespace: z.literal(true),
    case: z.enum(['sensitive', 'lowercase']),
    stripPunctuation: z.boolean(),
  })
  .strict();

export const ConstructedResponseMatcherSchema = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('accepted_set'),
        accepted: z.array(z.string().min(1)).min(1),
        normalization: NormalizationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('required_tokens'),
        tokens: z.array(z.string().min(1)).min(1),
        minimumMatches: z.number().int().positive(),
        normalization: NormalizationSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('numeric'),
        target: z.number().finite(),
        absoluteTolerance: z.number().nonnegative(),
        acceptedUnits: z.array(z.string().min(1)),
        requireUnit: z.boolean(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('ordered_steps'),
        steps: z
          .array(
            z
              .object({
                accepted: z.array(z.string().min(1)).min(1),
              })
              .strict(),
          )
          .min(2),
        normalization: NormalizationSchema,
      })
      .strict(),
  ])
  .superRefine((matcher, ctx) => {
    if (matcher.kind === 'required_tokens' && matcher.minimumMatches > matcher.tokens.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minimumMatches'],
        message: 'minimumMatches cannot exceed the number of required tokens',
      });
    }
    if (matcher.kind === 'numeric' && matcher.requireUnit && matcher.acceptedUnits.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acceptedUnits'],
        message: 'a unit-required numeric matcher needs at least one accepted unit',
      });
    }
  });
export type ConstructedResponseMatcher = z.infer<typeof ConstructedResponseMatcherSchema>;

const RubricCriterionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean(),
    matcher: ConstructedResponseMatcherSchema,
    correctFeedback: z.string().min(1),
    incorrectFeedback: z.string().min(1),
    diagnosticSignalIds: z.array(z.string().min(1)).default([]),
    objectiveFeatureIds: z.array(z.string().min(1)).default([]),
  })
  .strict();

const ConstructedRubricSchema = z
  .object({
    criteria: z.array(RubricCriterionSchema).min(1),
    correctFeedback: z.string().min(1),
    incorrectFeedback: z.string().min(1),
    notSureFeedback: z.string().min(1),
  })
  .strict()
  .superRefine((rubric, ctx) => {
    if (!rubric.criteria.some((criterion) => criterion.required)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['criteria'],
        message: 'a constructed-response rubric needs at least one required criterion',
      });
    }
  });

const NoResponseDefinitionSchema = z.object({ kind: z.literal('none') }).strict();

const ChoiceResponseDefinitionSchema = z
  .object({
    kind: z.literal('choice'),
    legend: z.string().min(1),
    choices: z.array(ChoiceDefinitionSchema).min(2),
    correctChoiceIds: z.array(z.string().min(1)).min(1),
    correctFeedback: z.string().min(1),
    notSureFeedback: z.string().min(1),
    allowNotSure: z.boolean().default(true),
  })
  .strict();

const TextResponseDefinitionSchema = z
  .object({
    kind: z.literal('text'),
    label: z.string().min(1),
    placeholder: z.string().min(1).nullable().default(null),
    allowNotSure: z.boolean().default(true),
    rubric: ConstructedRubricSchema,
  })
  .strict();

const NumericResponseDefinitionSchema = z
  .object({
    kind: z.literal('numeric'),
    label: z.string().min(1),
    unitLabel: z.string().min(1).nullable(),
    allowNotSure: z.boolean().default(true),
    rubric: ConstructedRubricSchema,
  })
  .strict();

const OrderedStepsResponseDefinitionSchema = z
  .object({
    kind: z.literal('ordered_steps'),
    legend: z.string().min(1),
    minimumSteps: z.number().int().positive(),
    maximumSteps: z.number().int().positive(),
    allowNotSure: z.boolean().default(true),
    rubric: ConstructedRubricSchema,
  })
  .strict();

export const ActivityResponseDefinitionSchema = z
  .discriminatedUnion('kind', [
    NoResponseDefinitionSchema,
    ChoiceResponseDefinitionSchema,
    TextResponseDefinitionSchema,
    NumericResponseDefinitionSchema,
    OrderedStepsResponseDefinitionSchema,
  ])
  .superRefine((response, ctx) => {
    if (response.kind === 'ordered_steps' && response.maximumSteps < response.minimumSteps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'maximumSteps must be at least minimumSteps',
      });
    }
  });
export type ActivityResponseDefinition = z.infer<typeof ActivityResponseDefinitionSchema>;

const ActivityAssistanceSchema = z
  .object({
    allowedLevels: z.array(AssistanceLevelSchema).min(1),
    initialLevel: AssistanceLevelSchema,
    hints: z
      .array(
        z
          .object({
            level: AssistanceLevelSchema,
            text: z.string().min(1),
            contentBearing: z.boolean(),
          })
          .strict(),
      )
      .default([]),
    revealAllowed: z.boolean(),
  })
  .strict();

export const ActivityDefinitionSchema = z
  .object({
    id: V3ActivityIdSchema,
    kcId: V3KcIdSchema,
    phase: LessonActivityPhaseSchema,
    familyId: z.string().min(1),
    constructId: z.string().min(1),
    constructPreserving: z.boolean(),
    changeDimensions: z.array(ChangeDimensionSchema).default([]),
    title: z.string().min(1),
    prompt: z.string().min(1).nullable().default(null),
    instructions: z.array(z.string().min(1)).default([]),
    representationIds: z.array(V3RepresentationIdSchema).default([]),
    response: ActivityResponseDefinitionSchema,
    assistance: ActivityAssistanceSchema,
    timing: TimedRangeSchema,
  })
  .strict();
export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;

const DefaultRouteCriteriaSchema = z
  .object({
    kind: z.literal('default'),
    signalIds: z.array(z.string()).length(0),
    minimumDistinctFamilies: z.literal(0),
  })
  .strict();

const ConvergentRouteCriteriaSchema = z
  .object({
    kind: z.literal('convergent_evidence'),
    signalIds: z.array(z.string().min(1)).min(1),
    minimumDistinctFamilies: z.number().int().min(2),
  })
  .strict();

const EntryRouteSchema = z
  .object({
    route: LessonRouteSchema,
    criteria: z.discriminatedUnion('kind', [
      DefaultRouteCriteriaSchema,
      ConvergentRouteCriteriaSchema,
    ]),
    initialAssistanceLevel: AssistanceLevelSchema,
    instructionActivityIds: z.array(V3ActivityIdSchema).min(3),
  })
  .strict();

const CompletionPoolsSchema = z
  .object({
    A3: z.array(V3ActivityIdSchema).min(1),
    A2: z.array(V3ActivityIdSchema).min(1),
    A1: z.array(V3ActivityIdSchema).min(1),
    A0: z.array(V3ActivityIdSchema).min(1),
  })
  .strict();
export type CompletionPools = z.infer<typeof CompletionPoolsSchema>;

const ExitPairSchema = z
  .object({
    id: z.string().min(1),
    nearActivityId: V3ActivityIdSchema,
    changedActivityId: V3ActivityIdSchema,
  })
  .strict();
export type ExitPairDefinition = z.infer<typeof ExitPairSchema>;

const GenericRepairMappingSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('generic'),
    signalIds: z.array(z.string()).length(0),
    objectiveFeatureIds: z.array(z.string()).length(0),
    minimumDistinctFamilies: z.literal(0),
    candidateActivityIds: z.array(V3ActivityIdSchema).min(1),
  })
  .strict();

const TargetedRepairMappingSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('targeted'),
    signalIds: z.array(z.string().min(1)),
    objectiveFeatureIds: z.array(z.string().min(1)),
    minimumDistinctFamilies: z.number().int().min(2),
    candidateActivityIds: z.array(V3ActivityIdSchema).min(1),
  })
  .strict();

const RepairMappingSchema = z
  .discriminatedUnion('kind', [GenericRepairMappingSchema, TargetedRepairMappingSchema])
  .superRefine((mapping, ctx) => {
    if (
      mapping.kind === 'targeted' &&
      mapping.signalIds.length === 0 &&
      mapping.objectiveFeatureIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targeted repair needs a response signal or failed objective feature',
      });
    }
  });

const RepairCycleSchema = z
  .object({
    cycle: z.union([z.literal(1), z.literal(2)]),
    mappings: z.array(RepairMappingSchema).min(1),
    recoveryPools: CompletionPoolsSchema,
  })
  .strict();

export const KcMicrocycleSchema = z
  .object({
    entryRouting: z
      .object({
        feedbackSealedUntilRouteFinalized: z.literal(true),
        probeCount: z.number().int().min(2).max(3),
        probeActivityIds: z.array(V3ActivityIdSchema).min(2),
        routes: z.array(EntryRouteSchema).length(4),
      })
      .strict(),
    fading: z
      .object({
        ladder: z.tuple([z.literal('A3'), z.literal('A2'), z.literal('A1'), z.literal('A0')]),
        successesToFade: z.number().int().min(1).max(4),
        requiredA0Successes: z.number().int().min(1).max(3),
        maxAttemptsPerLevel: z.number().int().min(1).max(4),
        maxReentryGenerations: z.number().int().min(0).max(2),
        nonSuccessRule: z.literal('hold_or_increase_support'),
        exhaustionRule: z.literal('planner_reentry_handoff'),
      })
      .strict(),
    workedDecisionActivityIds: z.array(V3ActivityIdSchema).min(1),
    completionPools: CompletionPoolsSchema,
    contrastActivityIds: z.array(V3ActivityIdSchema).min(1),
    pairedExit: z
      .object({
        feedbackSealedUntilBoth: z.literal(true),
        pairs: z.array(ExitPairSchema).min(3),
      })
      .strict(),
    repairs: z
      .object({
        maximumCycles: z.literal(2),
        cycles: z.tuple([RepairCycleSchema, RepairCycleSchema]),
      })
      .strict(),
  })
  .strict();
export type KcMicrocycle = z.infer<typeof KcMicrocycleSchema>;

export const ArtifactReferenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('support'),
      id: z.string().regex(/^V3-SUP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
      deliveryState: z.enum(['host_only', 'governance_only']),
      activation: z.enum(['host_only', 'governance_only']),
      evidenceUse: z.literal('none'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('extension'),
      id: z.string().regex(/^V3-EXT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
      deliveryState: z.enum(['host_only', 'governance_only']),
      activation: z.enum(['host_only', 'governance_only']),
      evidenceUse: z.literal('none'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('capstone'),
      id: z.string().regex(/^V3-CAP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
      deliveryState: z.enum(['required', 'governance_only']),
      activation: z.enum(['required_separate', 'governance_only']),
      evidenceUse: z.literal('separate_capstone_only'),
    })
    .strict(),
]);
export type LessonArtifactReference = z.infer<typeof ArtifactReferenceSchema>;

export const KnowledgeComponentDefinitionSchema = z
  .object({
    id: V3KcIdSchema,
    title: z.string().min(1),
    objective: z.string().min(1),
    scope: z
      .object({
        included: z.array(z.string().min(1)).min(1),
        excluded: z.array(z.string().min(1)).default([]),
        prerequisiteKcIds: z.array(V3KcIdSchema).default([]),
      })
      .strict(),
    representations: z.array(RepresentationDefinitionSchema).min(1),
    activities: z.array(ActivityDefinitionSchema).min(1),
    microcycle: KcMicrocycleSchema,
    artifactReferences: z.array(ArtifactReferenceSchema).default([]),
    timing: TimedRangeSchema,
  })
  .strict();
export type KnowledgeComponentDefinition = z.infer<typeof KnowledgeComponentDefinitionSchema>;

const ReviewGateSchema = z
  .object({
    status: z.enum(['pending', 'approved', 'changes_requested']),
    reviewerIds: z.array(z.string().min(1)),
    reportId: z.string().min(1).nullable(),
  })
  .strict();

export const LessonReviewEnvelopeSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    reviewedContentHash: Sha256DigestSchema,
    publicationFreezeId: z.string().min(1).nullable(),
    authorIds: z.array(z.string().min(1)).min(1),
    independentContentReview: ReviewGateSchema,
    independentDomainReview: ReviewGateSchema,
    copyReview: ReviewGateSchema,
    accessibilityReview: ReviewGateSchema,
    blindSolve: z
      .object({
        status: z.enum(['pending', 'passed', 'failed']),
        solverIds: z.array(z.string().min(1)),
        keysHidden: z.literal(true),
        reportId: z.string().min(1).nullable(),
      })
      .strict(),
    rightsReview: z
      .object({
        status: z.enum(['pending', 'cleared', 'restricted']),
        reviewerIds: z.array(z.string().min(1)),
        sourceRightsCleared: z.boolean(),
        modelProcessingRightsCleared: z.boolean(),
        similarity: z
          .object({
            status: z.enum(['pending', 'cleared', 'flagged']),
            reviewerIds: z.array(z.string().min(1)),
            reportId: z.string().min(1).nullable(),
          })
          .strict(),
      })
      .strict(),
    finalApproval: ReviewGateSchema,
  })
  .strict();
export type LessonReviewEnvelope = z.infer<typeof LessonReviewEnvelopeSchema>;

const LessonDefinitionBaseSchema = z
  .object({
    schemaVersion: z.literal(LESSON_DEFINITION_SCHEMA_VERSION),
    id: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    contentRelease: z.string().min(1),
    registryBinding: CanonicalLessonRegistryBindingSchema,
    contentDigest: z
      .object({
        algorithm: z.literal('sha256'),
        sha256: Sha256DigestSchema,
      })
      .strict(),
    publicationIntent: z.enum(['internal_draft', 'production']),
    title: z.string().min(1),
    summary: z.string().min(1),
    orderedKcIds: z.array(V3KcIdSchema).min(1),
    knowledgeComponents: z.array(KnowledgeComponentDefinitionSchema).min(1),
    artifactReferences: z.array(ArtifactReferenceSchema).default([]),
    timing: TimedRangeSchema,
    status: ContentStatusSchema,
    provenance: z
      .object({
        origin: z.enum(['original', 'licensed']),
        sourceRefs: z.array(z.string()).default([]),
        aiAssisted: z.boolean(),
        cleanRoom: z.boolean(),
      })
      .strict(),
    reviewEnvelope: LessonReviewEnvelopeSchema,
    testOnly: z.boolean(),
    accessibility: z
      .object({
        language: z.string().min(2),
        readingOrder: z.array(V3KcIdSchema).min(1),
        keyboardOnlySupported: z.literal(true),
        reducedMotionSupported: z.literal(true),
        authorNotes: z.array(z.string().min(1)).default([]),
      })
      .strict(),
  })
  .strict();

const phaseOrder = {
  orient_elicit: 0,
  build_model: 1,
  show_expert_decisions: 2,
} as const;
type InstructionPhase = keyof typeof phaseOrder;

const isInstructionPhase = (
  phase: z.infer<typeof LessonActivityPhaseSchema> | undefined,
): phase is InstructionPhase =>
  phase !== undefined && Object.prototype.hasOwnProperty.call(phaseOrder, phase);

const levelNames = ['A3', 'A2', 'A1', 'A0'] as const;

const collectPools = (
  pools: z.infer<typeof CompletionPoolsSchema>,
): z.infer<typeof V3ActivityIdSchema>[] => levelNames.flatMap((level) => pools[level]);

const addIssue = (ctx: z.RefinementCtx, path: (string | number)[], message: string): void => {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
};

const reviewerIds = (review: z.infer<typeof LessonReviewEnvelopeSchema>): string[] => [
  ...review.independentContentReview.reviewerIds,
  ...review.independentDomainReview.reviewerIds,
  ...review.copyReview.reviewerIds,
  ...review.accessibilityReview.reviewerIds,
  ...review.blindSolve.solverIds,
  ...review.rightsReview.reviewerIds,
  ...review.rightsReview.similarity.reviewerIds,
  ...review.finalApproval.reviewerIds,
];

const productionReviewIssues = (review: z.infer<typeof LessonReviewEnvelopeSchema>): string[] => {
  const issues: string[] = [];
  const approvedGates = [
    ['independent content review', review.independentContentReview],
    ['independent domain review', review.independentDomainReview],
    ['copy review', review.copyReview],
    ['accessibility review', review.accessibilityReview],
    ['final approval', review.finalApproval],
  ] as const;
  approvedGates.forEach(([label, gate]) => {
    if (gate.status !== 'approved' || gate.reviewerIds.length === 0 || gate.reportId === null) {
      issues.push(`${label} must be independently approved with reviewers and a report`);
    }
  });
  if (
    review.blindSolve.status !== 'passed' ||
    review.blindSolve.solverIds.length === 0 ||
    review.blindSolve.reportId === null
  ) {
    issues.push('blind solve must pass with an identified solver and report');
  }
  if (
    review.rightsReview.status !== 'cleared' ||
    !review.rightsReview.sourceRightsCleared ||
    !review.rightsReview.modelProcessingRightsCleared ||
    review.rightsReview.reviewerIds.length === 0
  ) {
    issues.push('source and model-processing rights require independent clearance');
  }
  if (
    review.rightsReview.similarity.status !== 'cleared' ||
    review.rightsReview.similarity.reviewerIds.length === 0 ||
    review.rightsReview.similarity.reportId === null
  ) {
    issues.push('source-output similarity review must be cleared and report-bound');
  }
  if (review.publicationFreezeId === null) {
    issues.push('production publication requires a content freeze ID');
  }
  const authors = new Set(review.authorIds);
  if (reviewerIds(review).some((id) => authors.has(id))) {
    issues.push('authors cannot serve in review, blind-solve, rights, or approval roles');
  }
  const blindSolvers = new Set(review.blindSolve.solverIds);
  if (review.finalApproval.reviewerIds.some((id) => blindSolvers.has(id))) {
    issues.push('blind solvers cannot be final approvers');
  }
  return issues;
};

const definitionDigestPayload = (lesson: Record<string, unknown>): Record<string, unknown> => {
  const {
    contentDigest: _contentDigest,
    reviewEnvelope: _reviewEnvelope,
    status: _status,
    publicationIntent: _publicationIntent,
    ...payload
  } = lesson;
  return payload;
};

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export function computeLessonContentDigest(input: Record<string, unknown>): string {
  return sha256(canonicalJson(definitionDigestPayload(input)));
}

export const LessonDefinitionSchema = LessonDefinitionBaseSchema.superRefine((lesson, ctx) => {
  const kcIds = lesson.knowledgeComponents.map((kc) => kc.id);
  if (
    new Set(kcIds).size !== kcIds.length ||
    lesson.orderedKcIds.length !== kcIds.length ||
    lesson.orderedKcIds.some((id, index) => id !== kcIds[index])
  ) {
    addIssue(
      ctx,
      ['orderedKcIds'],
      'orderedKcIds must list every knowledge component exactly once in authoring order',
    );
  }
  if (
    lesson.accessibility.readingOrder.length !== lesson.orderedKcIds.length ||
    lesson.accessibility.readingOrder.some((id, index) => id !== lesson.orderedKcIds[index])
  ) {
    addIssue(
      ctx,
      ['accessibility', 'readingOrder'],
      'accessibility reading order must match orderedKcIds',
    );
  }

  const binding = lesson.registryBinding;
  if (
    binding.lesson.id !== lesson.id ||
    binding.lesson.orderedKcIds.length !== lesson.orderedKcIds.length ||
    binding.lesson.orderedKcIds.some((id, index) => id !== lesson.orderedKcIds[index])
  ) {
    addIssue(ctx, ['registryBinding'], 'lesson ID and KC order must match the registry binding');
  }
  lesson.knowledgeComponents.forEach((kc, index) => {
    const canonicalKc = binding.kcs[index];
    if (
      !canonicalKc ||
      canonicalKc.id !== kc.id ||
      canonicalKc.statementOfCompetence !== kc.objective ||
      canonicalKc.scopeIn.length !== kc.scope.included.length ||
      canonicalKc.scopeIn.some((entry, scopeIndex) => entry !== kc.scope.included[scopeIndex]) ||
      canonicalKc.scopeOut.length !== kc.scope.excluded.length ||
      canonicalKc.scopeOut.some((entry, scopeIndex) => entry !== kc.scope.excluded[scopeIndex])
    ) {
      addIssue(
        ctx,
        ['knowledgeComponents', index],
        'KC identity, canonical statement, and scope must exactly match the compiled registry binding',
      );
    }
  });

  const bindingArtifacts = binding.attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    deliveryState: attachment.deliveryState,
    activation: attachment.activation,
  }));
  const authoredArtifacts = lesson.artifactReferences.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    deliveryState: artifact.deliveryState,
    activation: artifact.activation,
  }));
  if (canonicalJson(bindingArtifacts) !== canonicalJson(authoredArtifacts)) {
    addIssue(
      ctx,
      ['artifactReferences'],
      'artifact references and delivery states must exactly match the registry binding',
    );
  }
  lesson.artifactReferences.forEach((artifact, index) => {
    if (artifact.deliveryState === 'governance_only' && artifact.activation !== 'governance_only') {
      addIssue(
        ctx,
        ['artifactReferences', index],
        'held/governance-only artifacts cannot become active or required',
      );
    }
  });

  const globalActivityIds = new Set<string>();
  const globalRepresentationIds = new Set<string>();
  lesson.knowledgeComponents.forEach((kc, kcIndex) => {
    const basePath: (string | number)[] = ['knowledgeComponents', kcIndex];
    const activityById = new Map(kc.activities.map((activity) => [activity.id, activity]));
    const representationIds = new Set(
      kc.representations.map((representation) => representation.id),
    );
    kc.representations.forEach((representation) => {
      if (globalRepresentationIds.has(representation.id)) {
        addIssue(
          ctx,
          [...basePath, 'representations'],
          `duplicate representation ${representation.id}`,
        );
      }
      globalRepresentationIds.add(representation.id);
    });

    kc.activities.forEach((activity) => {
      if (globalActivityIds.has(activity.id)) {
        addIssue(ctx, [...basePath, 'activities'], `duplicate activity ${activity.id}`);
      }
      globalActivityIds.add(activity.id);
      if (activity.kcId !== kc.id) {
        addIssue(
          ctx,
          [...basePath, 'activities'],
          `${activity.id} must reference its containing KC`,
        );
      }
      activity.representationIds.forEach((id) => {
        if (!representationIds.has(id)) {
          addIssue(
            ctx,
            [...basePath, 'activities'],
            `${activity.id} references unknown representation ${id}`,
          );
        }
      });
      if (!activity.assistance.allowedLevels.includes(activity.assistance.initialLevel)) {
        addIssue(
          ctx,
          [...basePath, 'activities'],
          `${activity.id} initial assistance must be allowed`,
        );
      }
      if (activity.response.kind === 'choice') {
        const choiceIds = activity.response.choices.map((choice) => choice.id);
        if (new Set(choiceIds).size !== choiceIds.length) {
          addIssue(ctx, [...basePath, 'activities'], `${activity.id} choice IDs must be unique`);
        }
        activity.response.correctChoiceIds.forEach((id) => {
          if (!choiceIds.includes(id)) {
            addIssue(
              ctx,
              [...basePath, 'activities'],
              `${activity.id} has unknown correct choice ${id}`,
            );
          }
        });
      }
    });

    const referenced = new Set<string>();
    const freshFamilies = new Set<string>();
    const requireActivity = (
      id: string,
      expectedPhase?: z.infer<typeof LessonActivityPhaseSchema>,
      fresh = false,
    ) => {
      referenced.add(id);
      const activity = activityById.get(id as z.infer<typeof V3ActivityIdSchema>);
      if (!activity) {
        addIssue(ctx, [...basePath, 'microcycle'], `microcycle references unknown activity ${id}`);
        return undefined;
      }
      if (expectedPhase && activity.phase !== expectedPhase) {
        addIssue(ctx, [...basePath, 'microcycle'], `${id} must have phase ${expectedPhase}`);
      }
      if (fresh) {
        if (freshFamilies.has(activity.familyId)) {
          addIssue(
            ctx,
            [...basePath, 'microcycle'],
            `fresh activity family ${activity.familyId} is reused`,
          );
        }
        freshFamilies.add(activity.familyId);
      }
      return activity;
    };

    const requiredProbeCount =
      kc.microcycle.entryRouting.probeCount * (kc.microcycle.fading.maxReentryGenerations + 1);
    if (kc.microcycle.entryRouting.probeActivityIds.length < requiredProbeCount) {
      addIssue(
        ctx,
        [...basePath, 'microcycle', 'entryRouting', 'probeActivityIds'],
        `entry routing needs ${requiredProbeCount} fresh probes for allowed reentry generations`,
      );
    }
    const probes = kc.microcycle.entryRouting.probeActivityIds.map((id) =>
      requireActivity(id, 'enter_routing', true),
    );
    if (new Set(probes.map((activity) => activity?.familyId)).size !== probes.length) {
      addIssue(
        ctx,
        [...basePath, 'microcycle', 'entryRouting'],
        'entry probes require distinct sealed families',
      );
    }

    const routes = kc.microcycle.entryRouting.routes;
    const routeNames = routes.map((route) => route.route);
    if (
      new Set(routeNames).size !== 4 ||
      LessonRouteSchema.options.some((route) => !routeNames.includes(route))
    ) {
      addIssue(
        ctx,
        [...basePath, 'microcycle', 'entryRouting', 'routes'],
        'entry routing must define every route exactly once',
      );
    }
    routes.forEach((route) => {
      if ((route.route === 'standard') !== (route.criteria.kind === 'default')) {
        addIssue(
          ctx,
          [...basePath, 'microcycle', 'entryRouting', 'routes'],
          'standard is the only default; targeted routes require convergent evidence',
        );
      }
      const phases = route.instructionActivityIds.map((id) => requireActivity(id)?.phase);
      const ordered = phases.filter(isInstructionPhase);
      (Object.keys(phaseOrder) as InstructionPhase[]).forEach((phase) => {
        if (!ordered.includes(phase)) {
          addIssue(
            ctx,
            [...basePath, 'microcycle', 'entryRouting', 'routes'],
            `${route.route} is missing ${phase}`,
          );
        }
      });
      ordered.forEach((phase, index) => {
        if (index > 0 && phaseOrder[phase] < phaseOrder[ordered[index - 1]!]) {
          addIssue(
            ctx,
            [...basePath, 'microcycle', 'entryRouting', 'routes'],
            `${route.route} violates instruction phase order`,
          );
        }
      });
    });

    kc.microcycle.workedDecisionActivityIds.forEach((id) =>
      requireActivity(id, 'show_expert_decisions'),
    );
    const requiredPoolSize =
      kc.microcycle.fading.maxAttemptsPerLevel * (kc.microcycle.fading.maxReentryGenerations + 1);
    const validatePools = (
      pools: z.infer<typeof CompletionPoolsSchema>,
      path: (string | number)[],
    ) => {
      levelNames.forEach((level) => {
        if (pools[level].length < requiredPoolSize) {
          addIssue(
            ctx,
            [...path, level],
            `${level} needs ${requiredPoolSize} fresh activities for bounded attempts and reentry`,
          );
        }
        pools[level].forEach((id) => {
          const activity = requireActivity(id, 'completion', true);
          if (!activity) return;
          if (
            activity.assistance.initialLevel !== level ||
            !activity.assistance.allowedLevels.includes(level)
          ) {
            addIssue(ctx, path, `${id} must be authored for completion level ${level}`);
          }
          if (level === 'A0' && activity.assistance.revealAllowed) {
            addIssue(ctx, path, `${id} cannot reveal an A0 completion answer`);
          }
          if (activity.response.kind === 'none') {
            addIssue(ctx, path, `${id} must collect a completion response`);
          }
        });
      });
    };
    validatePools(kc.microcycle.completionPools, [...basePath, 'microcycle', 'completionPools']);

    kc.microcycle.contrastActivityIds.forEach((id) => requireActivity(id, 'contrast_bound'));

    const requiredExitPairs =
      (kc.microcycle.repairs.maximumCycles + 1) * (kc.microcycle.fading.maxReentryGenerations + 1);
    if (kc.microcycle.pairedExit.pairs.length < requiredExitPairs) {
      addIssue(
        ctx,
        [...basePath, 'microcycle', 'pairedExit', 'pairs'],
        `paired exit needs ${requiredExitPairs} fresh pairs for repairs and reentry`,
      );
    }
    const pairIds = new Set<string>();
    kc.microcycle.pairedExit.pairs.forEach((pair) => {
      if (pairIds.has(pair.id)) {
        addIssue(ctx, [...basePath, 'microcycle', 'pairedExit'], `duplicate exit pair ${pair.id}`);
      }
      pairIds.add(pair.id);
      const near = requireActivity(pair.nearActivityId, 'exit_near', true);
      const changed = requireActivity(pair.changedActivityId, 'exit_changed', true);
      if (!near || !changed) return;
      if (
        near.constructId !== changed.constructId ||
        !near.constructPreserving ||
        !changed.constructPreserving ||
        changed.changeDimensions.length === 0
      ) {
        addIssue(
          ctx,
          [...basePath, 'microcycle', 'pairedExit'],
          `${pair.id} must preserve the construct and change a declared task dimension`,
        );
      }
      [near, changed].forEach((activity) => {
        if (
          activity.assistance.initialLevel !== 'A0' ||
          activity.assistance.allowedLevels.length !== 1 ||
          activity.assistance.allowedLevels[0] !== 'A0' ||
          activity.assistance.revealAllowed ||
          activity.response.kind === 'none'
        ) {
          addIssue(
            ctx,
            [...basePath, 'microcycle', 'pairedExit'],
            `${activity.id} must be an unsupported, non-reveal A0 response`,
          );
        }
      });
    });

    if (
      kc.microcycle.repairs.cycles[0].cycle !== 1 ||
      kc.microcycle.repairs.cycles[1].cycle !== 2
    ) {
      addIssue(
        ctx,
        [...basePath, 'microcycle', 'repairs', 'cycles'],
        'repair cycles must be declared in cycle 1, cycle 2 order',
      );
    }
    const cycleRepresentations: Set<string>[] = [];
    kc.microcycle.repairs.cycles.forEach((cycle, cycleIndex) => {
      const generic = cycle.mappings.filter((mapping) => mapping.kind === 'generic');
      if (generic.length !== 1) {
        addIssue(
          ctx,
          [...basePath, 'microcycle', 'repairs', 'cycles', cycleIndex],
          'each repair cycle requires exactly one generic fallback',
        );
      }
      const representations = new Set<string>();
      cycle.mappings.forEach((mapping) => {
        if (mapping.candidateActivityIds.length < kc.microcycle.fading.maxReentryGenerations + 1) {
          addIssue(
            ctx,
            [...basePath, 'microcycle', 'repairs', 'cycles', cycleIndex],
            'repair mappings need a fresh candidate for every allowed run generation',
          );
        }
        mapping.candidateActivityIds.forEach((id) => {
          const activity = requireActivity(id, 'targeted_repair', true);
          activity?.representationIds.forEach((representationId) =>
            representations.add(representationId),
          );
        });
      });
      validatePools(cycle.recoveryPools, [
        ...basePath,
        'microcycle',
        'repairs',
        'cycles',
        cycleIndex,
        'recoveryPools',
      ]);
      collectPools(cycle.recoveryPools).forEach((id) => {
        activityById
          .get(id)
          ?.representationIds.forEach((representationId) => representations.add(representationId));
      });
      if (representations.size === 0) {
        addIssue(
          ctx,
          [...basePath, 'microcycle', 'repairs', 'cycles', cycleIndex],
          'each repair cycle needs a cycle-specific representation',
        );
      }
      cycleRepresentations.push(representations);
    });
    if ([...cycleRepresentations[0]!].some((id) => cycleRepresentations[1]!.has(id))) {
      addIssue(
        ctx,
        [...basePath, 'microcycle', 'repairs', 'cycles'],
        'repair cycles 1 and 2 must use distinct representation IDs',
      );
    }

    kc.activities.forEach((activity) => {
      if (!referenced.has(activity.id)) {
        addIssue(ctx, [...basePath, 'activities'], `${activity.id} is unreachable`);
      }
      if (
        freshFamilies.has(activity.familyId) &&
        !['enter_routing', 'completion', 'exit_near', 'exit_changed', 'targeted_repair'].includes(
          activity.phase,
        )
      ) {
        addIssue(
          ctx,
          [...basePath, 'activities'],
          `fresh family ${activity.familyId} leaks through non-fresh activity ${activity.id}`,
        );
      }
    });
    if (kc.scope.prerequisiteKcIds.includes(kc.id)) {
      addIssue(ctx, [...basePath, 'scope'], 'a KC cannot be its own prerequisite');
    }
  });

  if (lesson.status === 'published' || lesson.publicationIntent === 'production') {
    if (lesson.status !== 'published' || lesson.publicationIntent !== 'production') {
      addIssue(ctx, ['status'], 'production intent and published status must be set together');
    }
    if (lesson.testOnly || lesson.registryBinding.mode !== 'canonical') {
      addIssue(ctx, ['testOnly'], 'test fixtures and synthetic bindings cannot be published');
    }
    const computedDigest = computeLessonContentDigest(lesson as unknown as Record<string, unknown>);
    if (
      lesson.contentDigest.sha256 !== computedDigest ||
      lesson.reviewEnvelope.reviewedContentHash !== computedDigest
    ) {
      addIssue(
        ctx,
        ['contentDigest'],
        'published content and every approval must bind to the exact recomputed SHA-256',
      );
    }
    productionReviewIssues(lesson.reviewEnvelope).forEach((issue) =>
      addIssue(ctx, ['reviewEnvelope'], issue),
    );
  } else if (lesson.publicationIntent !== 'internal_draft') {
    addIssue(ctx, ['publicationIntent'], 'nonpublished definitions must remain internal drafts');
  }
});
export type LessonDefinition = z.infer<typeof LessonDefinitionSchema>;

export const parseLessonDefinition = (input: unknown): LessonDefinition =>
  LessonDefinitionSchema.parse(input);

export function validateLessonForProduction(
  definitionInput: unknown,
  manifest: CanonicalLessonAuthoringManifest | unknown,
): string[] {
  const parsed = LessonDefinitionSchema.safeParse(definitionInput);
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
  const definition = parsed.data;
  const issues = validateCanonicalLessonBinding(definition.registryBinding, manifest);
  if (definition.status !== 'published' || definition.publicationIntent !== 'production') {
    issues.push('production registry accepts only published production definitions');
  }
  return issues;
}
