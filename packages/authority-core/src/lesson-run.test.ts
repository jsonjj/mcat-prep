import { describe, expect, it } from 'vitest';
import {
  ActivityDefinitionSchema,
  syntheticV3LessonDefinition,
  type ActivityDefinition,
} from '@mcat/content';
import {
  LessonActionCommandSchema,
  LessonRunPinsSchema,
  PlannerInstructionResolutionSchema,
  fixedClock,
  type LessonActionInput,
  type LessonRunPins,
  type LessonRunState,
  type PlannerInstructionResolution,
} from '@mcat/contracts';
import {
  buildLessonStepView,
  dispatchLessonRunAction,
  dispatchLessonRunCommand,
  evaluateLessonResponse,
  initializeLessonReentryRun,
  initializeLessonRun,
  reduceLessonRun,
  replayLessonRun,
  startLessonRun,
} from './lesson-run';
import { acceptPlannerInstructionResolution } from './planner-instruction';

const clock = fixedClock('2026-07-23T16:41:00.000Z');

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  learnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  streamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  taskInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  taskKind: 'lesson_initial_instruction',
  targetKcId: syntheticV3LessonDefinition.orderedRequiredKcIds[0],
  plannerResolutionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  evidenceCutoff: '2026-07-23T16:40:00.000Z',
  lessonId: syntheticV3LessonDefinition.id,
  definitionVersion: syntheticV3LessonDefinition.definitionVersion,
  reviewedContentHash: syntheticV3LessonDefinition.contentDigest.sha256,
  contentRelease: syntheticV3LessonDefinition.contentRelease,
  registry: syntheticV3LessonDefinition.registryBinding.registry,
  policies: [{ policyId: 'lesson-runtime', version: 'v4-reconciled-test' }],
});

function plannerResolution(
  targetPins: LessonRunPins,
  requestedRoute:
    | 'concise'
    | 'standard'
    | 'misconception'
    | 'prerequisite_support' = 'standard',
  prior: PlannerInstructionResolution | null = null,
  over: Record<string, unknown> = {},
): PlannerInstructionResolution {
  const decision =
    requestedRoute === 'concise'
      ? {
          decisionClass: 'concise_eligible',
          recommendedAction: 'deliver_concise_instruction',
        }
      : requestedRoute === 'misconception'
        ? {
            decisionClass: 'misconception_hypothesis',
            recommendedAction: 'deliver_misconception_repair',
          }
        : requestedRoute === 'prerequisite_support'
          ? {
              decisionClass: 'prerequisite_gap',
              recommendedAction: 'deliver_bounded_prerequisite_bridge',
            }
          : {
              decisionClass: 'standard_required',
              recommendedAction: 'deliver_standard_instruction',
            };
  const candidate = {
    candidateId: 'synthetic-prerequisite-candidate',
    predecessorKcId: 'V3-KC-SYNTH-PREDECESSOR',
    edgeId: 'SYNTHETIC-HARD-EDGE',
    edgeKind: 'hard_prerequisite',
    pointOfUseId: 'synthetic-point-of-use',
    gapId: 'synthetic-gap',
    gapClass: 'narrow_bridge',
    qualification: {
      policy: { policyId: 'prerequisite-evidence', version: 'v1-test' },
      status: 'qualified',
      requiredDistinctFamilies: 2,
      observedDistinctFamilies: 2,
      freshnessWindowSeconds: 86_400,
      allEvidenceValid: true,
      sameFamilyExcluded: true,
      indirectEvidenceExcluded: true,
    },
  };
  const rootResolutionId =
    prior?.supersession.rootResolutionId ?? targetPins.plannerResolutionId;
  return PlannerInstructionResolutionSchema.parse({
    schemaVersion: '1.0',
    resolutionId: targetPins.plannerResolutionId,
    learnerId: targetPins.learnerId,
    lessonId: targetPins.lessonId,
    kcId: targetPins.targetKcId,
    taskKind: targetPins.taskKind,
    definitionVersion: targetPins.definitionVersion,
    reviewedContentHash: targetPins.reviewedContentHash,
    requestedRoute,
    diagnosticProvenance: {
      decisionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      ...decision,
      sourceEventIds: [
        'f0000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000002',
      ],
      observedAt: targetPins.evidenceCutoff,
      freshness: 'fresh',
      conflict: false,
      diagnosticPolicy: { policyId: 'diagnostic', version: 'v1-test' },
      modelVersions: [],
    },
    prerequisiteCandidate:
      requestedRoute === 'prerequisite_support' ? candidate : null,
    blockingCandidates: [],
    selectedBlockingCandidateId: null,
    directPointOfUseObservations:
      requestedRoute === 'prerequisite_support'
        ? [
            {
              observationId: 'f1000000-0000-4000-8000-000000000001',
              predecessorKcId: candidate.predecessorKcId,
              edgeId: candidate.edgeId,
              pointOfUseId: candidate.pointOfUseId,
              familyId: 'synthetic-prerequisite-family-1',
              outcome: 'failed',
              observedAt: targetPins.evidenceCutoff,
              valid: true,
              assistanceLevel: 'A0',
              contentBearingHintUsed: false,
            },
            {
              observationId: 'f1000000-0000-4000-8000-000000000002',
              predecessorKcId: candidate.predecessorKcId,
              edgeId: candidate.edgeId,
              pointOfUseId: candidate.pointOfUseId,
              familyId: 'synthetic-prerequisite-family-2',
              outcome: 'uncertain',
              observedAt: targetPins.evidenceCutoff,
              valid: true,
              assistanceLevel: 'A0',
              contentBearingHintUsed: false,
            },
          ]
        : [],
    origin: {
      sequenceRelationId: 'TEST-ONLY-FIRST-DELIVERY',
      lessonId: targetPins.lessonId,
      kcId: targetPins.targetKcId,
      checkpointId: `kc-${targetPins.targetKcId.endsWith('001') ? '001' : '002'}.enter`,
      state: 'not_started',
    },
    reentry:
      prior === null
        ? null
        : {
            sequenceRelationId: 'TEST-ONLY-SEQUENCE-REENTRY',
            lessonId: targetPins.lessonId,
            kcId: targetPins.targetKcId,
            checkpointId: `kc-${targetPins.targetKcId.endsWith('001') ? '001' : '002'}.enter`,
            state: 'in_progress',
            failedExitFunction: null,
            preservedExitFunctions: [],
          },
    evidenceCutoff: targetPins.evidenceCutoff,
    issuedAt: '2026-07-23T16:40:00.000Z',
    expiresAt: '2026-07-24T16:40:00.000Z',
    registry: targetPins.registry,
    policies: targetPins.policies,
    supersession: {
      rootResolutionId,
      supersedesResolutionId: prior?.resolutionId ?? null,
      generation: (prior?.supersession.generation ?? -1) + 1,
    },
    ...over,
  });
}

const initialResolution = plannerResolution(pins);

function nextRunArtifacts(
  parent: LessonRunState,
  runId: string,
  targetKcId = parent.currentKcId ?? parent.pins.targetKcId,
) {
  const nextPins = LessonRunPinsSchema.parse({
    ...parent.pins,
    runId,
    taskInstanceId: runId,
    taskKind: 'sequence_reentry',
    targetKcId,
    plannerResolutionId: runId,
  });
  const nextResolution = plannerResolution(
    nextPins,
    'standard',
    parent.plannerResolutionHistory.at(-1) ?? null,
  );
  return {
    nextPins,
    nextResolution,
    nextLineage: nextLineageFor(parent, nextPins),
  };
}

function event(
  state: LessonRunState,
  type: string,
  payload: Record<string, unknown>,
  over: Record<string, unknown> = {},
) {
  const sequence = state.lastSequence + 1;
  const suffix = String(sequence + 1).padStart(12, '0');
  return {
    schemaVersion: '2.0',
    eventId: `10000000-0000-4000-8000-${suffix}`,
    idempotencyKey: `20000000-0000-4000-8000-${suffix}`,
    ...state.pins,
    sequence,
    occurredAt: '2026-07-23T16:41:00.000Z',
    type,
    payload,
    ...over,
  };
}

const apply = (state: LessonRunState, type: string, payload: Record<string, unknown> = {}) =>
  reduceLessonRun(state, event(state, type, payload), syntheticV3LessonDefinition, 'test_fixture');

function nextLineageFor(parent: LessonRunState, nextPins: LessonRunPins) {
  const targetKcId = nextPins.targetKcId;
  const inheritedFromRunIds = [
    ...new Set([...parent.lineage.inheritedFromRunIds, parent.pins.runId]),
  ];
  const reentryHistory = [...parent.lineage.reentryHistory, { runId: nextPins.runId, targetKcId }];
  const kcReentryCounts = structuredClone(parent.lineage.kcReentryCounts);
  const targetCount = kcReentryCounts.find((entry) => entry.kcId === targetKcId);
  if (targetCount) targetCount.count += 1;
  else kcReentryCounts.push({ kcId: targetKcId, count: 1 });
  const reviewedContentPins = [...parent.lineage.reviewedContentPins];
  if (
    !reviewedContentPins.some(
      (pin) =>
        pin.lessonId === nextPins.lessonId &&
        pin.definitionVersion === nextPins.definitionVersion &&
        pin.reviewedContentHash === nextPins.reviewedContentHash,
    )
  ) {
    reviewedContentPins.push({
      lessonId: nextPins.lessonId,
      definitionVersion: nextPins.definitionVersion,
      reviewedContentHash: nextPins.reviewedContentHash,
    });
  }
  return {
    rootRunId: parent.lineage.rootRunId,
    parentRunId: parent.pins.runId,
    generation: parent.lineage.generation + 1,
    reentryHistory,
    kcReentryCounts,
    inheritedFromRunIds,
    inheritedExposure: {
      sourceRunIds: inheritedFromRunIds,
      families: structuredClone(parent.exposures),
    },
    reviewedContentPins,
  };
}

function freshStarted(): LessonRunState {
  return startLessonRun(
    initializeLessonRun(
      syntheticV3LessonDefinition,
      pins,
      initialResolution,
      'test_fixture',
      clock,
    ),
    syntheticV3LessonDefinition,
    'test_fixture',
    clock,
  ).state;
}

function activity(state: LessonRunState): ActivityDefinition {
  for (const kc of syntheticV3LessonDefinition.knowledgeComponents) {
    const found = kc.activities.find((candidate) => candidate.id === state.currentActivityId);
    if (found) return found;
  }
  throw new Error('Expected a current synthetic activity.');
}

const act = (state: LessonRunState, action: LessonActionInput): LessonRunState =>
  dispatchLessonRunAction(state, syntheticV3LessonDefinition, action, 'test_fixture').state;

function present(state: LessonRunState): LessonRunState {
  return act(state, { type: 'present', activityId: activity(state).id });
}

function submit(
  state: LessonRunState,
  choiceId: 'ready' | 'prerequisite' | 'swap' | 'aligned' | 'offset' = 'aligned',
): LessonRunState {
  const current = activity(state);
  const effectiveChoice =
    current.phase === 'enter_routing' && choiceId === 'offset'
      ? current.id.endsWith('ENTRY-1') || current.id.endsWith('ENTRY-3')
        ? 'ready'
        : 'prerequisite'
      : choiceId;
  return act(state, {
    type: 'submit_response',
    activityId: current.id,
    response: { kind: 'choice', choiceId: effectiveChoice },
    elapsedMs: null,
  });
}

function completeCurrent(
  state: LessonRunState,
  choiceId: 'ready' | 'prerequisite' | 'swap' | 'aligned' | 'offset' = 'aligned',
): LessonRunState {
  const current = activity(state);
  let next = present(state);
  if (current.response.kind !== 'none') next = submit(next, choiceId);
  return act(next, { type: 'continue', activityId: current.id });
}

function reachCompletion(
  entryChoice: 'ready' | 'prerequisite' | 'swap' | 'offset' = 'offset',
): LessonRunState {
  let state = freshStarted();
  state = completeCurrent(state, entryChoice);
  state = completeCurrent(state, entryChoice);
  for (let guard = 0; guard < 10 && state.phase !== 'completion'; guard += 1) {
    state = completeCurrent(state);
  }
  expect(state.phase).toBe('completion');
  return state;
}

function establishA0(state: LessonRunState): LessonRunState {
  let next = state;
  for (let guard = 0; guard < 8 && next.phase === 'completion'; guard += 1) {
    next = completeCurrent(next, 'aligned');
  }
  return next;
}

function reachFirstExit(): LessonRunState {
  let state = establishA0(reachCompletion());
  while (state.phase !== 'exit_near') state = completeCurrent(state);
  return state;
}

function submitExitPair(
  state: LessonRunState,
  near: 'aligned' | 'offset',
  changed: 'aligned' | 'offset',
): LessonRunState {
  let next = submit(present(state), near);
  expect(next.phase).toBe('exit_changed');
  next = submit(present(next), changed);
  return next;
}

function beginRepair(state: LessonRunState): LessonRunState {
  expect(state.status).toBe('awaiting_repair');
  return act(state, { type: 'continue', activityId: null });
}

describe('V3 lesson initialization, routing, and sealed entry evidence', () => {
  it('requires exact content, review, and registry pins and fails fixtures closed in production', () => {
    const fixture = initializeLessonRun(
      syntheticV3LessonDefinition,
      pins,
      initialResolution,
      'test_fixture',
      clock,
    );
    const production = initializeLessonRun(
      syntheticV3LessonDefinition,
      pins,
      initialResolution,
      'production',
      clock,
    );
    const wrongHash = initializeLessonRun(
      syntheticV3LessonDefinition,
      { ...pins, reviewedContentHash: '0'.repeat(64) },
      initialResolution,
      'test_fixture',
      clock,
    );

    expect(fixture.status).toBe('ready');
    expect(production.status).toBe('invalid_content');
    expect(production.invalidIssues).toContain('unpublished_or_test_content_forbidden');
    expect(wrongHash.invalidIssues).toContain('reviewed_content_hash_pin_mismatch');
  });

  it('keeps elicitation rationale sealed without allowing probes to change the planner route', () => {
    let state = freshStarted();
    expect(state.route).toBe('standard');
    state = submit(present(state), 'ready');
    let view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(state.authorityPrivateFeedback.sealedEntry).toHaveLength(1);
    expect(state.groupedFeedback).toBeNull();
    expect(JSON.stringify(view)).not.toContain('fits the invented rule');

    state = act(state, { type: 'continue', activityId: activity(state).id });
    state = submit(present(state), 'ready');
    view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(state.authorityPrivateFeedback.sealedEntry).toHaveLength(2);
    expect(JSON.stringify(view)).not.toContain('fits the invented rule');

    state = act(state, { type: 'continue', activityId: activity(state).id });
    view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(state.route).toBe('standard');
    expect(state.authorityPrivateFeedback.sealedEntry).toEqual([]);
    expect(state.groupedFeedback?.entries).toHaveLength(2);
    expect(JSON.stringify(view)).toContain('Correct under the invented fixture rule');
  });

  it.each([
    ['ready', 'concise'],
    ['prerequisite', 'standard'],
    ['swap', 'misconception'],
    ['offset', 'prerequisite_support'],
  ] as const)('keeps the planner route for %s probe responses (%s)', (choice, routeName) => {
    const requestedRoute = routeName;
    const resolution = plannerResolution(pins, requestedRoute);
    let state = startLessonRun(
      initializeLessonRun(
        syntheticV3LessonDefinition,
        pins,
        resolution,
        'test_fixture',
        clock,
      ),
      syntheticV3LessonDefinition,
      'test_fixture',
      clock,
    ).state;
    state = completeCurrent(state, choice);
    state = completeCurrent(state, choice === 'offset' ? 'prerequisite' : choice);

    expect(state.route).toBe(
      requestedRoute === 'prerequisite_support' ? 'prerequisite' : requestedRoute,
    );
  });

  it('records repeated not-sure elicitation without changing the accepted route', () => {
    let state = freshStarted();
    for (let probe = 0; probe < 2; probe += 1) {
      const current = activity(state);
      state = act(present(state), {
        type: 'submit_response',
        activityId: current.id,
        response: { kind: 'not_sure' },
        elapsedMs: null,
      });
      state = act(state, { type: 'continue', activityId: current.id });
    }

    expect(state.route).toBe('standard');
    expect(
      state.signals.find((signal) => signal.signalId.endsWith('-prerequisite'))?.familyIds,
    ).toHaveLength(2);
  });

  it('fails closed for missing/wrong/diagnostic resolutions and downgrades stale provenance', () => {
    const missing = initializeLessonRun(
      syntheticV3LessonDefinition,
      pins,
      null,
      'test_fixture',
      clock,
    );
    expect(missing.status).toBe('awaiting_planner_resolution');
    expect(buildLessonStepView(syntheticV3LessonDefinition, missing)).toMatchObject({
      status: 'planner_resolution_required',
      activity: null,
      availableActions: [],
    });
    const wrongLearner = {
      ...initialResolution,
      learnerId: '99999999-9999-4999-8999-999999999999',
    };
    expect(
      acceptPlannerInstructionResolution(wrongLearner, {
        pins,
        now: clock.now(),
        priorResolution: null,
      }),
    ).toMatchObject({
      kind: 'rejected',
      reasonCodes: ['LEARNER_IDENTITY_MISMATCH'],
    });

    const diagnostic = { ...initialResolution, taskKind: 'diagnostic_probe' };
    expect(
      acceptPlannerInstructionResolution(diagnostic, {
        pins,
        now: clock.now(),
        priorResolution: null,
      }),
    ).toMatchObject({
      kind: 'rejected',
      reasonCodes: expect.arrayContaining(['DIAGNOSTIC_PROBE_FORBIDDEN']),
    });

    const concise = plannerResolution(pins, 'concise');
    const staleConcise = {
      ...concise,
      diagnosticProvenance: {
        ...concise.diagnosticProvenance,
        freshness: 'stale',
      },
    };
    expect(
      acceptPlannerInstructionResolution(staleConcise, {
        pins,
        now: clock.now(),
        priorResolution: null,
      }),
    ).toMatchObject({
      kind: 'accepted',
      validated: {
        disposition: 'downgraded',
        effectiveRoute: 'standard',
        reasonCodes: ['CONCISE_PROVENANCE_STALE'],
      },
    });

    const prerequisite = plannerResolution(pins, 'prerequisite_support');
    const unqualified = {
      ...prerequisite,
      prerequisiteCandidate: {
        ...prerequisite.prerequisiteCandidate!,
        qualification: {
          ...prerequisite.prerequisiteCandidate!.qualification,
          status: 'not_qualified',
        },
      },
    };
    expect(
      acceptPlannerInstructionResolution(unqualified, {
        pins,
        now: clock.now(),
        priorResolution: null,
      }),
    ).toMatchObject({
      kind: 'accepted',
      validated: {
        effectiveRoute: 'standard',
        supportReturnedToPlanner: true,
      },
    });
  });
});

describe('performance-contingent completion and exact paired feedback', () => {
  it('holds support on wrong work and hands off after the finite A3 pool is exhausted', () => {
    let state = reachCompletion();
    const used: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      used.push(activity(state).id);
      state = completeCurrent(state, 'offset');
      expect(state.assistanceLevel).toBe('A3');
    }

    expect(new Set(used).size).toBe(2);
    expect(state.status).toBe('paused');
    expect(state.pauseReason).toBe('completion_exhausted');
    expect(state.plannerReentryRequired).toBe(true);
    expect(state.phase).toBe('handoff');
    expect(state.sequenceActivityIds.some((id) => id.includes('CONTRAST'))).toBe(false);
  });

  it('records content-bearing assistance as reveal exposure and does not fade support', () => {
    let state = reachCompletion();
    const assistedActivity = activity(state);
    state = present(state);
    state = act(state, {
      type: 'request_hint',
      activityId: assistedActivity.id,
    });

    expect(
      state.exposures.find((exposure) => exposure.familyId === assistedActivity.familyId)?.revealed,
    ).toBe(true);

    state = submit(state, 'aligned');
    expect(state.lastResponse).toMatchObject({ assisted: true, revealed: true });
    expect(state.assistanceLevel).toBe('A3');
    state = act(state, { type: 'continue', activityId: assistedActivity.id });

    expect(activity(state).id).not.toBe(assistedActivity.id);
    expect(state.assistanceLevel).toBe('A3');
  });

  it('rejects assistance after an A0 response commits and preserves valid exit scheduling', () => {
    let state = reachCompletion();
    while (state.phase === 'completion' && state.assistanceLevel !== 'A0') {
      state = completeCurrent(state, 'aligned');
    }
    const a0Activity = activity(state);
    state = submit(present(state), 'aligned');

    expect(state.assistanceLevel).toBe('A0');
    expect(state.completionReadyForExit).toBe(true);
    const view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(view.status).toBe('active');
    if (view.status !== 'active') throw new Error('Expected an active completion view.');
    expect(view.availableActions).not.toContain('request_hint');
    expect(view.activity.assistance.canRequestMore).toBe(false);
    expect(() => act(state, { type: 'request_hint', activityId: a0Activity.id })).toThrow(
      'Support cannot be added after this response is committed',
    );

    const directAttempt = apply(state, 'lesson_assistance_revealed', {
      kcId: a0Activity.kcId,
      activityId: a0Activity.id,
      fromLevel: 'A0',
      level: 'A1',
    });
    expect(directAttempt.status).toBe('blocked');
    expect(directAttempt.transitionErrors).toContain('assistance_reveal_not_allowed');

    state = act(state, { type: 'continue', activityId: a0Activity.id });
    expect(state.phase).toBe('contrast_bound');
    expect(state.assistanceLevel).toBe('A0');
  });

  it('requires unsupported A0 success before contrast or exit becomes reachable', () => {
    let state = reachCompletion();
    const levels: string[] = [];
    while (state.phase === 'completion') {
      levels.push(state.assistanceLevel);
      state = completeCurrent(state, 'aligned');
    }

    expect(levels).toEqual(['A3', 'A2', 'A1', 'A0']);
    expect(state.phase).toBe('contrast_bound');
    expect(state.completionReadyForExit).toBe(false);
  });

  it('preserves each answer-specific exit rationale privately and releases both together', () => {
    let state = reachFirstExit();
    const nearId = activity(state).id;
    state = submit(present(state), 'aligned');
    let view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(state.authorityPrivateFeedback.sealedExit).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain('Correct under the invented fixture rule');

    const changedId = activity(state).id;
    state = submit(present(state), 'offset');
    view = buildLessonStepView(syntheticV3LessonDefinition, state);

    expect(state.status).toBe('awaiting_repair');
    expect(state.authorityPrivateFeedback.sealedExit).toEqual([]);
    expect(state.groupedFeedback?.entries.map((entry) => entry.activityId)).toEqual([
      nearId,
      changedId,
    ]);
    expect(state.groupedFeedback?.entries[0]?.message).toBe(
      'Correct under the invented fixture rule.',
    );
    expect(state.groupedFeedback?.entries[1]?.message).toBe(
      'The selected answer conflicts with the synthetic rule.',
    );
    expect(JSON.stringify(view)).not.toContain('authorityPrivateFeedback');
  });

  it('uses fresh cycle-specific repair and recovery activities in cycle two', () => {
    let state = submitExitPair(reachFirstExit(), 'offset', 'offset');
    state = beginRepair(state);
    const cycleOneRepair = activity(state);
    const cycleOneRepresentation = cycleOneRepair.representationIds[0];
    state = completeCurrent(state);
    state = establishA0(state);
    state = submitExitPair(state, 'offset', 'offset');
    state = beginRepair(state);
    const cycleTwoRepair = activity(state);

    expect(state.repairCycles).toBe(2);
    expect(cycleTwoRepair.id).not.toBe(cycleOneRepair.id);
    expect(cycleTwoRepair.familyId).not.toBe(cycleOneRepair.familyId);
    expect(cycleTwoRepair.representationIds[0]).not.toBe(cycleOneRepresentation);
    expect(cycleTwoRepair.id).toContain('REPAIR-C2');
  });

  it('caps repair at two cycles and pauses for planner reentry', () => {
    let state = submitExitPair(reachFirstExit(), 'offset', 'offset');
    for (let cycle = 0; cycle < 2; cycle += 1) {
      state = beginRepair(state);
      state = completeCurrent(state);
      state = establishA0(state);
      state = submitExitPair(state, 'offset', 'offset');
    }

    expect(state.status).toBe('paused');
    expect(state.pauseReason).toBe('repair_exhausted');
    expect(state.repairCycles).toBe(2);
    expect(buildLessonStepView(syntheticV3LessonDefinition, state).availableActions).toEqual([]);
  });
});

describe('planner reentry lineage and cross-run exposure', () => {
  const advanceCurrentKcToExit = (input: LessonRunState): LessonRunState => {
    let state =
      input.status === 'ready'
        ? startLessonRun(input, syntheticV3LessonDefinition, 'test_fixture').state
        : input;
    for (let guard = 0; guard < 80 && state.phase !== 'exit_near'; guard += 1) {
      state = completeCurrent(state, state.phase === 'enter_routing' ? 'ready' : 'aligned');
    }
    expect(state.phase).toBe('exit_near');
    return state;
  };

  const exhaustCurrentKc = (input: LessonRunState): LessonRunState => {
    let state = submitExitPair(advanceCurrentKcToExit(input), 'offset', 'offset');
    for (let cycle = 0; cycle < 2; cycle += 1) {
      state = beginRepair(state);
      state = completeCurrent(state);
      state = establishA0(state);
      state = submitExitPair(state, 'offset', 'offset');
    }
    expect(state.status).toBe('paused');
    return state;
  };

  const repairExhausted = (): LessonRunState => {
    let state = submitExitPair(reachFirstExit(), 'offset', 'offset');
    for (let cycle = 0; cycle < 2; cycle += 1) {
      state = beginRepair(state);
      state = completeCurrent(state);
      state = establishA0(state);
      state = submitExitPair(state, 'offset', 'offset');
    }
    return state;
  };

  const handoff = (
    parent: LessonRunState,
    artifacts: ReturnType<typeof nextRunArtifacts>,
    definition = syntheticV3LessonDefinition,
  ): LessonRunState =>
    reduceLessonRun(
      parent,
      event(parent, 'lesson_planner_reentry_handoff', {
        nextRunPins: artifacts.nextPins,
        nextLineage: artifacts.nextLineage,
        nextResolution: artifacts.nextResolution,
      }),
      definition,
      'test_fixture',
    );

  it('rejects same-run handoff IDs and mismatched version pins', () => {
    const exhausted = repairExhausted();
    const sameRunLineage = nextLineageFor(exhausted, exhausted.pins);
    const sameRun = apply(exhausted, 'lesson_planner_reentry_handoff', {
      nextRunPins: exhausted.pins,
      nextLineage: sameRunLineage,
      nextResolution: initialResolution,
    });
    expect(sameRun.status).toBe('blocked');

    const valid = nextRunArtifacts(
      exhausted,
      '44444444-4444-4444-8444-444444444444',
    );
    const mismatchedPins = {
      ...valid.nextPins,
      reviewedContentHash: '0'.repeat(64),
    };
    const mismatch = apply(exhausted, 'lesson_planner_reentry_handoff', {
      nextRunPins: mismatchedPins,
      nextLineage: valid.nextLineage,
      nextResolution: valid.nextResolution,
    });
    expect(mismatch.status).toBe('blocked');

    const dropped = nextRunArtifacts(
      exhausted,
      '55555555-5555-4555-8555-555555555555',
    );
    const droppedExposure = apply(exhausted, 'lesson_planner_reentry_handoff', {
      nextRunPins: dropped.nextPins,
      nextLineage: {
        ...dropped.nextLineage,
        inheritedExposure: {
          ...dropped.nextLineage.inheritedExposure,
          families: dropped.nextLineage.inheritedExposure.families.slice(1),
        },
      },
      nextResolution: dropped.nextResolution,
    });
    expect(droppedExposure.status).toBe('blocked');
  });

  it('inherits exposure and selects untouched entry and exit replacement families', () => {
    let parent = repairExhausted();
    const artifacts = nextRunArtifacts(
      parent,
      '44444444-4444-4444-8444-444444444444',
    );
    parent = handoff(parent, artifacts);
    expect(parent.status).toBe('handoff');

    const child = initializeLessonReentryRun(
      syntheticV3LessonDefinition,
      artifacts.nextPins,
      artifacts.nextResolution,
      'test_fixture',
      parent,
      clock,
    );
    const inheritedFamilies = new Set(parent.exposures.map((exposure) => exposure.familyId));
    const selectedEntry = activity(child);

    expect(child.status).toBe('ready');
    expect(child.lineage.parentRunId).toBe(parent.pins.runId);
    expect(child.exposures).toEqual(parent.exposures);
    expect(child.lineage.inheritedExposure).toEqual({
      sourceRunIds: [parent.pins.runId],
      families: parent.exposures,
    });
    expect(new Set(child.exposures.map((exposure) => exposure.familyId)).size).toBe(
      child.exposures.length,
    );
    expect(inheritedFamilies.has(selectedEntry.familyId)).toBe(false);
    expect(selectedEntry.id).toContain('ENTRY-3');

    let reentered = startLessonRun(child, syntheticV3LessonDefinition, 'test_fixture').state;
    reentered = completeCurrent(reentered, 'ready');
    reentered = completeCurrent(reentered, 'ready');
    for (let guard = 0; guard < 10 && reentered.phase !== 'completion'; guard += 1) {
      reentered = completeCurrent(reentered);
    }
    reentered = establishA0(reentered);
    while (reentered.phase !== 'exit_near') reentered = completeCurrent(reentered);

    const selectedPair =
      syntheticV3LessonDefinition.knowledgeComponents[0]!.microcycle.pairedExit.pairs.find(
        (pair) => pair.id === reentered.activeExitPairId,
      )!;
    const selectedExitFamilies = [
      activity(reentered).familyId,
      syntheticV3LessonDefinition.knowledgeComponents[0]!.activities.find(
        (candidate) => candidate.id === selectedPair.changedActivityId,
      )!.familyId,
    ];
    expect(selectedExitFamilies.every((familyId) => !inheritedFamilies.has(familyId))).toBe(true);
  });

  it('uses the exact paused target KC reentry limit, not an unrelated KC minimum', () => {
    const mixedLimits = structuredClone(syntheticV3LessonDefinition);
    mixedLimits.knowledgeComponents[0]!.microcycle.fading.maxReentryGenerations = 1;
    mixedLimits.knowledgeComponents[1]!.microcycle.fading.maxReentryGenerations = 0;
    let parent = repairExhausted();
    const artifacts = nextRunArtifacts(
      parent,
      '66666666-6666-4666-8666-666666666666',
    );
    parent = handoff(parent, artifacts, mixedLimits);

    expect(parent.status).toBe('handoff');
    const child = initializeLessonReentryRun(
      mixedLimits,
      artifacts.nextPins,
      artifacts.nextResolution,
      'test_fixture',
      parent,
      clock,
    );
    expect(child.status).toBe('ready');
    expect(child.currentKcId).toBe(mixedLimits.knowledgeComponents[0]!.id);
    expect(child.exposures).toEqual(parent.exposures);
  });

  it('counts reentry independently for each KC while retaining global audit generation', () => {
    const kcOneId = syntheticV3LessonDefinition.knowledgeComponents[0]!.id;
    const kcTwoId = syntheticV3LessonDefinition.knowledgeComponents[1]!.id;
    let kcOneParent = repairExhausted();
    const kcOneArtifacts = nextRunArtifacts(
      kcOneParent,
      '77777777-7777-4777-8777-777777777777',
      kcOneId,
    );
    kcOneParent = handoff(kcOneParent, kcOneArtifacts);
    const kcOneChild = initializeLessonReentryRun(
      syntheticV3LessonDefinition,
      kcOneArtifacts.nextPins,
      kcOneArtifacts.nextResolution,
      'test_fixture',
      kcOneParent,
      clock,
    );
    expect(kcOneChild.lineage.kcReentryCounts).toEqual([{ kcId: kcOneId, count: 1 }]);

    let progressed = advanceCurrentKcToExit(kcOneChild);
    progressed = submitExitPair(progressed, 'aligned', 'aligned');
    progressed = act(progressed, { type: 'continue', activityId: null });
    expect(progressed.currentKcId).toBe(kcTwoId);
    expect(progressed.status).toBe('awaiting_planner_resolution');
    expect(progressed.exitedKcIds).toContain(kcOneId);

    const kcTwoArtifacts = nextRunArtifacts(
      progressed,
      '88888888-8888-4888-8888-888888888888',
      kcTwoId,
    );
    expect(kcTwoArtifacts.nextLineage.generation).toBe(2);
    expect(kcTwoArtifacts.nextLineage.kcReentryCounts).toEqual([
      { kcId: kcOneId, count: 1 },
      { kcId: kcTwoId, count: 1 },
    ]);
    const forgedCounts = apply(progressed, 'lesson_planner_reentry_handoff', {
      nextRunPins: kcTwoArtifacts.nextPins,
      nextLineage: {
        ...kcTwoArtifacts.nextLineage,
        kcReentryCounts: [{ kcId: kcOneId, count: 1 }],
      },
      nextResolution: kcTwoArtifacts.nextResolution,
    });
    expect(forgedCounts.status).toBe('blocked');

    let kcTwoParent = handoff(progressed, kcTwoArtifacts);
    expect(kcTwoParent.status).toBe('handoff');
    const kcTwoChild = initializeLessonReentryRun(
      syntheticV3LessonDefinition,
      kcTwoArtifacts.nextPins,
      kcTwoArtifacts.nextResolution,
      'test_fixture',
      kcTwoParent,
      clock,
    );
    expect(kcTwoChild.status).toBe('ready');
    expect(kcTwoChild.currentKcId).toBe(kcTwoId);
    expect(kcTwoChild.lineage.generation).toBe(2);

    const overLimitParent = exhaustCurrentKc(kcTwoChild);
    const overLimitArtifacts = nextRunArtifacts(
      overLimitParent,
      '99999999-9999-4999-8999-999999999999',
      kcTwoId,
    );
    const overLimit = handoff(overLimitParent, overLimitArtifacts);
    expect(overLimit.status).toBe('blocked');
    expect(overLimit.transitionErrors).toContain('planner_handoff_not_allowed');
  });
});

describe('deterministic scoring, replay, and HTTP-command idempotency', () => {
  it('evaluates simultaneous token and numeric criteria without an LLM', () => {
    const base = syntheticV3LessonDefinition.knowledgeComponents[0]!.activities.find(
      (candidate) => candidate.response.kind === 'choice',
    )!;
    const constructed = ActivityDefinitionSchema.parse({
      ...base,
      response: {
        kind: 'text',
        label: 'State the concepts and numeric result.',
        placeholder: null,
        allowNotSure: true,
        rubric: {
          criteria: [
            {
              id: 'concepts',
              label: 'Required concepts',
              required: true,
              matcher: {
                kind: 'required_tokens',
                tokens: ['glimmer', 'markers'],
                minimumMatches: 2,
                normalization: {
                  trim: true,
                  collapseWhitespace: true,
                  case: 'lowercase',
                  stripPunctuation: true,
                },
              },
              correctFeedback: 'Both concepts are present.',
              incorrectFeedback: 'Name both concepts.',
              diagnosticSignalIds: [],
              objectiveFeatureIds: ['feature-concepts'],
            },
            {
              id: 'value',
              label: 'Numeric result',
              required: true,
              matcher: {
                kind: 'numeric',
                target: 5,
                absoluteTolerance: 0.1,
                acceptedUnits: ['m/s'],
                requireUnit: true,
              },
              correctFeedback: 'The value and unit are correct.',
              incorrectFeedback: 'Check the value and unit.',
              diagnosticSignalIds: [],
              objectiveFeatureIds: ['feature-value'],
            },
          ],
          correctFeedback: 'All required criteria pass.',
          incorrectFeedback: 'One or more required criteria failed.',
          notSureFeedback: 'Not sure keeps support.',
        },
      },
    });

    expect(
      evaluateLessonResponse(constructed, {
        kind: 'text',
        text: 'The glimmer markers produce 5 m/s.',
      }).outcome,
    ).toBe('correct');
    const failed = evaluateLessonResponse(constructed, {
      kind: 'text',
      text: 'The glimmer marker produces 4 m/s.',
    });
    expect(failed.outcome).toBe('incorrect');
    expect(failed.objectiveFeatureIds).toEqual(['feature-concepts', 'feature-value']);
  });

  it('matches required tokens and phrases at Unicode-safe semantic boundaries', () => {
    const base = syntheticV3LessonDefinition.knowledgeComponents[0]!.activities.find(
      (candidate) => candidate.response.kind === 'choice',
    )!;
    const boundaryActivity = ActivityDefinitionSchema.parse({
      ...base,
      response: {
        kind: 'text',
        label: 'Use each required term.',
        placeholder: null,
        allowNotSure: true,
        rubric: {
          criteria: [
            {
              id: 'bounded-terms',
              label: 'Bounded terms',
              required: true,
              matcher: {
                kind: 'required_tokens',
                tokens: ['ion', 'oxidizing agent', 'NAD+'],
                minimumMatches: 3,
                normalization: {
                  trim: true,
                  collapseWhitespace: true,
                  case: 'lowercase',
                  stripPunctuation: true,
                },
              },
              correctFeedback: 'Every bounded term is present.',
              incorrectFeedback: 'Use each exact term.',
              diagnosticSignalIds: [],
              objectiveFeatureIds: ['feature-bounded-terms'],
            },
          ],
          correctFeedback: 'All terms matched.',
          incorrectFeedback: 'One or more terms did not match.',
          notSureFeedback: 'Not sure keeps support.',
        },
      },
    });

    expect(
      evaluateLessonResponse(boundaryActivity, {
        kind: 'text',
        text: 'The ion is handled by an oxidizing agent while NAD+ is present.',
      }).outcome,
    ).toBe('correct');
    expect(
      evaluateLessonResponse(boundaryActivity, {
        kind: 'text',
        text: 'The reaction mentions oxidizing agents and NADH.',
      }).outcome,
    ).toBe('incorrect');
  });

  it('replays idempotently and ignores duplicate event identities', () => {
    const initial = initializeLessonRun(syntheticV3LessonDefinition, pins, 'test_fixture');
    const started = event(initial, 'lesson_run_started', {});
    const once = replayLessonRun(initial, [started], syntheticV3LessonDefinition, 'test_fixture');
    const duplicated = replayLessonRun(
      initial,
      [started, started],
      syntheticV3LessonDefinition,
      'test_fixture',
    );

    expect(duplicated).toEqual(once);
    expect(duplicated.appliedEventIds).toHaveLength(1);
  });

  it('deduplicates an identical HTTP lesson command without emitting fresh events', () => {
    const state = freshStarted();
    const command = LessonActionCommandSchema.parse({
      envelope: {
        eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        occurredAt: '2026-07-23T16:41:00.000Z',
        expectedStreamVersion: 77,
        contentRelease: state.pins.contentRelease,
        taskInstanceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      runId: state.pins.runId,
      expectedRunVersion: state.lastSequence,
      action: { type: 'present', activityId: activity(state).id },
    });

    const first = dispatchLessonRunCommand(
      state,
      syntheticV3LessonDefinition,
      command,
      'test_fixture',
    );
    const retry = dispatchLessonRunCommand(
      first.state,
      syntheticV3LessonDefinition,
      command,
      'test_fixture',
    );

    expect(first.events).toHaveLength(1);
    expect(first.events[0]?.eventId).toBe(command.envelope.eventId);
    expect(retry.duplicate).toBe(true);
    expect(retry.events).toEqual([]);
    expect(retry.state).toEqual(first.state);
  });

  it('rejects stale lesson run concurrency without comparing aggregate stream versions', () => {
    const state = freshStarted();
    const command = LessonActionCommandSchema.parse({
      envelope: {
        eventId: 'abababab-abab-4bab-8bab-abababababab',
        idempotencyKey: 'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc',
        occurredAt: '2026-07-23T19:02:00.000Z',
        expectedStreamVersion: 10_000,
        contentRelease: state.pins.contentRelease,
        taskInstanceId: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
      },
      runId: state.pins.runId,
      expectedRunVersion: state.lastSequence - 1,
      action: { type: 'present', activityId: activity(state).id },
    });

    expect(() =>
      dispatchLessonRunCommand(state, syntheticV3LessonDefinition, command, 'test_fixture'),
    ).toThrow('lesson command run version mismatch');
  });

  it('derives identical child event identities for duplicate multi-event commands', () => {
    let state = freshStarted();
    state = completeCurrent(state, 'ready');
    state = submit(present(state), 'ready');
    const current = activity(state);
    const command = LessonActionCommandSchema.parse({
      envelope: {
        eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        occurredAt: '2026-07-23T16:41:00.000Z',
        expectedStreamVersion: 91,
        contentRelease: state.pins.contentRelease,
        taskInstanceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      },
      runId: state.pins.runId,
      expectedRunVersion: state.lastSequence,
      action: { type: 'continue', activityId: current.id },
    });

    const first = dispatchLessonRunCommand(
      state,
      syntheticV3LessonDefinition,
      command,
      'test_fixture',
    );
    const concurrentDuplicate = dispatchLessonRunCommand(
      state,
      syntheticV3LessonDefinition,
      command,
      'test_fixture',
    );
    const retry = dispatchLessonRunCommand(
      first.state,
      syntheticV3LessonDefinition,
      command,
      'test_fixture',
    );

    expect(first.events.map((event) => event.type)).toEqual([
      'lesson_activity_completed',
      'lesson_route_selected',
    ]);
    expect(first.events).toEqual(concurrentDuplicate.events);
    expect(first.events[1]?.eventId).not.toBe(command.envelope.eventId);
    expect(retry).toMatchObject({ duplicate: true, events: [] });
  });

  it('strips keys, exact private buffers, and matchers from learner DTOs', () => {
    const state = freshStarted();
    const view = buildLessonStepView(syntheticV3LessonDefinition, state);
    const json = JSON.stringify(view);

    expect(view.progress.exitedKcCount).toBe(0);
    expect(view.progress.kcOrdinal).toBe(1);
    expect(view.runVersion).toBe(state.lastSequence);
    expect(json).not.toContain('correctChoiceIds');
    expect(json).not.toContain('diagnosticSignalIds');
    expect(json).not.toContain('authorityPrivateFeedback');
    expect(json).not.toContain('matcher');
  });
});

describe('multi-KC completion semantics', () => {
  it('derives shell completion only after every required KC instructional exit', () => {
    let state = freshStarted();
    for (let guard = 0; guard < 400 && state.status !== 'complete'; guard += 1) {
      const view = buildLessonStepView(syntheticV3LessonDefinition, state);
      if (view.status === 'active') {
        let action: LessonActionInput;
        if (view.availableActions.includes('present')) {
          action = { type: 'present', activityId: view.activity.id };
        } else if (view.availableActions.includes('submit_response')) {
          const canonical = activity(state);
          if (canonical.response.kind !== 'choice') throw new Error('Expected fixture choice.');
          action = {
            type: 'submit_response',
            activityId: view.activity.id,
            response: {
              kind: 'choice',
              choiceId: canonical.response.correctChoiceIds[0]!,
            },
          };
        } else {
          action = { type: 'continue', activityId: view.activity.id };
        }
        state = act(state, action);
      } else if (
        (view.status === 'feedback_pending' || view.status === 'repair_pending') &&
        view.availableActions.includes('continue')
      ) {
        state = act(state, { type: 'continue', activityId: null });
      } else {
        throw new Error(`Unexpected synthetic runtime status ${view.status}.`);
      }
    }

    expect(state.status).toBe('complete');
    expect(state.exitedKcIds).toEqual(syntheticV3LessonDefinition.orderedKcIds);
    expect(JSON.stringify(state).toLocaleLowerCase()).not.toContain('mastery');
  });
});
