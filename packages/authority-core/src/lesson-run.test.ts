import { describe, expect, it } from 'vitest';
import { syntheticV3LessonDefinition, type ActivityDefinition } from '@mcat/content';
import {
  LessonRunPinsSchema,
  type LessonActionInput,
  type LessonResponseOutcome,
  type LessonRunState,
} from '@mcat/contracts';
import {
  buildLessonStepView,
  dispatchLessonRunAction,
  evaluateLessonResponse,
  initializeLessonRun,
  reduceLessonRun,
  replayLessonRun,
  startLessonRun,
} from './lesson-run';

const pins = LessonRunPinsSchema.parse({
  runId: '11111111-1111-4111-8111-111111111111',
  lessonId: syntheticV3LessonDefinition.id,
  definitionVersion: syntheticV3LessonDefinition.definitionVersion,
  contentRelease: syntheticV3LessonDefinition.contentRelease,
  policies: [{ policyId: 'lesson-runtime', version: 'v3-foundation-1' }],
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
    schemaVersion: '1.0',
    eventId: `10000000-0000-4000-8000-${suffix}`,
    idempotencyKey: `20000000-0000-4000-8000-${suffix}`,
    runId: state.pins.runId,
    lessonId: state.pins.lessonId,
    definitionVersion: state.pins.definitionVersion,
    contentRelease: state.pins.contentRelease,
    policies: state.pins.policies,
    sequence,
    occurredAt: '2026-07-23T06:00:00.000Z',
    type,
    payload,
    ...over,
  };
}

const apply = (state: LessonRunState, type: string, payload: Record<string, unknown> = {}) =>
  reduceLessonRun(state, event(state, type, payload), syntheticV3LessonDefinition, 'test_fixture');

function freshStarted(): LessonRunState {
  const initial = initializeLessonRun(syntheticV3LessonDefinition, pins, 'test_fixture');
  return apply(initial, 'lesson_run_started');
}

function activity(state: LessonRunState): ActivityDefinition {
  for (const kc of syntheticV3LessonDefinition.knowledgeComponents) {
    const found = kc.activities.find((candidate) => candidate.id === state.currentActivityId);
    if (found) return found;
  }
  throw new Error('Expected a current synthetic activity.');
}

function present(state: LessonRunState): LessonRunState {
  const current = activity(state);
  return apply(state, 'lesson_activity_presented', {
    kcId: current.kcId,
    activityId: current.id,
    familyId: current.familyId,
  });
}

function respond(
  state: LessonRunState,
  outcome: LessonResponseOutcome,
  signalIds: string[] = [],
  options: { assisted?: boolean; revealed?: boolean } = {},
): LessonRunState {
  const current = activity(state);
  const isExit = current.phase === 'exit_near' || current.phase === 'exit_changed';
  return apply(state, 'lesson_response_evaluated', {
    kcId: current.kcId,
    activityId: current.id,
    familyId: current.familyId,
    outcome,
    assistanceLevel: state.assistanceLevel,
    assisted: options.assisted ?? false,
    revealed: options.revealed ?? false,
    diagnosticSignalIds: signalIds,
    ...(isExit
      ? {}
      : {
          feedback: [
            {
              activityId: current.id,
              tone: outcome === 'correct' ? 'correct' : 'incorrect',
              message: 'Synthetic evaluated feedback.',
            },
          ],
        }),
  });
}

function completeCurrent(
  state: LessonRunState,
  outcome: LessonResponseOutcome = 'correct',
  signalIds: string[] = [],
  options: { assisted?: boolean; revealed?: boolean } = {},
): LessonRunState {
  const current = activity(state);
  let next = present(state);
  if (current.response.kind !== 'none') {
    next = respond(next, outcome, signalIds, options);
  }
  return apply(next, 'lesson_activity_completed', {
    kcId: current.kcId,
    activityId: current.id,
  });
}

function reachRoutePending(
  signalId: string,
  outcomes: LessonResponseOutcome[] = ['correct', 'correct'],
): LessonRunState {
  let state = freshStarted();
  state = completeCurrent(state, outcomes[0]!, [signalId]);
  state = completeCurrent(state, outcomes[1]!, [signalId]);
  expect(state.status).toBe('awaiting_route');
  return state;
}

function selectRoute(
  state: LessonRunState,
  route: 'concise' | 'standard' | 'prerequisite' | 'misconception',
): LessonRunState {
  return apply(state, 'lesson_route_selected', {
    kcId: state.currentKcId,
    route,
  });
}

function reachFirstExit(route: 'concise' | 'standard' = 'standard'): LessonRunState {
  const firstKc = syntheticV3LessonDefinition.knowledgeComponents[0]!;
  const signal =
    route === 'concise'
      ? firstKc.microcycle.entryRouting.routes.find((candidate) => candidate.route === 'concise')!
          .criteria.signalIds[0]!
      : 'unused-standard-signal';
  let state = selectRoute(reachRoutePending(signal), route);
  while (state.phase !== 'exit_near') state = completeCurrent(state);
  return state;
}

function releaseExitFeedback(state: LessonRunState): LessonRunState {
  const entries = state.sealedExitResults.map((result) => ({
    activityId: result.activityId,
    tone: result.passedUnsupported ? 'correct' : 'incorrect',
    message: `Synthetic sealed feedback for ${result.role}.`,
  }));
  return apply(state, 'lesson_exit_feedback_released', {
    kcId: state.currentKcId,
    feedback: entries,
  });
}

function submitExitPair(state: LessonRunState, outcome: LessonResponseOutcome): LessonRunState {
  let next = present(state);
  next = respond(next, outcome);
  next = present(next);
  return respond(next, outcome);
}

describe('V3 lesson run initialization and routing', () => {
  it('requires an explicit test-fixture mode and fails production closed', () => {
    const fixture = initializeLessonRun(syntheticV3LessonDefinition, pins, 'test_fixture');
    const production = initializeLessonRun(syntheticV3LessonDefinition, pins, 'production');

    expect(fixture.status).toBe('ready');
    expect(production.status).toBe('invalid_content');
    expect(production.invalidIssues).toContain('test_only_content_forbidden');
  });

  it('fails malformed lesson content to a non-interactive invalid state', () => {
    const malformed = structuredClone(syntheticV3LessonDefinition);
    malformed.orderedKcIds.reverse();
    const state = initializeLessonRun(malformed, pins, 'test_fixture');
    const view = buildLessonStepView(malformed, state);

    expect(state.status).toBe('invalid_content');
    expect(view.status).toBe('invalid_content');
    expect(view.availableActions).toEqual([]);
  });

  it.each([
    ['concise', 'ready'],
    ['prerequisite', 'prerequisite'],
    ['misconception', 'misconception'],
  ] as const)('selects the %s route only after two-family evidence', (route, signalTail) => {
    const kc = syntheticV3LessonDefinition.knowledgeComponents[0]!;
    const selected = kc.microcycle.entryRouting.routes.find(
      (candidate) => candidate.route === route,
    )!;
    const signalId =
      selected.criteria.kind === 'convergent_evidence'
        ? selected.criteria.signalIds[0]!
        : `signal-synth-001-${signalTail}`;
    const state = selectRoute(reachRoutePending(signalId), route);

    expect(state.status).toBe('active');
    expect(state.route).toBe(route);
  });

  it('uses standard as the deterministic fallback without targeted evidence', () => {
    const state = selectRoute(reachRoutePending('unmapped-signal'), 'standard');

    expect(state.status).toBe('active');
    expect(state.route).toBe('standard');
  });

  it('does not treat one distractor family as a misconception diagnosis', () => {
    const kc = syntheticV3LessonDefinition.knowledgeComponents[0]!;
    const misconception = kc.microcycle.entryRouting.routes.find(
      (candidate) => candidate.route === 'misconception',
    )!;
    const signalId =
      misconception.criteria.kind === 'convergent_evidence'
        ? misconception.criteria.signalIds[0]!
        : 'unreachable';
    let state = freshStarted();
    state = completeCurrent(state, 'incorrect', [signalId]);
    state = completeCurrent(state, 'correct', []);
    state = selectRoute(state, 'misconception');

    expect(state.status).toBe('blocked');
    expect(state.transitionErrors).toContain('route_requires_convergent_evidence');
  });
});

describe('V3 lesson fading, exits, and repair', () => {
  it('fades A3 through A0 only on successful unsupported completion performance', () => {
    let state = selectRoute(reachRoutePending('fallback'), 'standard');
    while (state.phase !== 'completion') state = completeCurrent(state);

    state = completeCurrent(state, 'incorrect');
    expect(state.assistanceLevel).toBe('A3');
    state = completeCurrent(state, 'correct');
    expect(state.assistanceLevel).toBe('A2');
    state = completeCurrent(state, 'correct', [], { assisted: true });
    expect(state.assistanceLevel).toBe('A2');
  });

  it('seals paired feedback until both fresh unsupported checks are submitted', () => {
    let state = reachFirstExit();
    state = present(state);
    state = respond(state, 'correct');
    let view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(JSON.stringify(view)).not.toContain('Synthetic sealed feedback');

    state = present(state);
    state = respond(state, 'correct');
    expect(state.status).toBe('awaiting_exit_feedback');
    expect(state.feedback?.sealed).toBe(true);
    view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(view.status).toBe('feedback_pending');
    expect(JSON.stringify(view)).not.toContain('Synthetic sealed feedback');

    state = releaseExitFeedback(state);
    view = buildLessonStepView(syntheticV3LessonDefinition, state);
    expect(JSON.stringify(view)).toContain('Synthetic sealed feedback');
  });

  it('marks a previously exposed exit family as contaminated', () => {
    let state = reachFirstExit();
    const current = activity(state);
    state = {
      ...state,
      exposures: [
        ...state.exposures,
        {
          familyId: current.familyId,
          activityIds: [current.id],
          firstSeenSequence: 0,
          revealed: false,
          feedbackSeen: false,
        },
      ],
    };
    state = present(state);
    state = respond(state, 'correct');

    expect(state.sealedExitResults[0]).toMatchObject({
      passedUnsupported: false,
      contamination: 'prior_family_exposure',
    });
  });

  it('caps repair at two cycles and pauses for planner reentry', () => {
    let state = submitExitPair(reachFirstExit(), 'incorrect');
    state = releaseExitFeedback(state);

    for (let cycle = 1; cycle <= 2; cycle += 1) {
      expect(state.status).toBe('awaiting_repair');
      const kc = syntheticV3LessonDefinition.knowledgeComponents[0]!;
      const generic = kc.microcycle.repairs.mappings.find((mapping) => mapping.kind === 'generic')!;
      state = apply(state, 'lesson_repair_started', {
        kcId: state.currentKcId,
        repairRouteId: generic.id,
      });
      while (state.phase !== 'exit_near') state = completeCurrent(state);
      state = submitExitPair(state, 'incorrect');
      state = releaseExitFeedback(state);
    }

    expect(state.status).toBe('paused');
    expect(state.repairCycles).toBe(2);
    expect(state.plannerReentryRequired).toBe(true);
    expect(buildLessonStepView(syntheticV3LessonDefinition, state).availableActions).not.toContain(
      'resume',
    );

    state = apply(state, 'lesson_planner_reentry_handoff', {
      nextRunId: '44444444-4444-4444-8444-444444444444',
    });
    expect(state.status).toBe('handoff');
    expect(state.handoffRunId).toBe('44444444-4444-4444-8444-444444444444');
  });
});

describe('V3 lesson replay, checkpoints, and safe views', () => {
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

  it('resumes the exact paused checkpoint with immutable pins and exposure state', () => {
    let state = reachFirstExit();
    const checkpoint = {
      currentActivityId: state.currentActivityId,
      sequencePosition: state.sequencePosition,
      assistanceLevel: state.assistanceLevel,
      exposures: structuredClone(state.exposures),
      pins: structuredClone(state.pins),
    };
    state = apply(state, 'lesson_run_paused', { reason: 'interruption' });
    expect(state.status).toBe('paused');
    state = apply(state, 'lesson_run_resumed');

    expect(state).toMatchObject(checkpoint);
    expect(state.status).toBe('active');
  });

  it('blocks an event with mismatched content or policy pins', () => {
    const state = freshStarted();
    const current = activity(state);
    const mismatched = event(
      state,
      'lesson_activity_presented',
      {
        kcId: current.kcId,
        activityId: current.id,
        familyId: current.familyId,
      },
      { contentRelease: 'other-release' },
    );
    const next = reduceLessonRun(state, mismatched, syntheticV3LessonDefinition, 'test_fixture');

    expect(next.status).toBe('blocked');
    expect(next.transitionErrors).toContain('event_pin_mismatch');
  });

  it('evaluates protected choices server-side and strips keys from learner views', () => {
    const state = freshStarted();
    const current = activity(state);
    const evaluated = evaluateLessonResponse(current, {
      kind: 'choice',
      choiceId: 'ready',
    });
    const view = buildLessonStepView(syntheticV3LessonDefinition, state);
    const json = JSON.stringify(view);

    expect(evaluated.outcome).toBe('correct');
    expect(json).not.toContain('correctChoiceIds');
    expect(json).not.toContain('diagnosticSignalIds');
    expect(json).not.toContain('acceptedAnswers');
  });

  it('derives multi-KC lesson completion only from all KC instructional exits', () => {
    let state = startLessonRun(
      initializeLessonRun(syntheticV3LessonDefinition, pins, 'test_fixture'),
      syntheticV3LessonDefinition,
      'test_fixture',
    ).state;

    for (let guard = 0; guard < 200 && state.status !== 'complete'; guard += 1) {
      const view = buildLessonStepView(syntheticV3LessonDefinition, state);
      if (view.status === 'active') {
        let action: LessonActionInput;
        if (view.availableActions.includes('present')) {
          action = { type: 'present' as const, activityId: view.activity.id };
        } else if (view.availableActions.includes('submit_response')) {
          const canonical = activity(state);
          if (canonical.response.kind !== 'choice') {
            throw new Error('Synthetic completion expects choice responses.');
          }
          action = {
            type: 'submit_response' as const,
            activityId: view.activity.id,
            response: {
              kind: 'choice' as const,
              choiceId: canonical.response.correctChoiceIds[0]!,
            },
          };
        } else {
          action = { type: 'continue' as const, activityId: view.activity.id };
        }
        state = dispatchLessonRunAction(
          state,
          syntheticV3LessonDefinition,
          action,
          'test_fixture',
        ).state;
      } else if (
        (view.status === 'feedback_pending' || view.status === 'repair_pending') &&
        view.availableActions.includes('continue') &&
        view.activity
      ) {
        state = dispatchLessonRunAction(
          state,
          syntheticV3LessonDefinition,
          { type: 'continue', activityId: view.activity.id },
          'test_fixture',
        ).state;
      } else {
        throw new Error(`Unexpected synthetic runtime status ${view.status}.`);
      }
    }

    expect(state.status).toBe('complete');
    expect(state.exitedKcIds).toEqual(syntheticV3LessonDefinition.orderedKcIds);
    expect(JSON.stringify(state).toLocaleLowerCase()).not.toContain('mastery');
  });
});
