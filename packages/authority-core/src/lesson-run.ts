import {
  LessonDefinitionSchema,
  type ActivityDefinition,
  type KnowledgeComponentDefinition,
  type LessonDefinition,
} from '@mcat/content';
import {
  LessonActivityResponseInputSchema,
  LessonActionInputSchema,
  LessonRunEventSchema,
  LessonRunPinsSchema,
  LessonRunStateSchema,
  LessonStepViewSchema,
  type AssistanceLevel,
  type Clock,
  type LessonActionInput,
  type LessonActivityResponseInput,
  type LessonFeedbackEntry,
  type LessonRunEvent,
  type LessonRunPins,
  type LessonRunState,
  type LessonStepView,
  newEventId,
  newIdempotencyKey,
  systemClock,
} from '@mcat/contracts';
import {
  decideLessonAssistance,
  distinctSignalFamilyCount,
} from '@mcat/policies';

export type LessonRuntimeMode = 'production' | 'test_fixture';

const supportIndex = (level: AssistanceLevel): number =>
  (['A3', 'A2', 'A1', 'A0'] as const).indexOf(level);

const issueCode = (path: PropertyKey[], code: string): string =>
  `${code}:${path.map(String).join('.') || 'root'}`;

function invalidState(pins: LessonRunPins, issues: string[]): LessonRunState {
  return LessonRunStateSchema.parse({
    schemaVersion: '1.0',
    pins,
    status: 'invalid_content',
    currentKcId: null,
    currentActivityId: null,
    phase: null,
    route: null,
    sequenceActivityIds: [],
    sequencePosition: 0,
    assistanceLevel: 'A3',
    consecutiveUnsupportedSuccesses: 0,
    repairCycles: 0,
    exitedKcIds: [],
    signals: [],
    exposures: [],
    activePresentation: null,
    lastResponse: null,
    sealedExitResults: [],
    visibleAssistanceLevel: null,
    feedback: null,
    resumeStatus: null,
    pauseReason: null,
    plannerReentryRequired: false,
    handoffRunId: null,
    appliedEventIds: [],
    appliedIdempotencyKeys: [],
    lastSequence: -1,
    invalidIssues: issues,
    transitionErrors: [],
  });
}

function definitionIssues(
  input: unknown,
  pins: LessonRunPins,
  mode: LessonRuntimeMode,
): { definition: LessonDefinition | null; issues: string[] } {
  const parsed = LessonDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      definition: null,
      issues: parsed.error.issues.map((issue) => issueCode(issue.path, issue.code)),
    };
  }
  const issues: string[] = [];
  if (parsed.data.id !== pins.lessonId) issues.push('lesson_id_pin_mismatch');
  if (parsed.data.definitionVersion !== pins.definitionVersion) {
    issues.push('definition_version_pin_mismatch');
  }
  if (parsed.data.contentRelease !== pins.contentRelease) {
    issues.push('content_release_pin_mismatch');
  }
  if (mode === 'production' && parsed.data.testOnly) {
    issues.push('test_only_content_forbidden');
  }
  return { definition: issues.length === 0 ? parsed.data : null, issues };
}

/**
 * Initializes a version-bound run. Runtime mode is mandatory so a synthetic
 * fixture can never be enabled by an implicit production fallback.
 */
export function initializeLessonRun(
  definitionInput: unknown,
  pinsInput: LessonRunPins,
  mode: LessonRuntimeMode,
): LessonRunState {
  const pins = LessonRunPinsSchema.parse(pinsInput);
  const checked = definitionIssues(definitionInput, pins, mode);
  if (!checked.definition) return invalidState(pins, checked.issues);

  const firstKc = checked.definition.knowledgeComponents[0]!;
  const sequenceActivityIds = firstKc.microcycle.entryRouting.probeActivityIds;
  const firstActivity = activityById(firstKc, sequenceActivityIds[0]!);
  return LessonRunStateSchema.parse({
    ...invalidState(pins, []),
    status: 'ready',
    currentKcId: firstKc.id,
    currentActivityId: firstActivity.id,
    phase: firstActivity.phase,
    sequenceActivityIds,
    invalidIssues: [],
  });
}

function activityById(
  kc: KnowledgeComponentDefinition,
  activityId: string,
): ActivityDefinition {
  const activity = kc.activities.find((candidate) => candidate.id === activityId);
  if (!activity) throw new Error(`Validated definition is missing activity ${activityId}.`);
  return activity;
}

function currentKc(
  definition: LessonDefinition,
  state: LessonRunState,
): KnowledgeComponentDefinition | null {
  return (
    definition.knowledgeComponents.find((candidate) => candidate.id === state.currentKcId) ??
    null
  );
}

function currentActivity(
  definition: LessonDefinition,
  state: LessonRunState,
): ActivityDefinition | null {
  const kc = currentKc(definition, state);
  if (!kc || state.currentActivityId === null) return null;
  return kc.activities.find((candidate) => candidate.id === state.currentActivityId) ?? null;
}

function block(state: LessonRunState, code: string): LessonRunState {
  state.status = 'blocked';
  state.currentActivityId = null;
  state.phase = null;
  state.transitionErrors.push(code);
  return LessonRunStateSchema.parse(state);
}

function policiesEqual(
  left: LessonRunPins['policies'],
  right: LessonRunPins['policies'],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (policy, index) =>
        policy.policyId === right[index]?.policyId &&
        policy.version === right[index]?.version,
    )
  );
}

function eventPinsMatch(state: LessonRunState, event: LessonRunEvent): boolean {
  return (
    event.runId === state.pins.runId &&
    event.lessonId === state.pins.lessonId &&
    event.definitionVersion === state.pins.definitionVersion &&
    event.contentRelease === state.pins.contentRelease &&
    policiesEqual(event.policies, state.pins.policies)
  );
}

function recordEvent(state: LessonRunState, event: LessonRunEvent): void {
  state.appliedEventIds.push(event.eventId);
  state.appliedIdempotencyKeys.push(event.idempotencyKey);
  state.lastSequence = event.sequence;
}

function addSignals(
  state: LessonRunState,
  familyId: string,
  signalIds: readonly string[],
): void {
  for (const signalId of new Set(signalIds)) {
    const existing = state.signals.find((signal) => signal.signalId === signalId);
    if (!existing) {
      state.signals.push({ signalId, familyIds: [familyId] });
    } else if (!existing.familyIds.includes(familyId)) {
      existing.familyIds.push(familyId);
    }
  }
}

function exposureFor(state: LessonRunState, familyId: string) {
  return state.exposures.find((exposure) => exposure.familyId === familyId);
}

function clearActivityTransient(state: LessonRunState): void {
  state.activePresentation = null;
  state.lastResponse = null;
  state.visibleAssistanceLevel = null;
  state.feedback = null;
}

function setCurrentFromSequence(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  position: number,
): void {
  state.sequencePosition = position;
  const id = state.sequenceActivityIds[position];
  if (id === undefined) {
    state.currentActivityId = null;
    state.phase = 'enter_routing';
    state.status = 'awaiting_route';
    clearActivityTransient(state);
    return;
  }
  const activity = activityById(kc, id);
  state.currentActivityId = activity.id;
  state.phase = activity.phase;
  state.status = 'active';
  clearActivityTransient(state);
}

function activeExitPair(
  kc: KnowledgeComponentDefinition,
  state: LessonRunState,
) {
  return kc.microcycle.pairedExit.attempts[state.repairCycles]!;
}

function transitionError(
  state: LessonRunState,
  condition: boolean,
  code: string,
): condition is false {
  if (!condition) block(state, code);
  return !condition;
}

/**
 * Pure deterministic transition reducer. Accepted event order is authoritative;
 * duplicates are ignored by event id or idempotency key.
 */
export function reduceLessonRun(
  stateInput: LessonRunState,
  eventInput: unknown,
  definitionInput: unknown,
  mode: LessonRuntimeMode,
): LessonRunState {
  const state = LessonRunStateSchema.parse(structuredClone(stateInput));
  const parsedEvent = LessonRunEventSchema.safeParse(eventInput);
  if (!parsedEvent.success) return block(state, 'invalid_event_contract');
  const event = parsedEvent.data;

  if (
    state.appliedEventIds.includes(event.eventId) ||
    state.appliedIdempotencyKeys.includes(event.idempotencyKey)
  ) {
    return state;
  }
  if (!eventPinsMatch(state, event)) return block(state, 'event_pin_mismatch');
  if (event.sequence !== state.lastSequence + 1) {
    return block(state, 'event_sequence_gap');
  }

  const checked = definitionIssues(definitionInput, state.pins, mode);
  if (!checked.definition) {
    state.status = 'invalid_content';
    state.currentActivityId = null;
    state.phase = null;
    state.invalidIssues = checked.issues;
    recordEvent(state, event);
    return LessonRunStateSchema.parse(state);
  }
  const definition = checked.definition;
  recordEvent(state, event);

  if (event.type === 'lesson_invalid_content_detected') {
    state.status = 'invalid_content';
    state.currentActivityId = null;
    state.phase = null;
    state.invalidIssues = [...event.payload.issueCodes];
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_run_started') {
    if (transitionError(state, state.status === 'ready', 'run_start_not_ready')) return state;
    state.status = 'active';
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_run_paused') {
    if (
      transitionError(
        state,
        ['active', 'awaiting_route', 'awaiting_exit_feedback', 'awaiting_repair'].includes(
          state.status,
        ),
        'pause_not_allowed',
      )
    ) {
      return state;
    }
    state.resumeStatus = state.status as NonNullable<LessonRunState['resumeStatus']>;
    state.status = 'paused';
    state.pauseReason = event.payload.reason;
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_run_resumed') {
    if (
      transitionError(
        state,
        state.status === 'paused' &&
          !state.plannerReentryRequired &&
          state.resumeStatus !== null,
        'resume_not_allowed',
      )
    ) {
      return state;
    }
    state.status = state.resumeStatus!;
    state.resumeStatus = null;
    state.pauseReason = null;
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_planner_reentry_handoff') {
    if (
      transitionError(
        state,
        state.status === 'paused' && state.plannerReentryRequired,
        'planner_handoff_not_allowed',
      )
    ) {
      return state;
    }
    state.status = 'handoff';
    state.handoffRunId = event.payload.nextRunId;
    return LessonRunStateSchema.parse(state);
  }

  const kc = currentKc(definition, state);
  if (!kc) return block(state, 'current_kc_missing');

  if (event.type === 'lesson_activity_presented') {
    const activity = currentActivity(definition, state);
    if (
      transitionError(
        state,
        state.status === 'active' &&
          activity !== null &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          event.payload.familyId === activity.familyId &&
          state.activePresentation === null,
        'presentation_mismatch',
      )
    ) {
      return state;
    }
    const existing = exposureFor(state, activity.familyId);
    state.activePresentation = {
      activityId: activity.id,
      familyId: activity.familyId,
      freshAtPresentation: existing === undefined,
    };
    if (!existing) {
      state.exposures.push({
        familyId: activity.familyId,
        activityIds: [activity.id],
        firstSeenSequence: event.sequence,
        revealed: false,
        feedbackSeen: false,
      });
    } else if (!existing.activityIds.includes(activity.id)) {
      existing.activityIds.push(activity.id);
    }
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_assistance_revealed') {
    const activity = currentActivity(definition, state);
    const hint = activity?.assistance.hints.find(
      (candidate) => candidate.level === event.payload.level,
    );
    if (
      transitionError(
        state,
        state.status === 'active' &&
          activity !== null &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          !['exit_near', 'exit_changed'].includes(activity.phase) &&
          hint !== undefined &&
          activity.assistance.allowedLevels.includes(event.payload.level) &&
          supportIndex(event.payload.level) <= supportIndex(state.assistanceLevel),
        'assistance_reveal_not_allowed',
      )
    ) {
      return state;
    }
    state.assistanceLevel = event.payload.level;
    state.visibleAssistanceLevel = event.payload.level;
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_route_selected') {
    const route = kc.microcycle.entryRouting.routes.find(
      (candidate) => candidate.route === event.payload.route,
    );
    if (
      transitionError(
        state,
        state.status === 'awaiting_route' &&
          event.payload.kcId === kc.id &&
          route !== undefined,
        'route_selection_not_allowed',
      )
    ) {
      return state;
    }
    if (
      route!.criteria.kind === 'convergent_evidence' &&
      distinctSignalFamilyCount(state.signals, route!.criteria.signalIds) <
        route!.criteria.minimumDistinctFamilies
    ) {
      return block(state, 'route_requires_convergent_evidence');
    }
    state.route = route!.route;
    state.sequenceActivityIds = [...route!.activityIds];
    state.assistanceLevel = route!.initialAssistanceLevel;
    state.consecutiveUnsupportedSuccesses = 0;
    setCurrentFromSequence(state, kc, 0);
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_response_evaluated') {
    const activity = currentActivity(definition, state);
    const presentation = state.activePresentation;
    const visibleAssistanceUsed = state.visibleAssistanceLevel !== null;
    if (
      transitionError(
        state,
        state.status === 'active' &&
          activity !== null &&
          presentation !== null &&
          presentation.activityId === activity.id &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          event.payload.familyId === activity.familyId &&
          activity.response.kind !== 'none' &&
          event.payload.assistanceLevel === state.assistanceLevel &&
          activity.assistance.allowedLevels.includes(event.payload.assistanceLevel) &&
          (!visibleAssistanceUsed || event.payload.assisted) &&
          (!event.payload.revealed || activity.assistance.revealAllowed),
        'response_evaluation_mismatch',
      )
    ) {
      return state;
    }
    addSignals(state, activity.familyId, event.payload.diagnosticSignalIds);
    const exposure = exposureFor(state, activity.familyId)!;
    exposure.revealed = exposure.revealed || event.payload.revealed;
    state.lastResponse = {
      activityId: activity.id,
      outcome: event.payload.outcome,
      assisted: event.payload.assisted,
      revealed: event.payload.revealed,
    };

    if (activity.phase === 'exit_near' || activity.phase === 'exit_changed') {
      if (event.payload.feedback && event.payload.feedback.length > 0) {
        return block(state, 'exit_feedback_must_remain_sealed');
      }
      const pairedFamilyReuse = state.sealedExitResults.some(
        (result) => result.familyId === activity.familyId,
      );
      const contamination =
        !presentation.freshAtPresentation
          ? 'prior_family_exposure'
          : pairedFamilyReuse
            ? 'paired_family_reuse'
            : event.payload.revealed
              ? 'revealed'
              : event.payload.assisted
                ? 'assisted'
                : event.payload.assistanceLevel !== 'A0'
                  ? 'support_not_a0'
                  : null;
      state.sealedExitResults.push({
        activityId: activity.id,
        familyId: activity.familyId,
        role: activity.phase === 'exit_near' ? 'near' : 'changed',
        outcome: event.payload.outcome,
        passedUnsupported:
          event.payload.outcome === 'correct' && contamination === null,
        contamination,
      });
      state.feedback = { sealed: true, entries: [] };
      state.activePresentation = null;
      state.lastResponse = null;
      state.visibleAssistanceLevel = null;

      if (activity.phase === 'exit_near') {
        const pair = activeExitPair(kc, state);
        if (pair.nearActivityId !== activity.id) {
          return block(state, 'unexpected_near_exit_activity');
        }
        const changedPosition = state.sequenceActivityIds.indexOf(pair.changedActivityId);
        if (changedPosition < 0) return block(state, 'changed_exit_not_in_sequence');
        setCurrentFromSequence(state, kc, changedPosition);
      } else {
        const pair = activeExitPair(kc, state);
        if (
          pair.changedActivityId !== activity.id ||
          state.sealedExitResults.length !== 2
        ) {
          return block(state, 'exit_pair_incomplete');
        }
        state.status = 'awaiting_exit_feedback';
      }
      return LessonRunStateSchema.parse(state);
    }

    state.feedback = {
      sealed: false,
      entries: event.payload.feedback ? [...event.payload.feedback] : [],
    };
    if (activity.phase === 'completion') {
      const decision = decideLessonAssistance({
        currentLevel: state.assistanceLevel,
        outcome: event.payload.outcome,
        assisted: event.payload.assisted || event.payload.revealed,
        consecutiveUnsupportedSuccesses: state.consecutiveUnsupportedSuccesses,
        successesToFade: kc.microcycle.fading.successesToFade,
      });
      state.assistanceLevel = decision.nextLevel;
      state.consecutiveUnsupportedSuccesses =
        decision.consecutiveUnsupportedSuccesses;
    }
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_activity_completed') {
    const activity = currentActivity(definition, state);
    const responseSatisfied =
      activity?.response.kind === 'none' || state.lastResponse?.activityId === activity?.id;
    if (
      transitionError(
        state,
        state.status === 'active' &&
          activity !== null &&
          state.activePresentation?.activityId === activity.id &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          responseSatisfied &&
          !['exit_near', 'exit_changed'].includes(activity.phase),
        'activity_completion_not_allowed',
      )
    ) {
      return state;
    }
    const exposure = exposureFor(state, activity.familyId);
    if (state.feedback && !state.feedback.sealed && exposure) exposure.feedbackSeen = true;
    setCurrentFromSequence(state, kc, state.sequencePosition + 1);
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_exit_feedback_released') {
    if (
      transitionError(
        state,
        state.status === 'awaiting_exit_feedback' &&
          event.payload.kcId === kc.id &&
          state.sealedExitResults.length === 2 &&
          new Set(event.payload.feedback.map((entry) => entry.activityId)).size === 2 &&
          event.payload.feedback.every((entry) =>
            state.sealedExitResults.some(
              (result) => result.activityId === entry.activityId,
            ),
          ),
        'exit_feedback_release_not_allowed',
      )
    ) {
      return state;
    }
    state.feedback = { sealed: false, entries: [...event.payload.feedback] };
    for (const result of state.sealedExitResults) {
      const exposure = exposureFor(state, result.familyId);
      if (exposure) exposure.feedbackSeen = true;
    }
    if (state.sealedExitResults.every((result) => result.passedUnsupported)) {
      return LessonRunStateSchema.parse(state);
    }
    if (state.repairCycles >= kc.microcycle.repairs.maximumCycles) {
      state.status = 'paused';
      state.pauseReason = 'repair_exhausted';
      state.resumeStatus = null;
      state.plannerReentryRequired = true;
      return LessonRunStateSchema.parse(state);
    }
    state.status = 'awaiting_repair';
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_repair_started') {
    const mapping = kc.microcycle.repairs.mappings.find(
      (candidate) => candidate.id === event.payload.repairRouteId,
    );
    if (
      transitionError(
        state,
        state.status === 'awaiting_repair' &&
          event.payload.kcId === kc.id &&
          mapping !== undefined &&
          state.repairCycles < kc.microcycle.repairs.maximumCycles,
        'repair_start_not_allowed',
      )
    ) {
      return state;
    }
    if (
      mapping!.kind === 'targeted' &&
      distinctSignalFamilyCount(state.signals, mapping!.signalIds) <
        mapping!.minimumDistinctFamilies
    ) {
      return block(state, 'targeted_repair_requires_convergent_evidence');
    }
    state.repairCycles += 1;
    const pair = kc.microcycle.pairedExit.attempts[state.repairCycles]!;
    state.sequenceActivityIds = [
      ...mapping!.activityIds,
      pair.nearActivityId,
      pair.changedActivityId,
    ];
    state.sealedExitResults = [];
    state.feedback = null;
    state.assistanceLevel = 'A3';
    state.consecutiveUnsupportedSuccesses = 0;
    setCurrentFromSequence(state, kc, 0);
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'kc_instructional_exit') {
    if (
      transitionError(
        state,
        state.status === 'awaiting_exit_feedback' &&
          state.feedback !== null &&
          !state.feedback.sealed &&
          state.sealedExitResults.length === 2 &&
          state.sealedExitResults.every((result) => result.passedUnsupported) &&
          event.payload.kcId === kc.id,
        'kc_exit_not_allowed',
      )
    ) {
      return state;
    }
    if (!state.exitedKcIds.includes(kc.id)) state.exitedKcIds.push(kc.id);
    const nextKc = definition.knowledgeComponents.find(
      (candidate) => !state.exitedKcIds.includes(candidate.id),
    );
    if (!nextKc) {
      state.status = 'complete';
      state.currentKcId = null;
      state.currentActivityId = null;
      state.phase = null;
      state.route = null;
      state.sequenceActivityIds = [];
      state.sequencePosition = 0;
      clearActivityTransient(state);
      return LessonRunStateSchema.parse(state);
    }
    state.currentKcId = nextKc.id;
    state.route = null;
    state.repairCycles = 0;
    state.signals = [];
    state.sealedExitResults = [];
    state.assistanceLevel = 'A3';
    state.consecutiveUnsupportedSuccesses = 0;
    state.sequenceActivityIds = [...nextKc.microcycle.entryRouting.probeActivityIds];
    setCurrentFromSequence(state, nextKc, 0);
    return LessonRunStateSchema.parse(state);
  }

  return block(state, 'unsupported_lesson_event');
}

export function replayLessonRun(
  initialState: LessonRunState,
  events: readonly unknown[],
  definitionInput: unknown,
  mode: LessonRuntimeMode,
): LessonRunState {
  return events.reduce(
    (state, event) => reduceLessonRun(state, event, definitionInput, mode),
    initialState,
  );
}

export interface EvaluatedLessonResponse {
  outcome: 'correct' | 'incorrect' | 'not_sure';
  diagnosticSignalIds: string[];
  feedback: LessonFeedbackEntry[];
}

/** Deterministic server-side evaluation. No model or client-provided correctness is accepted. */
export function evaluateLessonResponse(
  activity: ActivityDefinition,
  responseInput: unknown,
): EvaluatedLessonResponse {
  const response = LessonActivityResponseInputSchema.parse(responseInput);
  if (activity.response.kind === 'none') {
    throw new Error('This activity does not accept a response.');
  }
  if (response.kind === 'not_sure') {
    if (!activity.response.allowNotSure) throw new Error('Not-sure is not enabled.');
    const message =
      activity.response.kind === 'choice'
        ? activity.response.notSureFeedback
        : activity.response.rubric.notSureFeedback;
    return {
      outcome: 'not_sure',
      diagnosticSignalIds: [],
      feedback: [{ activityId: activity.id, tone: 'information', message }],
    };
  }

  if (activity.response.kind === 'choice') {
    if (response.kind !== 'choice') throw new Error('A choice response is required.');
    const choice = activity.response.choices.find(
      (candidate) => candidate.id === response.choiceId,
    );
    if (!choice) throw new Error('The choice id is not part of this activity.');
    const correct = activity.response.correctChoiceIds.includes(choice.id);
    return {
      outcome: correct ? 'correct' : 'incorrect',
      diagnosticSignalIds: [...choice.diagnosticSignalIds],
      feedback: [
        {
          activityId: activity.id,
          tone: correct ? 'correct' : 'incorrect',
          message: correct ? activity.response.correctFeedback : choice.feedback,
        },
      ],
    };
  }

  if (response.kind !== 'text') throw new Error('A text response is required.');
  const normalize = (value: string, caseSensitive: boolean) => {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    return caseSensitive ? trimmed : trimmed.toLocaleLowerCase();
  };
  const correct = activity.response.rubric.criteria
    .filter((criterion) => criterion.required)
    .every((criterion) =>
      criterion.acceptedAnswers.some(
        (answer) =>
          normalize(answer, criterion.caseSensitive) ===
          normalize(response.text, criterion.caseSensitive),
      ),
    );
  return {
    outcome: correct ? 'correct' : 'incorrect',
    diagnosticSignalIds: [],
    feedback: [
      {
        activityId: activity.id,
        tone: correct ? 'correct' : 'incorrect',
        message: correct
          ? activity.response.rubric.correctFeedback
          : activity.response.rubric.incorrectFeedback,
      },
    ],
  };
}

function safeActivity(
  definition: LessonDefinition,
  state: LessonRunState,
  activity: ActivityDefinition,
) {
  const kc = currentKc(definition, state)!;
  const response =
    activity.response.kind === 'none'
      ? ({ kind: 'none' } as const)
      : activity.response.kind === 'choice'
        ? ({
            kind: 'choice',
            legend: activity.response.legend,
            choices: activity.response.choices.map((choice) => ({
              id: choice.id,
              label: choice.label,
            })),
            allowNotSure: activity.response.allowNotSure,
          } as const)
        : ({
            kind: 'text',
            label: activity.response.label,
            placeholder: activity.response.placeholder,
            allowNotSure: activity.response.allowNotSure,
          } as const);
  const visibleHint =
    state.visibleAssistanceLevel === null
      ? null
      : (activity.assistance.hints.find(
          (hint) => hint.level === state.visibleAssistanceLevel,
        )?.text ?? null);
  const canRequestMore =
    !['exit_near', 'exit_changed'].includes(activity.phase) &&
    activity.assistance.hints.some(
      (hint) =>
        supportIndex(hint.level) <= supportIndex(state.assistanceLevel) &&
        hint.level !== state.visibleAssistanceLevel,
    );
  return {
    id: activity.id,
    kcId: activity.kcId,
    phase: activity.phase,
    title: activity.title,
    prompt: activity.prompt,
    instructions: [...activity.instructions],
    representations: activity.representationIds.map((id) => {
      const representation = kc.representations.find((candidate) => candidate.id === id)!;
      const longDescription =
        representation.alternatives.find(
          (alternative) => alternative.format === 'long_description',
        )?.content.join('\n') ?? null;
      const altText =
        representation.kind === 'text'
          ? null
          : (representation.alternatives.find((alternative) =>
              ['plain_text', 'long_description', 'data_table', 'transcript'].includes(
                alternative.format,
              ),
            )?.content.join('\n') ?? null);
      return {
        id: representation.id,
        kind: representation.kind,
        label: representation.label,
        body: [...representation.body],
        altText,
        longDescription,
        table: representation.table
          ? {
              caption: representation.table.caption,
              columns: [...representation.table.columns],
              rows: representation.table.rows.map((row) => [...row]),
            }
          : null,
      };
    }),
    response,
    assistance: {
      currentLevel: state.assistanceLevel,
      visibleHint,
      canRequestMore,
    },
    feedback:
      state.feedback && state.lastResponse?.activityId === activity.id
        ? structuredClone(state.feedback)
        : null,
  };
}

function safeCommon(
  definition: LessonDefinition | null,
  state: LessonRunState,
) {
  const kc = definition ? currentKc(definition, state) : null;
  const kcIndex =
    definition && kc
      ? definition.knowledgeComponents.findIndex((candidate) => candidate.id === kc.id)
      : -1;
  return {
    kind: 'v3_lesson' as const,
    schemaVersion: '1.0' as const,
    runId: state.pins.runId,
    lessonId: state.pins.lessonId,
    definitionVersion: state.pins.definitionVersion,
    lessonTitle: definition?.title ?? 'Lesson unavailable',
    kcId: kc?.id ?? null,
    kcTitle: kc?.title ?? null,
    route: state.route,
    progress: {
      kcOrdinal: kcIndex >= 0 ? kcIndex + 1 : null,
      kcCount: definition?.knowledgeComponents.length ?? 1,
      exitedKcCount: state.exitedKcIds.length,
    },
  };
}

/** Compiles canonical content into the strict learner-safe activity DTO. */
export function buildLessonStepView(
  definitionInput: unknown,
  stateInput: LessonRunState,
): LessonStepView {
  const state = LessonRunStateSchema.parse(stateInput);
  const parsed = LessonDefinitionSchema.safeParse(definitionInput);
  const definition = parsed.success ? parsed.data : null;
  const common = safeCommon(definition, state);

  if (state.status === 'invalid_content' || definition === null) {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'invalid_content',
      activity: null,
      availableActions: [],
      message: 'This lesson cannot run because its content definition is invalid.',
      issueCodes:
        state.invalidIssues.length > 0 ? state.invalidIssues : ['definition_parse_failed'],
    });
  }
  if (state.status === 'blocked') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'blocked',
      activity: null,
      availableActions: [],
      message: 'This lesson run is blocked because its event stream is inconsistent.',
      issueCodes: state.transitionErrors,
    });
  }
  if (state.status === 'paused') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'paused',
      activity: null,
      availableActions: state.plannerReentryRequired ? [] : ['resume'],
      message: state.plannerReentryRequired
        ? 'Two repair cycles are complete. Return to the planner for a new entry decision.'
        : 'Paused at the exact current checkpoint.',
      plannerReentryRequired: state.plannerReentryRequired,
    });
  }
  if (state.status === 'handoff') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'handoff',
      activity: null,
      availableActions: [],
      message: 'The planner created a new version-bound run for reentry.',
      nextRunId: state.handoffRunId,
    });
  }
  if (state.status === 'complete') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'complete',
      activity: null,
      availableActions: [],
      message: 'Every required KC reached instructional exit.',
      completion: {
        kind: 'lesson_completion',
        instructionalExitKcIds: [...state.exitedKcIds],
      },
    });
  }

  const activity = currentActivity(definition, state);
  const safe = activity ? safeActivity(definition, state, activity) : null;
  if (state.status === 'awaiting_route') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'route_pending',
      activity: null,
      availableActions: ['pause'],
      message: 'Entry evidence is sealed while the authority selects a deterministic route.',
    });
  }
  if (state.status === 'awaiting_repair') {
    const feedbackReleased = state.feedback !== null && !state.feedback.sealed;
    return LessonStepViewSchema.parse({
      ...common,
      status: 'repair_pending',
      activity: safe ? { ...safe, feedback: state.feedback } : null,
      availableActions: feedbackReleased && safe ? ['continue', 'pause'] : ['pause'],
      message: feedbackReleased
        ? 'Review both sealed responses, then continue to targeted repair.'
        : 'The authority is selecting an eligible repair route.',
    });
  }
  if (state.status === 'awaiting_exit_feedback') {
    const feedbackReleased = state.feedback !== null && !state.feedback.sealed;
    return LessonStepViewSchema.parse({
      ...common,
      status: 'feedback_pending',
      activity: safe
        ? {
            ...safe,
            feedback: state.feedback,
          }
        : null,
      availableActions:
        feedbackReleased &&
        state.sealedExitResults.every((result) => result.passedUnsupported)
          ? ['continue', 'pause']
          : ['pause'],
      message: feedbackReleased
        ? 'Both exit responses are sealed and feedback is now available.'
        : 'Feedback remains sealed until both exit responses are submitted.',
    });
  }

  if (!activity || !safe) {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'blocked',
      activity: null,
      availableActions: [],
      message: 'The current activity is missing.',
      issueCodes: ['current_activity_missing'],
    });
  }

  const actions: Array<
    'present' | 'submit_response' | 'continue' | 'request_assistance' | 'pause'
  > = [];
  if (state.activePresentation === null) {
    actions.push('present');
  } else if (activity.response.kind === 'none' || state.lastResponse?.activityId === activity.id) {
    actions.push('continue');
  } else {
    actions.push('submit_response');
    if (safe.assistance.canRequestMore) actions.push('request_assistance');
  }
  actions.push('pause');
  return LessonStepViewSchema.parse({
    ...common,
    status: 'active',
    activity: safe,
    availableActions: actions,
    message: null,
  });
}

export interface LessonDispatchResult {
  state: LessonRunState;
  events: LessonRunEvent[];
}

function eligibleEntryRoute(
  kc: KnowledgeComponentDefinition,
  state: LessonRunState,
) {
  const priority = ['prerequisite', 'misconception', 'concise'] as const;
  for (const routeName of priority) {
    const route = kc.microcycle.entryRouting.routes.find(
      (candidate) => candidate.route === routeName,
    );
    if (
      route?.criteria.kind === 'convergent_evidence' &&
      distinctSignalFamilyCount(state.signals, route.criteria.signalIds) >=
        route.criteria.minimumDistinctFamilies
    ) {
      return route;
    }
  }
  return kc.microcycle.entryRouting.routes.find(
    (candidate) => candidate.route === 'standard',
  )!;
}

function eligibleRepairMapping(
  kc: KnowledgeComponentDefinition,
  state: LessonRunState,
) {
  for (const mapping of kc.microcycle.repairs.mappings) {
    if (
      mapping.kind === 'targeted' &&
      distinctSignalFamilyCount(state.signals, mapping.signalIds) >=
        mapping.minimumDistinctFamilies
    ) {
      return mapping;
    }
  }
  return kc.microcycle.repairs.mappings.find((mapping) => mapping.kind === 'generic')!;
}

function genericExitFeedback(
  activity: ActivityDefinition,
  outcome: 'correct' | 'incorrect' | 'not_sure',
): LessonFeedbackEntry {
  let message = 'Review this response before the next fresh check.';
  if (activity.response.kind === 'choice') {
    message =
      outcome === 'correct'
        ? activity.response.correctFeedback
        : outcome === 'not_sure'
          ? activity.response.notSureFeedback
          : 'This response did not meet the instructional exit check.';
  } else if (activity.response.kind === 'text') {
    message =
      outcome === 'correct'
        ? activity.response.rubric.correctFeedback
        : outcome === 'not_sure'
          ? activity.response.rubric.notSureFeedback
          : activity.response.rubric.incorrectFeedback;
  }
  return {
    activityId: activity.id,
    tone:
      outcome === 'correct'
        ? 'correct'
        : outcome === 'incorrect'
          ? 'incorrect'
          : 'information',
    message,
  };
}

function nextAssistanceHint(activity: ActivityDefinition, state: LessonRunState) {
  const candidates = activity.assistance.hints
    .filter(
      (hint) =>
        supportIndex(hint.level) <= supportIndex(state.assistanceLevel) &&
        hint.level !== state.visibleAssistanceLevel,
    )
    .sort((left, right) => supportIndex(right.level) - supportIndex(left.level));
  return candidates[0] ?? null;
}

/**
 * Server-side command orchestrator. It derives scoring, routing, assistance,
 * feedback release, and repair choice from canonical content and run state.
 */
export function dispatchLessonRunAction(
  stateInput: LessonRunState,
  definitionInput: unknown,
  actionInput: unknown,
  mode: LessonRuntimeMode,
  clock: Clock = systemClock,
): LessonDispatchResult {
  const action: LessonActionInput = LessonActionInputSchema.parse(actionInput);
  const definition = LessonDefinitionSchema.parse(definitionInput);
  let state = LessonRunStateSchema.parse(stateInput);
  const events: LessonRunEvent[] = [];

  const append = (type: LessonRunEvent['type'], payload: Record<string, unknown>) => {
    const event = LessonRunEventSchema.parse({
      schemaVersion: '1.0',
      eventId: newEventId(),
      idempotencyKey: newIdempotencyKey(),
      runId: state.pins.runId,
      lessonId: state.pins.lessonId,
      definitionVersion: state.pins.definitionVersion,
      contentRelease: state.pins.contentRelease,
      policies: state.pins.policies,
      sequence: state.lastSequence + 1,
      occurredAt: clock.now(),
      type,
      payload,
    });
    state = reduceLessonRun(state, event, definition, mode);
    events.push(event);
  };

  if (action.type === 'pause') {
    append('lesson_run_paused', { reason: 'learner' });
    return { state, events };
  }
  if (action.type === 'resume') {
    append('lesson_run_resumed', {});
    return { state, events };
  }

  const kc = currentKc(definition, state);
  const activity = currentActivity(definition, state);
  if (!kc) throw new Error('The lesson run has no active KC.');

  if (action.type === 'present') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The presented activity does not match the current run.');
    }
    append('lesson_activity_presented', {
      kcId: kc.id,
      activityId: activity.id,
      familyId: activity.familyId,
    });
    return { state, events };
  }

  if (action.type === 'request_assistance') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The assistance request does not match the current activity.');
    }
    const hint = nextAssistanceHint(activity, state);
    if (!hint) throw new Error('No additional deterministic support is available.');
    append('lesson_assistance_revealed', {
      kcId: kc.id,
      activityId: activity.id,
      level: hint.level,
    });
    return { state, events };
  }

  if (action.type === 'submit_response') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The response does not match the current activity.');
    }
    const evaluated = evaluateLessonResponse(activity, action.response);
    const isExit =
      activity.phase === 'exit_near' || activity.phase === 'exit_changed';
    append('lesson_response_evaluated', {
      kcId: kc.id,
      activityId: activity.id,
      familyId: activity.familyId,
      outcome: evaluated.outcome,
      assistanceLevel: state.assistanceLevel,
      assisted: state.visibleAssistanceLevel !== null,
      revealed: false,
      diagnosticSignalIds: evaluated.diagnosticSignalIds,
      ...(isExit ? {} : { feedback: evaluated.feedback }),
    });

    if (state.status === 'awaiting_exit_feedback') {
      const feedback = state.sealedExitResults.map((result) =>
        genericExitFeedback(activityById(kc, result.activityId), result.outcome),
      );
      append('lesson_exit_feedback_released', { kcId: kc.id, feedback });
    }
    return { state, events };
  }

  if (action.type === 'continue') {
    if (state.status === 'awaiting_exit_feedback') {
      append('kc_instructional_exit', { kcId: kc.id });
      return { state, events };
    }
    if (state.status === 'awaiting_repair') {
      const mapping = eligibleRepairMapping(kc, state);
      append('lesson_repair_started', {
        kcId: kc.id,
        repairRouteId: mapping.id,
      });
      return { state, events };
    }
    if (!activity || action.activityId !== activity.id) {
      throw new Error('Continue does not match the current activity.');
    }
    append('lesson_activity_completed', {
      kcId: kc.id,
      activityId: activity.id,
    });
    if (state.status === 'awaiting_route') {
      const route = eligibleEntryRoute(kc, state);
      append('lesson_route_selected', { kcId: kc.id, route: route.route });
    }
    return { state, events };
  }

  return { state, events };
}

export function startLessonRun(
  stateInput: LessonRunState,
  definitionInput: unknown,
  mode: LessonRuntimeMode,
  clock: Clock = systemClock,
): LessonDispatchResult {
  const state = LessonRunStateSchema.parse(stateInput);
  const event = LessonRunEventSchema.parse({
    schemaVersion: '1.0',
    eventId: newEventId(),
    idempotencyKey: newIdempotencyKey(),
    runId: state.pins.runId,
    lessonId: state.pins.lessonId,
    definitionVersion: state.pins.definitionVersion,
    contentRelease: state.pins.contentRelease,
    policies: state.pins.policies,
    sequence: state.lastSequence + 1,
    occurredAt: clock.now(),
    type: 'lesson_run_started',
    payload: {},
  });
  return {
    state: reduceLessonRun(state, event, definitionInput, mode),
    events: [event],
  };
}

export const parseLessonActionResponse = (
  input: unknown,
): LessonActivityResponseInput => LessonActivityResponseInputSchema.parse(input);
