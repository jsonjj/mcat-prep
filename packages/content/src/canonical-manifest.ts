import { z } from 'zod';
import {
  Sha256DigestSchema,
  V3KcIdSchema,
  V3LessonIdSchema,
  V3RegistryPinSchema,
} from '@mcat/contracts';
import { compareCodeUnits, deterministicJson } from './deterministic-json';

const CanonicalGroupingIdSchema = z.string().regex(/^V3-CL-\d{6}$/);
const BindingGroupingIdSchema = z.string().regex(/^V3-CL-[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
const AttachmentIdSchema = z.string().regex(/^V3-(?:EXT|CAP|SUP)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/);
const PrerequisiteEntityIdSchema = z.union([
  V3KcIdSchema,
  z.string().regex(/^V3-CAP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
]);

const ManifestLessonSchema = z
  .object({
    lesson_id: V3LessonIdSchema,
    canonical_display_label: z.string().min(1),
    concise_scope: z.string().min(1),
    scope_exclusions: z.array(z.string()),
    nested_kc_ids: z.array(V3KcIdSchema).min(1).max(5),
    owning_cluster_id: CanonicalGroupingIdSchema,
    extension_ids: z.array(z.string()),
    capstone_ids: z.array(z.string()),
    support_artifact_ids: z.array(z.string()),
    unresolved_holds: z.array(z.string()),
    hard_prerequisite_lesson_ids: z.array(V3LessonIdSchema),
    helpful_prerequisite_lesson_ids: z.array(V3LessonIdSchema),
    direct_successor_lesson_ids: z.array(V3LessonIdSchema),
    sequence_relation_refs: z.record(z.unknown()),
  })
  .passthrough();

const ManifestKcSchema = z
  .object({
    kc_id: V3KcIdSchema,
    owning_lesson_id: V3LessonIdSchema,
    statement_of_competence: z.string().min(1),
    scope_in: z.array(z.string()),
    scope_out: z.array(z.string()),
    representations: z.array(z.string()),
    hard_prerequisite_ids: z.array(PrerequisiteEntityIdSchema),
    helpful_prerequisite_ids: z.array(PrerequisiteEntityIdSchema),
  })
  .passthrough();

const ManifestGroupingSchema = z
  .object({
    grouping_id: CanonicalGroupingIdSchema,
    lesson_id: V3LessonIdSchema,
    member_kc_ids: z.array(V3KcIdSchema).min(1),
    member_capstone_ids: z.array(z.string()),
    teaching_order: z
      .object({
        accepted_freeze_id: z.string().min(1),
        entity_ids: z.array(z.string()).min(1),
      })
      .passthrough(),
  })
  .passthrough();

const ManifestExtensionSchema = z
  .object({
    extension_id: z.string().regex(/^V3-EXT-\d{6}$/),
    owning_lesson_id: V3LessonIdSchema,
    host_lesson_ids: z.array(V3LessonIdSchema),
    secondary_application_lesson_ids: z.array(V3LessonIdSchema).default([]),
    delivery_state: z.enum(['host_only', 'governance_only']),
    hold_ids: z.array(z.string()).default([]),
    required_delivery: z.boolean().default(false),
  })
  .passthrough();

const ManifestCapstoneSchema = z
  .object({
    capstone_id: z.string().regex(/^V3-CAP-\d{6}$/),
    owning_lesson_id: V3LessonIdSchema,
    delivery_state: z.enum(['required', 'governance_only']),
    hold_ids: z.array(z.string()).default([]),
    required_delivery: z.boolean().optional(),
    component_kc_ids: z.array(V3KcIdSchema).min(1),
    placement_freeze_id: z.string().min(1),
    delivery_evidence: z
      .object({
        placement_relation_id: z.string().min(1).optional(),
        hold_id: z.string().min(1).optional(),
      })
      .passthrough(),
  })
  .passthrough();

const ManifestSupportSchema = z
  .object({
    support_id: z.string().regex(/^V3-SUP-\d{6}$/),
    host_lesson_id: V3LessonIdSchema,
    delivery_state: z.literal('host_only'),
  })
  .passthrough();

const ManifestEdgeSchema = z
  .object({
    edge_id: z.string().min(1),
    source_id: z.string().min(1),
    target_id: z.string().min(1),
  })
  .passthrough();

const ManifestRelationSchema = z.object({ relation_id: z.string().min(1) }).passthrough();

const HeldInternalEntitySchema = z.union([
  z.string().min(1),
  z
    .object({
      entity_id: z.string().min(1),
      held_relation_id: z.string().min(1),
      hold_id: z.string().min(1),
      required_delivery: z.literal(false),
      required_placement: z.null(),
    })
    .passthrough(),
]);

const ManifestInternalLessonOrderRelationSchema = z
  .object({
    relation_id: z.string().min(1),
    grouping_id: CanonicalGroupingIdSchema,
    lesson_id: V3LessonIdSchema,
    ordered_entity_ids: z.array(z.string()).min(1),
    ordered_nested_kc_ids: z.array(V3KcIdSchema).min(1),
    owned_capstone_ids: z.array(z.string()),
    referenced_capstone_ids: z.array(z.string()),
    held_nonrequired_entity_ids: z.array(HeldInternalEntitySchema),
  })
  .passthrough();

const ManifestCapstonePlacementRelationSchema = z
  .object({
    relation_id: z.string().min(1),
    target_capstone_id: z.string().regex(/^V3-CAP-\d{6}$/),
    owning_lesson_id: V3LessonIdSchema,
    component_kc_ids: z.array(V3KcIdSchema).min(1),
    placement_kind: z.literal('CAPSTONE_COORDINATION'),
  })
  .passthrough();

export const CanonicalLessonAuthoringManifestSchema = z
  .object({
    schema_version: z.literal('mcat-v3-lesson-authoring-manifest-2'),
    metadata: z
      .object({
        registry: z
          .object({
            artifact_id: z.string().min(1),
            sha256: Sha256DigestSchema,
            phase1_gate_id: z.string().min(1),
            freeze_ids: z
              .object({
                phase0: z.string().min(1),
                canonical: z.string().min(1),
                graph: z.string().min(1),
                sequence: z.string().min(1),
              })
              .strict(),
          })
          .passthrough(),
        counts: z
          .object({
            lessons: z.literal(114),
            kcs: z.literal(422),
            groupings: z.literal(114),
          })
          .passthrough(),
        held_nonrequired_entity_ids: z.array(AttachmentIdSchema),
      })
      .passthrough(),
    curriculum: z
      .object({
        lessons: z.array(ManifestLessonSchema).length(114),
        kcs: z.array(ManifestKcSchema).length(422),
        groupings: z.array(ManifestGroupingSchema).length(114),
        extensions: z.array(ManifestExtensionSchema),
        capstones: z.array(ManifestCapstoneSchema),
        support_artifacts: z.array(ManifestSupportSchema),
      })
      .passthrough(),
    graph: z
      .object({
        edges: z.array(ManifestEdgeSchema),
      })
      .passthrough(),
    sequence: z
      .object({
        normalized_relations: z.record(z.unknown()),
      })
      .passthrough(),
    governance: z
      .object({
        holds: z.array(z.object({ hold_id: z.string().min(1) }).passthrough()),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((manifest, ctx) => {
    const uniqueCount = (values: string[]) => new Set(values).size;
    const lessonIds = manifest.curriculum.lessons.map((lesson) => lesson.lesson_id);
    const kcIds = manifest.curriculum.kcs.map((kc) => kc.kc_id);
    const groupingIds = manifest.curriculum.groupings.map((grouping) => grouping.grouping_id);
    if (
      uniqueCount(lessonIds) !== 114 ||
      uniqueCount(kcIds) !== 422 ||
      uniqueCount(groupingIds) !== 114
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['curriculum'],
        message: 'canonical manifest identities must be unique at the frozen counts',
      });
    }
  });
export type CanonicalLessonAuthoringManifest = z.infer<
  typeof CanonicalLessonAuthoringManifestSchema
>;

export const CanonicalKcBindingSchema = z
  .object({
    id: V3KcIdSchema,
    owningLessonId: V3LessonIdSchema,
    statementOfCompetence: z.string().min(1),
    scopeIn: z.array(z.string()),
    scopeOut: z.array(z.string()),
    representationLabels: z.array(z.string()),
    hardPrerequisiteEntityIds: z.array(PrerequisiteEntityIdSchema),
    helpfulPrerequisiteEntityIds: z.array(PrerequisiteEntityIdSchema),
  })
  .strict();

export const CanonicalAttachmentBindingSchema = z
  .object({
    id: AttachmentIdSchema,
    kind: z.enum(['extension', 'capstone', 'support']),
    owningLessonId: V3LessonIdSchema,
    deliveryState: z.enum(['required', 'host_only', 'governance_only']),
    activation: z.enum(['required_separate', 'host_only', 'governance_only']),
    holdIds: z.array(z.string()),
    lessonRelation: z.enum([
      'owner',
      'host',
      'secondary_application',
      'referenced',
      'governance_only',
    ]),
    componentKcIds: z.array(V3KcIdSchema),
    placementRelationId: z.string().min(1).nullable(),
    placementFreezeId: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((attachment, ctx) => {
    if (attachment.kind === 'capstone') {
      if (attachment.componentKcIds.length === 0 || attachment.placementFreezeId === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'capstone bindings require component KCs and an exact placement freeze',
        });
      }
      if (
        attachment.deliveryState === 'required' &&
        (attachment.activation !== 'required_separate' ||
          attachment.placementRelationId === null ||
          !['owner', 'referenced'].includes(attachment.lessonRelation))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'required capstones need an owned/referenced separate placement',
        });
      }
      if (
        attachment.deliveryState === 'governance_only' &&
        (attachment.activation !== 'governance_only' ||
          attachment.lessonRelation !== 'governance_only' ||
          attachment.placementRelationId !== null)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'held capstones must remain governance-only and unplaced',
        });
      }
    } else if (
      attachment.componentKcIds.length > 0 ||
      attachment.placementRelationId !== null ||
      attachment.placementFreezeId !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'only capstone bindings carry component and placement facts',
      });
    }
  });

export const CanonicalLessonRegistryBindingSchema = z
  .object({
    mode: z.enum(['canonical', 'synthetic_test_fixture']),
    registry: V3RegistryPinSchema,
    phase1GateId: z.string().min(1),
    lesson: z
      .object({
        id: V3LessonIdSchema,
        groupingId: BindingGroupingIdSchema,
        canonicalDisplayLabel: z.string().min(1),
        conciseScope: z.string().min(1),
        scopeExclusions: z.array(z.string()),
        orderedKcIds: z.array(V3KcIdSchema).min(1).max(5),
        hardPrerequisiteLessonIds: z.array(V3LessonIdSchema),
        helpfulPrerequisiteLessonIds: z.array(V3LessonIdSchema),
        directSuccessorLessonIds: z.array(V3LessonIdSchema),
      })
      .strict(),
    grouping: z
      .object({
        id: BindingGroupingIdSchema,
        lessonId: V3LessonIdSchema,
        memberKcIds: z.array(V3KcIdSchema).min(1),
        memberCapstoneIds: z.array(z.string()),
        teachingOrderEntityIds: z.array(z.string()).min(1),
      })
      .strict(),
    kcs: z.array(CanonicalKcBindingSchema).min(1).max(5),
    attachments: z.array(CanonicalAttachmentBindingSchema),
    graphEdgeIds: z.array(z.string()),
    sequenceRelationIds: z.array(z.string()),
    holdIds: z.array(z.string()),
  })
  .strict();
export type CanonicalLessonRegistryBinding = z.infer<typeof CanonicalLessonRegistryBindingSchema>;

const flattenRelationIds = (value: unknown, target: Set<string>): void => {
  if (typeof value === 'string' && value.startsWith('R14-')) {
    target.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenRelationIds(entry, target));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => flattenRelationIds(entry, target));
  }
};

const containsRelevantEntity = (value: unknown, relevantIds: ReadonlySet<string>): boolean => {
  if (typeof value === 'string') return relevantIds.has(value);
  if (Array.isArray(value))
    return value.some((entry) => containsRelevantEntity(entry, relevantIds));
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => containsRelevantEntity(entry, relevantIds));
  }
  return false;
};

const exactArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((entry, index) => entry === right[index]);

const exactMembers = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((entry) => right.includes(entry));

const heldInternalEntityId = (entry: z.infer<typeof HeldInternalEntitySchema>): string =>
  typeof entry === 'string' ? entry : entry.entity_id;

const findNormalizedRelation = (
  manifest: CanonicalLessonAuthoringManifest,
  relationId: string,
): z.infer<typeof ManifestRelationSchema> => {
  const matches: z.infer<typeof ManifestRelationSchema>[] = [];
  for (const collection of Object.values(manifest.sequence.normalized_relations)) {
    if (!Array.isArray(collection)) continue;
    for (const candidate of collection) {
      const relation = ManifestRelationSchema.safeParse(candidate);
      if (relation.success && relation.data.relation_id === relationId) {
        matches.push(relation.data);
      }
    }
  }
  if (matches.length !== 1) {
    throw new Error(`canonical sequence relation ${relationId} must resolve exactly once`);
  }
  return matches[0]!;
};

export const parseCanonicalLessonAuthoringManifest = (
  input: unknown,
): CanonicalLessonAuthoringManifest => CanonicalLessonAuthoringManifestSchema.parse(input);

export function compileCanonicalLessonBinding(
  manifestInput: unknown,
  lessonIdInput: string,
): CanonicalLessonRegistryBinding {
  const manifest = parseCanonicalLessonAuthoringManifest(manifestInput);
  const lessonId = V3LessonIdSchema.parse(lessonIdInput);
  const lesson = manifest.curriculum.lessons.find((candidate) => candidate.lesson_id === lessonId);
  if (!lesson) throw new Error(`canonical manifest does not contain lesson ${lessonId}`);
  const grouping = manifest.curriculum.groupings.find(
    (candidate) => candidate.grouping_id === lesson.owning_cluster_id,
  );
  if (!grouping || grouping.lesson_id !== lesson.lesson_id) {
    throw new Error(`canonical grouping mismatch for ${lessonId}`);
  }
  if (
    !exactArray(grouping.member_kc_ids, lesson.nested_kc_ids) ||
    !exactArray(grouping.member_capstone_ids, lesson.capstone_ids)
  ) {
    throw new Error(`canonical grouping membership mismatch for ${lessonId}`);
  }

  const internalRelations = z
    .array(ManifestInternalLessonOrderRelationSchema)
    .parse(manifest.sequence.normalized_relations.lesson_internal_order_relations);
  const matchingInternalRelations = internalRelations.filter(
    (relation) => relation.lesson_id === lessonId,
  );
  if (matchingInternalRelations.length !== 1) {
    throw new Error(`canonical internal sequence mismatch for ${lessonId}`);
  }
  const internalRelation = matchingInternalRelations[0]!;
  const declaredInternalRelationId = lesson.sequence_relation_refs.internal_order;
  if (
    internalRelation.grouping_id !== grouping.grouping_id ||
    internalRelation.relation_id !== declaredInternalRelationId ||
    !exactArray(internalRelation.ordered_nested_kc_ids, lesson.nested_kc_ids)
  ) {
    throw new Error(`canonical internal sequence facts mismatch for ${lessonId}`);
  }
  const heldInternalIds = internalRelation.held_nonrequired_entity_ids.map(heldInternalEntityId);
  const activeCapstoneIds = [
    ...internalRelation.owned_capstone_ids,
    ...internalRelation.referenced_capstone_ids,
  ];
  if (
    !exactMembers([...activeCapstoneIds, ...heldInternalIds], lesson.capstone_ids) ||
    !exactMembers(
      internalRelation.ordered_entity_ids,
      grouping.teaching_order.entity_ids.filter((id) => !heldInternalIds.includes(id)),
    )
  ) {
    throw new Error(`canonical capstone internal-order mismatch for ${lessonId}`);
  }

  const kcById = new Map(manifest.curriculum.kcs.map((kc) => [kc.kc_id, kc]));
  const kcs = lesson.nested_kc_ids.map((kcId) => {
    const kc = kcById.get(kcId);
    if (!kc || kc.owning_lesson_id !== lessonId) {
      throw new Error(`canonical KC ownership mismatch for ${kcId}`);
    }
    return {
      id: kc.kc_id,
      owningLessonId: kc.owning_lesson_id,
      statementOfCompetence: kc.statement_of_competence,
      scopeIn: [...kc.scope_in],
      scopeOut: [...kc.scope_out],
      representationLabels: [...kc.representations],
      hardPrerequisiteEntityIds: [...kc.hard_prerequisite_ids],
      helpfulPrerequisiteEntityIds: [...kc.helpful_prerequisite_ids],
    };
  });

  const extensions = new Map(
    manifest.curriculum.extensions.map((record) => [record.extension_id, record]),
  );
  const capstones = new Map(
    manifest.curriculum.capstones.map((record) => [record.capstone_id, record]),
  );
  const supports = new Map(
    manifest.curriculum.support_artifacts.map((record) => [record.support_id, record]),
  );
  const attachments: z.infer<typeof CanonicalAttachmentBindingSchema>[] = [];
  for (const id of lesson.extension_ids) {
    const extension = extensions.get(id);
    if (
      !extension ||
      ![
        extension.owning_lesson_id,
        ...extension.host_lesson_ids,
        ...extension.secondary_application_lesson_ids,
      ].includes(lessonId)
    ) {
      throw new Error(`canonical extension ownership mismatch for ${id}`);
    }
    attachments.push({
      id: extension.extension_id,
      kind: 'extension',
      owningLessonId: extension.owning_lesson_id,
      deliveryState: extension.delivery_state,
      activation: extension.delivery_state === 'governance_only' ? 'governance_only' : 'host_only',
      holdIds: [...extension.hold_ids],
      lessonRelation:
        extension.delivery_state === 'governance_only'
          ? 'governance_only'
          : extension.owning_lesson_id === lessonId
            ? 'owner'
            : extension.host_lesson_ids.includes(lessonId)
              ? 'host'
              : 'secondary_application',
      componentKcIds: [],
      placementRelationId: null,
      placementFreezeId: null,
    });
  }
  for (const id of lesson.capstone_ids) {
    const capstone = capstones.get(id);
    if (!capstone) throw new Error(`canonical capstone missing for ${id}`);
    const association = internalRelation.owned_capstone_ids.includes(id)
      ? 'owner'
      : internalRelation.referenced_capstone_ids.includes(id)
        ? 'referenced'
        : heldInternalIds.includes(id)
          ? 'governance_only'
          : null;
    if (
      association === null ||
      (association === 'owner' && capstone.owning_lesson_id !== lessonId) ||
      (association === 'referenced' && capstone.owning_lesson_id === lessonId) ||
      (association === 'referenced' &&
        !lesson.nested_kc_ids.some((kcId) => capstone.component_kc_ids.includes(kcId))) ||
      capstone.placement_freeze_id !== manifest.metadata.registry.freeze_ids.sequence
    ) {
      throw new Error(`canonical capstone association mismatch for ${id}`);
    }
    const placementRelationId = capstone.delivery_evidence.placement_relation_id ?? null;
    if (association === 'governance_only') {
      if (
        capstone.delivery_state !== 'governance_only' ||
        capstone.required_delivery !== false ||
        placementRelationId !== null
      ) {
        throw new Error(`held capstone placement mismatch for ${id}`);
      }
    } else {
      if (capstone.delivery_state !== 'required' || placementRelationId === null) {
        throw new Error(`required capstone placement missing for ${id}`);
      }
      const placement = ManifestCapstonePlacementRelationSchema.parse(
        findNormalizedRelation(manifest, placementRelationId),
      );
      if (
        placement.target_capstone_id !== capstone.capstone_id ||
        placement.owning_lesson_id !== capstone.owning_lesson_id ||
        !exactArray(placement.component_kc_ids, capstone.component_kc_ids)
      ) {
        throw new Error(`canonical capstone placement relation mismatch for ${id}`);
      }
    }
    attachments.push({
      id: capstone.capstone_id,
      kind: 'capstone',
      owningLessonId: capstone.owning_lesson_id,
      deliveryState: capstone.delivery_state,
      activation:
        capstone.delivery_state === 'governance_only' ? 'governance_only' : 'required_separate',
      holdIds: [...capstone.hold_ids],
      lessonRelation: association,
      componentKcIds: [...capstone.component_kc_ids],
      placementRelationId,
      placementFreezeId: capstone.placement_freeze_id,
    });
  }
  for (const id of lesson.support_artifact_ids) {
    const support = supports.get(id);
    if (!support || support.host_lesson_id !== lessonId) {
      throw new Error(`canonical support host mismatch for ${id}`);
    }
    attachments.push({
      id: support.support_id,
      kind: 'support',
      owningLessonId: support.host_lesson_id,
      deliveryState: support.delivery_state,
      activation: 'host_only',
      holdIds: [],
      lessonRelation: 'host',
      componentKcIds: [],
      placementRelationId: null,
      placementFreezeId: null,
    });
  }

  const heldIds = new Set(manifest.metadata.held_nonrequired_entity_ids);
  for (const attachment of attachments) {
    const held = heldIds.has(attachment.id);
    if (
      (held && attachment.activation !== 'governance_only') ||
      (!held && attachment.activation === 'governance_only')
    ) {
      throw new Error(`held attachment delivery mismatch for ${attachment.id}`);
    }
  }

  const relevantEntityIds = new Set<string>([
    lesson.lesson_id,
    ...lesson.nested_kc_ids,
    ...lesson.extension_ids,
    ...lesson.capstone_ids,
    ...lesson.support_artifact_ids,
  ]);
  const graphEdgeIds = manifest.graph.edges
    .filter(
      (edge) => relevantEntityIds.has(edge.source_id) || relevantEntityIds.has(edge.target_id),
    )
    .map((edge) => edge.edge_id)
    .sort(compareCodeUnits);

  const sequenceRelationIds = new Set<string>();
  flattenRelationIds(lesson.sequence_relation_refs, sequenceRelationIds);
  for (const relations of Object.values(manifest.sequence.normalized_relations)) {
    if (!Array.isArray(relations)) continue;
    for (const relation of relations) {
      const parsedRelation = ManifestRelationSchema.safeParse(relation);
      if (
        parsedRelation.success &&
        containsRelevantEntity(parsedRelation.data, relevantEntityIds)
      ) {
        sequenceRelationIds.add(parsedRelation.data.relation_id);
      }
    }
  }

  const holdIds = new Set(lesson.unresolved_holds);
  attachments.forEach((attachment) => attachment.holdIds.forEach((id) => holdIds.add(id)));

  return CanonicalLessonRegistryBindingSchema.parse({
    mode: 'canonical',
    registry: {
      manifestSchemaVersion: manifest.schema_version,
      artifactId: manifest.metadata.registry.artifact_id,
      sha256: manifest.metadata.registry.sha256,
      phase0FreezeId: manifest.metadata.registry.freeze_ids.phase0,
      canonicalFreezeId: manifest.metadata.registry.freeze_ids.canonical,
      graphFreezeId: manifest.metadata.registry.freeze_ids.graph,
      sequenceFreezeId: manifest.metadata.registry.freeze_ids.sequence,
    },
    phase1GateId: manifest.metadata.registry.phase1_gate_id,
    lesson: {
      id: lesson.lesson_id,
      groupingId: lesson.owning_cluster_id,
      canonicalDisplayLabel: lesson.canonical_display_label,
      conciseScope: lesson.concise_scope,
      scopeExclusions: [...lesson.scope_exclusions],
      orderedKcIds: [...lesson.nested_kc_ids],
      hardPrerequisiteLessonIds: [...lesson.hard_prerequisite_lesson_ids],
      helpfulPrerequisiteLessonIds: [...lesson.helpful_prerequisite_lesson_ids],
      directSuccessorLessonIds: [...lesson.direct_successor_lesson_ids],
    },
    grouping: {
      id: grouping.grouping_id,
      lessonId: grouping.lesson_id,
      memberKcIds: [...grouping.member_kc_ids],
      memberCapstoneIds: [...grouping.member_capstone_ids],
      teachingOrderEntityIds: [...grouping.teaching_order.entity_ids],
    },
    kcs,
    attachments,
    graphEdgeIds,
    sequenceRelationIds: [...sequenceRelationIds].sort(compareCodeUnits),
    holdIds: [...holdIds].sort(compareCodeUnits),
  });
}

export function validateCanonicalLessonBinding(
  bindingInput: unknown,
  manifestInput: unknown,
): string[] {
  const parsed = CanonicalLessonRegistryBindingSchema.safeParse(bindingInput);
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message);
  if (parsed.data.mode !== 'canonical') {
    return ['production registry validation rejects synthetic_test_fixture bindings'];
  }
  let expected: CanonicalLessonRegistryBinding;
  try {
    expected = compileCanonicalLessonBinding(manifestInput, parsed.data.lesson.id);
  } catch (error) {
    return [error instanceof Error ? error.message : 'canonical manifest compilation failed'];
  }
  return deterministicJson(parsed.data) === deterministicJson(expected)
    ? []
    : ['lesson registry binding does not exactly match the compiled canonical manifest projection'];
}
