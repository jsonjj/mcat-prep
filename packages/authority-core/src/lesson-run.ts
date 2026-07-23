import { createHash } from 'node:crypto';
import {
  LessonDefinitionSchema,
  type ActivityDefinition,
  type CompletionPools,
  type KnowledgeComponentDefinition,
  type LessonDefinition,
} from '@mcat/content';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LessonActionCommandSchema,
  LessonActivityResponseInputSchema,
  LessonActionInputSchema,
  LessonRunEventSchema,
  LessonRunLineageSchema,
  LessonRunPinsSchema,
  LessonRunStateSchema,
  LessonStepViewSchema,
  type AssistanceLevel,
  type Clock,
  type LessonActionCommand,
  type LessonActionInput,
  type LessonActivityResponseInput,
  type LessonFeedbackEntry,
  type LessonRunEvent,
  type LessonRunLineage,
  type LessonRunPins,
  type LessonRunState,
  type LessonStepView,
  newEventId,
  newIdempotencyKey,
  newTaskInstanceId,
  systemClock,
} from '@mcat/contracts';
import { decideLessonAssistance, distinctSignalFamilyCount } from '@mcat/policies';

export type LessonRuntimeMode = 'production' | 'test_fixture';

const SUPPORT_LADDER: readonly AssistanceLevel[] = ['A3', 'A2', 'A1', 'A0'];
const supportIndex = (level: AssistanceLevel): number => SUPPORT_LADDER.indexOf(level);
const issueCode = (path: PropertyKey[], code: string): string =>
  `${code}:${path.map(String).join('.') || 'root'}`;

const contentPin = (pins: LessonRunPins) => ({
  lessonId: pins.lessonId,
  definitionVersion: pins.definitionVersion,
  reviewedContentHash: pins.reviewedContentHash,
});

const initialLineage = (pins: LessonRunPins): LessonRunLineage =>
  LessonRunLineageSchema.parse({
    rootRunId: pins.runId,
    parentRunId: null,
    generation: 0,
    inheritedFromRunIds: [],
    reviewedContentPins: [contentPin(pins)],
  });

function invalidState(
  pins: LessonRunPins,
  issues: string[],
  lineage: LessonRunLineage = initialLineage(pins),
): LessonRunState {
  return LessonRunStateSchema.parse({
    schemaVersion: '1.1',
    pins,
    lineage,
    status: 'invalid_content',
    currentKcId: null,
    currentActivityId: null,
    phase: null,
    route: null,
    sequenceActivityIds: [],
    sequencePosition: 0,
    sequencePurpose: null,
    assistanceLevel: 'A3',
    consecutiveUnsupportedSuccesses: 0,
    completionContext: null,
    completionAttemptCounts: { A3: 0, A2: 0, A1: 0, A0: 0 },
    completionUsedActivityIds: [],
    completionA0Successes: 0,
    completionReadyForExit: false,
    repairCycles: 0,
    exitedKcIds: [],
    signals: [],
    objectiveFeatures: [],
    exposures: [],
    activePresentation: null,
    lastResponse: null,
    sealedExitResults: [],
    activeExitPairId: null,
    usedExitPairIds: [],
    visibleAssistanceLevel: null,
    feedback: null,
    groupedFeedback: null,
    authorityPrivateFeedback: { sealedEntry: [], sealedExit: [] },
    resumeStatus: null,
    pauseReason: null,
    plannerReentryRequired: false,
    handoffRunId: null,
    handoffPins: null,
    handoffLineage: null,
    appliedEventIds: [],
    appliedIdempotencyKeys: [],
    lastSequence: -1,
    invalidIssues: issues,
    transitionErrors: [],
  });
}

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
  const definition = parsed.data;
  const issues: string[] = [];
  if (definition.id !== pins.lessonId) issues.push('lesson_id_pin_mismatch');
  if (definition.definitionVersion !== pins.definitionVersion) {
    issues.push('definition_version_pin_mismatch');
  }
  if (definition.contentRelease !== pins.contentRelease) {
    issues.push('content_release_pin_mismatch');
  }
  if (definition.contentDigest.sha256 !== pins.reviewedContentHash) {
    issues.push('reviewed_content_hash_pin_mismatch');
  }
  if (canonicalJson(definition.registryBinding.registry) !== canonicalJson(pins.registry)) {
    issues.push('registry_freeze_pin_mismatch');
  }
  if (
    mode === 'production' &&
    (definition.testOnly ||
      definition.status !== 'published' ||
      definition.publicationIntent !== 'production' ||
      definition.registryBinding.mode !== 'canonical')
  ) {
    issues.push('unpublished_or_test_content_forbidden');
  }
  if (mode === 'test_fixture' && !definition.testOnly) {
    issues.push('test_fixture_mode_requires_test_only_content');
  }
  return { definition: issues.length === 0 ? definition : null, issues };
}

function activityById(kc: KnowledgeComponentDefinition, activityId: string): ActivityDefinition {
  const activity = kc.activities.find((candidate) => candidate.id === activityId);
  if (!activity) throw new Error(`Validated definition is missing activity ${activityId}.`);
  return activity;
}

function currentKc(
  definition: LessonDefinition,
  state: LessonRunState,
): KnowledgeComponentDefinition | null {
  return (
    definition.knowledgeComponents.find((candidate) => candidate.id === state.currentKcId) ?? null
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

function exposureFor(state: LessonRunState, familyId: string) {
  return state.exposures.find((exposure) => exposure.familyId === familyId);
}

function familyIsFresh(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  activityId: string,
): boolean {
  return exposureFor(state, activityById(kc, activityId).familyId) === undefined;
}

function selectFreshActivities(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  candidateIds: readonly string[],
  count: number,
): ActivityDefinition[] {
  return candidateIds
    .map((id) => activityById(kc, id))
    .filter((activity) => exposureFor(state, activity.familyId) === undefined)
    .slice(0, count);
}

function clearActivityTransient(state: LessonRunState): void {
  state.activePresentation = null;
  state.lastResponse = null;
  state.visibleAssistanceLevel = null;
  state.feedback = null;
}

function clearCompletionState(state: LessonRunState): void {
  state.completionContext = null;
  state.completionAttemptCounts = { A3: 0, A2: 0, A1: 0, A0: 0 };
  state.completionUsedActivityIds = [];
  state.completionA0Successes = 0;
  state.completionReadyForExit = false;
}

function pauseForPlanner(
  state: LessonRunState,
  reason:
    | 'repair_exhausted'
    | 'entry_pool_exhausted'
    | 'completion_exhausted'
    | 'exit_pool_exhausted',
): void {
  state.status = 'paused';
  state.pauseReason = reason;
  state.resumeStatus = null;
  state.plannerReentryRequired = true;
  state.currentActivityId = null;
  state.phase = 'handoff';
  clearActivityTransient(state);
}

function setCurrentFromSequence(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  position: number,
): boolean {
  state.sequencePosition = position;
  const id = state.sequenceActivityIds[position];
  if (id === undefined) {
    state.currentActivityId = null;
    state.phase = null;
    clearActivityTransient(state);
    return false;
  }
  const activity = activityById(kc, id);
  state.currentActivityId = activity.id;
  state.phase = activity.phase;
  state.status = 'active';
  clearActivityTransient(state);
  return true;
}

function startKc(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  status: 'ready' | 'active',
): void {
  const probes = selectFreshActivities(
    state,
    kc,
    kc.microcycle.entryRouting.probeActivityIds,
    kc.microcycle.entryRouting.probeCount,
  );
  state.currentKcId = kc.id;
  state.route = null;
  state.repairCycles = 0;
  state.signals = [];
  state.objectiveFeatures = [];
  state.sealedExitResults = [];
  state.activeExitPairId = null;
  state.assistanceLevel = 'A3';
  state.consecutiveUnsupportedSuccesses = 0;
  state.groupedFeedback = null;
  state.authorityPrivateFeedback = { sealedEntry: [], sealedExit: [] };
  clearCompletionState(state);
  if (probes.length !== kc.microcycle.entryRouting.probeCount) {
    pauseForPlanner(state, 'entry_pool_exhausted');
    return;
  }
  state.sequenceActivityIds = probes.map((activity) => activity.id);
  state.sequencePosition = 0;
  state.sequencePurpose = 'entry';
  state.currentActivityId = probes[0]!.id;
  state.phase = probes[0]!.phase;
  state.status = status;
  clearActivityTransient(state);
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
  const state = invalidState(pins, []);
  startKc(state, checked.definition.knowledgeComponents[0]!, 'ready');
  state.invalidIssues = [];
  return LessonRunStateSchema.parse(state);
}

const expectedReentryLineage = (
  parent: LessonRunState,
  nextPins: LessonRunPins,
): LessonRunLineage => {
  const pins = [...parent.lineage.reviewedContentPins];
  const nextContentPin = contentPin(nextPins);
  if (
    !pins.some(
      (pin) =>
        pin.lessonId === nextContentPin.lessonId &&
        pin.definitionVersion === nextContentPin.definitionVersion &&
        pin.reviewedContentHash === nextContentPin.reviewedContentHash,
    )
  ) {
    pins.push(nextContentPin);
  }
  return LessonRunLineageSchema.parse({
    rootRunId: parent.lineage.rootRunId,
    parentRunId: parent.pins.runId,
    generation: parent.lineage.generation + 1,
    inheritedFromRunIds: [...new Set([...parent.lineage.inheritedFromRunIds, parent.pins.runId])],
    reviewedContentPins: pins,
  });
};

const pinsMatchExceptRun = (left: LessonRunPins, right: LessonRunPins): boolean => {
  const { runId: _leftRun, ...leftRest } = left;
  const { runId: _rightRun, ...rightRest } = right;
  return canonicalJson(leftRest) === canonicalJson(rightRest);
};

/**
 * Creates a reentry run only from an accepted planner handoff. Every family,
 * key, feedback, and reveal exposure is inherited before replacement selection.
 */
export function initializeLessonReentryRun(
  definitionInput: unknown,
  pinsInput: LessonRunPins,
  mode: LessonRuntimeMode,
  parentInput: LessonRunState,
): LessonRunState {
  const pins = LessonRunPinsSchema.parse(pinsInput);
  const parent = LessonRunStateSchema.parse(parentInput);
  const checked = definitionIssues(definitionInput, pins, mode);
  const issues = [...checked.issues];
  if (parent.status !== 'handoff') issues.push('parent_not_handed_off');
  if (pins.runId === parent.pins.runId) issues.push('same_run_reentry_forbidden');
  if (!parent.handoffPins || canonicalJson(parent.handoffPins) !== canonicalJson(pins)) {
    issues.push('handoff_pin_mismatch');
  }
  const expectedLineage = expectedReentryLineage(parent, pins);
  if (
    !parent.handoffLineage ||
    canonicalJson(parent.handoffLineage) !== canonicalJson(expectedLineage)
  ) {
    issues.push('handoff_lineage_mismatch');
  }
  const maxGeneration = checked.definition
    ? Math.min(
        ...checked.definition.knowledgeComponents.map(
          (kc) => kc.microcycle.fading.maxReentryGenerations,
        ),
      )
    : 0;
  if (expectedLineage.generation > maxGeneration) issues.push('reentry_generation_exhausted');
  if (!checked.definition || issues.length > 0) {
    return invalidState(pins, issues, expectedLineage);
  }

  const state = invalidState(pins, [], expectedLineage);
  state.exposures = structuredClone(parent.exposures);
  state.exitedKcIds = [...parent.exitedKcIds];
  state.usedExitPairIds = [...parent.usedExitPairIds];
  const target =
    checked.definition.knowledgeComponents.find((kc) => kc.id === parent.currentKcId) ??
    checked.definition.knowledgeComponents.find((kc) => !state.exitedKcIds.includes(kc.id));
  if (!target) {
    state.status = 'complete';
    state.currentKcId = null;
    state.invalidIssues = [];
    return LessonRunStateSchema.parse(state);
  }
  startKc(state, target, 'ready');
  state.invalidIssues = [];
  return LessonRunStateSchema.parse(state);
}

function block(state: LessonRunState, code: string): LessonRunState {
  state.status = 'blocked';
  state.currentActivityId = null;
  state.phase = null;
  state.transitionErrors.push(code);
  return LessonRunStateSchema.parse(state);
}

function policiesEqual(left: LessonRunPins['policies'], right: LessonRunPins['policies']): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function eventPinsMatch(state: LessonRunState, event: LessonRunEvent): boolean {
  return (
    event.runId === state.pins.runId &&
    event.lessonId === state.pins.lessonId &&
    event.definitionVersion === state.pins.definitionVersion &&
    event.reviewedContentHash === state.pins.reviewedContentHash &&
    event.contentRelease === state.pins.contentRelease &&
    canonicalJson(event.registry) === canonicalJson(state.pins.registry) &&
    policiesEqual(event.policies, state.pins.policies)
  );
}

function recordEvent(state: LessonRunState, event: LessonRunEvent): void {
  state.appliedEventIds.push(event.eventId);
  state.appliedIdempotencyKeys.push(event.idempotencyKey);
  state.lastSequence = event.sequence;
}

function addEvidence(
  evidence: { signalId: string; familyIds: string[] }[],
  familyId: string,
  ids: readonly string[],
): void {
  for (const id of new Set(ids)) {
    const existing = evidence.find((entry) => entry.signalId === id);
    if (!existing) evidence.push({ signalId: id, familyIds: [familyId] });
    else if (!existing.familyIds.includes(familyId)) existing.familyIds.push(familyId);
  }
}

function addObjectiveFeatures(
  state: LessonRunState,
  familyId: string,
  ids: readonly string[],
): void {
  for (const id of new Set(ids)) {
    const existing = state.objectiveFeatures.find((entry) => entry.featureId === id);
    if (!existing) state.objectiveFeatures.push({ featureId: id, familyIds: [familyId] });
    else if (!existing.familyIds.includes(familyId)) existing.familyIds.push(familyId);
  }
}

function transitionError(
  state: LessonRunState,
  condition: boolean,
  code: string,
): condition is false {
  if (!condition) block(state, code);
  return !condition;
}

function completionPoolsFor(
  kc: KnowledgeComponentDefinition,
  state: LessonRunState,
): CompletionPools {
  if (state.completionContext === 'repair') {
    return kc.microcycle.repairs.cycles[state.repairCycles - 1]!.recoveryPools;
  }
  return kc.microcycle.completionPools;
}

function scheduleCompletionActivity(state: LessonRunState, kc: KnowledgeComponentDefinition): void {
  const level = state.assistanceLevel;
  const max = kc.microcycle.fading.maxAttemptsPerLevel;
  if (state.completionAttemptCounts[level] >= max) {
    pauseForPlanner(state, 'completion_exhausted');
    return;
  }
  const pools = completionPoolsFor(kc, state);
  const next = pools[level]
    .map((id) => activityById(kc, id))
    .find(
      (activity) =>
        !state.completionUsedActivityIds.includes(activity.id) &&
        exposureFor(state, activity.familyId) === undefined,
    );
  if (!next) {
    pauseForPlanner(state, 'completion_exhausted');
    return;
  }
  state.completionUsedActivityIds.push(next.id);
  state.sequenceActivityIds = [next.id];
  state.sequencePosition = 0;
  state.sequencePurpose = null;
  state.currentActivityId = next.id;
  state.phase = next.phase;
  state.status = 'active';
  clearActivityTransient(state);
}

function enterCompletion(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  context: 'initial' | 'repair',
): void {
  state.completionContext = context;
  state.completionAttemptCounts = { A3: 0, A2: 0, A1: 0, A0: 0 };
  state.completionUsedActivityIds = [];
  state.completionA0Successes = 0;
  state.completionReadyForExit = false;
  state.consecutiveUnsupportedSuccesses = 0;
  scheduleCompletionActivity(state, kc);
}

function selectExitPair(kc: KnowledgeComponentDefinition, state: LessonRunState) {
  return kc.microcycle.pairedExit.pairs.find(
    (pair) =>
      !state.usedExitPairIds.includes(pair.id) &&
      familyIsFresh(state, kc, pair.nearActivityId) &&
      familyIsFresh(state, kc, pair.changedActivityId),
  );
}

function schedulePostCompletion(state: LessonRunState, kc: KnowledgeComponentDefinition): void {
  const pair = selectExitPair(kc, state);
  if (!pair) {
    pauseForPlanner(state, 'exit_pool_exhausted');
    return;
  }
  state.activeExitPairId = pair.id;
  state.usedExitPairIds.push(pair.id);
  state.sealedExitResults = [];
  state.authorityPrivateFeedback.sealedExit = [];
  const includeContrast = state.completionContext === 'initial';
  state.sequenceActivityIds = [
    ...(includeContrast ? kc.microcycle.contrastActivityIds : []),
    pair.nearActivityId,
    pair.changedActivityId,
  ];
  state.sequencePurpose = 'post_completion';
  clearCompletionState(state);
  setCurrentFromSequence(state, kc, 0);
}

function activeExitPair(kc: KnowledgeComponentDefinition, state: LessonRunState) {
  return kc.microcycle.pairedExit.pairs.find((pair) => pair.id === state.activeExitPairId);
}

function objectiveFamilyCount(
  state: LessonRunState,
  signalIds: readonly string[],
  objectiveFeatureIds: readonly string[],
): number {
  const families = new Set<string>();
  const signals = new Set(signalIds);
  const features = new Set(objectiveFeatureIds);
  state.signals.forEach((signal) => {
    if (signals.has(signal.signalId)) signal.familyIds.forEach((family) => families.add(family));
  });
  state.objectiveFeatures.forEach((feature) => {
    if (features.has(feature.featureId)) {
      feature.familyIds.forEach((family) => families.add(family));
    }
  });
  return families.size;
}

function repairMappingEligible(
  mapping: KnowledgeComponentDefinition['microcycle']['repairs']['cycles'][number]['mappings'][number],
  state: LessonRunState,
): boolean {
  return (
    mapping.kind === 'generic' ||
    objectiveFamilyCount(state, mapping.signalIds, mapping.objectiveFeatureIds) >=
      mapping.minimumDistinctFamilies
  );
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
  if (event.sequence !== state.lastSequence + 1) return block(state, 'event_sequence_gap');

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
        state.status === 'paused' && !state.plannerReentryRequired && state.resumeStatus !== null,
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
    const nextPins = event.payload.nextRunPins;
    const expected = expectedReentryLineage(state, nextPins);
    const maxGeneration = Math.min(
      ...definition.knowledgeComponents.map((kc) => kc.microcycle.fading.maxReentryGenerations),
    );
    if (
      transitionError(
        state,
        state.status === 'paused' &&
          state.plannerReentryRequired &&
          nextPins.runId !== state.pins.runId &&
          pinsMatchExceptRun(state.pins, nextPins) &&
          canonicalJson(event.payload.nextLineage) === canonicalJson(expected) &&
          expected.generation <= maxGeneration,
        'planner_handoff_not_allowed',
      )
    ) {
      return state;
    }
    state.status = 'handoff';
    state.handoffRunId = nextPins.runId;
    state.handoffPins = structuredClone(nextPins);
    state.handoffLineage = structuredClone(event.payload.nextLineage);
    return LessonRunStateSchema.parse(state);
  }

  const kc = currentKc(definition, state);
  if (!kc) return block(state, 'current_kc_missing');

  if (event.type === 'lesson_activity_presented') {
    const activity = currentActivity(definition, state);
    if (!activity) return block(state, 'presentation_activity_missing');
    if (
      transitionError(
        state,
        state.status === 'active' &&
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
        answerKeySeen: false,
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
          state.activePresentation?.activityId === activity.id &&
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
        state.status === 'awaiting_route' && event.payload.kcId === kc.id && route !== undefined,
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
    state.sequenceActivityIds = [...route!.instructionActivityIds];
    state.sequencePurpose = 'route_instruction';
    state.assistanceLevel = route!.initialAssistanceLevel;
    state.consecutiveUnsupportedSuccesses = 0;
    state.groupedFeedback = {
      kind: 'entry',
      entries: structuredClone(state.authorityPrivateFeedback.sealedEntry),
    };
    state.authorityPrivateFeedback.sealedEntry = [];
    state.groupedFeedback.entries.forEach((entry) => {
      const activity = activityById(kc, entry.activityId);
      const exposure = exposureFor(state, activity.familyId);
      if (exposure) {
        exposure.feedbackSeen = true;
        exposure.answerKeySeen = true;
      }
    });
    setCurrentFromSequence(state, kc, 0);
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_response_evaluated') {
    const activity = currentActivity(definition, state);
    const presentation = state.activePresentation;
    if (!activity || !presentation) return block(state, 'response_activity_missing');
    if (
      transitionError(
        state,
        state.status === 'active' &&
          presentation.activityId === activity.id &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          event.payload.familyId === activity.familyId &&
          activity.response.kind !== 'none' &&
          event.payload.assistanceLevel === state.assistanceLevel &&
          activity.assistance.allowedLevels.includes(event.payload.assistanceLevel) &&
          (state.visibleAssistanceLevel === null || event.payload.assisted) &&
          (!event.payload.revealed || activity.assistance.revealAllowed) &&
          event.payload.authorityFeedback.every((entry) => entry.activityId === activity.id),
        'response_evaluation_mismatch',
      )
    ) {
      return state;
    }
    addEvidence(state.signals, activity.familyId, event.payload.diagnosticSignalIds);
    addObjectiveFeatures(state, activity.familyId, event.payload.objectiveFeatureIds);
    const exposure = exposureFor(state, activity.familyId)!;
    exposure.revealed = exposure.revealed || event.payload.revealed;
    state.lastResponse = {
      activityId: activity.id,
      outcome: event.payload.outcome,
      assisted: event.payload.assisted,
      revealed: event.payload.revealed,
    };

    if (activity.phase === 'enter_routing') {
      state.authorityPrivateFeedback.sealedEntry.push(
        ...structuredClone(event.payload.authorityFeedback),
      );
      state.feedback = { sealed: true, entries: [] };
      return LessonRunStateSchema.parse(state);
    }

    if (activity.phase === 'exit_near' || activity.phase === 'exit_changed') {
      const pair = activeExitPair(kc, state);
      if (!pair) return block(state, 'active_exit_pair_missing');
      const pairedFamilyReuse = state.sealedExitResults.some(
        (result) => result.familyId === activity.familyId,
      );
      const contamination = !presentation.freshAtPresentation
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
        passedUnsupported: event.payload.outcome === 'correct' && contamination === null,
        contamination,
      });
      state.authorityPrivateFeedback.sealedExit.push(
        ...structuredClone(event.payload.authorityFeedback),
      );
      state.feedback = { sealed: true, entries: [] };
      clearActivityTransient(state);
      state.feedback = { sealed: true, entries: [] };
      if (activity.phase === 'exit_near') {
        if (pair.nearActivityId !== activity.id) {
          return block(state, 'unexpected_near_exit_activity');
        }
        const changedPosition = state.sequenceActivityIds.indexOf(pair.changedActivityId);
        if (changedPosition < 0) return block(state, 'changed_exit_not_in_sequence');
        setCurrentFromSequence(state, kc, changedPosition);
        state.feedback = { sealed: true, entries: [] };
      } else {
        if (pair.changedActivityId !== activity.id || state.sealedExitResults.length !== 2) {
          return block(state, 'exit_pair_incomplete');
        }
        state.status = 'awaiting_exit_feedback';
        state.currentActivityId = null;
        state.phase = null;
      }
      return LessonRunStateSchema.parse(state);
    }

    state.feedback = {
      sealed: false,
      entries: structuredClone(event.payload.authorityFeedback),
    };
    if (activity.phase === 'completion') {
      const attemptedLevel = state.assistanceLevel;
      state.completionAttemptCounts[attemptedLevel] += 1;
      const assisted = event.payload.assisted || event.payload.revealed;
      const decision = decideLessonAssistance({
        currentLevel: attemptedLevel,
        outcome: event.payload.outcome,
        assisted,
        consecutiveUnsupportedSuccesses: state.consecutiveUnsupportedSuccesses,
        successesToFade: kc.microcycle.fading.successesToFade,
      });
      if (attemptedLevel === 'A0' && event.payload.outcome === 'correct' && !assisted) {
        state.completionA0Successes += 1;
      } else {
        state.completionA0Successes = 0;
      }
      state.completionReadyForExit =
        state.completionA0Successes >= kc.microcycle.fading.requiredA0Successes;
      state.assistanceLevel = decision.nextLevel;
      state.consecutiveUnsupportedSuccesses = decision.consecutiveUnsupportedSuccesses;
    }
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_activity_completed') {
    const activity = currentActivity(definition, state);
    if (!activity) return block(state, 'completion_activity_missing');
    const responseSatisfied =
      activity.response.kind === 'none' || state.lastResponse?.activityId === activity.id;
    if (
      transitionError(
        state,
        state.status === 'active' &&
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
    if (state.feedback && !state.feedback.sealed && exposure) {
      exposure.feedbackSeen = true;
      exposure.answerKeySeen = activity.response.kind !== 'none';
    }
    if (state.groupedFeedback?.kind === 'entry') state.groupedFeedback = null;

    if (activity.phase === 'completion') {
      clearActivityTransient(state);
      if (state.completionReadyForExit) schedulePostCompletion(state, kc);
      else scheduleCompletionActivity(state, kc);
      return LessonRunStateSchema.parse(state);
    }

    const nextPosition = state.sequencePosition + 1;
    if (setCurrentFromSequence(state, kc, nextPosition)) {
      return LessonRunStateSchema.parse(state);
    }
    if (state.sequencePurpose === 'entry') {
      state.status = 'awaiting_route';
      state.phase = 'enter_routing';
    } else if (state.sequencePurpose === 'route_instruction') {
      enterCompletion(state, kc, 'initial');
    } else if (state.sequencePurpose === 'repair_instruction') {
      enterCompletion(state, kc, 'repair');
    } else {
      return block(state, 'unexpected_sequence_exhaustion');
    }
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_exit_feedback_released') {
    const sealedIds = state.sealedExitResults.map((result) => result.activityId);
    if (
      transitionError(
        state,
        state.status === 'awaiting_exit_feedback' &&
          event.payload.kcId === kc.id &&
          state.sealedExitResults.length === 2 &&
          state.authorityPrivateFeedback.sealedExit.length === 2 &&
          state.authorityPrivateFeedback.sealedExit.every((entry) =>
            sealedIds.includes(entry.activityId),
          ),
        'exit_feedback_release_not_allowed',
      )
    ) {
      return state;
    }
    state.groupedFeedback = {
      kind: 'exit',
      entries: structuredClone(state.authorityPrivateFeedback.sealedExit),
    };
    state.authorityPrivateFeedback.sealedExit = [];
    state.feedback = null;
    state.sealedExitResults.forEach((result) => {
      const exposure = exposureFor(state, result.familyId);
      if (exposure) {
        exposure.feedbackSeen = true;
        exposure.answerKeySeen = true;
      }
    });
    if (state.sealedExitResults.every((result) => result.passedUnsupported)) {
      return LessonRunStateSchema.parse(state);
    }
    if (state.repairCycles >= kc.microcycle.repairs.maximumCycles) {
      pauseForPlanner(state, 'repair_exhausted');
      return LessonRunStateSchema.parse(state);
    }
    state.status = 'awaiting_repair';
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_repair_started') {
    const cycle = kc.microcycle.repairs.cycles[state.repairCycles];
    const mapping = cycle?.mappings.find(
      (candidate) => candidate.id === event.payload.repairRouteId,
    );
    if (
      transitionError(
        state,
        state.status === 'awaiting_repair' &&
          event.payload.kcId === kc.id &&
          cycle !== undefined &&
          mapping !== undefined &&
          repairMappingEligible(mapping, state) &&
          state.repairCycles < kc.microcycle.repairs.maximumCycles,
        'repair_start_not_allowed',
      )
    ) {
      return state;
    }
    const repairActivity = mapping!.candidateActivityIds
      .map((id) => activityById(kc, id))
      .find((activity) => exposureFor(state, activity.familyId) === undefined);
    if (!repairActivity) {
      pauseForPlanner(state, 'repair_exhausted');
      return LessonRunStateSchema.parse(state);
    }
    state.repairCycles += 1;
    state.sequenceActivityIds = [repairActivity.id];
    state.sequencePosition = 0;
    state.sequencePurpose = 'repair_instruction';
    state.sealedExitResults = [];
    state.activeExitPairId = null;
    state.groupedFeedback = null;
    state.feedback = null;
    state.assistanceLevel = 'A3';
    state.consecutiveUnsupportedSuccesses = 0;
    clearCompletionState(state);
    setCurrentFromSequence(state, kc, 0);
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'kc_instructional_exit') {
    if (
      transitionError(
        state,
        state.status === 'awaiting_exit_feedback' &&
          state.groupedFeedback?.kind === 'exit' &&
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
      state.sequencePurpose = null;
      state.groupedFeedback = null;
      clearActivityTransient(state);
      return LessonRunStateSchema.parse(state);
    }
    startKc(state, nextKc, 'active');
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
  return events.reduce<LessonRunState>(
    (state, event) => reduceLessonRun(state, event, definitionInput, mode),
    initialState,
  );
}

export interface EvaluatedLessonResponse {
  outcome: 'correct' | 'incorrect' | 'not_sure';
  diagnosticSignalIds: string[];
  objectiveFeatureIds: string[];
  feedback: LessonFeedbackEntry[];
}

const normalizeText = (
  value: string,
  normalization: {
    trim: true;
    collapseWhitespace: true;
    case: 'sensitive' | 'lowercase';
    stripPunctuation: boolean;
  },
): string => {
  let result = normalization.trim ? value.trim() : value;
  if (normalization.collapseWhitespace) result = result.replace(/\s+/g, ' ');
  if (normalization.stripPunctuation) result = result.replace(/[^\p{L}\p{N}\s.+-]/gu, '');
  if (normalization.case === 'lowercase') result = result.toLocaleLowerCase();
  return result;
};

const responseText = (response: LessonActivityResponseInput): string | null => {
  if (response.kind === 'text') return response.text;
  if (response.kind === 'numeric') {
    return `${response.value}${response.unit === null ? '' : ` ${response.unit}`}`;
  }
  if (response.kind === 'ordered_steps') return response.steps.join(' -> ');
  return null;
};

function matcherPasses(
  matcher: Extract<
    ActivityDefinition['response'],
    { kind: 'text' | 'numeric' | 'ordered_steps' }
  >['rubric']['criteria'][number]['matcher'],
  response: LessonActivityResponseInput,
): boolean {
  if (matcher.kind === 'accepted_set') {
    const text = responseText(response);
    return (
      text !== null &&
      matcher.accepted.some(
        (accepted) =>
          normalizeText(accepted, matcher.normalization) ===
          normalizeText(text, matcher.normalization),
      )
    );
  }
  if (matcher.kind === 'required_tokens') {
    const text = responseText(response);
    if (text === null) return false;
    const normalized = normalizeText(text, matcher.normalization);
    const matches = matcher.tokens.filter((token) =>
      normalized.includes(normalizeText(token, matcher.normalization)),
    ).length;
    return matches >= matcher.minimumMatches;
  }
  if (matcher.kind === 'numeric') {
    let value: number;
    let unit: string | null;
    if (response.kind === 'numeric') {
      value = response.value;
      unit = response.unit;
    } else {
      const text = responseText(response);
      const match = text?.match(/([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*([^\s,;]+)?/);
      if (!match) return false;
      value = Number(match[1]);
      unit = match[2]?.trim() || null;
    }
    const unitPasses =
      !matcher.requireUnit ||
      (unit !== null &&
        matcher.acceptedUnits.some(
          (accepted) =>
            accepted.toLocaleLowerCase().replace(/[.,:;]+$/u, '') ===
            unit!.toLocaleLowerCase().replace(/[.,:;]+$/u, ''),
        ));
    return unitPasses && Math.abs(value - matcher.target) <= matcher.absoluteTolerance;
  }
  if (response.kind !== 'ordered_steps' || response.steps.length !== matcher.steps.length) {
    return false;
  }
  return matcher.steps.every((step, index) =>
    step.accepted.some(
      (accepted) =>
        normalizeText(accepted, matcher.normalization) ===
        normalizeText(response.steps[index]!, matcher.normalization),
    ),
  );
}

/** Deterministic server-side evaluation. No model or client correctness is accepted. */
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
      objectiveFeatureIds: [],
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
      objectiveFeatureIds: correct ? [] : [...choice.objectiveFeatureIds],
      feedback: [
        {
          activityId: activity.id,
          tone: correct ? 'correct' : 'incorrect',
          message: correct ? activity.response.correctFeedback : choice.feedback,
        },
      ],
    };
  }

  const inputKindMatches =
    (activity.response.kind === 'text' && response.kind === 'text') ||
    (activity.response.kind === 'numeric' &&
      (response.kind === 'numeric' || response.kind === 'text')) ||
    (activity.response.kind === 'ordered_steps' && response.kind === 'ordered_steps');
  if (!inputKindMatches) throw new Error(`${activity.response.kind} response input is required.`);
  const evaluated = activity.response.rubric.criteria.map((criterion) => ({
    criterion,
    passed: matcherPasses(criterion.matcher, response),
  }));
  const correct = evaluated
    .filter(({ criterion }) => criterion.required)
    .every(({ passed }) => passed);
  const failed = evaluated.filter(({ passed }) => !passed);
  const criterionRationales = evaluated.map(
    ({ criterion, passed }) =>
      `${criterion.label}: ${passed ? criterion.correctFeedback : criterion.incorrectFeedback}`,
  );
  return {
    outcome: correct ? 'correct' : 'incorrect',
    diagnosticSignalIds: failed.flatMap(({ criterion }) => criterion.diagnosticSignalIds),
    objectiveFeatureIds: failed.flatMap(({ criterion }) => criterion.objectiveFeatureIds),
    feedback: [
      {
        activityId: activity.id,
        tone: correct ? 'correct' : 'incorrect',
        message: [
          correct
            ? activity.response.rubric.correctFeedback
            : activity.response.rubric.incorrectFeedback,
          ...criterionRationales,
        ].join(' '),
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
        : activity.response.kind === 'text'
          ? ({
              kind: 'text',
              label: activity.response.label,
              placeholder: activity.response.placeholder,
              allowNotSure: activity.response.allowNotSure,
            } as const)
          : activity.response.kind === 'numeric'
            ? ({
                kind: 'numeric',
                label: activity.response.label,
                unitLabel: activity.response.unitLabel,
                allowNotSure: activity.response.allowNotSure,
              } as const)
            : ({
                kind: 'ordered_steps',
                legend: activity.response.legend,
                minimumSteps: activity.response.minimumSteps,
                maximumSteps: activity.response.maximumSteps,
                allowNotSure: activity.response.allowNotSure,
              } as const);
  const visibleHint =
    state.visibleAssistanceLevel === null
      ? null
      : (activity.assistance.hints.find((hint) => hint.level === state.visibleAssistanceLevel)
          ?.text ?? null);
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
      const representation = kc.representations.find((candidate) => candidate.id === id);
      if (!representation) throw new Error(`Missing safe representation ${id}.`);
      return structuredClone(representation);
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

function safeCommon(definition: LessonDefinition | null, state: LessonRunState) {
  const kc = definition ? currentKc(definition, state) : null;
  const kcIndex =
    definition && kc
      ? definition.knowledgeComponents.findIndex((candidate) => candidate.id === kc.id)
      : -1;
  return {
    kind: 'v3_lesson' as const,
    schemaVersion: '1.1' as const,
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
    groupedFeedback: state.groupedFeedback ? structuredClone(state.groupedFeedback) : null,
  };
}

/** Compiles server content into the strict learner-safe activity DTO. */
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
    const exhaustionMessage: Record<string, string> = {
      repair_exhausted:
        'Two repair cycles are complete. Return to the planner for a fresh reentry run.',
      completion_exhausted:
        'The finite supported-task pool is exhausted. Return to the planner for reentry.',
      entry_pool_exhausted:
        'No untouched entry-probe set remains. Return to the planner for reviewed replacements.',
      exit_pool_exhausted:
        'No untouched paired exit family remains. Return to the planner for reviewed replacements.',
    };
    return LessonStepViewSchema.parse({
      ...common,
      status: 'paused',
      activity: null,
      availableActions: state.plannerReentryRequired ? [] : ['resume'],
      message: state.plannerReentryRequired
        ? (exhaustionMessage[state.pauseReason ?? ''] ??
          'Return to the planner for a new entry decision.')
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
      message: 'The planner created a new version-bound run with inherited exposure.',
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
      message: 'All entry responses are sealed while the authority finalizes one route.',
    });
  }
  if (state.status === 'awaiting_repair') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'repair_pending',
      activity: null,
      availableActions: ['continue', 'pause'],
      message: 'Both exact rationales are available. Continue to a fresh cycle-specific repair.',
    });
  }
  if (state.status === 'awaiting_exit_feedback') {
    const released = state.groupedFeedback?.kind === 'exit';
    return LessonStepViewSchema.parse({
      ...common,
      status: 'feedback_pending',
      activity: null,
      availableActions: released ? ['continue', 'pause'] : ['pause'],
      message: released
        ? 'Both answer-specific rationales were released together.'
        : 'Feedback remains sealed until both exit responses are committed.',
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
  if (state.activePresentation === null) actions.push('present');
  else if (activity.response.kind === 'none' || state.lastResponse?.activityId === activity.id) {
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
  duplicate: boolean;
}

function eligibleEntryRoute(kc: KnowledgeComponentDefinition, state: LessonRunState) {
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
  return kc.microcycle.entryRouting.routes.find((candidate) => candidate.route === 'standard')!;
}

function eligibleRepairMapping(kc: KnowledgeComponentDefinition, state: LessonRunState) {
  const cycle = kc.microcycle.repairs.cycles[state.repairCycles]!;
  return (
    cycle.mappings.find(
      (mapping) => mapping.kind === 'targeted' && repairMappingEligible(mapping, state),
    ) ?? cycle.mappings.find((mapping) => mapping.kind === 'generic')!
  );
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

interface EventIdentity {
  eventId: string;
  idempotencyKey: string;
  occurredAt: string;
}

function dispatchWithIdentity(
  stateInput: LessonRunState,
  definitionInput: unknown,
  action: LessonActionInput,
  mode: LessonRuntimeMode,
  identity: (index: number) => EventIdentity,
): LessonDispatchResult {
  const definition = LessonDefinitionSchema.parse(definitionInput);
  let state = LessonRunStateSchema.parse(stateInput);
  const events: LessonRunEvent[] = [];
  const append = (type: LessonRunEvent['type'], payload: Record<string, unknown>) => {
    const eventIdentity = identity(events.length);
    const event = LessonRunEventSchema.parse({
      schemaVersion: '1.1',
      eventId: eventIdentity.eventId,
      idempotencyKey: eventIdentity.idempotencyKey,
      runId: state.pins.runId,
      lessonId: state.pins.lessonId,
      definitionVersion: state.pins.definitionVersion,
      reviewedContentHash: state.pins.reviewedContentHash,
      contentRelease: state.pins.contentRelease,
      registry: state.pins.registry,
      policies: state.pins.policies,
      sequence: state.lastSequence + 1,
      occurredAt: eventIdentity.occurredAt,
      type,
      payload,
    });
    state = reduceLessonRun(state, event, definition, mode);
    events.push(event);
  };

  if (action.type === 'pause') {
    append('lesson_run_paused', { reason: 'learner' });
    return { state, events, duplicate: false };
  }
  if (action.type === 'resume') {
    append('lesson_run_resumed', {});
    return { state, events, duplicate: false };
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
    return { state, events, duplicate: false };
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
    return { state, events, duplicate: false };
  }
  if (action.type === 'submit_response') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The response does not match the current activity.');
    }
    const evaluated = evaluateLessonResponse(activity, action.response);
    append('lesson_response_evaluated', {
      kcId: kc.id,
      activityId: activity.id,
      familyId: activity.familyId,
      outcome: evaluated.outcome,
      assistanceLevel: state.assistanceLevel,
      assisted: state.visibleAssistanceLevel !== null,
      revealed: exposureFor(state, activity.familyId)?.revealed ?? false,
      diagnosticSignalIds: evaluated.diagnosticSignalIds,
      objectiveFeatureIds: evaluated.objectiveFeatureIds,
      authorityFeedback: evaluated.feedback,
    });
    if (state.status === 'awaiting_exit_feedback') {
      append('lesson_exit_feedback_released', { kcId: kc.id });
    }
    return { state, events, duplicate: false };
  }
  if (action.type === 'continue') {
    if (state.status === 'awaiting_exit_feedback') {
      append('kc_instructional_exit', { kcId: kc.id });
      return { state, events, duplicate: false };
    }
    if (state.status === 'awaiting_repair') {
      const mapping = eligibleRepairMapping(kc, state);
      append('lesson_repair_started', { kcId: kc.id, repairRouteId: mapping.id });
      return { state, events, duplicate: false };
    }
    if (!activity || action.activityId !== activity.id) {
      throw new Error('Continue does not match the current activity.');
    }
    append('lesson_activity_completed', { kcId: kc.id, activityId: activity.id });
    if (state.status === 'awaiting_route') {
      const route = eligibleEntryRoute(kc, state);
      append('lesson_route_selected', { kcId: kc.id, route: route.route });
    }
    return { state, events, duplicate: false };
  }
  return { state, events, duplicate: false };
}

const deterministicUuid = (seed: string): string => {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16]!, 16) % 4]!;
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
};

/**
 * HTTP-command boundary. The command envelope becomes the first event identity;
 * child identities are deterministic. Replaying the same command emits no events.
 */
export function dispatchLessonRunCommand(
  stateInput: LessonRunState,
  definitionInput: unknown,
  commandInput: unknown,
  mode: LessonRuntimeMode,
): LessonDispatchResult {
  const state = LessonRunStateSchema.parse(stateInput);
  const command: LessonActionCommand = LessonActionCommandSchema.parse(commandInput);
  if (command.runId !== state.pins.runId) throw new Error('lesson command run pin mismatch');
  if (command.envelope.contentRelease !== state.pins.contentRelease) {
    throw new Error('lesson command content-release pin mismatch');
  }
  if (
    state.appliedEventIds.includes(command.envelope.eventId) ||
    state.appliedIdempotencyKeys.includes(command.envelope.idempotencyKey)
  ) {
    return { state, events: [], duplicate: true };
  }
  if (command.envelope.expectedStreamVersion !== state.lastSequence + 1) {
    throw new Error('lesson command stream version mismatch');
  }
  return dispatchWithIdentity(state, definitionInput, command.action, mode, (index) => ({
    eventId:
      index === 0
        ? command.envelope.eventId
        : EventIdSchema.parse(
            deterministicUuid(`${command.envelope.eventId}:lesson-child-event:${index}`),
          ),
    idempotencyKey:
      index === 0
        ? command.envelope.idempotencyKey
        : IdempotencyKeySchema.parse(
            deterministicUuid(
              `${command.envelope.idempotencyKey}:lesson-child-idempotency:${index}`,
            ),
          ),
    occurredAt: command.envelope.occurredAt,
  }));
}

/** Convenience for trusted in-process callers; HTTP handlers use dispatchLessonRunCommand. */
export function dispatchLessonRunAction(
  stateInput: LessonRunState,
  definitionInput: unknown,
  actionInput: unknown,
  mode: LessonRuntimeMode,
  clock: Clock = systemClock,
): LessonDispatchResult {
  const action = LessonActionInputSchema.parse(actionInput);
  const state = LessonRunStateSchema.parse(stateInput);
  const command = LessonActionCommandSchema.parse({
    envelope: {
      eventId: newEventId(),
      idempotencyKey: newIdempotencyKey(),
      occurredAt: clock.now(),
      expectedStreamVersion: state.lastSequence + 1,
      contentRelease: state.pins.contentRelease,
      taskInstanceId: newTaskInstanceId(),
    },
    runId: state.pins.runId,
    action,
  });
  return dispatchLessonRunCommand(state, definitionInput, command, mode);
}

export function startLessonRun(
  stateInput: LessonRunState,
  definitionInput: unknown,
  mode: LessonRuntimeMode,
  clock: Clock = systemClock,
): LessonDispatchResult {
  const state = LessonRunStateSchema.parse(stateInput);
  const event = LessonRunEventSchema.parse({
    schemaVersion: '1.1',
    eventId: newEventId(),
    idempotencyKey: newIdempotencyKey(),
    runId: state.pins.runId,
    lessonId: state.pins.lessonId,
    definitionVersion: state.pins.definitionVersion,
    reviewedContentHash: state.pins.reviewedContentHash,
    contentRelease: state.pins.contentRelease,
    registry: state.pins.registry,
    policies: state.pins.policies,
    sequence: state.lastSequence + 1,
    occurredAt: clock.now(),
    type: 'lesson_run_started',
    payload: {},
  });
  return {
    state: reduceLessonRun(state, event, definitionInput, mode),
    events: [event],
    duplicate: false,
  };
}

export const parseLessonActionResponse = (input: unknown): LessonActivityResponseInput =>
  LessonActivityResponseInputSchema.parse(input);
