import { createHash } from 'node:crypto';
import { LessonDefinitionSchema, type LessonDefinition } from '@mcat/content';
import {
  CanonicalLearnerEventSchema,
  EventIdSchema,
  IdempotencyKeySchema,
  LessonRunEventSchema,
  LessonRunStateSchema,
  UtcTimestampSchema,
  type CanonicalLearnerEvent,
  type CanonicalLessonEventType,
  type LessonRunEvent,
  type LessonRunState,
} from '@mcat/contracts';

const deterministicUuid = (seed: string): string => {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16]!, 16) % 4]!;
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
};

const route = (
  value: 'concise' | 'standard' | 'prerequisite' | 'misconception',
) =>
  value === 'prerequisite'
    ? ('PREREQUISITE_SUPPORT' as const)
    : (value.toUpperCase() as 'CONCISE' | 'STANDARD' | 'MISCONCEPTION');

const upper = <T extends string>(value: T): Uppercase<T> =>
  value.toUpperCase() as Uppercase<T>;

const activity = (
  definition: LessonDefinition,
  activityId: string,
) =>
  definition.knowledgeComponents
    .flatMap((kc) => kc.activities)
    .find((candidate) => candidate.id === activityId);

/**
 * Exact public projection of accepted private transitions. Authority-only
 * scoring fields remain private; every externally meaningful transition and
 * its transactional checkpoint receives a canonical event.
 */
export function translateLessonRunEventsToCanonical(
  eventInputs: readonly unknown[],
  stateInput: LessonRunState,
  definitionInput: unknown,
  acceptedAtInput: string,
  startingStreamSequence = 0,
): CanonicalLearnerEvent[] {
  const events = eventInputs.map((event) => LessonRunEventSchema.parse(event));
  const state = LessonRunStateSchema.parse(stateInput);
  const definition = LessonDefinitionSchema.parse(definitionInput);
  const acceptedAt = UtcTimestampSchema.parse(acceptedAtInput);
  const result: CanonicalLearnerEvent[] = [];

  const commitFor = (event: LessonRunEvent) => {
    const commit = state.checkpointCommits.find(
      (candidate) => candidate.shell.committedByEventId === event.eventId,
    );
    if (!commit) {
      throw new Error(`Accepted lesson event ${event.eventId} has no transactional checkpoint.`);
    }
    return commit;
  };

  events.forEach((event) => {
    const commit = commitFor(event);
    let eventOffset = 0;
    const emit = (
      eventType: CanonicalLessonEventType,
      payload: Record<string, unknown>,
      actorType: 'LEARNER' | 'AUTHORITY' | 'PLANNER' | 'SYSTEM',
    ): void => {
      const id =
        eventOffset === 0
          ? event.eventId
          : EventIdSchema.parse(
              deterministicUuid(`${event.eventId}:canonical:${eventOffset}`),
            );
      const idempotencyKey =
        eventOffset === 0
          ? event.idempotencyKey
          : IdempotencyKeySchema.parse(
              deterministicUuid(
                `${event.idempotencyKey}:canonical:${eventOffset}`,
              ),
            );
      result.push(
        CanonicalLearnerEventSchema.parse({
          schemaVersion: '1.0',
          streamId: event.streamId,
          streamSequence: startingStreamSequence + result.length,
          eventId: id,
          eventType,
          occurredAt: event.occurredAt,
          acceptedAt,
          actor: {
            actorType,
            actorId:
              actorType === 'LEARNER'
                ? event.learnerId
                : actorType === 'PLANNER'
                  ? 'planner'
                  : 'lesson-authority',
          },
          learnerId: event.learnerId,
          idempotencyKey,
          causationId: eventOffset === 0 ? null : event.eventId,
          correlationId: null,
          decisionContext: {
            evidenceCutoff: event.evidenceCutoff,
            registry: event.registry,
            contentRelease: event.contentRelease,
            definitionVersion: event.definitionVersion,
            reviewedContentHash: event.reviewedContentHash,
            policyVersions: event.policies,
            modelVersions: [],
          },
          payload,
        }),
      );
      eventOffset += 1;
    };

    if (event.type === 'lesson_run_started') {
      const instruction = commit.shell.validatedPlannerInstruction!;
      emit(
        'LESSON_SHELL_STARTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          taskInstanceId: event.taskInstanceId,
          resolutionId: instruction.resolution.resolutionId,
          orderedRequiredKcIds: definition.orderedRequiredKcIds,
        },
        'SYSTEM',
      );
      emit(
        'KC_MICROCYCLE_STARTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: instruction.resolution.kcId,
          ordinal:
            definition.orderedRequiredKcIds.indexOf(instruction.resolution.kcId) + 1,
          resolutionId: instruction.resolution.resolutionId,
          checkpointId: commit.kc!.checkpointId,
        },
        'SYSTEM',
      );
    } else if (event.type === 'lesson_route_selected') {
      const instruction = event.payload.validatedInstruction;
      if (instruction.disposition === 'downgraded') {
        emit(
          'ENTRY_ROUTE_DOWNGRADED',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: instruction.resolution.kcId,
            resolutionId: instruction.resolution.resolutionId,
            requestedRoute: upper(instruction.resolution.requestedRoute),
            selectedRoute: 'STANDARD',
            reasonCodes: instruction.reasonCodes,
            supportReturnedToPlanner: instruction.supportReturnedToPlanner,
          },
          'PLANNER',
        );
      } else {
        emit(
          'ENTRY_ROUTE_SELECTED',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: instruction.resolution.kcId,
            resolutionId: instruction.resolution.resolutionId,
            requestedRoute: upper(instruction.resolution.requestedRoute),
            selectedRoute: route(instruction.effectiveRoute),
            reasonCode: 'ACCEPTED',
          },
          'PLANNER',
        );
      }
      if (instruction.blockedForPredecessor) {
        const selected = instruction.resolution.blockingCandidates.find(
          (candidate) =>
            candidate.candidateId ===
            instruction.resolution.selectedBlockingCandidateId,
        )!;
        emit(
          'KC_PAUSED_FOR_PREDECESSOR',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: instruction.resolution.kcId,
            predecessorKcId: selected.predecessorKcId,
            edgeId: selected.edgeId,
            pointOfUseId: selected.pointOfUseId,
            originCheckpointId: instruction.resolution.origin.checkpointId,
            reentryCheckpointId:
              instruction.resolution.reentry?.checkpointId ??
              instruction.resolution.origin.checkpointId,
          },
          'AUTHORITY',
        );
      }
    } else if (event.type === 'lesson_planner_resolution_rejected') {
      emit(
        'PLANNER_INSTRUCTION_RESOLUTION_REJECTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          resolutionId: event.payload.resolutionId,
          reasonCodes: event.payload.reasonCodes,
        },
        'AUTHORITY',
      );
    } else if (event.type === 'lesson_activity_presented') {
      const definitionActivity = activity(definition, event.payload.activityId)!;
      if (definitionActivity.response.kind === 'none') {
        emit(
          'INSTRUCTION_NODE_PRESENTED',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: event.payload.kcId,
            activityId: event.payload.activityId,
            nodeId: event.payload.activityId,
            familyId: event.payload.familyId,
            assistanceLevel: commit.kc!.actualAssistanceLevel,
          },
          'AUTHORITY',
        );
      } else {
        emit(
          'ITEM_PRESENTED',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: event.payload.kcId,
            activityId: event.payload.activityId,
            familyId: event.payload.familyId,
            attemptSlot: upper(event.payload.attemptSlot),
            assistanceLevel: commit.kc!.actualAssistanceLevel,
          },
          'AUTHORITY',
        );
      }
    } else if (event.type === 'lesson_response_evaluated') {
      emit(
        'ATTEMPT_OBSERVED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          attemptId: event.eventId,
          activityId: event.payload.activityId,
          familyId: event.payload.familyId,
          attemptKind: 'FIRST',
          responseKind: upper(event.payload.responseKind),
          outcome:
            event.payload.outcome === null ? null : upper(event.payload.outcome),
          omissionType:
            event.payload.omissionType === null
              ? null
              : upper(event.payload.omissionType),
          assistanceLevel: event.payload.assistanceLevel,
          hinted: event.payload.assisted,
          revealed: event.payload.revealed,
          validForEvidence: event.payload.validForEvidence,
          elapsedMs: event.payload.elapsedMs,
        },
        'LEARNER',
      );
      const definitionActivity = activity(definition, event.payload.activityId)!;
      if (
        !['enter_routing', 'exit_near', 'exit_changed'].includes(
          definitionActivity.phase,
        ) &&
        event.payload.validForEvidence
      ) {
        emit(
          'FEEDBACK_DELIVERED',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: event.payload.kcId,
            activityIds: [event.payload.activityId],
            grouped: false,
            answerSpecific: true,
          },
          'AUTHORITY',
        );
      }
    } else if (event.type === 'lesson_confidence_recorded') {
      emit(
        'CONFIDENCE_RECORDED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          attemptId: event.payload.attemptId,
          confidence: event.payload.confidence,
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_learner_cause_recorded') {
      emit(
        'LEARNER_CAUSE_RECORDED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          attemptId: event.payload.attemptId,
          cause: event.payload.cause,
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_hint_requested') {
      emit(
        'HINT_REQUESTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          activityId: event.payload.activityId,
          hintId: event.payload.hintId,
          requestedLevel: event.payload.level,
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_reveal_requested') {
      emit(
        'REVEAL_REQUESTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          activityId: event.payload.activityId,
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_assistance_revealed') {
      emit(
        'ASSISTANCE_CHANGED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          activityId: event.payload.activityId,
          fromLevel: event.payload.fromLevel,
          toLevel: event.payload.level,
          reason: 'HINT_CONSUMED',
        },
        'AUTHORITY',
      );
    } else if (event.type === 'lesson_activity_completed') {
      if (commit.shell.openFeedback.visibleActivityIds.length > 0) {
        emit(
          'FEEDBACK_DELIVERED',
          {
            runId: event.runId,
            lessonId: event.lessonId,
            kcId: event.payload.kcId,
            activityIds: commit.shell.openFeedback.visibleActivityIds,
            grouped: true,
            answerSpecific: true,
          },
          'AUTHORITY',
        );
      }
    } else if (event.type === 'lesson_exit_feedback_released') {
      emit(
        'FEEDBACK_DELIVERED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          activityIds: commit.shell.openFeedback.visibleActivityIds,
          grouped: true,
          answerSpecific: true,
        },
        'AUTHORITY',
      );
    } else if (event.type === 'lesson_repair_started') {
      emit(
        'KC_REPAIR_STARTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          repairCycle: commit.kc!.repairCycle,
          repairRouteId: event.payload.repairRouteId,
          failedExitFunction: upper(event.payload.failedExitFunction),
          preservationDecision: upper(event.payload.preservationDecision),
          invalidationReason: event.payload.invalidationReason,
        },
        'AUTHORITY',
      );
    } else if (event.type === 'lesson_retry_observed') {
      emit(
        'RETRY_OBSERVED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          retryAttemptId: event.eventId,
          retryOf: event.payload.retryOf,
          activityId: event.payload.activityId,
          familyId: event.payload.familyId,
          outcome: upper(event.payload.outcome),
          canCloseRepair: false,
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_item_invalidated') {
      emit(
        'ITEM_INVALIDATED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          activityId: event.payload.activityId,
          familyId: event.payload.familyId,
          attemptId: event.payload.attemptId,
          reason: upper(event.payload.reason),
          exposureRetained: true,
          learnerPenalty: 'NONE',
          substitutionRequired: event.payload.substitutionRequired,
        },
        'AUTHORITY',
      );
    } else if (event.type === 'kc_resumed_at_reentry') {
      emit(
        'KC_RESUMED_AT_REENTRY',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          failedExitFunction: upper(event.payload.failedExitFunction),
          originCheckpointId: event.payload.originCheckpointId,
          reentryCheckpointId: event.payload.reentryCheckpointId,
          preservedExitFunctions:
            commit.kc?.repairReentry.preservedSuccesses.map((success) =>
              upper(success.exitFunction),
            ) ?? [],
          preservationDecision: upper(event.payload.preservationDecision),
        },
        'AUTHORITY',
      );
    } else if (event.type === 'kc_instructional_exit') {
      emit(
        'KC_INSTRUCTIONAL_EXIT_RECORDED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.payload.kcId,
          checkpointId: commit.kc!.checkpointId,
          nearUseAttemptId: event.payload.nearUseAttemptId,
          changedTaskAttemptId: event.payload.changedTaskAttemptId,
        },
        'AUTHORITY',
      );
    } else if (event.type === 'lesson_run_paused') {
      emit(
        'LESSON_SHELL_PAUSED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          checkpointId: commit.shell.checkpointId,
          reason: upper(event.payload.reason),
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_run_resumed') {
      const prior = state.checkpointCommits.find(
        (candidate) =>
          candidate.shell.eventStreamSequence === event.sequence - 1,
      );
      emit(
        'LESSON_SHELL_RESUMED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          checkpointId: prior?.shell.checkpointId ?? commit.shell.checkpointId,
        },
        'LEARNER',
      );
    } else if (event.type === 'lesson_planner_reentry_handoff') {
      const resolution = event.payload.nextResolution;
      emit(
        'PLANNER_INSTRUCTION_RESOLUTION_SUPERSEDED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: resolution.kcId,
          previousResolutionId: resolution.supersession.supersedesResolutionId!,
          replacementResolutionId: resolution.resolutionId,
          supersessionGeneration: resolution.supersession.generation,
        },
        'PLANNER',
      );
      emit(
        'KC_PLANNER_HANDOFF_REQUESTED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          kcId: event.targetKcId,
          reason:
            state.pauseReason === 'repair_exhausted'
              ? 'REPAIR_EXHAUSTED'
              : state.pauseReason === 'entry_pool_exhausted'
                ? 'ENTRY_POOL_EXHAUSTED'
                : state.pauseReason === 'exit_pool_exhausted'
                  ? 'EXIT_POOL_EXHAUSTED'
                  : state.pauseReason === 'blocked_for_predecessor'
                    ? 'BLOCKED_FOR_PREDECESSOR'
                    : 'COMPLETION_POOL_EXHAUSTED',
          checkpointId: commit.kc?.checkpointId ?? commit.shell.checkpointId,
        },
        'PLANNER',
      );
      emit(
        'SEQUENCE_REENTRY_RECORDED',
        {
          runId: event.payload.nextRunPins.runId,
          lessonId: event.lessonId,
          kcId: resolution.kcId,
          resolutionId: resolution.resolutionId,
          originSequenceRelationId:
            resolution.origin.sequenceRelationId,
          reentrySequenceRelationId:
            resolution.reentry?.sequenceRelationId ??
            resolution.origin.sequenceRelationId,
          originCheckpointId: resolution.origin.checkpointId,
          reentryCheckpointId:
            resolution.reentry?.checkpointId ??
            resolution.origin.checkpointId,
        },
        'PLANNER',
      );
    } else if (event.type === 'lesson_delivery_completed') {
      emit(
        'LESSON_DELIVERY_COMPLETED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          orderedRequiredKcIds: event.payload.orderedRequiredKcIds,
          instructionalExitKcIds: event.payload.instructionalExitKcIds,
          derivedByAuthority: true,
        },
        'AUTHORITY',
      );
    } else if (event.type === 'lesson_invalid_content_detected') {
      emit(
        'LESSON_CONTENT_INVALIDATED',
        {
          runId: event.runId,
          lessonId: event.lessonId,
          issueCodes: event.payload.issueCodes,
        },
        'AUTHORITY',
      );
    }

    const checkpoint = commit.kc ?? commit.shell;
    emit(
      'CHECKPOINT_COMMITTED',
      {
        runId: event.runId,
        lessonId: event.lessonId,
        kcId: checkpoint.kcId,
        checkpointId: checkpoint.checkpointId,
        definitionHash: checkpoint.definitionHash,
        committedStreamSequence: checkpoint.eventStreamSequence,
      },
      'AUTHORITY',
    );
  });
  return result;
}
