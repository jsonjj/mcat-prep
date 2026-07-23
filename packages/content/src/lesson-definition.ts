import { z } from 'zod';
import {
  AssistanceLevelSchema,
  LessonActivityPhaseSchema,
  LessonDefinitionVersionSchema,
  LessonRouteSchema,
  V3ActivityIdSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
  V3RepresentationIdSchema,
} from '@mcat/contracts';
import { ChangeDimensionSchema } from '@mcat/domain';
import { ContentStatusSchema, ProvenanceSchema, ReviewSchema } from './schema';

export const LESSON_DEFINITION_SCHEMA_VERSION = '3.0.0' as const;

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

export const AccessibilityAlternativeSchema = z
  .object({
    format: z.enum([
      'plain_text',
      'long_description',
      'data_table',
      'transcript',
      'audio_description',
      'reduced_motion',
    ]),
    content: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const RepresentationDefinitionSchema = z
  .object({
    id: V3RepresentationIdSchema,
    kind: z.enum([
      'text',
      'equation',
      'table',
      'diagram',
      'graph',
      'animation',
      'audio',
      'video',
      'simulation',
    ]),
    label: z.string().min(1),
    body: z.array(z.string().min(1)).default([]),
    assetRef: z.string().min(1).nullable().default(null),
    table: z
      .object({
        caption: z.string().min(1),
        columns: z.array(z.string().min(1)).min(1),
        rows: z.array(z.array(z.string())).min(1),
      })
      .strict()
      .nullable()
      .default(null),
    alternatives: z.array(AccessibilityAlternativeSchema).default([]),
  })
  .strict()
  .superRefine((representation, ctx) => {
    if (representation.kind === 'table' && representation.table === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['table'],
        message: 'Table representations require semantic table data.',
      });
    }
    if (
      !['text', 'table'].includes(representation.kind) &&
      representation.alternatives.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alternatives'],
        message: 'Non-text representations require an accessibility alternative.',
      });
    }
  });
export type RepresentationDefinition = z.infer<typeof RepresentationDefinitionSchema>;

const ChoiceDefinitionSchema = z
  .object({
    id: z.string().min(1).max(32),
    label: z.string().min(1),
    feedback: z.string().min(1),
    diagnosticSignalIds: z.array(z.string().min(1)).default([]),
  })
  .strict();

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

const ConstructedResponseDefinitionSchema = z
  .object({
    kind: z.literal('text'),
    label: z.string().min(1),
    placeholder: z.string().min(1).nullable().default(null),
    allowNotSure: z.boolean().default(true),
    rubric: z
      .object({
        criteria: z
          .array(
            z
              .object({
                id: z.string().min(1),
                label: z.string().min(1),
                acceptedAnswers: z.array(z.string().min(1)).min(1),
                caseSensitive: z.boolean().default(false),
                required: z.boolean().default(true),
              })
              .strict(),
          )
          .min(1),
        correctFeedback: z.string().min(1),
        incorrectFeedback: z.string().min(1),
        notSureFeedback: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const ActivityResponseDefinitionSchema = z.discriminatedUnion('kind', [
  NoResponseDefinitionSchema,
  ChoiceResponseDefinitionSchema,
  ConstructedResponseDefinitionSchema,
]);
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
    activityIds: z.array(V3ActivityIdSchema).min(2),
  })
  .strict();

const ExitPairSchema = z
  .object({
    nearActivityId: V3ActivityIdSchema,
    changedActivityId: V3ActivityIdSchema,
  })
  .strict();

const GenericRepairMappingSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('generic'),
    signalIds: z.array(z.string()).length(0),
    minimumDistinctFamilies: z.literal(0),
    activityIds: z.array(V3ActivityIdSchema).min(2),
  })
  .strict();

const TargetedRepairMappingSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('targeted'),
    signalIds: z.array(z.string().min(1)).min(1),
    minimumDistinctFamilies: z.number().int().min(2),
    activityIds: z.array(V3ActivityIdSchema).min(2),
  })
  .strict();

export const KcMicrocycleSchema = z
  .object({
    entryRouting: z
      .object({
        probeActivityIds: z.array(V3ActivityIdSchema).min(2),
        routes: z.array(EntryRouteSchema).length(4),
      })
      .strict(),
    fading: z
      .object({
        ladder: z.tuple([z.literal('A3'), z.literal('A2'), z.literal('A1'), z.literal('A0')]),
        successesToFade: z.number().int().min(1).max(4),
        nonSuccessRule: z.literal('hold_or_increase_support'),
      })
      .strict(),
    workedDecisionActivityIds: z.array(V3ActivityIdSchema).min(1),
    pairedExit: z
      .object({
        feedbackSealedUntilBoth: z.literal(true),
        attempts: z.array(ExitPairSchema).length(3),
      })
      .strict(),
    repairs: z
      .object({
        maximumCycles: z.literal(2),
        mappings: z
          .array(
            z.discriminatedUnion('kind', [GenericRepairMappingSchema, TargetedRepairMappingSchema]),
          )
          .min(1),
      })
      .strict(),
  })
  .strict();
export type KcMicrocycle = z.infer<typeof KcMicrocycleSchema>;

const ArtifactReferenceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('support'),
      id: z.string().regex(/^V3-SUP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
      evidenceUse: z.literal('none'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('extension'),
      id: z.string().regex(/^V3-EXT-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
      evidenceUse: z.literal('none'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('capstone'),
      id: z.string().regex(/^V3-CAP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
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

const LessonDefinitionBaseSchema = z
  .object({
    schemaVersion: z.literal(LESSON_DEFINITION_SCHEMA_VERSION),
    id: V3LessonIdSchema,
    definitionVersion: LessonDefinitionVersionSchema,
    contentRelease: z.string().min(1),
    canonicalRegistryRef: z.string().min(1).nullable(),
    title: z.string().min(1),
    summary: z.string().min(1),
    orderedKcIds: z.array(V3KcIdSchema).min(1),
    knowledgeComponents: z.array(KnowledgeComponentDefinitionSchema).min(1),
    artifactReferences: z.array(ArtifactReferenceSchema).default([]),
    timing: TimedRangeSchema,
    status: ContentStatusSchema,
    provenance: ProvenanceSchema,
    review: ReviewSchema,
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
  completion: 3,
  contrast_bound: 4,
  exit_near: 5,
  exit_changed: 6,
} as const;
type OrderedPhase = keyof typeof phaseOrder;

const isOrderedPhase = (
  phase: z.infer<typeof LessonActivityPhaseSchema> | undefined,
): phase is OrderedPhase =>
  phase !== undefined && Object.prototype.hasOwnProperty.call(phaseOrder, phase);

export const LessonDefinitionSchema = LessonDefinitionBaseSchema.superRefine((lesson, ctx) => {
  const kcIds = lesson.knowledgeComponents.map((kc) => kc.id);
  if (
    new Set(kcIds).size !== kcIds.length ||
    lesson.orderedKcIds.length !== kcIds.length ||
    lesson.orderedKcIds.some((id, index) => id !== kcIds[index])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orderedKcIds'],
      message:
        'orderedKcIds must list every knowledge component exactly once and match authoring order.',
    });
  }
  if (
    lesson.accessibility.readingOrder.length !== lesson.orderedKcIds.length ||
    lesson.accessibility.readingOrder.some((id, index) => id !== lesson.orderedKcIds[index])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accessibility', 'readingOrder'],
      message: 'Accessibility reading order must match orderedKcIds.',
    });
  }

  const globalActivityIds = new Set<string>();
  const globalRepresentationIds = new Set<string>();

  lesson.knowledgeComponents.forEach((kc, kcIndex) => {
    const basePath = ['knowledgeComponents', kcIndex] as const;
    const activityById = new Map(kc.activities.map((activity) => [activity.id, activity]));
    const representationIds = new Set(
      kc.representations.map((representation) => representation.id),
    );

    for (const representation of kc.representations) {
      if (globalRepresentationIds.has(representation.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'representations'],
          message: `Duplicate representation id ${representation.id}.`,
        });
      }
      globalRepresentationIds.add(representation.id);
    }

    for (const activity of kc.activities) {
      if (globalActivityIds.has(activity.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'activities'],
          message: `Duplicate activity id ${activity.id}.`,
        });
      }
      globalActivityIds.add(activity.id);
      if (activity.kcId !== kc.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'activities'],
          message: `Activity ${activity.id} must reference its containing KC.`,
        });
      }
      for (const representationId of activity.representationIds) {
        if (!representationIds.has(representationId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'activities'],
            message: `Activity ${activity.id} references unknown representation ${representationId}.`,
          });
        }
      }
      if (!activity.assistance.allowedLevels.includes(activity.assistance.initialLevel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'activities'],
          message: `Activity ${activity.id} initial assistance must be allowed.`,
        });
      }
      if (activity.response.kind === 'choice') {
        const choiceIds = activity.response.choices.map((choice) => choice.id);
        if (new Set(choiceIds).size !== choiceIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'activities'],
            message: `Activity ${activity.id} choice ids must be unique.`,
          });
        }
        for (const correctId of activity.response.correctChoiceIds) {
          if (!choiceIds.includes(correctId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...basePath, 'activities'],
              message: `Activity ${activity.id} has an unknown correct choice id.`,
            });
          }
        }
      }
    }

    const referenced = new Set<string>();
    const requireActivity = (
      id: string,
      expectedPhase?: z.infer<typeof LessonActivityPhaseSchema>,
    ) => {
      referenced.add(id);
      const activity = activityById.get(id as z.infer<typeof V3ActivityIdSchema>);
      if (!activity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'microcycle'],
          message: `Microcycle references unknown activity ${id}.`,
        });
        return undefined;
      }
      if (expectedPhase && activity.phase !== expectedPhase) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'microcycle'],
          message: `Activity ${id} must have phase ${expectedPhase}.`,
        });
      }
      return activity;
    };

    for (const probeId of kc.microcycle.entryRouting.probeActivityIds) {
      requireActivity(probeId, 'enter_routing');
    }

    const routes = kc.microcycle.entryRouting.routes;
    const routeNames = routes.map((route) => route.route);
    if (
      new Set(routeNames).size !== 4 ||
      LessonRouteSchema.options.some((route) => !routeNames.includes(route))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...basePath, 'microcycle', 'entryRouting', 'routes'],
        message: 'Entry routing must define concise, standard, prerequisite, and misconception.',
      });
    }
    for (const route of routes) {
      if ((route.route === 'standard') !== (route.criteria.kind === 'default')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'microcycle', 'entryRouting', 'routes'],
          message:
            'Standard is the only default route; all targeted routes require convergent evidence.',
        });
      }

      const phases = route.activityIds
        .map((id) => requireActivity(id)?.phase)
        .filter(isOrderedPhase);
      for (const requiredPhase of Object.keys(phaseOrder) as OrderedPhase[]) {
        if (!phases.includes(requiredPhase)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'microcycle', 'entryRouting', 'routes'],
            message: `Route ${route.route} is missing ${requiredPhase}.`,
          });
        }
      }
      for (let index = 1; index < phases.length; index += 1) {
        if (phaseOrder[phases[index]!]! < phaseOrder[phases[index - 1]!]!) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'microcycle', 'entryRouting', 'routes'],
            message: `Route ${route.route} violates microcycle phase order.`,
          });
        }
      }
      const initialExit = kc.microcycle.pairedExit.attempts[0]!;
      if (
        route.activityIds.at(-2) !== initialExit.nearActivityId ||
        route.activityIds.at(-1) !== initialExit.changedActivityId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'microcycle', 'entryRouting', 'routes'],
          message: `Route ${route.route} must end with the initial paired exit checks.`,
        });
      }
    }

    for (const id of kc.microcycle.workedDecisionActivityIds) {
      requireActivity(id, 'show_expert_decisions');
    }

    const exitFamilies = new Set<string>();
    for (const pair of kc.microcycle.pairedExit.attempts) {
      const near = requireActivity(pair.nearActivityId, 'exit_near');
      const changed = requireActivity(pair.changedActivityId, 'exit_changed');
      if (!near || !changed) continue;
      if (
        near.constructId !== changed.constructId ||
        !near.constructPreserving ||
        !changed.constructPreserving ||
        changed.changeDimensions.length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'microcycle', 'pairedExit'],
          message:
            'Each exit pair must preserve one construct and the changed task must declare a change dimension.',
        });
      }
      for (const activity of [near, changed]) {
        if (
          activity.assistance.initialLevel !== 'A0' ||
          activity.assistance.allowedLevels.length !== 1 ||
          activity.assistance.allowedLevels[0] !== 'A0' ||
          activity.assistance.revealAllowed
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'microcycle', 'pairedExit'],
            message: `Exit activity ${activity.id} must be unsupported A0 with reveal disabled.`,
          });
        }
        if (activity.response.kind === 'none') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'microcycle', 'pairedExit'],
            message: `Exit activity ${activity.id} must collect a response.`,
          });
        }
        if (exitFamilies.has(activity.familyId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'microcycle', 'pairedExit'],
            message: 'All bounded exit attempts require distinct item families.',
          });
        }
        exitFamilies.add(activity.familyId);
      }
    }
    for (const activity of kc.activities) {
      if (
        exitFamilies.has(activity.familyId) &&
        !['exit_near', 'exit_changed'].includes(activity.phase)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'microcycle', 'pairedExit'],
          message: `Exit family ${activity.familyId} is exposed by non-exit activity ${activity.id}.`,
        });
      }
    }

    const genericMappings = kc.microcycle.repairs.mappings.filter(
      (mapping) => mapping.kind === 'generic',
    );
    if (genericMappings.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...basePath, 'microcycle', 'repairs', 'mappings'],
        message: 'Exactly one generic repair fallback is required.',
      });
    }
    for (const mapping of kc.microcycle.repairs.mappings) {
      mapping.activityIds.forEach((id, index) => {
        const mapped = requireActivity(id);
        if (
          mapped &&
          ((index === 0 && mapped.phase !== 'targeted_repair') ||
            (index > 0 && mapped.phase !== 'completion'))
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...basePath, 'microcycle', 'repairs', 'mappings'],
            message:
              'Repair mappings must begin with targeted repair, followed only by completion/fading activities.',
          });
        }
      });
    }

    for (const activity of kc.activities) {
      if (!referenced.has(activity.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...basePath, 'activities'],
          message: `Activity ${activity.id} is unreachable from the microcycle.`,
        });
      }
    }
    if (kc.scope.prerequisiteKcIds.includes(kc.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...basePath, 'scope', 'prerequisiteKcIds'],
        message: 'A KC cannot be its own prerequisite.',
      });
    }
  });

  if (lesson.status === 'published') {
    if (lesson.testOnly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['testOnly'],
        message: 'Test-only lesson definitions cannot be published.',
      });
    }
    if (
      lesson.review.content_status !== 'approved' ||
      lesson.review.copy_status !== 'approved' ||
      lesson.review.accessibility_status !== 'approved' ||
      lesson.provenance.rights_status !== 'cleared' ||
      lesson.canonicalRegistryRef === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message:
          'Published definitions require registry linkage, cleared rights, and complete review approval.',
      });
    }
  }
});
export type LessonDefinition = z.infer<typeof LessonDefinitionSchema>;

export const parseLessonDefinition = (input: unknown): LessonDefinition =>
  LessonDefinitionSchema.parse(input);
