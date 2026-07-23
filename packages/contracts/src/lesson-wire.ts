import { sha256 } from 'js-sha256';
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
import {
  LessonDefinitionVersionSchema,
  Sha256DigestSchema,
  V3RegistryPinSchema,
} from './lesson-pins';
import { UtcTimestampSchema } from './time';
import { PolicyVersionSchema } from './versioning';

export const LEARNER_EVENT_WIRE_SCHEMA_VERSION = '1.0' as const;

export const CanonicalLessonEventTypeSchema = z.enum([
  'LESSON_SHELL_STARTED',
  'LESSON_SHELL_RESUMED',
  'LESSON_SHELL_PAUSED',
  'KC_MICROCYCLE_STARTED',
  'ENTRY_ROUTE_SELECTED',
  'ENTRY_ROUTE_DOWNGRADED',
  'PLANNER_INSTRUCTION_RESOLUTION_REJECTED',
  'PLANNER_INSTRUCTION_RESOLUTION_SUPERSEDED',
  'INSTRUCTION_NODE_PRESENTED',
  'ITEM_PRESENTED',
  'ATTEMPT_OBSERVED',
  'CONFIDENCE_RECORDED',
  'LEARNER_CAUSE_RECORDED',
  'HINT_REQUESTED',
  'REVEAL_REQUESTED',
  'RETRY_OBSERVED',
  'FEEDBACK_DELIVERED',
  'ASSISTANCE_CHANGED',
  'CHECKPOINT_COMMITTED',
  'ITEM_INVALIDATED',
  'KC_REPAIR_STARTED',
  'KC_PAUSED_FOR_PREDECESSOR',
  'KC_RESUMED_AT_REENTRY',
  'SEQUENCE_REENTRY_RECORDED',
  'KC_PLANNER_HANDOFF_REQUESTED',
  'KC_INSTRUCTIONAL_EXIT_RECORDED',
  'LESSON_DELIVERY_COMPLETED',
  'LESSON_CONTENT_INVALIDATED',
]);
export type CanonicalLessonEventType = z.infer<
  typeof CanonicalLessonEventTypeSchema
>;

export const CanonicalLessonRouteWireSchema = z.enum([
  'CONCISE',
  'STANDARD',
  'MISCONCEPTION',
  'PREREQUISITE_SUPPORT',
]);

export const CanonicalFailedExitFunctionSchema = z.enum([
  'NEAR_USE',
  'CHANGED_TASK',
]);
export type CanonicalFailedExitFunction = z.infer<
  typeof CanonicalFailedExitFunctionSchema
>;

export const CanonicalOmissionTypeSchema = z.enum([
  'INTENTIONAL_SKIP',
  'VALID_TIMEOUT',
  'ABANDONMENT',
  'TECHNICAL',
  'INACCESSIBLE',
  'TELEMETRY_MISSING',
]);
export type CanonicalOmissionType = z.infer<typeof CanonicalOmissionTypeSchema>;

export const CanonicalPlannerResolutionReasonCodeSchema = z.enum([
  'ACCEPTED',
  'CONCISE_PROVENANCE_STALE',
  'CONCISE_PROVENANCE_CONFLICTING',
  'MISCONCEPTION_PROVENANCE_STALE',
  'MISCONCEPTION_PROVENANCE_CONFLICTING',
  'PREREQUISITE_QUALIFICATION_INVALID',
  'PREREQUISITE_SUPPORT_RETURNED_TO_PLANNER',
  'RESOLUTION_MISSING',
  'RESOLUTION_CONTRACT_INVALID',
  'RESOLUTION_IDENTITY_MISMATCH',
  'LEARNER_IDENTITY_MISMATCH',
  'LESSON_IDENTITY_MISMATCH',
  'KC_IDENTITY_MISMATCH',
  'TASK_KIND_MISMATCH',
  'DIAGNOSTIC_PROBE_FORBIDDEN',
  'DEFINITION_PIN_MISMATCH',
  'REGISTRY_PIN_MISMATCH',
  'POLICY_PIN_MISMATCH',
  'EVIDENCE_CUTOFF_MISMATCH',
  'RESOLUTION_EXPIRED',
  'SUPERSESSION_LINEAGE_UNREPLAYABLE',
]);
export type CanonicalPlannerResolutionReasonCode = z.infer<
  typeof CanonicalPlannerResolutionReasonCodeSchema
>;

export const LearnerEventActorSchema = z
  .object({
    actorType: z.enum(['LEARNER', 'AUTHORITY', 'PLANNER', 'SYSTEM']),
    actorId: z.string().min(1).nullable(),
  })
  .strict();

export const LearnerEventDecisionContextSchema = z
  .object({
    evidenceCutoff: UtcTimestampSchema,
    registry: V3RegistryPinSchema,
    contentRelease: z.string().min(1),
    definitionVersion: LessonDefinitionVersionSchema,
    reviewedContentHash: Sha256DigestSchema,
    policyVersions: z.array(PolicyVersionSchema).min(1),
    modelVersions: z.array(PolicyVersionSchema),
  })
  .strict();
export type LearnerEventDecisionContext = z.infer<
  typeof LearnerEventDecisionContextSchema
>;

const RunContextShape = {
  runId: LessonRunIdSchema,
  lessonId: V3LessonIdSchema,
};

const KcContextShape = {
  ...RunContextShape,
  kcId: V3KcIdSchema,
};

const PreservationDecisionSchema = z.enum([
  'PRESERVE_VALID_SUCCESSES',
  'INVALIDATE_AND_RESTART_NEAR_USE',
]);

const LessonShellStartedPayloadSchema = z
  .object({
    ...RunContextShape,
    taskInstanceId: TaskInstanceIdSchema,
    resolutionId: EventIdSchema,
    orderedRequiredKcIds: z.array(V3KcIdSchema).min(1),
  })
  .strict();

const LessonShellResumedPayloadSchema = z
  .object({
    ...RunContextShape,
    checkpointId: z.string().min(1),
  })
  .strict();

const LessonShellPausedPayloadSchema = z
  .object({
    ...RunContextShape,
    checkpointId: z.string().min(1),
    reason: z.enum([
      'LEARNER',
      'INTERRUPTION',
      'REPAIR_EXHAUSTED',
      'POOL_EXHAUSTED',
      'BLOCKED_FOR_PREDECESSOR',
    ]),
  })
  .strict();

const KcMicrocycleStartedPayloadSchema = z
  .object({
    ...KcContextShape,
    ordinal: z.number().int().positive(),
    resolutionId: EventIdSchema,
    checkpointId: z.string().min(1),
  })
  .strict();

const EntryRouteSelectedPayloadSchema = z
  .object({
    ...KcContextShape,
    resolutionId: EventIdSchema,
    requestedRoute: CanonicalLessonRouteWireSchema,
    selectedRoute: CanonicalLessonRouteWireSchema,
    reasonCode: z.literal('ACCEPTED'),
  })
  .strict();

const EntryRouteDowngradedPayloadSchema = z
  .object({
    ...KcContextShape,
    resolutionId: EventIdSchema,
    requestedRoute: CanonicalLessonRouteWireSchema,
    selectedRoute: z.literal('STANDARD'),
    reasonCodes: z.array(CanonicalPlannerResolutionReasonCodeSchema).min(1),
    supportReturnedToPlanner: z.boolean(),
  })
  .strict();

const PlannerResolutionRejectedPayloadSchema = z
  .object({
    runId: LessonRunIdSchema,
    lessonId: V3LessonIdSchema,
    kcId: V3KcIdSchema.nullable(),
    resolutionId: EventIdSchema.nullable(),
    reasonCodes: z.array(CanonicalPlannerResolutionReasonCodeSchema).min(1),
  })
  .strict();

const PlannerResolutionSupersededPayloadSchema = z
  .object({
    ...KcContextShape,
    previousResolutionId: EventIdSchema,
    replacementResolutionId: EventIdSchema,
    supersessionGeneration: z.number().int().positive(),
  })
  .strict();

const InstructionNodePresentedPayloadSchema = z
  .object({
    ...KcContextShape,
    activityId: V3ActivityIdSchema,
    nodeId: z.string().min(1),
    familyId: z.string().min(1),
    assistanceLevel: z.enum(['A3', 'A2', 'A1', 'A0']),
  })
  .strict();

const ItemPresentedPayloadSchema = z
  .object({
    ...KcContextShape,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    attemptSlot: z.enum(['FIRST', 'RETRY', 'SUBSTITUTE']),
    assistanceLevel: z.enum(['A3', 'A2', 'A1', 'A0']),
  })
  .strict();

const AttemptObservedPayloadSchema = z
  .object({
    ...KcContextShape,
    attemptId: EventIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    attemptKind: z.literal('FIRST'),
    responseKind: z.enum([
      'CHOICE',
      'TEXT',
      'NUMERIC',
      'ORDERED_STEPS',
      'NOT_SURE',
      'OMISSION',
    ]),
    outcome: z.enum(['CORRECT', 'INCORRECT', 'NOT_SURE']).nullable(),
    omissionType: CanonicalOmissionTypeSchema.nullable(),
    assistanceLevel: z.enum(['A3', 'A2', 'A1', 'A0']),
    hinted: z.boolean(),
    revealed: z.boolean(),
    validForEvidence: z.boolean(),
    elapsedMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

const ConfidenceRecordedPayloadSchema = z
  .object({
    ...KcContextShape,
    attemptId: EventIdSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

const LearnerCauseRecordedPayloadSchema = z
  .object({
    ...KcContextShape,
    attemptId: EventIdSchema,
    cause: z.string().min(1),
  })
  .strict();

const HintRequestedPayloadSchema = z
  .object({
    ...KcContextShape,
    activityId: V3ActivityIdSchema,
    hintId: z.string().min(1),
    requestedLevel: z.enum(['A3', 'A2', 'A1', 'A0']),
  })
  .strict();

const RevealRequestedPayloadSchema = z
  .object({
    ...KcContextShape,
    activityId: V3ActivityIdSchema,
  })
  .strict();

const RetryObservedPayloadSchema = z
  .object({
    ...KcContextShape,
    retryAttemptId: EventIdSchema,
    retryOf: EventIdSchema,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    outcome: z.enum(['CORRECT', 'INCORRECT', 'NOT_SURE']),
    canCloseRepair: z.literal(false),
  })
  .strict();

const FeedbackDeliveredPayloadSchema = z
  .object({
    ...KcContextShape,
    activityIds: z.array(V3ActivityIdSchema).min(1),
    grouped: z.boolean(),
    answerSpecific: z.boolean(),
  })
  .strict();

const AssistanceChangedPayloadSchema = z
  .object({
    ...KcContextShape,
    activityId: V3ActivityIdSchema,
    fromLevel: z.enum(['A3', 'A2', 'A1', 'A0']),
    toLevel: z.enum(['A3', 'A2', 'A1', 'A0']),
    reason: z.enum(['PERFORMANCE_POLICY', 'HINT_CONSUMED', 'PLANNER_ROUTE', 'REPAIR_START']),
  })
  .strict();

const CheckpointCommittedPayloadSchema = z
  .object({
    ...RunContextShape,
    kcId: V3KcIdSchema.nullable(),
    checkpointId: z.string().min(1),
    definitionHash: Sha256DigestSchema,
    committedStreamSequence: z.number().int().nonnegative(),
  })
  .strict();

const ItemInvalidatedPayloadSchema = z
  .object({
    ...KcContextShape,
    activityId: V3ActivityIdSchema,
    familyId: z.string().min(1),
    attemptId: EventIdSchema.nullable(),
    reason: z.enum([
      'TECHNICAL',
      'INACCESSIBLE',
      'TELEMETRY_MISSING',
      'CONTENT_DEFECT',
      'ADMINISTRATION_ERROR',
    ]),
    exposureRetained: z.literal(true),
    learnerPenalty: z.literal('NONE'),
    substitutionRequired: z.boolean(),
  })
  .strict();

const KcRepairStartedPayloadSchema = z
  .object({
    ...KcContextShape,
    repairCycle: z.union([z.literal(1), z.literal(2)]),
    repairRouteId: z.string().min(1),
    failedExitFunction: CanonicalFailedExitFunctionSchema,
    preservationDecision: PreservationDecisionSchema,
    invalidationReason: z.string().min(1).nullable(),
  })
  .strict();

const KcPausedForPredecessorPayloadSchema = z
  .object({
    ...KcContextShape,
    predecessorKcId: V3KcIdSchema,
    edgeId: z.string().min(1),
    pointOfUseId: z.string().min(1),
    originCheckpointId: z.string().min(1),
    reentryCheckpointId: z.string().min(1),
  })
  .strict();

const KcResumedAtReentryPayloadSchema = z
  .object({
    ...KcContextShape,
    failedExitFunction: CanonicalFailedExitFunctionSchema,
    originCheckpointId: z.string().min(1),
    reentryCheckpointId: z.string().min(1),
    preservedExitFunctions: z.array(CanonicalFailedExitFunctionSchema),
    preservationDecision: PreservationDecisionSchema,
  })
  .strict();

const SequenceReentryRecordedPayloadSchema = z
  .object({
    ...KcContextShape,
    resolutionId: EventIdSchema,
    originSequenceRelationId: z.string().min(1),
    reentrySequenceRelationId: z.string().min(1),
    originCheckpointId: z.string().min(1),
    reentryCheckpointId: z.string().min(1),
  })
  .strict();

const KcPlannerHandoffRequestedPayloadSchema = z
  .object({
    ...KcContextShape,
    reason: z.enum([
      'REPAIR_EXHAUSTED',
      'ENTRY_POOL_EXHAUSTED',
      'COMPLETION_POOL_EXHAUSTED',
      'EXIT_POOL_EXHAUSTED',
      'BLOCKED_FOR_PREDECESSOR',
    ]),
    checkpointId: z.string().min(1),
  })
  .strict();

const KcInstructionalExitRecordedPayloadSchema = z
  .object({
    ...KcContextShape,
    checkpointId: z.string().min(1),
    nearUseAttemptId: EventIdSchema,
    changedTaskAttemptId: EventIdSchema,
  })
  .strict();

const LessonDeliveryCompletedPayloadSchema = z
  .object({
    ...RunContextShape,
    orderedRequiredKcIds: z.array(V3KcIdSchema).min(1),
    instructionalExitKcIds: z.array(V3KcIdSchema).min(1),
    derivedByAuthority: z.literal(true),
  })
  .strict();

const LessonContentInvalidatedPayloadSchema = z
  .object({
    ...RunContextShape,
    issueCodes: z.array(z.string().min(1)).min(1),
  })
  .strict();

const CanonicalEventBaseSchema = z
  .object({
    schemaVersion: z.literal(LEARNER_EVENT_WIRE_SCHEMA_VERSION),
    streamId: z.string().uuid(),
    streamSequence: z.number().int().nonnegative(),
    eventId: EventIdSchema,
    occurredAt: UtcTimestampSchema,
    acceptedAt: UtcTimestampSchema,
    actor: LearnerEventActorSchema,
    learnerId: LearnerIdSchema,
    idempotencyKey: IdempotencyKeySchema,
    causationId: EventIdSchema.nullable(),
    correlationId: EventIdSchema.nullable(),
    decisionContext: LearnerEventDecisionContextSchema,
  })
  .strict();

const withCanonicalEvent = <
  const TType extends CanonicalLessonEventType,
  TShape extends z.ZodRawShape,
>(
  eventType: TType,
  payload: z.ZodObject<TShape>,
) =>
  CanonicalEventBaseSchema.extend({
    eventType: z.literal(eventType),
    payload,
  }).strict();

export const CanonicalLearnerEventSchema = z.discriminatedUnion('eventType', [
  withCanonicalEvent('LESSON_SHELL_STARTED', LessonShellStartedPayloadSchema),
  withCanonicalEvent('LESSON_SHELL_RESUMED', LessonShellResumedPayloadSchema),
  withCanonicalEvent('LESSON_SHELL_PAUSED', LessonShellPausedPayloadSchema),
  withCanonicalEvent('KC_MICROCYCLE_STARTED', KcMicrocycleStartedPayloadSchema),
  withCanonicalEvent('ENTRY_ROUTE_SELECTED', EntryRouteSelectedPayloadSchema),
  withCanonicalEvent('ENTRY_ROUTE_DOWNGRADED', EntryRouteDowngradedPayloadSchema),
  withCanonicalEvent(
    'PLANNER_INSTRUCTION_RESOLUTION_REJECTED',
    PlannerResolutionRejectedPayloadSchema,
  ),
  withCanonicalEvent(
    'PLANNER_INSTRUCTION_RESOLUTION_SUPERSEDED',
    PlannerResolutionSupersededPayloadSchema,
  ),
  withCanonicalEvent('INSTRUCTION_NODE_PRESENTED', InstructionNodePresentedPayloadSchema),
  withCanonicalEvent('ITEM_PRESENTED', ItemPresentedPayloadSchema),
  withCanonicalEvent('ATTEMPT_OBSERVED', AttemptObservedPayloadSchema),
  withCanonicalEvent('CONFIDENCE_RECORDED', ConfidenceRecordedPayloadSchema),
  withCanonicalEvent('LEARNER_CAUSE_RECORDED', LearnerCauseRecordedPayloadSchema),
  withCanonicalEvent('HINT_REQUESTED', HintRequestedPayloadSchema),
  withCanonicalEvent('REVEAL_REQUESTED', RevealRequestedPayloadSchema),
  withCanonicalEvent('RETRY_OBSERVED', RetryObservedPayloadSchema),
  withCanonicalEvent('FEEDBACK_DELIVERED', FeedbackDeliveredPayloadSchema),
  withCanonicalEvent('ASSISTANCE_CHANGED', AssistanceChangedPayloadSchema),
  withCanonicalEvent('CHECKPOINT_COMMITTED', CheckpointCommittedPayloadSchema),
  withCanonicalEvent('ITEM_INVALIDATED', ItemInvalidatedPayloadSchema),
  withCanonicalEvent('KC_REPAIR_STARTED', KcRepairStartedPayloadSchema),
  withCanonicalEvent('KC_PAUSED_FOR_PREDECESSOR', KcPausedForPredecessorPayloadSchema),
  withCanonicalEvent('KC_RESUMED_AT_REENTRY', KcResumedAtReentryPayloadSchema),
  withCanonicalEvent('SEQUENCE_REENTRY_RECORDED', SequenceReentryRecordedPayloadSchema),
  withCanonicalEvent(
    'KC_PLANNER_HANDOFF_REQUESTED',
    KcPlannerHandoffRequestedPayloadSchema,
  ),
  withCanonicalEvent(
    'KC_INSTRUCTIONAL_EXIT_RECORDED',
    KcInstructionalExitRecordedPayloadSchema,
  ),
  withCanonicalEvent('LESSON_DELIVERY_COMPLETED', LessonDeliveryCompletedPayloadSchema),
  withCanonicalEvent('LESSON_CONTENT_INVALIDATED', LessonContentInvalidatedPayloadSchema),
]);
export type CanonicalLearnerEvent = z.infer<typeof CanonicalLearnerEventSchema>;

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const camelToSnake = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());

const mapKeysDeep = (
  value: unknown,
  convert: (key: string) => string,
): unknown => {
  if (Array.isArray(value)) return value.map((entry) => mapKeysDeep(entry, convert));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      convert(key),
      mapKeysDeep(entry, convert),
    ]),
  );
};

const containsCamelCaseKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsCamelCaseKey);
  if (!isRecord(value)) return false;
  return (
    Object.keys(value).some((key) => /[A-Z]/.test(key)) ||
    Object.values(value).some(containsCamelCaseKey)
  );
};

/**
 * Runtime parser for the canonical external representation. It accepts only
 * snake_case keys and produces the internal camelCase event.
 */
export const CanonicalLearnerEventWireSchema = z.preprocess((input) => {
  if (!isRecord(input)) return input;
  if (containsCamelCaseKey(input)) return { invalid_wire_key: true };
  return mapKeysDeep(input, snakeToCamel);
}, CanonicalLearnerEventSchema);

export type CanonicalLearnerEventWire = Record<string, JsonValue>;

export function serializeCanonicalLearnerEvent(
  input: CanonicalLearnerEvent,
): CanonicalLearnerEventWire {
  const event = CanonicalLearnerEventSchema.parse(input);
  const wire = mapKeysDeep(event, camelToSnake) as CanonicalLearnerEventWire;
  CanonicalLearnerEventWireSchema.parse(wire);
  return wire;
}

export function parseCanonicalLearnerEventWire(input: unknown): CanonicalLearnerEvent {
  return CanonicalLearnerEventWireSchema.parse(input);
}

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const canonicalJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareCodeUnits)
      .map((key) => [key, canonicalJsonValue(value[key]!)]) as [string, JsonValue][],
  );
};

export function canonicalLearnerEventJson(input: CanonicalLearnerEvent): string {
  return JSON.stringify(canonicalJsonValue(serializeCanonicalLearnerEvent(input)));
}

export function canonicalLearnerEventBytes(input: CanonicalLearnerEvent): Uint8Array {
  return new TextEncoder().encode(canonicalLearnerEventJson(input));
}

/** Hash/idempotency/replay material is always the exact canonical wire bytes. */
export function canonicalLearnerEventDigest(input: CanonicalLearnerEvent): string {
  return sha256(canonicalLearnerEventBytes(input));
}
