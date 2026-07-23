import { describe, expect, it } from 'vitest';
import {
  ActivityDefinitionSchema,
  syntheticV3LessonDefinition,
  type ActivityDefinition,
} from '@mcat/content';
import {
  LessonActionCommandSchema,
  LessonRunPinsSchema,
  type LessonActionInput,
  type LessonRunState,
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

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  lessonId: syntheticV3LessonDefinition.id,
  definitionVersion: syntheticV3LessonDefinition.definitionVersion,
  reviewedContentHash: syntheticV3LessonDefinition.contentDigest.sha256,
  contentRelease: syntheticV3LessonDefinition.contentRelease,
  registry: syntheticV3LessonDefinition.registryBinding.registry,
  policies: [{ policyId: 'lesson-runtime', version: 'v3-foundation-2' }],
});

function event(
  state: LessonRunState,
  type: string,
  payload: Record<string, unknown>,
  over: Record<string, unknown> = {},
) {
  const sequence = state.lastSequence + 1;
  const suffix = String(sequence + 1).padStart(12, '0');
  return {
    schemaVersion: '1.1',
    eventId: `10000000-0000-4000-8000-${suffix}`,
    idempotencyKey: `20000000-0000-4000-8000-${suffix}`,
    runId: state.pins.runId,
    lessonId: state.pins.lessonId,
    definitionVersion: state.pins.definitionVersion,
    reviewedContentHash: state.pins.reviewedContentHash,
    contentRelease: state.pins.contentRelease,
    registry: state.pins.registry,
    policies: state.pins.policies,
    sequence,
    occurredAt: '2026-07-23T16:41:00.000Z',
    type,
    payload,
    ...over,
  };
}

const apply = (state: LessonRunState, type: string, payload: Record<string, unknown> = {}) =>
  reduceLessonRun(state, event(state, type, payload), syntheticV3LessonDefinition, 'test_fixture');

function freshStarted(): LessonRunState {
  return startLessonRun(
    initializeLessonRun(syntheticV3LessonDefinition, pins, 'test_fixture'),
    syntheticV3LessonDefinition,
    'test_fixture',
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
    const fixture = initializeLessonRun(syntheticV3LessonDefinition, pins, 'test_fixture');
    const production = initializeLessonRun(syntheticV3LessonDefinition, pins, 'production');
    const wrongHash = initializeLessonRun(
      syntheticV3LessonDefinition,
      { ...pins, reviewedContentHash: '0'.repeat(64) },
      'test_fixture',
    );

    expect(fixture.status).toBe('ready');
    expect(production.status).toBe('invalid_content');
    expect(production.invalidIssues).toContain('unpublished_or_test_content_forbidden');
    expect(wrongHash.invalidIssues).toContain('reviewed_content_hash_pin_mismatch');
  });

  it('keeps all entry rationale sealed until both probes commit and routing finalizes', () => {
    let state = freshStarted();
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
    expect(state.route).toBe('concise');
    expect(state.authorityPrivateFeedback.sealedEntry).toEqual([]);
    expect(state.groupedFeedback?.entries).toHaveLength(2);
    expect(JSON.stringify(view)).toContain('Correct under the invented fixture rule');
  });

  it.each([
    ['ready', 'concise'],
    ['prerequisite', 'prerequisite'],
    ['swap', 'misconception'],
    ['offset', 'standard'],
  ] as const)('selects %s probe evidence into the %s route', (choice, expectedRoute) => {
    let state = freshStarted();
    state = completeCurrent(state, choice);
    state = completeCurrent(state, choice);

    expect(state.route).toBe(expectedRoute);
    expect(state.status).toBe('active');
  });

  it('routes repeated not-sure responses through deterministic convergent evidence', () => {
    let state = freshStarted();
    for (let probe = 0; probe < 2; probe += 1) {
      const current = activity(state);
      state = act(present(state), {
        type: 'submit_response',
        activityId: current.id,
        response: { kind: 'not_sure' },
      });
      state = act(state, { type: 'continue', activityId: current.id });
    }

    expect(state.route).toBe('prerequisite');
    expect(
      state.signals.find((signal) => signal.signalId.endsWith('-prerequisite'))?.familyIds,
    ).toHaveLength(2);
  });

  it('rejects a targeted route when only one family supports its signal', () => {
    let state = freshStarted();
    state = completeCurrent(state, 'swap');
    const second = activity(state);
    state = submit(present(state), 'prerequisite');
    state = apply(state, 'lesson_activity_completed', {
      kcId: second.kcId,
      activityId: second.id,
    });
    expect(state.status).toBe('awaiting_route');
    state = apply(state, 'lesson_route_selected', {
      kcId: state.currentKcId,
      route: 'misconception',
    });

    expect(state.status).toBe('blocked');
    expect(state.transitionErrors).toContain('route_requires_convergent_evidence');
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
      type: 'request_assistance',
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

  it('rejects same-run handoff IDs and mismatched version pins', () => {
    const exhausted = repairExhausted();
    const sameRunLineage = {
      rootRunId: exhausted.lineage.rootRunId,
      parentRunId: exhausted.pins.runId,
      generation: 1,
      inheritedFromRunIds: [exhausted.pins.runId],
      inheritedExposure: {
        sourceRunIds: [exhausted.pins.runId],
        families: structuredClone(exhausted.exposures),
      },
      reviewedContentPins: exhausted.lineage.reviewedContentPins,
    };
    const sameRun = apply(exhausted, 'lesson_planner_reentry_handoff', {
      nextRunPins: exhausted.pins,
      nextLineage: sameRunLineage,
    });
    expect(sameRun.status).toBe('blocked');

    const mismatchedPins = {
      ...exhausted.pins,
      runId: '44444444-4444-4444-8444-444444444444',
      reviewedContentHash: '0'.repeat(64),
    };
    const mismatch = apply(exhausted, 'lesson_planner_reentry_handoff', {
      nextRunPins: mismatchedPins,
      nextLineage: sameRunLineage,
    });
    expect(mismatch.status).toBe('blocked');

    const validNextPins = LessonRunPinsSchema.parse({
      ...exhausted.pins,
      runId: '55555555-5555-4555-8555-555555555555',
    });
    const droppedExposure = apply(exhausted, 'lesson_planner_reentry_handoff', {
      nextRunPins: validNextPins,
      nextLineage: {
        ...sameRunLineage,
        inheritedExposure: {
          ...sameRunLineage.inheritedExposure,
          families: sameRunLineage.inheritedExposure.families.slice(1),
        },
      },
    });
    expect(droppedExposure.status).toBe('blocked');
  });

  it('inherits exposure and selects untouched entry and exit replacement families', () => {
    let parent = repairExhausted();
    const nextPins = LessonRunPinsSchema.parse({
      ...parent.pins,
      runId: '44444444-4444-4444-8444-444444444444',
    });
    const nextLineage = {
      rootRunId: parent.lineage.rootRunId,
      parentRunId: parent.pins.runId,
      generation: 1,
      inheritedFromRunIds: [parent.pins.runId],
      inheritedExposure: {
        sourceRunIds: [parent.pins.runId],
        families: structuredClone(parent.exposures),
      },
      reviewedContentPins: parent.lineage.reviewedContentPins,
    };
    parent = apply(parent, 'lesson_planner_reentry_handoff', {
      nextRunPins: nextPins,
      nextLineage,
    });
    expect(parent.status).toBe('handoff');

    const child = initializeLessonReentryRun(
      syntheticV3LessonDefinition,
      nextPins,
      'test_fixture',
      parent,
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
    const nextPins = LessonRunPinsSchema.parse({
      ...parent.pins,
      runId: '66666666-6666-4666-8666-666666666666',
    });
    const nextLineage = {
      rootRunId: parent.lineage.rootRunId,
      parentRunId: parent.pins.runId,
      generation: 1,
      inheritedFromRunIds: [parent.pins.runId],
      inheritedExposure: {
        sourceRunIds: [parent.pins.runId],
        families: structuredClone(parent.exposures),
      },
      reviewedContentPins: parent.lineage.reviewedContentPins,
    };
    parent = reduceLessonRun(
      parent,
      event(parent, 'lesson_planner_reentry_handoff', {
        nextRunPins: nextPins,
        nextLineage,
      }),
      mixedLimits,
      'test_fixture',
    );

    expect(parent.status).toBe('handoff');
    const child = initializeLessonReentryRun(mixedLimits, nextPins, 'test_fixture', parent);
    expect(child.status).toBe('ready');
    expect(child.currentKcId).toBe(mixedLimits.knowledgeComponents[0]!.id);
    expect(child.exposures).toEqual(parent.exposures);
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
