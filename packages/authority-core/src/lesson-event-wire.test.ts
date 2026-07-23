import { describe, expect, it } from 'vitest';
import { syntheticV3LessonDefinition, type ActivityDefinition } from '@mcat/content';
import {
  LessonRunPinsSchema,
  PlannerInstructionResolutionSchema,
  fixedClock,
  parseCanonicalLearnerEventWire,
  serializeCanonicalLearnerEvent,
  type LessonActionInput,
  type LessonRunState,
} from '@mcat/contracts';
import { dispatchLessonRunAction, initializeLessonRun, startLessonRun } from './lesson-run';
import { translateLessonRunEventsToCanonical } from './lesson-event-wire';

const clock = fixedClock('2026-07-23T20:00:00.000Z');

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  learnerId: '22222222-2222-4222-8222-222222222222',
  streamId: '33333333-3333-4333-8333-333333333333',
  taskInstanceId: '44444444-4444-4444-8444-444444444444',
  taskKind: 'lesson_initial_instruction',
  targetKcId: syntheticV3LessonDefinition.orderedRequiredKcIds[0],
  plannerResolutionId: '55555555-5555-4555-8555-555555555555',
  evidenceCutoff: '2026-07-23T19:58:00.000Z',
  lessonId: syntheticV3LessonDefinition.id,
  definitionVersion: syntheticV3LessonDefinition.definitionVersion,
  reviewedContentHash: syntheticV3LessonDefinition.contentDigest.sha256,
  contentRelease: syntheticV3LessonDefinition.contentRelease,
  registry: syntheticV3LessonDefinition.registryBinding.registry,
  policies: [
    { policyId: 'lesson-runtime', version: 'v4-reconciled-test' },
    { policyId: 'diagnostic', version: 'v1-test' },
  ],
});

const resolution = PlannerInstructionResolutionSchema.parse({
  schemaVersion: '1.0',
  resolutionId: pins.plannerResolutionId,
  learnerId: pins.learnerId,
  lessonId: pins.lessonId,
  kcId: pins.targetKcId,
  taskKind: pins.taskKind,
  definitionVersion: pins.definitionVersion,
  reviewedContentHash: pins.reviewedContentHash,
  requestedRoute: 'standard',
  diagnosticProvenance: {
    decisionId: '66666666-6666-4666-8666-666666666666',
    decisionClass: 'standard_required',
    recommendedAction: 'deliver_standard_instruction',
    sourceEventIds: ['77777777-7777-4777-8777-777777777777'],
    observedAt: '2026-07-23T19:57:00.000Z',
    freshness: 'fresh',
    conflict: false,
    diagnosticPolicy: { policyId: 'diagnostic', version: 'v1-test' },
    modelVersions: [{ policyId: 'diagnostic-model', version: 'v2-test' }],
  },
  prerequisiteCandidate: null,
  blockingCandidates: [],
  selectedBlockingCandidateId: null,
  directPointOfUseObservations: [],
  origin: {
    sequenceRelationId: 'TEST-ONLY-FIRST-DELIVERY',
    lessonId: pins.lessonId,
    kcId: pins.targetKcId,
    checkpointId: 'kc-001.enter',
    state: 'not_started',
  },
  reentry: null,
  evidenceCutoff: pins.evidenceCutoff,
  issuedAt: '2026-07-23T19:59:00.000Z',
  expiresAt: '2026-07-24T19:59:00.000Z',
  registry: pins.registry,
  policies: pins.policies,
  supersession: {
    rootResolutionId: pins.plannerResolutionId,
    supersedesResolutionId: null,
    generation: 0,
  },
});

const startedRun = () =>
  startLessonRun(
    initializeLessonRun(syntheticV3LessonDefinition, pins, resolution, 'test_fixture', clock),
    syntheticV3LessonDefinition,
    'test_fixture',
    clock,
  );

const activity = (state: LessonRunState): ActivityDefinition => {
  const found = syntheticV3LessonDefinition.knowledgeComponents
    .flatMap((kc) => kc.activities)
    .find((candidate) => candidate.id === state.currentActivityId);
  if (!found) throw new Error('Expected a current synthetic activity.');
  return found;
};

const act = (state: LessonRunState, action: LessonActionInput) =>
  dispatchLessonRunAction(state, syntheticV3LessonDefinition, action, 'test_fixture');

const completeCurrent = (state: LessonRunState): LessonRunState => {
  const current = activity(state);
  let next = act(state, { type: 'present', activityId: current.id }).state;
  if (current.response.kind !== 'none') {
    if (current.response.kind !== 'choice') {
      throw new Error('The synthetic wire fixture expects choice responses.');
    }
    next = act(next, {
      type: 'submit_response',
      activityId: current.id,
      response: {
        kind: 'choice',
        choiceId: current.response.correctChoiceIds[0]!,
      },
      elapsedMs: 1_000,
    }).state;
  }
  return act(next, { type: 'continue', activityId: current.id }).state;
};

describe('private lesson event to canonical learner-event translation', () => {
  it('emits canonical shell, KC, accepted planner route, and transactional checkpoints', () => {
    const started = startedRun();
    const canonical = translateLessonRunEventsToCanonical(
      started.events,
      started.state,
      syntheticV3LessonDefinition,
      '2026-07-23T20:00:00.050Z',
      40,
    );

    expect(canonical.map((event) => event.eventType)).toEqual([
      'LESSON_SHELL_STARTED',
      'KC_MICROCYCLE_STARTED',
      'CHECKPOINT_COMMITTED',
      'ENTRY_ROUTE_SELECTED',
      'CHECKPOINT_COMMITTED',
    ]);
    expect(canonical.map((event) => event.streamSequence)).toEqual([40, 41, 42, 43, 44]);
    canonical.forEach((event) => {
      expect(parseCanonicalLearnerEventWire(serializeCanonicalLearnerEvent(event))).toEqual(event);
      expect(event.decisionContext.modelVersions).toEqual([
        { policyId: 'diagnostic-model', version: 'v2-test' },
      ]);
    });
    expect(JSON.stringify(serializeCanonicalLearnerEvent(canonical[3]!))).not.toContain(
      'diagnosticProvenance',
    );
  });

  it('records a technical validity incident, retains exposure, and substitutes an untouched family', () => {
    const started = startedRun();
    const original = activity(started.state);
    const presented = act(started.state, {
      type: 'present',
      activityId: original.id,
    });
    const omitted = act(presented.state, {
      type: 'submit_response',
      activityId: original.id,
      response: { kind: 'omission', omissionType: 'technical' },
      elapsedMs: null,
    });
    const canonical = translateLessonRunEventsToCanonical(
      [...presented.events, ...omitted.events],
      omitted.state,
      syntheticV3LessonDefinition,
      '2026-07-23T20:00:01.000Z',
    );

    expect(canonical.map((event) => event.eventType)).toEqual([
      'ITEM_PRESENTED',
      'CHECKPOINT_COMMITTED',
      'ATTEMPT_OBSERVED',
      'CHECKPOINT_COMMITTED',
      'ITEM_INVALIDATED',
      'CHECKPOINT_COMMITTED',
    ]);
    const attempt = canonical.find((event) => event.eventType === 'ATTEMPT_OBSERVED');
    expect(attempt?.payload).toMatchObject({
      outcome: null,
      omissionType: 'TECHNICAL',
      validForEvidence: false,
    });
    expect(omitted.state.attempts[0]).toMatchObject({
      activityId: original.id,
      outcome: null,
      invalidated: true,
      validForEvidence: false,
    });
    expect(
      omitted.state.exposures.some((exposure) => exposure.familyId === original.familyId),
    ).toBe(true);
    expect(activity(omitted.state).familyId).not.toBe(original.familyId);
    expect(omitted.state.invalidatedItems[0]).toMatchObject({
      exposureRetained: true,
      learnerPenalty: 'none',
    });
  });

  it('does not lose a performance-driven assistance transition', () => {
    let state = startedRun().state;
    for (let guard = 0; guard < 20 && state.phase !== 'completion'; guard += 1) {
      state = completeCurrent(state);
    }
    expect(state.phase).toBe('completion');
    expect(state.assistanceLevel).toBe('A3');

    const current = activity(state);
    const presented = act(state, { type: 'present', activityId: current.id });
    if (current.response.kind !== 'choice') {
      throw new Error('Expected a choice completion activity.');
    }
    const submitted = act(presented.state, {
      type: 'submit_response',
      activityId: current.id,
      response: {
        kind: 'choice',
        choiceId: current.response.correctChoiceIds[0]!,
      },
      elapsedMs: 900,
    });
    const canonical = translateLessonRunEventsToCanonical(
      submitted.events,
      submitted.state,
      syntheticV3LessonDefinition,
      '2026-07-23T20:00:02.000Z',
    );

    expect(canonical.map((event) => event.eventType)).toEqual([
      'ATTEMPT_OBSERVED',
      'FEEDBACK_DELIVERED',
      'ASSISTANCE_CHANGED',
      'CHECKPOINT_COMMITTED',
    ]);
    expect(
      canonical.find((event) => event.eventType === 'ASSISTANCE_CHANGED')?.payload,
    ).toMatchObject({
      fromLevel: 'A3',
      toLevel: 'A2',
      reason: 'PERFORMANCE_POLICY',
    });
  });
});
