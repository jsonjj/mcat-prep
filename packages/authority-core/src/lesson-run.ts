import { createHash } from 'node:crypto';
import {
  deterministicJson,
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
  LessonCheckpointCommitSchema,
  LessonRuntimeCheckpointSchema,
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
  type PlannerInstructionResolution,
  type ValidatedPlannerInstruction,
  type LessonStepView,
  newEventId,
  newIdempotencyKey,
  newTaskInstanceId,
  systemClock,
} from '@mcat/contracts';
import { decideLessonAssistance } from '@mcat/policies';
import { acceptPlannerInstructionResolution } from './planner-instruction';

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
    reentryHistory: [],
    kcReentryCounts: [],
    inheritedFromRunIds: [],
    inheritedExposure: { sourceRunIds: [], families: [] },
    reviewedContentPins: [contentPin(pins)],
  });

function invalidState(
  pins: LessonRunPins,
  issues: string[],
  lineage: LessonRunLineage = initialLineage(pins),
): LessonRunState {
  return LessonRunStateSchema.parse({
    schemaVersion: '2.0',
    pins,
    lineage,
    status: 'invalid_content',
    currentKcId: null,
    currentActivityId: null,
    phase: null,
    route: null,
    validatedPlannerInstruction: null,
    plannerResolutionHistory: [],
    plannerResolutionRejectionCodes: [],
    returnSupportToPlanner: false,
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
    repairReentry: {
      failedExitFunction: null,
      originState: null,
      originCheckpointId: null,
      originExitPairId: null,
      preservedSuccesses: [],
      preservationDecision: null,
      invalidationReason: null,
      reentryState: null,
      reentryCheckpointId: null,
    },
    exitedKcIds: [],
    signals: [],
    objectiveFeatures: [],
    exposures: structuredClone(lineage.inheritedExposure.families),
    activePresentation: null,
    lastResponse: null,
    sealedExitResults: [],
    activeExitPairId: null,
    usedExitPairIds: [],
    attempts: [],
    confidenceRecords: [],
    learnerCauseRecords: [],
    invalidatedItems: [],
    visibleAssistanceLevel: null,
    feedback: null,
    groupedFeedback: null,
    authorityPrivateFeedback: { sealedEntry: [], sealedExit: [] },
    currentCheckpoint: null,
    kcCheckpoints: [],
    checkpointCommits: [],
    timing: {
      shellStartedAt: null,
      currentKcStartedAt: null,
      observations: [],
    },
    resumeStatus: null,
    pauseReason: null,
    plannerReentryRequired: false,
    handoffRunId: null,
    handoffPins: null,
    handoffLineage: null,
    handoffResolution: null,
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
  if (!definition.orderedRequiredKcIds.includes(pins.targetKcId)) {
    issues.push('target_kc_not_in_required_denominator');
  }
  if (deterministicJson(definition.registryBinding.registry) !== deterministicJson(pins.registry)) {
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

function reentryTargetKc(
  definition: LessonDefinition,
  state: LessonRunState,
): KnowledgeComponentDefinition | null {
  const current =
    definition.knowledgeComponents.find(
      (kc) => kc.id === state.currentKcId && !state.exitedKcIds.includes(kc.id),
    ) ?? null;
  return (
    current ??
    definition.knowledgeComponents.find((kc) => !state.exitedKcIds.includes(kc.id)) ??
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
  instruction: ValidatedPlannerInstruction,
): void {
  const probes = selectFreshActivities(
    state,
    kc,
    kc.microcycle.entryRouting.probeActivityIds,
    kc.microcycle.entryRouting.probeCount,
  );
  state.currentKcId = kc.id;
  state.route = null;
  state.validatedPlannerInstruction = structuredClone(instruction);
  if (
    !state.plannerResolutionHistory.some(
      (resolution) =>
        resolution.resolutionId === instruction.resolution.resolutionId,
    )
  ) {
    state.plannerResolutionHistory.push(structuredClone(instruction.resolution));
  }
  state.returnSupportToPlanner = instruction.supportReturnedToPlanner;
  state.repairCycles = 0;
  state.signals = [];
  state.objectiveFeatures = [];
  state.sealedExitResults = [];
  state.activeExitPairId = null;
  state.assistanceLevel = probes[0]?.assistance.initialLevel ?? 'A0';
  state.consecutiveUnsupportedSuccesses = 0;
  state.groupedFeedback = null;
  state.authorityPrivateFeedback = { sealedEntry: [], sealedExit: [] };
  state.timing.currentKcStartedAt = null;
  clearCompletionState(state);
  if (probes.length !== kc.microcycle.entryRouting.probeCount) {
    pauseForPlanner(state, 'entry_pool_exhausted');
    return;
  }
  state.sequenceActivityIds = probes.map((activity) => activity.id);
  state.sequencePosition = 0;
  state.sequencePurpose = 'entry';
  state.currentActivityId = probes[0]?.id ?? null;
  state.phase = probes[0]?.phase ?? 'enter_routing';
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
  resolutionInput: unknown,
  mode: LessonRuntimeMode,
  clock: Clock = systemClock,
): LessonRunState {
  const pins = LessonRunPinsSchema.parse(pinsInput);
  const checked = definitionIssues(definitionInput, pins, mode);
  if (!checked.definition) return invalidState(pins, checked.issues);
  const accepted = acceptPlannerInstructionResolution(resolutionInput, {
    pins,
    now: clock.now(),
    priorResolution: null,
  });
  if (accepted.kind === 'rejected') {
    const state = invalidState(pins, []);
    state.status = 'awaiting_planner_resolution';
    state.plannerResolutionRejectionCodes = [...accepted.reasonCodes];
    state.invalidIssues = [];
    return LessonRunStateSchema.parse(state);
  }
  const state = invalidState(pins, []);
  const target = checked.definition.knowledgeComponents.find(
    (kc) => kc.id === pins.targetKcId,
  )!;
  startKc(state, target, 'ready', accepted.validated);
  state.invalidIssues = [];
  return LessonRunStateSchema.parse(state);
}

const expectedReentryLineage = (
  parent: LessonRunState,
  nextPins: LessonRunPins,
  targetKcId: KnowledgeComponentDefinition['id'],
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
  const inheritedFromRunIds = [
    ...new Set([...parent.lineage.inheritedFromRunIds, parent.pins.runId]),
  ];
  const reentryHistory = [...parent.lineage.reentryHistory, { runId: nextPins.runId, targetKcId }];
  const kcReentryCounts = structuredClone(parent.lineage.kcReentryCounts);
  const targetCount = kcReentryCounts.find((entry) => entry.kcId === targetKcId);
  if (targetCount) targetCount.count += 1;
  else kcReentryCounts.push({ kcId: targetKcId, count: 1 });
  return LessonRunLineageSchema.parse({
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
    reviewedContentPins: pins,
  });
};

const kcReentryCount = (lineage: LessonRunLineage, kcId: string): number =>
  lineage.kcReentryCounts.find((entry) => entry.kcId === kcId)?.count ?? 0;

const reentryPinsCompatible = (left: LessonRunPins, right: LessonRunPins): boolean => {
  const {
    runId: _leftRun,
    taskInstanceId: _leftTask,
    taskKind: _leftKind,
    targetKcId: _leftTarget,
    plannerResolutionId: _leftResolution,
    evidenceCutoff: _leftCutoff,
    ...leftRest
  } = left;
  const {
    runId: _rightRun,
    taskInstanceId: _rightTask,
    taskKind: _rightKind,
    targetKcId: _rightTarget,
    plannerResolutionId: _rightResolution,
    evidenceCutoff: _rightCutoff,
    ...rightRest
  } = right;
  return deterministicJson(leftRest) === deterministicJson(rightRest);
};

/**
 * Creates a reentry run only from an accepted planner handoff. Every family,
 * key, feedback, and reveal exposure is inherited before replacement selection.
 */
export function initializeLessonReentryRun(
  definitionInput: unknown,
  pinsInput: LessonRunPins,
  resolutionInput: unknown,
  mode: LessonRuntimeMode,
  parentInput: LessonRunState,
  clock: Clock = systemClock,
): LessonRunState {
  const pins = LessonRunPinsSchema.parse(pinsInput);
  const parent = LessonRunStateSchema.parse(parentInput);
  const checked = definitionIssues(definitionInput, pins, mode);
  const issues = [...checked.issues];
  if (parent.status !== 'handoff') issues.push('parent_not_handed_off');
  if (pins.runId === parent.pins.runId) issues.push('same_run_reentry_forbidden');
  if (!parent.handoffPins || deterministicJson(parent.handoffPins) !== deterministicJson(pins)) {
    issues.push('handoff_pin_mismatch');
  }
  if (
    !parent.handoffResolution ||
    deterministicJson(parent.handoffResolution) !== deterministicJson(resolutionInput)
  ) {
    issues.push('handoff_resolution_mismatch');
  }
  if (!reentryPinsCompatible(parent.pins, pins)) issues.push('reentry_content_pin_mismatch');
  const target = checked.definition
    ? checked.definition.knowledgeComponents.find((kc) => kc.id === pins.targetKcId) ?? null
    : null;
  const accepted = acceptPlannerInstructionResolution(resolutionInput, {
    pins,
    now: clock.now(),
    priorResolution: parent.plannerResolutionHistory.at(-1) ?? null,
  });
  const lineageTargetKcId = target?.id ?? parent.currentKcId;
  const expectedLineage =
    lineageTargetKcId === null
      ? initialLineage(pins)
      : pins.runId === parent.pins.runId
        ? parent.lineage
        : expectedReentryLineage(parent, pins, lineageTargetKcId);
  if (!target) issues.push('reentry_target_missing');
  if (
    !parent.handoffLineage ||
    deterministicJson(parent.handoffLineage) !== deterministicJson(expectedLineage)
  ) {
    issues.push('handoff_lineage_mismatch');
  }
  const maxTargetReentries = target?.microcycle.fading.maxReentryGenerations ?? 0;
  if (target && kcReentryCount(expectedLineage, target.id) > maxTargetReentries) {
    issues.push('kc_reentry_limit_exhausted');
  }
  if (!checked.definition || issues.length > 0) {
    return invalidState(pins, issues, expectedLineage);
  }

  const state = invalidState(pins, [], expectedLineage);
  state.exposures = structuredClone(expectedLineage.inheritedExposure.families);
  state.exitedKcIds = [...parent.exitedKcIds];
  state.usedExitPairIds = [...parent.usedExitPairIds];
  state.attempts = structuredClone(parent.attempts);
  state.confidenceRecords = structuredClone(parent.confidenceRecords);
  state.learnerCauseRecords = structuredClone(parent.learnerCauseRecords);
  state.invalidatedItems = structuredClone(parent.invalidatedItems);
  state.plannerResolutionHistory = structuredClone(parent.plannerResolutionHistory);
  state.timing = structuredClone(parent.timing);
  state.kcCheckpoints = structuredClone(parent.kcCheckpoints);
  if (!target) {
    state.status = 'complete';
    state.currentKcId = null;
    state.invalidIssues = [];
    return LessonRunStateSchema.parse(state);
  }
  if (accepted.kind === 'rejected') {
    state.status = 'awaiting_planner_resolution';
    state.plannerResolutionRejectionCodes = [...accepted.reasonCodes];
    state.invalidIssues = [];
    return LessonRunStateSchema.parse(state);
  }
  startKc(state, target, 'ready', accepted.validated);
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
  return deterministicJson(left) === deterministicJson(right);
}

function eventPinsMatch(state: LessonRunState, event: LessonRunEvent): boolean {
  return (
    event.runId === state.pins.runId &&
    event.learnerId === state.pins.learnerId &&
    event.streamId === state.pins.streamId &&
    event.taskInstanceId === state.pins.taskInstanceId &&
    event.taskKind === state.pins.taskKind &&
    event.targetKcId === state.pins.targetKcId &&
    event.plannerResolutionId === state.pins.plannerResolutionId &&
    event.evidenceCutoff === state.pins.evidenceCutoff &&
    event.lessonId === state.pins.lessonId &&
    event.definitionVersion === state.pins.definitionVersion &&
    event.reviewedContentHash === state.pins.reviewedContentHash &&
    event.contentRelease === state.pins.contentRelease &&
    deterministicJson(event.registry) === deterministicJson(state.pins.registry) &&
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

function scheduleFreshExitPair(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
  includeContrast: boolean,
): void {
  const pair = selectExitPair(kc, state);
  if (!pair) {
    pauseForPlanner(state, 'exit_pool_exhausted');
    return;
  }
  state.activeExitPairId = pair.id;
  state.usedExitPairIds.push(pair.id);
  state.sealedExitResults = [];
  state.authorityPrivateFeedback.sealedExit = [];
  state.sequenceActivityIds = [
    ...(includeContrast ? kc.microcycle.contrastActivityIds : []),
    pair.nearActivityId,
    pair.changedActivityId,
  ];
  state.sequencePurpose = 'post_completion';
  clearCompletionState(state);
  setCurrentFromSequence(state, kc, 0);
}

function schedulePostCompletion(state: LessonRunState, kc: KnowledgeComponentDefinition): void {
  scheduleFreshExitPair(state, kc, state.completionContext === 'initial');
}

function activeExitPair(kc: KnowledgeComponentDefinition, state: LessonRunState) {
  return kc.microcycle.pairedExit.pairs.find((pair) => pair.id === state.activeExitPairId);
}

function exitFunctionObserved(
  state: LessonRunState,
  exitFunction: 'near_use' | 'changed_task',
): boolean {
  const role = exitFunction === 'near_use' ? 'near' : 'changed';
  return (
    state.repairReentry.preservedSuccesses.some(
      (success) => success.exitFunction === exitFunction,
    ) || state.sealedExitResults.some((result) => result.role === role)
  );
}

function exitFunctionPassed(
  state: LessonRunState,
  exitFunction: 'near_use' | 'changed_task',
): boolean {
  const role = exitFunction === 'near_use' ? 'near' : 'changed';
  return (
    state.repairReentry.preservedSuccesses.some(
      (success) => success.exitFunction === exitFunction,
    ) ||
    state.sealedExitResults.some(
      (result) => result.role === role && result.passedUnsupported,
    )
  );
}

const exitChecksComplete = (state: LessonRunState): boolean =>
  exitFunctionObserved(state, 'near_use') &&
  exitFunctionObserved(state, 'changed_task');

const exitChecksPass = (state: LessonRunState): boolean =>
  exitFunctionPassed(state, 'near_use') &&
  exitFunctionPassed(state, 'changed_task');

function successfulExitAttemptId(
  state: LessonRunState,
  exitFunction: 'near_use' | 'changed_task',
): string | null {
  const preserved = state.repairReentry.preservedSuccesses.find(
    (success) => success.exitFunction === exitFunction,
  );
  if (preserved) return preserved.attemptId;
  const role = exitFunction === 'near_use' ? 'near' : 'changed';
  return (
    state.sealedExitResults.find(
      (result) => result.role === role && result.passedUnsupported,
    )?.attemptId ?? null
  );
}

function beginPlannerRouteInstruction(
  state: LessonRunState,
  kc: KnowledgeComponentDefinition,
): void {
  const route = kc.microcycle.entryRouting.routes.find(
    (candidate) => candidate.route === state.route,
  );
  if (!route) {
    block(state, 'planner_route_not_authored');
    return;
  }
  state.sequenceActivityIds = [...route.instructionActivityIds];
  state.sequencePosition = 0;
  state.sequencePurpose = 'route_instruction';
  state.assistanceLevel = route.initialAssistanceLevel;
  state.consecutiveUnsupportedSuccesses = 0;
  if (state.authorityPrivateFeedback.sealedEntry.length > 0) {
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
  }
  setCurrentFromSequence(state, kc, 0);
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
function reduceLessonRunTransition(
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
  if (event.type === 'lesson_planner_resolution_rejected') {
    state.status = 'awaiting_planner_resolution';
    state.currentKcId = null;
    state.currentActivityId = null;
    state.phase = null;
    state.route = null;
    state.plannerResolutionRejectionCodes = [...event.payload.reasonCodes];
    return LessonRunStateSchema.parse(state);
  }
  if (event.type === 'lesson_run_started') {
    if (transitionError(state, state.status === 'ready', 'run_start_not_ready')) return state;
    state.status = 'active';
    state.timing.shellStartedAt ??= event.occurredAt;
    state.timing.currentKcStartedAt = event.occurredAt;
    return LessonRunStateSchema.parse(state);
  }
  if (event.type === 'lesson_run_paused') {
    if (
      transitionError(
        state,
        ['active', 'awaiting_exit_feedback', 'awaiting_repair', 'awaiting_reentry'].includes(
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
          state.resumeStatus !== null &&
          state.checkpointCommits.at(-1)?.shell.checkpointId ===
            definition.shellCheckpointMap.paused &&
          state.checkpointCommits.at(-1)?.shell.eventStreamSequence ===
            state.lastSequence,
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
    const target =
      definition.knowledgeComponents.find((kc) => kc.id === nextPins.targetKcId) ?? null;
    const expected =
      target && nextPins.runId !== state.pins.runId
        ? expectedReentryLineage(state, nextPins, target.id)
        : null;
    const maxTargetReentries = target?.microcycle.fading.maxReentryGenerations ?? 0;
    const nextInstruction = acceptPlannerInstructionResolution(
      event.payload.nextResolution,
      {
        pins: nextPins,
        now: event.occurredAt,
        priorResolution: state.plannerResolutionHistory.at(-1) ?? null,
      },
    );
    if (
      transitionError(
        state,
        ['paused', 'awaiting_planner_resolution', 'blocked_for_predecessor'].includes(
          state.status,
        ) &&
          state.plannerReentryRequired &&
          nextPins.runId !== state.pins.runId &&
          reentryPinsCompatible(state.pins, nextPins) &&
          expected !== null &&
          deterministicJson(event.payload.nextLineage) === deterministicJson(expected) &&
          nextInstruction.kind === 'accepted' &&
          target !== null &&
          kcReentryCount(expected, target.id) <= maxTargetReentries,
        'planner_handoff_not_allowed',
      )
    ) {
      return state;
    }
    state.status = 'handoff';
    state.handoffRunId = nextPins.runId;
    state.handoffPins = structuredClone(nextPins);
    state.handoffLineage = structuredClone(event.payload.nextLineage);
    state.handoffResolution = structuredClone(event.payload.nextResolution);
    return LessonRunStateSchema.parse(state);
  }
  if (event.type === 'lesson_delivery_completed') {
    if (
      transitionError(
        state,
        state.status === 'awaiting_delivery_completion' &&
          event.payload.derivedByAuthority &&
          deterministicJson(event.payload.orderedRequiredKcIds) ===
            deterministicJson(definition.orderedRequiredKcIds) &&
          definition.orderedRequiredKcIds.every((kcId) =>
            event.payload.instructionalExitKcIds.includes(kcId),
          ) &&
          definition.orderedRequiredKcIds.every((kcId) =>
            state.exitedKcIds.includes(kcId),
          ),
        'lesson_delivery_completion_not_allowed',
      )
    ) {
      return state;
    }
    state.status = 'complete';
    if (state.timing.shellStartedAt !== null) {
      state.timing.observations.push({
        scope: 'lesson_shell',
        kcId: null,
        activityId: null,
        startedAt: state.timing.shellStartedAt,
        endedAt: event.occurredAt,
        durationMs: Math.max(
          0,
          Date.parse(event.occurredAt) - Date.parse(state.timing.shellStartedAt),
        ),
        observationKind: 'wall_clock',
        completionThresholdApplied: false,
      });
    }
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
      presentedAt: event.occurredAt,
      attemptSlot: event.payload.attemptSlot,
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
          event.payload.fromLevel === state.assistanceLevel &&
          !['exit_near', 'exit_changed'].includes(activity.phase) &&
          state.lastResponse?.activityId !== activity.id &&
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
    if (hint!.contentBearing) {
      exposureFor(state, activity!.familyId)!.revealed = true;
    }
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_hint_requested') {
    const activity = currentActivity(definition, state);
    const hint = activity?.assistance.hints.find(
      (candidate) =>
        candidate.id === event.payload.hintId &&
        candidate.level === event.payload.level,
    );
    if (
      transitionError(
        state,
        state.status === 'active' &&
          activity !== null &&
          state.activePresentation?.activityId === activity.id &&
          state.lastResponse?.activityId !== activity.id &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          hint !== undefined,
        'hint_request_not_allowed',
      )
    ) {
      return state;
    }
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_reveal_requested') {
    const activity = currentActivity(definition, state);
    if (
      transitionError(
        state,
        state.status === 'active' &&
          activity !== null &&
          state.activePresentation?.activityId === activity.id &&
          state.lastResponse?.activityId !== activity.id &&
          event.payload.kcId === kc.id &&
          event.payload.activityId === activity.id &&
          activity.assistance.revealAllowed,
        'reveal_request_not_allowed',
      )
    ) {
      return state;
    }
    exposureFor(state, activity!.familyId)!.revealed = true;
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_route_selected') {
    const instruction = event.payload.validatedInstruction;
    if (
      transitionError(
        state,
        state.status === 'active' &&
          state.route === null &&
          state.validatedPlannerInstruction !== null &&
          deterministicJson(instruction) ===
            deterministicJson(state.validatedPlannerInstruction) &&
          instruction.resolution.kcId === kc.id,
        'route_selection_not_allowed',
      )
    ) {
      return state;
    }
    state.route = instruction.effectiveRoute;
    if (instruction.blockedForPredecessor) {
      state.status = 'blocked_for_predecessor';
      state.pauseReason = 'blocked_for_predecessor';
      state.plannerReentryRequired = true;
      state.currentActivityId = null;
      state.phase = 'handoff';
      clearActivityTransient(state);
      return LessonRunStateSchema.parse(state);
    }
    if (state.sequenceActivityIds.length === 0) beginPlannerRouteInstruction(state, kc);
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
          !state.attempts.some(
            (attempt) =>
              attempt.activityId === activity.id && attempt.administration === 'first',
          ) &&
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
    const derivedElapsedMs = Math.max(
      0,
      Date.parse(event.occurredAt) - Date.parse(presentation.presentedAt),
    );
    state.attempts.push({
      attemptId: event.eventId,
      activityId: activity.id,
      familyId: activity.familyId,
      administration: 'first',
      retryOf: null,
      responseDigest: event.payload.responseDigest,
      responseKind: event.payload.responseKind,
      outcome: event.payload.outcome,
      omissionType: event.payload.omissionType,
      assistanceLevel: event.payload.assistanceLevel,
      hinted: event.payload.assisted,
      revealed: event.payload.revealed,
      validForEvidence: event.payload.validForEvidence,
      invalidated: false,
      committedSequence: event.sequence,
      elapsedMs: event.payload.elapsedMs ?? derivedElapsedMs,
    });
    state.timing.observations.push({
      scope: 'uninterrupted_segment',
      kcId: kc.id,
      activityId: activity.id,
      startedAt: presentation.presentedAt,
      endedAt: event.occurredAt,
      durationMs: event.payload.elapsedMs ?? derivedElapsedMs,
      observationKind: 'wall_clock',
      completionThresholdApplied: false,
    });
    const exposure = exposureFor(state, activity.familyId)!;
    exposure.revealed = exposure.revealed || event.payload.revealed;
    if (!event.payload.validForEvidence || event.payload.outcome === null) {
      return LessonRunStateSchema.parse(state);
    }
    addEvidence(state.signals, activity.familyId, event.payload.diagnosticSignalIds);
    addObjectiveFeatures(state, activity.familyId, event.payload.objectiveFeatureIds);
    state.lastResponse = {
      attemptId: event.eventId,
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
        attemptId: event.eventId,
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
        if (exitChecksComplete(state)) {
          state.status = 'awaiting_exit_feedback';
          state.currentActivityId = null;
          state.phase = null;
        } else {
          const changedPosition = state.sequenceActivityIds.indexOf(pair.changedActivityId);
          if (changedPosition < 0) return block(state, 'changed_exit_not_in_sequence');
          setCurrentFromSequence(state, kc, changedPosition);
          state.feedback = { sealed: true, entries: [] };
        }
      } else {
        if (pair.changedActivityId !== activity.id || !exitChecksComplete(state)) {
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

  if (event.type === 'lesson_retry_observed') {
    const original = state.attempts.find(
      (attempt) =>
        attempt.attemptId === event.payload.retryOf &&
        attempt.administration === 'first',
    );
    if (
      transitionError(
        state,
        original !== undefined &&
          original.activityId === event.payload.activityId &&
          original.familyId === event.payload.familyId &&
          event.payload.kcId === kc.id &&
          !state.attempts.some((attempt) => attempt.attemptId === event.eventId),
        'retry_observation_not_allowed',
      )
    ) {
      return state;
    }
    state.attempts.push({
      attemptId: event.eventId,
      activityId: event.payload.activityId,
      familyId: event.payload.familyId,
      administration: 'retry',
      retryOf: event.payload.retryOf,
      responseDigest: event.payload.responseDigest,
      responseKind: event.payload.responseKind,
      outcome: event.payload.outcome,
      omissionType: null,
      assistanceLevel: event.payload.assistanceLevel,
      hinted: false,
      revealed: false,
      validForEvidence: false,
      invalidated: false,
      committedSequence: event.sequence,
      elapsedMs: event.payload.elapsedMs,
      canCloseRepair: false,
    });
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_confidence_recorded') {
    const attempt = state.attempts.find(
      (candidate) => candidate.attemptId === event.payload.attemptId,
    );
    if (
      transitionError(
        state,
        event.payload.kcId === kc.id &&
          attempt !== undefined &&
          kc.activities.some((activity) => activity.id === attempt.activityId) &&
          !state.confidenceRecords.some(
            (record) => record.attemptId === attempt.attemptId,
          ),
        'confidence_record_not_allowed',
      )
    ) {
      return state;
    }
    state.confidenceRecords.push({
      attemptId: event.payload.attemptId,
      confidence: event.payload.confidence,
      sequence: event.sequence,
    });
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_learner_cause_recorded') {
    const attempt = state.attempts.find(
      (candidate) => candidate.attemptId === event.payload.attemptId,
    );
    if (
      transitionError(
        state,
        event.payload.kcId === kc.id &&
          attempt !== undefined &&
          kc.activities.some((activity) => activity.id === attempt.activityId) &&
          !state.learnerCauseRecords.some(
            (record) => record.attemptId === attempt.attemptId,
          ),
        'learner_cause_record_not_allowed',
      )
    ) {
      return state;
    }
    state.learnerCauseRecords.push({
      attemptId: event.payload.attemptId,
      cause: event.payload.cause,
      sequence: event.sequence,
    });
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'lesson_item_invalidated') {
    const activity = activityById(kc, event.payload.activityId);
    const attempt =
      event.payload.attemptId === null
        ? null
        : state.attempts.find(
            (candidate) => candidate.attemptId === event.payload.attemptId,
          ) ?? null;
    if (
      transitionError(
        state,
        event.payload.kcId === kc.id &&
          activity.familyId === event.payload.familyId &&
          (event.payload.attemptId === null || attempt !== null) &&
          !state.invalidatedItems.some(
            (item) =>
              item.activityId === activity.id &&
              item.attemptId === event.payload.attemptId,
          ),
        'item_invalidation_not_allowed',
      )
    ) {
      return state;
    }
    if (attempt) attempt.invalidated = true;
    state.invalidatedItems.push({
      activityId: activity.id,
      familyId: activity.familyId,
      attemptId: event.payload.attemptId,
      reason: event.payload.reason,
      exposureRetained: true,
      learnerPenalty: 'none',
      substitutionRequired: event.payload.substitutionRequired,
      sequence: event.sequence,
    });
    clearActivityTransient(state);
    if (!event.payload.substitutionRequired) {
      return LessonRunStateSchema.parse(state);
    }
    if (activity.phase === 'enter_routing') {
      const replacement = kc.microcycle.entryRouting.probeActivityIds
        .map((id) => activityById(kc, id))
        .find((candidate) => exposureFor(state, candidate.familyId) === undefined);
      if (!replacement) {
        pauseForPlanner(state, 'entry_pool_exhausted');
      } else {
        state.sequenceActivityIds[state.sequencePosition] = replacement.id;
        state.currentActivityId = replacement.id;
        state.phase = replacement.phase;
        state.status = 'active';
      }
    } else if (activity.phase === 'completion') {
      scheduleCompletionActivity(state, kc);
    } else if (activity.phase === 'exit_near' || activity.phase === 'exit_changed') {
      state.sealedExitResults = [];
      state.authorityPrivateFeedback.sealedExit = [];
      state.groupedFeedback = null;
      scheduleFreshExitPair(state, kc, false);
    } else {
      pauseForPlanner(state, 'completion_exhausted');
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
      if (state.completionReadyForExit) {
        if (state.completionContext === 'repair') {
          state.status = 'awaiting_reentry';
          state.currentActivityId = null;
          state.phase = 'handoff';
          state.sequenceActivityIds = [];
          state.sequencePosition = 0;
          state.sequencePurpose = null;
          clearCompletionState(state);
        } else {
          schedulePostCompletion(state, kc);
        }
      } else scheduleCompletionActivity(state, kc);
      return LessonRunStateSchema.parse(state);
    }

    const nextPosition = state.sequencePosition + 1;
    if (setCurrentFromSequence(state, kc, nextPosition)) {
      return LessonRunStateSchema.parse(state);
    }
    if (state.sequencePurpose === 'entry') {
      if (state.route === null) return block(state, 'planner_route_missing_after_elicitation');
      beginPlannerRouteInstruction(state, kc);
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
          exitChecksComplete(state) &&
          state.sealedExitResults.length >= 1 &&
          state.authorityPrivateFeedback.sealedExit.length ===
            state.sealedExitResults.length &&
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
    if (exitChecksPass(state)) {
      return LessonRunStateSchema.parse(state);
    }
    const failedResult =
      state.sealedExitResults.find((result) => result.role === 'near' && !result.passedUnsupported) ??
      state.sealedExitResults.find(
        (result) => result.role === 'changed' && !result.passedUnsupported,
      )!;
    state.repairReentry = {
      failedExitFunction: failedResult.role === 'near' ? 'near_use' : 'changed_task',
      originState: 'exit_checks_pending',
      originCheckpointId:
        failedResult.role === 'near'
          ? kc.microcycle.checkpointMap.exitNear
          : kc.microcycle.checkpointMap.exitChanged,
      originExitPairId: state.activeExitPairId,
      preservedSuccesses: [
        ...state.repairReentry.preservedSuccesses,
        ...state.sealedExitResults
          .filter((result) => result.passedUnsupported)
          .map((result) => ({
            exitFunction:
              result.role === 'near' ? ('near_use' as const) : ('changed_task' as const),
            attemptId: result.attemptId,
            activityId: result.activityId,
            familyId: result.familyId,
            sourcePairId: state.activeExitPairId!,
          })),
      ].filter(
        (success, index, successes) =>
          successes.findIndex(
            (candidate) => candidate.exitFunction === success.exitFunction,
          ) === index,
      ),
      preservationDecision: null,
      invalidationReason: null,
      reentryState: null,
      reentryCheckpointId: null,
    };
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
          state.repairCycles < kc.microcycle.repairs.maximumCycles &&
          state.repairReentry.failedExitFunction === event.payload.failedExitFunction &&
          (event.payload.preservationDecision === 'preserve_valid_successes'
            ? event.payload.invalidationReason === null
            : event.payload.invalidationReason !== null),
        'repair_start_not_allowed',
      )
    ) {
      return state;
    }
    state.repairReentry.preservationDecision = event.payload.preservationDecision;
    state.repairReentry.invalidationReason = event.payload.invalidationReason;
    if (event.payload.preservationDecision === 'invalidate_and_restart_near_use') {
      state.repairReentry.failedExitFunction = 'near_use';
      state.repairReentry.preservedSuccesses = [];
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

  if (event.type === 'kc_resumed_at_reentry') {
    const repair = state.repairReentry;
    if (
      transitionError(
        state,
        state.status === 'awaiting_reentry' &&
          event.payload.kcId === kc.id &&
          repair.failedExitFunction === event.payload.failedExitFunction &&
          repair.originCheckpointId === event.payload.originCheckpointId &&
          repair.preservationDecision === event.payload.preservationDecision &&
          repair.invalidationReason === event.payload.invalidationReason,
        'kc_reentry_resume_not_allowed',
      )
    ) {
      return state;
    }
    const pair = selectExitPair(kc, state);
    if (!pair) {
      pauseForPlanner(state, 'exit_pool_exhausted');
      return LessonRunStateSchema.parse(state);
    }
    state.activeExitPairId = pair.id;
    state.usedExitPairIds.push(pair.id);
    state.sealedExitResults = [];
    state.authorityPrivateFeedback.sealedExit = [];
    state.groupedFeedback = null;
    const preservedFunctions = new Set(
      repair.preservedSuccesses.map((success) => success.exitFunction),
    );
    if (
      repair.failedExitFunction === 'changed_task' &&
      !preservedFunctions.has('near_use')
    ) {
      return block(state, 'changed_task_reentry_requires_preserved_near_use');
    }
    state.sequenceActivityIds =
      repair.failedExitFunction === 'changed_task'
        ? [pair.changedActivityId]
        : [
            pair.nearActivityId,
            ...(preservedFunctions.has('changed_task') ? [] : [pair.changedActivityId]),
          ];
    state.sequencePosition = 0;
    state.sequencePurpose = 'post_completion';
    state.repairReentry.reentryState = 'exit_checks_pending';
    state.repairReentry.reentryCheckpointId = event.payload.reentryCheckpointId;
    setCurrentFromSequence(state, kc, 0);
    return LessonRunStateSchema.parse(state);
  }

  if (event.type === 'kc_instructional_exit') {
    if (
      transitionError(
        state,
        state.status === 'awaiting_exit_feedback' &&
          state.groupedFeedback?.kind === 'exit' &&
          exitChecksComplete(state) &&
          exitChecksPass(state) &&
          event.payload.kcId === kc.id &&
          event.payload.nearUseAttemptId ===
            successfulExitAttemptId(state, 'near_use') &&
          event.payload.changedTaskAttemptId ===
            successfulExitAttemptId(state, 'changed_task'),
        'kc_exit_not_allowed',
      )
    ) {
      return state;
    }
    if (!state.exitedKcIds.includes(kc.id)) state.exitedKcIds.push(kc.id);
    if (state.timing.currentKcStartedAt !== null) {
      state.timing.observations.push({
        scope: 'kc_microcycle',
        kcId: kc.id,
        activityId: null,
        startedAt: state.timing.currentKcStartedAt,
        endedAt: event.occurredAt,
        durationMs: Math.max(
          0,
          Date.parse(event.occurredAt) - Date.parse(state.timing.currentKcStartedAt),
        ),
        observationKind: 'wall_clock',
        completionThresholdApplied: false,
      });
    }
    const nextRequiredKcId = definition.orderedRequiredKcIds.find(
      (kcId) => !state.exitedKcIds.includes(kcId),
    );
    const nextKc = definition.knowledgeComponents.find(
      (candidate) => candidate.id === nextRequiredKcId,
    );
    if (!nextKc) {
      state.status = 'awaiting_delivery_completion';
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
    state.status = 'awaiting_planner_resolution';
    state.currentKcId = nextKc.id;
    state.currentActivityId = null;
    state.phase = null;
    state.route = null;
    state.validatedPlannerInstruction = null;
    state.sequenceActivityIds = [];
    state.sequencePosition = 0;
    state.sequencePurpose = null;
    state.plannerReentryRequired = true;
    state.groupedFeedback = null;
    clearActivityTransient(state);
    return LessonRunStateSchema.parse(state);
  }

  return block(state, 'unsupported_lesson_event');
}

function shellCheckpointId(
  definition: LessonDefinition,
  state: LessonRunState,
): string {
  if (state.status === 'complete') return definition.shellCheckpointMap.deliveryComplete;
  if (state.status === 'blocked_for_predecessor') {
    return definition.shellCheckpointMap.blockedForPredecessor;
  }
  if (state.status === 'paused' || state.status === 'handoff') {
    return definition.shellCheckpointMap.paused;
  }
  if (state.lastSequence < 0) return definition.shellCheckpointMap.notStarted;
  return definition.shellCheckpointMap.inProgress;
}

function kcCheckpointId(
  kc: KnowledgeComponentDefinition,
  state: LessonRunState,
  kcId: string,
): string {
  if (state.exitedKcIds.includes(kcId)) return kc.microcycle.checkpointMap.exited;
  if (state.status === 'blocked_for_predecessor') {
    return kc.microcycle.checkpointMap.blockedForPredecessor;
  }
  if (
    state.status === 'handoff' ||
    (state.status === 'paused' && state.plannerReentryRequired)
  ) {
    return kc.microcycle.checkpointMap.plannerHandoff;
  }
  if (state.phase === 'orient_elicit') return kc.microcycle.checkpointMap.orientElicit;
  if (state.phase === 'build_model') return kc.microcycle.checkpointMap.buildModel;
  if (state.phase === 'show_expert_decisions') {
    return kc.microcycle.checkpointMap.showExpertDecisions;
  }
  if (state.phase === 'completion') {
    return kc.microcycle.checkpointMap.completion[state.assistanceLevel];
  }
  if (state.phase === 'contrast_bound') return kc.microcycle.checkpointMap.contrastBound;
  if (state.phase === 'exit_near') return kc.microcycle.checkpointMap.exitNear;
  if (state.phase === 'exit_changed') return kc.microcycle.checkpointMap.exitChanged;
  if (state.phase === 'targeted_repair') {
    return state.repairCycles <= 1
      ? kc.microcycle.checkpointMap.repairCycle1
      : kc.microcycle.checkpointMap.repairCycle2;
  }
  return kc.microcycle.checkpointMap.enter;
}

function appendTransactionalCheckpoint(
  prior: LessonRunState,
  next: LessonRunState,
  definition: LessonDefinition,
  event: LessonRunEvent,
): LessonRunState {
  if (next.lastSequence === prior.lastSequence) return next;
  const payloadKcId =
    'kcId' in event.payload && typeof event.payload.kcId === 'string'
      ? event.payload.kcId
      : null;
  const checkpointKcId = payloadKcId ?? next.currentKcId;
  const kc =
    checkpointKcId === null
      ? null
      : definition.knowledgeComponents.find(
          (candidate) => candidate.id === checkpointKcId,
        ) ?? null;
  const instruction =
    next.validatedPlannerInstruction ?? prior.validatedPlannerInstruction;
  const kcOrdinal =
    kc === null ? null : definition.orderedRequiredKcIds.indexOf(kc.id) + 1;
  const shellState =
    next.status === 'complete'
      ? 'delivery_complete'
      : next.status === 'blocked_for_predecessor'
        ? 'blocked_for_predecessor'
        : next.status === 'paused' || next.status === 'handoff'
          ? 'paused'
          : next.lastSequence < 0
            ? 'not_started'
            : 'in_progress';
  const kcState =
    kc === null
      ? null
      : next.exitedKcIds.includes(kc.id)
        ? 'exited'
        : next.status === 'blocked_for_predecessor'
          ? 'blocked_for_predecessor'
          : next.phase === 'targeted_repair' || next.status === 'awaiting_reentry'
            ? 'repair_in_progress'
            : ['exit_near', 'exit_changed'].includes(next.phase ?? '')
              ? 'exit_checks_pending'
              : 'in_progress';
  const checkpointBase = {
    definitionHash: next.pins.reviewedContentHash,
    lessonId: next.pins.lessonId,
    kcId: kc?.id ?? null,
    kcOrdinal: kcOrdinal > 0 ? kcOrdinal : null,
    shellState,
    kcState,
    nodeId: next.currentKcId === kc?.id ? next.currentActivityId : null,
    actualAssistanceLevel: next.assistanceLevel,
    validatedPlannerInstruction: instruction
      ? structuredClone(instruction)
      : null,
    attempts:
      kc === null
        ? structuredClone(next.attempts)
        : structuredClone(
            next.attempts.filter((attempt) =>
              kc.activities.some((activity) => activity.id === attempt.activityId),
            ),
          ),
    exposedFamilies: structuredClone(next.exposures),
    openFeedback: {
      sealedEntryActivityIds: next.authorityPrivateFeedback.sealedEntry.map(
        (entry) => entry.activityId,
      ),
      sealedExitActivityIds: next.authorityPrivateFeedback.sealedExit.map(
        (entry) => entry.activityId,
      ),
      visibleActivityIds: [
        ...(next.feedback?.entries.map((entry) => entry.activityId) ?? []),
        ...(next.groupedFeedback?.entries.map((entry) => entry.activityId) ?? []),
      ],
    },
    repairCycle: next.repairCycles,
    repairReentry: structuredClone(next.repairReentry),
    originCoordinate: instruction?.resolution.origin.checkpointId ?? null,
    reentryCoordinate: instruction?.resolution.reentry?.checkpointId ?? null,
    eventStreamSequence: event.sequence,
    committedByEventId: event.eventId,
    committedAt: event.occurredAt,
  } as const;
  const shell = LessonRuntimeCheckpointSchema.parse({
    ...checkpointBase,
    checkpointId: shellCheckpointId(definition, next),
  });
  const kcCheckpoint =
    kc === null
      ? null
      : LessonRuntimeCheckpointSchema.parse({
          ...checkpointBase,
          checkpointId: kcCheckpointId(kc, next, kc.id),
        });
  const commit = LessonCheckpointCommitSchema.parse({
    shell,
    kc: kcCheckpoint,
  });
  const committed = structuredClone(next);
  committed.currentCheckpoint = structuredClone(kcCheckpoint ?? shell);
  if (kcCheckpoint !== null) {
    const existing = committed.kcCheckpoints.findIndex(
      (checkpoint) => checkpoint.kcId === kcCheckpoint.kcId,
    );
    if (existing >= 0) committed.kcCheckpoints[existing] = structuredClone(kcCheckpoint);
    else committed.kcCheckpoints.push(structuredClone(kcCheckpoint));
  }
  committed.checkpointCommits.push(commit);
  return LessonRunStateSchema.parse(committed);
}

export function reduceLessonRun(
  stateInput: LessonRunState,
  eventInput: unknown,
  definitionInput: unknown,
  mode: LessonRuntimeMode,
): LessonRunState {
  const prior = LessonRunStateSchema.parse(stateInput);
  const next = reduceLessonRunTransition(prior, eventInput, definitionInput, mode);
  const event = LessonRunEventSchema.safeParse(eventInput);
  const definition = LessonDefinitionSchema.safeParse(definitionInput);
  if (!event.success || !definition.success) return next;
  return appendTransactionalCheckpoint(prior, next, definition.data, event.data);
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
  outcome: 'correct' | 'incorrect' | 'not_sure' | null;
  omissionType:
    | 'intentional_skip'
    | 'valid_timeout'
    | 'abandonment'
    | 'technical'
    | 'inaccessible'
    | 'telemetry_missing'
    | null;
  validForEvidence: boolean;
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
  if (normalization.stripPunctuation) result = result.replace(/[^\p{L}\p{N}\s.+-]/gu, ' ');
  if (normalization.collapseWhitespace) result = result.replace(/\s+/g, ' ');
  if (normalization.trim) result = result.trim();
  if (normalization.case === 'lowercase') result = result.toLowerCase();
  return result;
};

const TOKEN_WORD_CHARACTER = /[\p{L}\p{N}\p{M}_]/u;

const containsNormalizedToken = (text: string, token: string): boolean => {
  if (token.length === 0) return false;
  let fromIndex = 0;
  while (fromIndex <= text.length - token.length) {
    const matchIndex = text.indexOf(token, fromIndex);
    if (matchIndex < 0) return false;
    const before = Array.from(text.slice(0, matchIndex)).at(-1);
    const after = Array.from(text.slice(matchIndex + token.length))[0];
    if (
      (before === undefined || !TOKEN_WORD_CHARACTER.test(before)) &&
      (after === undefined || !TOKEN_WORD_CHARACTER.test(after))
    ) {
      return true;
    }
    fromIndex = matchIndex + 1;
  }
  return false;
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
      containsNormalizedToken(normalized, normalizeText(token, matcher.normalization)),
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
            accepted.toLowerCase().replace(/[.,:;]+$/u, '') ===
            unit!.toLowerCase().replace(/[.,:;]+$/u, ''),
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
  if (response.kind === 'omission') {
    const validityIncident = ['technical', 'inaccessible', 'telemetry_missing'].includes(
      response.omissionType,
    );
    return {
      outcome: validityIncident ? null : 'not_sure',
      omissionType: response.omissionType,
      validForEvidence: !validityIncident,
      diagnosticSignalIds: [],
      objectiveFeatureIds: [],
      feedback: [
        {
          activityId: activity.id,
          tone: 'information',
          message: validityIncident
            ? 'This administration was invalid and will be replaced without learner penalty.'
            : 'The omission is recorded; support will not be reduced.',
        },
      ],
    };
  }
  if (response.kind === 'not_sure') {
    if (!activity.response.allowNotSure) throw new Error('Not-sure is not enabled.');
    const message =
      activity.response.kind === 'choice'
        ? activity.response.notSureFeedback
        : activity.response.rubric.notSureFeedback;
    const diagnosticSignalIds =
      activity.response.kind === 'choice'
        ? activity.response.notSureDiagnosticSignalIds
        : activity.response.rubric.notSureDiagnosticSignalIds;
    const objectiveFeatureIds =
      activity.response.kind === 'choice'
        ? activity.response.notSureObjectiveFeatureIds
        : activity.response.rubric.notSureObjectiveFeatureIds;
    return {
      outcome: 'not_sure',
      omissionType: null,
      validForEvidence: true,
      diagnosticSignalIds: [...diagnosticSignalIds],
      objectiveFeatureIds: [...objectiveFeatureIds],
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
      omissionType: null,
      validForEvidence: true,
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
    omissionType: null,
    validForEvidence: true,
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
    state.lastResponse?.activityId !== activity.id &&
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
      canReveal:
        state.lastResponse?.activityId !== activity.id &&
        !['exit_near', 'exit_changed'].includes(activity.phase) &&
        activity.assistance.revealAllowed &&
        !(exposureFor(state, activity.familyId)?.revealed ?? false),
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
    schemaVersion: '2.0' as const,
    runId: state.pins.runId,
    runVersion: state.lastSequence,
    lessonId: state.pins.lessonId,
    definitionVersion: state.pins.definitionVersion,
    lessonTitle: definition?.title ?? 'Lesson unavailable',
    kcId: kc?.id ?? null,
    kcTitle: kc?.title ?? null,
    route: state.route,
    checkpointId: state.currentCheckpoint?.checkpointId ?? null,
    progress: {
      kcOrdinal: kcIndex >= 0 ? kcIndex + 1 : null,
      kcCount: definition?.orderedRequiredKcIds.length ?? 1,
      exitedKcCount:
        definition?.orderedRequiredKcIds.filter((kcId) =>
          state.exitedKcIds.includes(kcId),
        ).length ?? 0,
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
        orderedRequiredKcIds: [...definition.orderedRequiredKcIds],
        instructionalExitKcIds: [...state.exitedKcIds],
      },
    });
  }

  const activity = currentActivity(definition, state);
  const safe = activity ? safeActivity(definition, state, activity) : null;
  if (state.status === 'awaiting_planner_resolution') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'planner_resolution_required',
      activity: null,
      availableActions: [],
      message: 'The planner must issue a valid, replayable instruction resolution.',
    });
  }
  if (state.status === 'blocked_for_predecessor') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'blocked_for_predecessor',
      activity: null,
      availableActions: [],
      message: 'This KC is paused at its exact checkpoint for predecessor support.',
    });
  }
  if (state.status === 'awaiting_reentry') {
    return LessonStepViewSchema.parse({
      ...common,
      status: 'reentry_pending',
      activity: null,
      availableActions: [],
      message: 'The authority is resuming the exact failed exit function.',
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
    | 'present'
    | 'submit_response'
    | 'continue'
    | 'request_hint'
    | 'request_reveal'
    | 'pause'
  > = [];
  if (state.activePresentation === null) actions.push('present');
  else if (activity.response.kind === 'none' || state.lastResponse?.activityId === activity.id) {
    actions.push('continue');
  } else {
    actions.push('submit_response');
    if (safe.assistance.canRequestMore) actions.push('request_hint');
    if (safe.assistance.canReveal) actions.push('request_reveal');
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
      schemaVersion: '2.0',
      eventId: eventIdentity.eventId,
      idempotencyKey: eventIdentity.idempotencyKey,
      ...state.pins,
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

  if (action.type === 'record_confidence') {
    append('lesson_confidence_recorded', {
      kcId: kc.id,
      attemptId: action.attemptId,
      confidence: action.confidence,
    });
    return { state, events, duplicate: false };
  }
  if (action.type === 'record_learner_cause') {
    append('lesson_learner_cause_recorded', {
      kcId: kc.id,
      attemptId: action.attemptId,
      cause: action.cause,
    });
    return { state, events, duplicate: false };
  }
  if (action.type === 'present') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The presented activity does not match the current run.');
    }
    append('lesson_activity_presented', {
      kcId: kc.id,
      activityId: activity.id,
      familyId: activity.familyId,
      attemptSlot: 'first',
    });
    return { state, events, duplicate: false };
  }
  if (action.type === 'request_hint') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The hint request does not match the current activity.');
    }
    if (state.lastResponse?.activityId === activity.id) {
      throw new Error('Support cannot be added after this response is committed.');
    }
    const hint = nextAssistanceHint(activity, state);
    if (!hint) throw new Error('No additional deterministic support is available.');
    append('lesson_hint_requested', {
      kcId: kc.id,
      activityId: activity.id,
      hintId: hint.id,
      level: hint.level,
    });
    append('lesson_assistance_revealed', {
      kcId: kc.id,
      activityId: activity.id,
      fromLevel: state.assistanceLevel,
      level: hint.level,
    });
    return { state, events, duplicate: false };
  }
  if (action.type === 'request_reveal') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The reveal request does not match the current activity.');
    }
    if (state.lastResponse?.activityId === activity.id) {
      throw new Error('A reveal cannot be requested after this response is committed.');
    }
    append('lesson_reveal_requested', {
      kcId: kc.id,
      activityId: activity.id,
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
      responseDigest: createHash('sha256')
        .update(deterministicJson(action.response))
        .digest('hex'),
      responseKind: action.response.kind,
      omissionType: evaluated.omissionType,
      validForEvidence: evaluated.validForEvidence,
      elapsedMs: action.elapsedMs,
      assistanceLevel: state.assistanceLevel,
      assisted: state.visibleAssistanceLevel !== null,
      revealed: exposureFor(state, activity.familyId)?.revealed ?? false,
      diagnosticSignalIds: evaluated.diagnosticSignalIds,
      objectiveFeatureIds: evaluated.objectiveFeatureIds,
      authorityFeedback: evaluated.feedback,
    });
    if (
      evaluated.omissionType !== null &&
      ['technical', 'inaccessible', 'telemetry_missing'].includes(
        evaluated.omissionType,
      )
    ) {
      append('lesson_item_invalidated', {
        kcId: kc.id,
        activityId: activity.id,
        familyId: activity.familyId,
        attemptId: events[0]!.eventId,
        reason: evaluated.omissionType,
        substitutionRequired: true,
      });
    }
    if (state.status === 'awaiting_exit_feedback') {
      append('lesson_exit_feedback_released', { kcId: kc.id });
    }
    return { state, events, duplicate: false };
  }
  if (action.type === 'retry_response') {
    if (!activity || action.activityId !== activity.id) {
      throw new Error('The retry does not match the current activity.');
    }
    if (action.response.kind === 'omission') {
      throw new Error('An omission is not a retry observation.');
    }
    const original = state.attempts.find(
      (attempt) =>
        attempt.attemptId === action.retryOf &&
        attempt.activityId === activity.id &&
        attempt.administration === 'first',
    );
    if (!original) throw new Error('The retry must reference the immutable first attempt.');
    const evaluated = evaluateLessonResponse(activity, action.response);
    if (evaluated.outcome === null) throw new Error('A retry requires a scorable response.');
    append('lesson_retry_observed', {
      kcId: kc.id,
      activityId: activity.id,
      familyId: activity.familyId,
      retryOf: action.retryOf,
      responseDigest: createHash('sha256')
        .update(deterministicJson(action.response))
        .digest('hex'),
      responseKind: action.response.kind,
      outcome: evaluated.outcome,
      assistanceLevel: state.assistanceLevel,
      elapsedMs: action.elapsedMs,
    });
    return { state, events, duplicate: false };
  }
  if (action.type === 'continue') {
    if (state.status === 'awaiting_exit_feedback') {
      const nearUseAttemptId = successfulExitAttemptId(state, 'near_use');
      const changedTaskAttemptId = successfulExitAttemptId(state, 'changed_task');
      if (nearUseAttemptId === null || changedTaskAttemptId === null) {
        throw new Error('Instructional exit requires both valid first-attempt checks.');
      }
      append('kc_instructional_exit', {
        kcId: kc.id,
        nearUseAttemptId,
        changedTaskAttemptId,
      });
      if (state.status === 'awaiting_delivery_completion') {
        append('lesson_delivery_completed', {
          orderedRequiredKcIds: definition.orderedRequiredKcIds,
          instructionalExitKcIds: state.exitedKcIds,
          derivedByAuthority: true,
        });
      }
      return { state, events, duplicate: false };
    }
    if (state.status === 'awaiting_repair') {
      const mapping = eligibleRepairMapping(kc, state);
      if (state.repairReentry.failedExitFunction === null) {
        throw new Error('Repair cannot start without the exact failed exit function.');
      }
      append('lesson_repair_started', {
        kcId: kc.id,
        repairRouteId: mapping.id,
        failedExitFunction: state.repairReentry.failedExitFunction,
        preservationDecision: 'preserve_valid_successes',
        invalidationReason: null,
      });
      return { state, events, duplicate: false };
    }
    if (!activity || action.activityId !== activity.id) {
      throw new Error('Continue does not match the current activity.');
    }
    append('lesson_activity_completed', { kcId: kc.id, activityId: activity.id });
    if (state.status === 'awaiting_reentry') {
      const repair = state.repairReentry;
      if (
        repair.failedExitFunction === null ||
        repair.originCheckpointId === null ||
        repair.preservationDecision === null
      ) {
        throw new Error('Exact repair reentry metadata is incomplete.');
      }
      append('kc_resumed_at_reentry', {
        kcId: kc.id,
        failedExitFunction: repair.failedExitFunction,
        originCheckpointId: repair.originCheckpointId,
        reentryCheckpointId:
          repair.failedExitFunction === 'near_use'
            ? kc.microcycle.checkpointMap.exitNear
            : kc.microcycle.checkpointMap.exitChanged,
        preservationDecision: repair.preservationDecision,
        invalidationReason: repair.invalidationReason,
      });
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
  if (command.expectedRunVersion !== state.lastSequence) {
    throw new Error('lesson command run version mismatch');
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
      expectedStreamVersion: 0,
      contentRelease: state.pins.contentRelease,
      taskInstanceId: newTaskInstanceId(),
    },
    runId: state.pins.runId,
    expectedRunVersion: state.lastSequence,
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
  let state = LessonRunStateSchema.parse(stateInput);
  const occurredAt = clock.now();
  const rootEventId = newEventId();
  const rootIdempotencyKey = newIdempotencyKey();
  if (state.status === 'awaiting_planner_resolution') {
    const rejected = LessonRunEventSchema.parse({
      schemaVersion: '2.0',
      eventId: rootEventId,
      idempotencyKey: rootIdempotencyKey,
      ...state.pins,
      sequence: state.lastSequence + 1,
      occurredAt,
      type: 'lesson_planner_resolution_rejected',
      payload: {
        resolutionId: state.pins.plannerResolutionId,
        kcId: state.pins.targetKcId,
        reasonCodes:
          state.plannerResolutionRejectionCodes.length > 0
            ? state.plannerResolutionRejectionCodes
            : ['RESOLUTION_MISSING'],
      },
    });
    return {
      state: reduceLessonRun(state, rejected, definitionInput, mode),
      events: [rejected],
      duplicate: false,
    };
  }
  const started = LessonRunEventSchema.parse({
    schemaVersion: '2.0',
    eventId: rootEventId,
    idempotencyKey: rootIdempotencyKey,
    ...state.pins,
    sequence: state.lastSequence + 1,
    occurredAt,
    type: 'lesson_run_started',
    payload: {},
  });
  state = reduceLessonRun(state, started, definitionInput, mode);
  if (state.validatedPlannerInstruction === null) {
    throw new Error('A lesson cannot start without an accepted planner instruction.');
  }
  const selected = LessonRunEventSchema.parse({
    schemaVersion: '2.0',
    eventId: EventIdSchema.parse(
      deterministicUuid(`${rootEventId}:lesson-child-event:1`),
    ),
    idempotencyKey: IdempotencyKeySchema.parse(
      deterministicUuid(`${rootIdempotencyKey}:lesson-child-idempotency:1`),
    ),
    ...state.pins,
    sequence: state.lastSequence + 1,
    occurredAt,
    type: 'lesson_route_selected',
    payload: {
      validatedInstruction: state.validatedPlannerInstruction,
    },
  });
  state = reduceLessonRun(state, selected, definitionInput, mode);
  return {
    state,
    events: [started, selected],
    duplicate: false,
  };
}

export const parseLessonActionResponse = (input: unknown): LessonActivityResponseInput =>
  LessonActivityResponseInputSchema.parse(input);
