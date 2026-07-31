import { createHash, randomUUID } from 'node:crypto';
import {
  TARGET_LESSON_ID,
  TARGET_ORDERED_KC_IDS,
  VECTOR_LESSON_KCS,
  VECTOR_LESSON_ROUTES,
  type VectorLessonActivityRole,
  type VectorLessonChoiceId,
  type VectorLessonKcAuthoring,
  type VectorLessonKcId,
  type VectorLessonRoute,
  type VectorLessonSafeItem,
} from '@mcat/content/v3-vector-lesson';
import {
  VectorLessonRunViewSchema,
  type VectorLessonAction,
  type VectorLessonRunView,
} from '@mcat/contracts';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import { lessonContentProvider } from './lesson-content-provider';

const REGISTRY_SHA256 = '635c39e9c0ebb28a3892399449aa9b74893aae3264924cd739b92b6e370ba26a';
// L1's content revision, read from the vendored lesson-script.json through the
// one content seam (Phase 7-4). Byte-identical to the retired generator's
// `buildVectorLessonArtifacts().script.content_sha256` (validator rules R3/R5).
const DEFINITION_HASH = lessonContentProvider.getDefinitionHash(TARGET_LESSON_ID);
const ROUTING_POLICY_VERSION = 'v3-les-130923-internal-pilot-route-v1';
const PLANNER_POLICY_VERSION = 'v3-les-130923-server-standard-pilot-v1';
const EXIT_POLICY_VERSION = 'v3-les-130923-uncalibrated-instructional-exit-v1';
const REPAIR_POLICY_VERSION = 'v3-les-130923-uncalibrated-finite-repair-v1';
const MAX_INTERNAL_PILOT_REPAIR_CONFIRMATIONS = 2;
const MISCONCEPTION_HYPOTHESIS_BY_KC: Readonly<Record<VectorLessonKcId, string>> = {
  'V3-KC-866848': 'vtr-observed-sign-reversal-v1',
  'V3-KC-700208': 'vtr-observed-ratio-role-swap-v1',
  'V3-KC-159529': 'vtr-observed-direction-input-order-v1',
};

type KcStage =
  | 'ENTRY'
  | 'ORIENTATION'
  | 'EXPLANATION'
  | 'MODEL'
  | 'THINK_ALOUD'
  | 'WORKED'
  | 'GUIDED'
  | 'GUIDED_FRESH'
  | 'LIGHT'
  | 'LIGHT_FRESH'
  | 'SUPPORT_RESTORE'
  | 'SOLO'
  | 'CONTRAST'
  | 'NEAR_INITIAL'
  | 'CHANGED_INITIAL'
  | 'FEEDBACK'
  | 'REPAIR_CONTENT'
  | 'REPAIR_ALT_CONTENT'
  | 'REPAIR_CONFIRM_1'
  | 'REPAIR_CONFIRM_2'
  | 'REENTRY'
  | 'RECAP'
  | 'BLOCKED'
  | 'COMPLETE';

const KC_STAGES: readonly KcStage[] = [
  'ENTRY',
  'ORIENTATION',
  'EXPLANATION',
  'MODEL',
  'THINK_ALOUD',
  'WORKED',
  'GUIDED',
  'GUIDED_FRESH',
  'LIGHT',
  'LIGHT_FRESH',
  'SUPPORT_RESTORE',
  'SOLO',
  'CONTRAST',
  'NEAR_INITIAL',
  'CHANGED_INITIAL',
  'FEEDBACK',
  'REPAIR_CONTENT',
  'REPAIR_ALT_CONTENT',
  'REPAIR_CONFIRM_1',
  'REPAIR_CONFIRM_2',
  'REENTRY',
  'RECAP',
  'BLOCKED',
  'COMPLETE',
];

type FailedExitFunction = 'NEAR_USE' | 'CHANGED_TASK';

export interface VectorLessonPlannerResolution {
  readonly resolutionId: string;
  readonly kcId: VectorLessonKcId;
  readonly taskKind: 'KC_LESSON';
  readonly resolvedInstructionRoute: VectorLessonRoute;
  readonly registrySha256: string;
  readonly routingPolicyVersion: string;
  readonly plannerPolicyVersion: string;
  readonly evidenceCutoff: string;
  readonly expiresAt: string | null;
  readonly misconceptionHypothesisId?: string;
}

export interface ValidatedVectorLessonResolution {
  readonly route: VectorLessonRoute;
  readonly disposition: 'ACCEPTED' | 'DOWNGRADED';
  readonly reason: string | null;
  readonly resolutionId: string;
}

export interface VectorLessonResponseRecord {
  readonly responseId: string;
  readonly itemId: string;
  readonly itemVersion: string;
  readonly itemFamilyId: string;
  readonly kcId: VectorLessonKcId;
  readonly activityRole: VectorLessonActivityRole;
  /**
   * What this runtime PUT ON THE SCREEN for this administration, read from the
   * live delivery state at commit.
   *
   * There is deliberately no authored `assistance_state` on this record. It used
   * to be here, was emitted as the seam's `assistanceLevel`, and thereby handed
   * the lesson author the independence decision (fail-open 6, commit `9fcaea3`).
   * The field is gone rather than merely unread, so the authored byte is
   * unreachable from the seam by construction rather than by discipline.
   *
   * Every field below is a fact about the delivery:
   *
   * - `observedScaffoldDisplayed` — the persistent structured reference panel
   *   accompanied the item. Displayed, not merely available, and displayed
   *   whether or not the learner asked: `presentedSupportFor` decides it once,
   *   and the screen reads the same value.
   * - `observedSupportOffered` — the one-bounded-cue mechanism was authorized.
   *   An OFFER carries no content, so it is audit only and never raises the
   *   level; recorded so a run where the cue was declined can be told from one
   *   where it was never available.
   * - `observedSupportRequested` — the learner issued `REQUEST_SUPPORT` and the
   *   runtime released the cue's text.
   * - `observedAnswerRevealed` — the open-feedback state at commit. This state
   *   machine only enters feedback after a commit, so nothing answer-bearing can
   *   precede one, but it is read rather than assumed.
   */
  readonly observedScaffoldDisplayed: boolean;
  readonly observedSupportOffered: boolean;
  readonly observedSupportRequested: boolean;
  readonly observedAnswerRevealed: boolean;
  readonly firstAttempt: true;
  readonly choiceId: VectorLessonChoiceId | null;
  readonly correct: boolean;
  readonly omissionType: 'INTENTIONAL_SKIP' | null;
  readonly observedResponseFeatures: readonly string[];
  readonly committedAt: string;
  readonly feedbackState: 'AUTHORIZED_AFTER_COMMITMENT';
}

interface RepairExecution {
  readonly failedFunction: FailedExitFunction;
  readonly registryRepairTemplateIds: readonly string[];
  readonly instantiatedRegistryRelationId: null;
  readonly originSequenceRelationId: 'R14-FD-130923';
  readonly originCheckpointId: string;
  readonly originMicrocycleState: 'NEAR_USE_EXIT_PENDING' | 'CHANGED_TASK_EXIT_PENDING';
  readonly preservedExitFunctionSuccesses: readonly FailedExitFunction[];
  readonly reentryCheckpointId: string;
  readonly reentryMicrocycleState: 'NEAR_USE_EXIT_PENDING' | 'CHANGED_TASK_EXIT_PENDING';
  readonly preservationPolicyDecisionId: string;
  confirmationAttempt: 1 | 2;
}

export interface VectorLessonReentryCoordinate {
  readonly failedFunction: FailedExitFunction;
  readonly originCheckpointId: string;
  readonly destination: 'NEAR_USE_EXIT_PENDING' | 'CHANGED_TASK_EXIT_PENDING';
  readonly freshItemId: string;
}

interface FeedbackState {
  readonly sourceItemId: string;
  readonly sourceStage: KcStage;
  readonly sourceNodeId: string;
  readonly heading: string;
  readonly outcome: 'CORRECT' | 'TRY_A_DIFFERENT_ANGLE' | 'REPAIR_CONFIRMED' | 'REPAIR_EXHAUSTED';
  readonly body: readonly string[];
  readonly nextStage: KcStage;
  readonly primaryActionLabel: string;
}

interface Checkpoint {
  readonly lessonRunId: string;
  readonly lessonDefinitionHash: string;
  readonly kcId: VectorLessonKcId;
  readonly canonicalOrdinal: number;
  readonly microcycleState: string;
  readonly nodeId: string;
  readonly assistanceState: 'A0' | 'A1' | 'A2' | 'A3';
  readonly resolvedInstructionRoute: VectorLessonRoute;
  readonly plannerInstructionResolutionId: string;
  readonly attemptState: 'AWAITING_RESPONSE' | 'COMMITTED' | 'NOT_APPLICABLE';
  readonly committedResponseIds: readonly string[];
  readonly exposedItemFamilyIds: readonly string[];
  readonly openFeedbackState: string | null;
  readonly supportReturnStage: 'LIGHT' | 'LIGHT_FRESH' | null;
  readonly repairCycle: number;
  readonly failedExitFunction: FailedExitFunction | null;
  readonly preservedExitFunctionSuccesses: readonly FailedExitFunction[];
  readonly originatingSequenceCoordinate: number;
  readonly reentryCoordinate: VectorLessonReentryCoordinate | null;
  readonly reentryMicrocycleState: string | null;
  readonly eventStreamSequence: number;
}

interface LessonRuntimeEvent {
  readonly sequence: number;
  readonly type: string;
  readonly occurredAt: string;
  readonly kcId: VectorLessonKcId;
  readonly nodeId: string;
}

export interface VectorLessonRun {
  readonly runId: string;
  readonly lessonId: typeof TARGET_LESSON_ID;
  readonly definitionHash: string;
  readonly orderedKcIds: readonly VectorLessonKcId[];
  status: 'IN_PROGRESS' | 'BLOCKED' | 'DELIVERY_COMPLETE';
  paused: boolean;
  currentKcIndex: number;
  stage: KcStage;
  currentItemId: string | null;
  resolvedRoute: VectorLessonRoute;
  plannerResolutionId: string;
  /**
   * The authored assistance DESIGN of the current screen, carried for the
   * checkpoint's audit trail and read by nothing else. It is not the assistance
   * the learner took and it never leaves this module — the response record has no
   * such field, so it cannot reach the seam.
   */
  assistanceState: 'A0' | 'A1' | 'A2' | 'A3';
  /**
   * The delivery ledger for the current administration — see
   * {@link presentedSupportFor}. `scaffoldPresented` and `supportOffered` are
   * what the runtime decided to put on the screen; `supportRequested` is what
   * the learner then took.
   */
  scaffoldPresented: boolean;
  supportOffered: boolean;
  supportRequested: boolean;
  supportReturnStage: 'LIGHT' | 'LIGHT_FRESH' | null;
  committedResponses: Record<string, VectorLessonResponseRecord>;
  exposedFamilyIds: string[];
  exitedKcIds: VectorLessonKcId[];
  preservedExitSuccesses: Record<VectorLessonKcId, { nearUse: boolean; changedTask: boolean }>;
  feedback: FeedbackState | null;
  repair: RepairExecution | null;
  reentryCoordinate: VectorLessonReentryCoordinate | null;
  checkpoint: Checkpoint;
  eventSequence: number;
  events: LessonRuntimeEvent[];
  startedAt: string;
  updatedAt: string;
  pauseCount: number;
  resumeCount: number;
  sessionCount: number;
  readonly estimatedCoreSegmentMinutes: null;
  readonly estimatedBranchSegmentMinutes: null;
  readonly estimatedKcCoreMinutes: null;
  readonly estimatedKcBranchMinutes: null;
  readonly estimatedShellCoreMinutes: null;
  readonly estimatedShellBranchMinutes: null;
  observedActiveSegmentMs: number;
  observedWallSegmentMs: number;
  observedKcActiveMs: number;
  observedShellActiveMs: number;
  helpTimeMs: number;
  feedbackTimeMs: number;
  repairTimeMs: number;
  readonly exitPolicyVersion: string;
  readonly repairPolicyVersion: string;
  readonly timingPolicyVersion: string;
}

export function createStandardVectorLessonPilotResolution(
  kcId: VectorLessonKcId,
  now: string,
): VectorLessonPlannerResolution {
  return {
    resolutionId: `pilot-${kcId.toLowerCase()}-${createHash('sha256')
      .update(`${kcId}:${now}:${PLANNER_POLICY_VERSION}`)
      .digest('hex')
      .slice(0, 16)}`,
    kcId,
    taskKind: 'KC_LESSON',
    resolvedInstructionRoute: 'STANDARD',
    registrySha256: REGISTRY_SHA256,
    routingPolicyVersion: ROUTING_POLICY_VERSION,
    plannerPolicyVersion: PLANNER_POLICY_VERSION,
    evidenceCutoff: now,
    expiresAt: null,
  };
}

export function validateVectorLessonPlannerResolution(
  resolution: VectorLessonPlannerResolution,
  expectedKcId: VectorLessonKcId,
  now: string,
): ValidatedVectorLessonResolution {
  const nowMs = Date.parse(now);
  const cutoffMs = Date.parse(resolution.evidenceCutoff);
  const expiresMs = resolution.expiresAt === null ? null : Date.parse(resolution.expiresAt);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(cutoffMs) ||
    (expiresMs !== null && !Number.isFinite(expiresMs)) ||
    resolution.taskKind !== 'KC_LESSON' ||
    resolution.kcId !== expectedKcId ||
    !VECTOR_LESSON_ROUTES.includes(resolution.resolvedInstructionRoute) ||
    resolution.registrySha256 !== REGISTRY_SHA256 ||
    resolution.routingPolicyVersion !== ROUTING_POLICY_VERSION ||
    resolution.plannerPolicyVersion !== PLANNER_POLICY_VERSION ||
    (expiresMs !== null && expiresMs <= nowMs)
  ) {
    throw new Error('Planner instruction resolution is invalid for this lesson checkpoint');
  }
  if (
    resolution.resolvedInstructionRoute === 'MISCONCEPTION' &&
    resolution.misconceptionHypothesisId !== MISCONCEPTION_HYPOTHESIS_BY_KC[expectedKcId]
  ) {
    return {
      route: 'STANDARD',
      disposition: 'DOWNGRADED',
      reason: 'MISCONCEPTION_REFERENCE_INVALID',
      resolutionId: resolution.resolutionId,
    };
  }
  if (resolution.resolvedInstructionRoute === 'PREREQUISITE_SUPPORT') {
    // This canonical first lesson has no hard predecessor. V3-SUP-900001 is
    // optional below-ceiling support and must never be promoted to a blocker.
    return {
      route: 'STANDARD',
      disposition: 'DOWNGRADED',
      reason: 'NO_AUTHORIZED_HARD_PREDECESSOR_FOR_TARGET',
      resolutionId: resolution.resolutionId,
    };
  }
  return {
    route: resolution.resolvedInstructionRoute,
    disposition: 'ACCEPTED',
    reason: null,
    resolutionId: resolution.resolutionId,
  };
}

function currentKc(run: VectorLessonRun): VectorLessonKcAuthoring {
  const kc = VECTOR_LESSON_KCS[run.currentKcIndex];
  if (kc === undefined) throw new Error('Lesson checkpoint has no current KC');
  return kc;
}

function itemForStage(run: VectorLessonRun, stage: KcStage): VectorLessonSafeItem | null {
  const kc = currentKc(run);
  const byRole = (role: VectorLessonActivityRole) =>
    kc.items.filter((item) => item.activity_role === role);
  switch (stage) {
    case 'ENTRY':
      return byRole('ENTRY_CHECK')[0] ?? null;
    case 'GUIDED':
      return byRole('GUIDED_PRACTICE').find((item) => !item.item_id.endsWith('fresh')) ?? null;
    case 'GUIDED_FRESH':
      return byRole('GUIDED_PRACTICE').find((item) => item.item_id.endsWith('fresh')) ?? null;
    case 'LIGHT':
      return (
        byRole('LIGHT_SUPPORT_PRACTICE').find((item) => !item.item_id.endsWith('fresh')) ?? null
      );
    case 'LIGHT_FRESH':
      return (
        byRole('LIGHT_SUPPORT_PRACTICE').find((item) => item.item_id.endsWith('fresh')) ?? null
      );
    case 'SOLO':
      return byRole('SOLO_PRACTICE')[0] ?? null;
    case 'NEAR_INITIAL':
      return byRole('NEAR_EXIT').find((item) => item.item_id.endsWith('initial')) ?? null;
    case 'CHANGED_INITIAL':
      return byRole('CHANGED_EXIT').find((item) => item.item_id.endsWith('initial')) ?? null;
    case 'REPAIR_CONFIRM_1':
    case 'REPAIR_CONFIRM_2': {
      const failed = run.repair?.failedFunction;
      if (failed === undefined) return null;
      const functionSlug = failed === 'NEAR_USE' ? 'near' : 'changed';
      const suffix = `${functionSlug}-${stage === 'REPAIR_CONFIRM_1' ? '1' : '2'}`;
      return byRole('REPAIR_CONFIRMATION').find((item) => item.item_id.endsWith(suffix)) ?? null;
    }
    case 'REENTRY': {
      const failed = run.repair?.failedFunction ?? run.reentryCoordinate?.failedFunction;
      const role = failed === 'CHANGED_TASK' ? 'CHANGED_EXIT' : 'NEAR_EXIT';
      return byRole(role).find((item) => item.item_id.endsWith('reentry')) ?? null;
    }
    default:
      return null;
  }
}

/**
 * What support this runtime puts on the screen alongside one item.
 *
 * ONE decision, in ONE place. The rendered screen, the `REQUEST_SUPPORT`
 * authorization and the commit-time observation all read its result out of run
 * state, so the runtime cannot present a scaffold it did not record, and cannot
 * record one it did not present. Before this existed the same conclusion was
 * re-derived from `assistance_state` at three separate sites — the screen read
 * the item's byte while support authorization read the run's copy of it — which
 * is the "unenforced invariant" lesson-evidence-mastery-contract §15.2 named as
 * the reason no assistance observation could be trusted.
 *
 * The authored design decides what the SCREEN carries, and that is legitimately
 * the author's to decide, so the authored value is read here — once, for that
 * purpose only. It is never read to decide what the learner TOOK: that is
 * derived downstream from the delivery facts this produces, and the response
 * record carries no authored assistance field at all.
 */
interface PresentedSupport {
  /** A persistent structured reference panel accompanies the item. */
  readonly scaffoldPresented: boolean;
  /** The one-bounded-cue mechanism is authorized for this item. */
  readonly supportOffered: boolean;
}

const NO_SUPPORT_PRESENTED: PresentedSupport = {
  scaffoldPresented: false,
  supportOffered: false,
};

function presentedSupportFor(item: VectorLessonSafeItem | null): PresentedSupport {
  if (item === null) return NO_SUPPORT_PRESENTED;
  return {
    scaffoldPresented: item.assistance_state !== 'A0',
    supportOffered: item.assistance_state === 'A1' || item.assistance_state === 'A2',
  };
}

/**
 * Put one item (or no item) on the screen and open a fresh delivery ledger for
 * it. Every path that changes `currentItemId` goes through here, so no path can
 * leave the ledger describing the previous screen.
 */
function presentItem(run: VectorLessonRun, item: VectorLessonSafeItem | null): void {
  const presented = presentedSupportFor(item);
  run.currentItemId = item?.item_id ?? null;
  run.assistanceState = item?.assistance_state ?? 'A3';
  run.scaffoldPresented = presented.scaffoldPresented;
  run.supportOffered = presented.supportOffered;
  run.supportRequested = false;
}

function stageNodeId(run: VectorLessonRun, stage = run.stage): string {
  const slug = currentKc(run).slug;
  const suffixByStage: Record<KcStage, string> = {
    ENTRY: 'entry',
    ORIENTATION: 'orientation',
    EXPLANATION: 'explanation',
    MODEL: 'model',
    THINK_ALOUD: 'think-aloud',
    WORKED: 'worked',
    GUIDED: 'guided',
    GUIDED_FRESH: 'guided',
    LIGHT: 'light',
    LIGHT_FRESH: 'light',
    SUPPORT_RESTORE:
      run.repair?.failedFunction === 'CHANGED_TASK' ? 'repair-changed' : 'repair-near',
    SOLO: 'solo',
    CONTRAST: 'contrast',
    NEAR_INITIAL: 'near-exit',
    CHANGED_INITIAL: 'changed-exit',
    FEEDBACK: run.feedback?.sourceNodeId.replace(`vtr-${slug}-node-`, '') ?? 'orientation',
    REPAIR_CONTENT:
      run.repair?.failedFunction === 'CHANGED_TASK' ? 'repair-changed' : 'repair-near',
    REPAIR_ALT_CONTENT:
      run.repair?.failedFunction === 'CHANGED_TASK' ? 'repair-changed' : 'repair-near',
    REPAIR_CONFIRM_1:
      run.repair?.failedFunction === 'CHANGED_TASK' ? 'repair-changed' : 'repair-near',
    REPAIR_CONFIRM_2:
      run.repair?.failedFunction === 'CHANGED_TASK' ? 'repair-changed' : 'repair-near',
    REENTRY: run.repair?.failedFunction === 'CHANGED_TASK' ? 'reentry-changed' : 'reentry-near',
    RECAP: 'recap',
    BLOCKED: run.repair?.failedFunction === 'CHANGED_TASK' ? 'repair-changed' : 'repair-near',
    COMPLETE: 'recap',
  };
  return `vtr-${slug}-node-${suffixByStage[stage]}`;
}

function microcycleState(stage: KcStage): string {
  if (stage === 'ENTRY') return 'ENTRY_ROUTE_VALIDATION';
  if (stage === 'ORIENTATION') return 'ORIENTATION';
  if (['EXPLANATION', 'MODEL'].includes(stage)) return 'MODEL';
  if (['THINK_ALOUD', 'WORKED'].includes(stage)) return 'EXPERT_DECISION';
  if (['GUIDED', 'GUIDED_FRESH'].includes(stage)) return 'GUIDED_PRACTICE';
  if (['LIGHT', 'LIGHT_FRESH', 'SUPPORT_RESTORE', 'SOLO'].includes(stage)) return 'FADING';
  if (stage === 'CONTRAST') return 'CONTRAST_AND_BOUNDS';
  if (stage === 'NEAR_INITIAL') return 'NEAR_USE_EXIT_PENDING';
  if (stage === 'CHANGED_INITIAL') return 'CHANGED_TASK_EXIT_PENDING';
  if (stage.startsWith('REPAIR')) return 'IMMEDIATE_REPAIR';
  if (stage === 'REENTRY') return 'RESUMED_AT_REENTRY';
  if (stage === 'RECAP') return 'EXITED';
  if (stage === 'BLOCKED') return 'PLANNER_HANDOFF';
  if (stage === 'COMPLETE') return 'DELIVERY_COMPLETE';
  return 'FEEDBACK';
}

function screenToken(run: VectorLessonRun): string {
  return `scr-${createHash('sha256')
    .update(
      [
        run.runId,
        run.definitionHash,
        run.currentKcIndex,
        run.stage,
        run.currentItemId ?? '',
        run.eventSequence,
        run.feedback?.sourceItemId ?? '',
        run.supportRequested ? 'support' : '',
        run.supportReturnStage ?? '',
      ].join(':'),
    )
    .digest('hex')
    .slice(0, 24)}`;
}

function recordEvent(run: VectorLessonRun, type: string, now: string): void {
  run.eventSequence += 1;
  run.events.push({
    sequence: run.eventSequence,
    type,
    occurredAt: now,
    kcId: currentKc(run).kc_id,
    nodeId: stageNodeId(run),
  });
  run.updatedAt = now;
}

function updateCheckpoint(run: VectorLessonRun): void {
  const responses = Object.values(run.committedResponses);
  const successes = run.preservedExitSuccesses[currentKc(run).kc_id];
  const preservedExitFunctionSuccesses: FailedExitFunction[] = [
    ...(successes.nearUse ? (['NEAR_USE'] as const) : []),
    ...(successes.changedTask ? (['CHANGED_TASK'] as const) : []),
  ];
  run.checkpoint = {
    lessonRunId: run.runId,
    lessonDefinitionHash: run.definitionHash,
    kcId: currentKc(run).kc_id,
    canonicalOrdinal: currentKc(run).canonical_ordinal,
    microcycleState: microcycleState(run.stage),
    nodeId: stageNodeId(run),
    assistanceState: run.assistanceState,
    resolvedInstructionRoute: run.resolvedRoute,
    plannerInstructionResolutionId: run.plannerResolutionId,
    attemptState:
      run.stage === 'FEEDBACK'
        ? 'COMMITTED'
        : run.currentItemId === null
          ? 'NOT_APPLICABLE'
          : 'AWAITING_RESPONSE',
    committedResponseIds: responses.map((response) => response.responseId),
    exposedItemFamilyIds: [...run.exposedFamilyIds],
    openFeedbackState: run.feedback?.outcome ?? null,
    supportReturnStage: run.supportReturnStage,
    repairCycle: run.repair?.confirmationAttempt ?? 0,
    failedExitFunction: run.repair?.failedFunction ?? null,
    preservedExitFunctionSuccesses,
    originatingSequenceCoordinate: run.eventSequence,
    reentryCoordinate: run.reentryCoordinate,
    reentryMicrocycleState: run.reentryCoordinate?.destination ?? null,
    eventStreamSequence: run.eventSequence,
  };
}

function exposeCurrentStage(run: VectorLessonRun, now: string): void {
  const current = itemForStage(run, run.stage);
  presentItem(run, current);
  if (current !== null && !run.exposedFamilyIds.includes(current.semantic_family_id)) {
    run.exposedFamilyIds.push(current.semantic_family_id);
    recordEvent(run, 'item_presented', now);
  } else if (run.stage === 'WORKED') {
    const workedFamily = currentKc(run).worked_example.family_id;
    if (!run.exposedFamilyIds.includes(workedFamily)) {
      run.exposedFamilyIds.push(workedFamily);
      recordEvent(run, 'worked_family_presented', now);
    }
  }
  updateCheckpoint(run);
}

function enterStage(run: VectorLessonRun, stage: KcStage, now: string): void {
  run.stage = stage;
  if (stage === 'BLOCKED') run.status = 'BLOCKED';
  run.feedback = null;
  exposeCurrentStage(run, now);
  recordEvent(
    run,
    stage === 'REENTRY'
      ? 'kc_resumed_at_reentry'
      : stage === 'BLOCKED'
        ? 'kc_planner_handoff_requested'
        : 'checkpoint_committed',
    now,
  );
  updateCheckpoint(run);
}

function initialExitSuccesses(): VectorLessonRun['preservedExitSuccesses'] {
  return Object.fromEntries(
    TARGET_ORDERED_KC_IDS.map((kcId) => [kcId, { nearUse: false, changedTask: false }]),
  ) as VectorLessonRun['preservedExitSuccesses'];
}

export function createVectorLessonRun(options: {
  readonly runId?: string;
  readonly now: string;
  readonly resolution?: VectorLessonPlannerResolution;
}): VectorLessonRun {
  const firstKc = TARGET_ORDERED_KC_IDS[0];
  const resolution =
    options.resolution ?? createStandardVectorLessonPilotResolution(firstKc, options.now);
  const validated = validateVectorLessonPlannerResolution(resolution, firstKc, options.now);
  const run = {
    runId: options.runId ?? randomUUID(),
    lessonId: TARGET_LESSON_ID,
    definitionHash: DEFINITION_HASH,
    orderedKcIds: [...TARGET_ORDERED_KC_IDS],
    status: 'IN_PROGRESS',
    paused: false,
    currentKcIndex: 0,
    stage: 'ENTRY',
    currentItemId: null,
    resolvedRoute: validated.route,
    plannerResolutionId: validated.resolutionId,
    assistanceState: 'A0',
    scaffoldPresented: false,
    supportOffered: false,
    supportRequested: false,
    supportReturnStage: null,
    committedResponses: {},
    exposedFamilyIds: [],
    exitedKcIds: [],
    preservedExitSuccesses: initialExitSuccesses(),
    feedback: null,
    repair: null,
    reentryCoordinate: null,
    checkpoint: {} as Checkpoint,
    eventSequence: 0,
    events: [],
    startedAt: options.now,
    updatedAt: options.now,
    pauseCount: 0,
    resumeCount: 0,
    sessionCount: 1,
    estimatedCoreSegmentMinutes: null,
    estimatedBranchSegmentMinutes: null,
    estimatedKcCoreMinutes: null,
    estimatedKcBranchMinutes: null,
    estimatedShellCoreMinutes: null,
    estimatedShellBranchMinutes: null,
    observedActiveSegmentMs: 0,
    observedWallSegmentMs: 0,
    observedKcActiveMs: 0,
    observedShellActiveMs: 0,
    helpTimeMs: 0,
    feedbackTimeMs: 0,
    repairTimeMs: 0,
    exitPolicyVersion: EXIT_POLICY_VERSION,
    repairPolicyVersion: REPAIR_POLICY_VERSION,
    timingPolicyVersion: 'v3-les-130923-uncalibrated-segment-hypothesis-v1',
  } satisfies VectorLessonRun;
  recordEvent(run, 'lesson_shell_started', options.now);
  recordEvent(run, 'kc_microcycle_started', options.now);
  recordEvent(
    run,
    validated.disposition === 'DOWNGRADED' ? 'entry_route_downgraded' : 'entry_route_selected',
    options.now,
  );
  exposeCurrentStage(run, options.now);
  return run;
}

function cloneRun(run: VectorLessonRun): VectorLessonRun {
  return structuredClone(run);
}

function itemById(itemId: string): VectorLessonSafeItem {
  const item = VECTOR_LESSON_KCS.flatMap((kc) => kc.items).find(
    (candidate) => candidate.item_id === itemId,
  );
  if (item === undefined) throw new Error('The lesson item is not authorized by the definition');
  return item;
}

function beginRepair(
  run: VectorLessonRun,
  failedFunction: FailedExitFunction,
  now: string,
): boolean {
  const kc = currentKc(run);
  const destination =
    failedFunction === 'NEAR_USE' ? 'NEAR_USE_EXIT_PENDING' : 'CHANGED_TASK_EXIT_PENDING';
  const freshItem = kc.items.find(
    (item) =>
      item.activity_role === (failedFunction === 'NEAR_USE' ? 'NEAR_EXIT' : 'CHANGED_EXIT') &&
      item.item_id.endsWith('reentry'),
  );
  if (freshItem === undefined) throw new Error('No fresh exact-reentry family is available');
  const originCheckpointId = `checkpoint-${run.runId}-${run.eventSequence}`;
  if (run.exposedFamilyIds.includes(freshItem.semantic_family_id)) {
    run.reentryCoordinate = {
      failedFunction,
      originCheckpointId,
      destination,
      freshItemId: freshItem.item_id,
    };
    run.status = 'BLOCKED';
    run.stage = 'BLOCKED';
    presentItem(run, null);
    run.feedback = null;
    recordEvent(run, 'kc_planner_handoff_requested', now);
    updateCheckpoint(run);
    return false;
  }
  run.repair = {
    failedFunction,
    registryRepairTemplateIds: [...kc.repair_relation_ids],
    instantiatedRegistryRelationId: null,
    originSequenceRelationId: 'R14-FD-130923',
    originCheckpointId,
    originMicrocycleState: destination,
    preservedExitFunctionSuccesses:
      failedFunction === 'CHANGED_TASK' && run.preservedExitSuccesses[kc.kc_id].nearUse
        ? ['NEAR_USE']
        : [],
    reentryCheckpointId: originCheckpointId,
    reentryMicrocycleState: destination,
    preservationPolicyDecisionId: 'v3-les-130923-internal-pilot-preserve-near-on-changed-repair-v1',
    confirmationAttempt: 1,
  };
  run.reentryCoordinate = {
    failedFunction,
    originCheckpointId,
    destination,
    freshItemId: freshItem.item_id,
  };
  recordEvent(run, 'kc_repair_started', now);
  return true;
}

function enterFeedback(
  run: VectorLessonRun,
  feedback: Omit<FeedbackState, 'sourceStage' | 'sourceNodeId'>,
  now: string,
): void {
  const sourceStage = run.stage;
  const sourceNodeId = stageNodeId(run);
  run.stage = 'FEEDBACK';
  // `commitResponse` has already read the delivery ledger for the attempt this
  // feedback belongs to, so closing it here cannot erase the observation.
  presentItem(run, null);
  run.feedback = { ...feedback, sourceStage, sourceNodeId };
  recordEvent(run, 'feedback_delivered', now);
  updateCheckpoint(run);
}

function commitResponse(
  run: VectorLessonRun,
  item: VectorLessonSafeItem,
  choiceId: VectorLessonChoiceId | null,
  now: string,
): boolean {
  if (run.committedResponses[item.item_id] !== undefined) {
    throw new Error('The first attempt for this administration is already committed');
  }
  const authority = VECTOR_LESSON_PROTECTED_ANSWERS[item.item_id];
  if (authority === undefined) throw new Error('Server answer authority is unavailable');
  const correct = choiceId === authority.correctChoiceId;
  run.committedResponses[item.item_id] = {
    responseId: `response-${createHash('sha256')
      .update(`${run.runId}:${item.item_id}:${run.eventSequence}`)
      .digest('hex')
      .slice(0, 24)}`,
    itemId: item.item_id,
    itemVersion: item.item_version,
    itemFamilyId: item.semantic_family_id,
    kcId: item.primary_kc_id,
    activityRole: item.activity_role,
    // The delivery ledger, captured before `enterFeedback` closes it, so this is
    // the administration as it stood at the moment of commitment.
    observedScaffoldDisplayed: run.scaffoldPresented,
    observedSupportOffered: run.supportOffered,
    observedSupportRequested: run.supportRequested,
    observedAnswerRevealed: run.feedback !== null,
    firstAttempt: true,
    choiceId,
    correct,
    omissionType: choiceId === null ? 'INTENTIONAL_SKIP' : null,
    observedResponseFeatures:
      choiceId === null
        ? ['submitted no response']
        : [item.observed_feature_by_choice[choiceId]].filter(
            (feature): feature is string => feature !== undefined,
          ),
    committedAt: now,
    feedbackState: 'AUTHORIZED_AFTER_COMMITMENT',
  };
  recordEvent(run, 'attempt_observed', now);
  return correct;
}

function feedbackBody(item: VectorLessonSafeItem, choiceId: VectorLessonChoiceId | null): string {
  const authority = VECTOR_LESSON_PROTECTED_ANSWERS[item.item_id]!;
  if (choiceId === null) {
    return 'No response was committed. This administration remains exposed, so the lesson will use a fresh family where one is authorized.';
  }
  return authority.choiceFeedback[choiceId];
}

function markExitFunction(run: VectorLessonRun, failedFunction: FailedExitFunction): void {
  const successes = run.preservedExitSuccesses[currentKc(run).kc_id];
  if (failedFunction === 'NEAR_USE') successes.nearUse = true;
  else successes.changedTask = true;
}

function submitCurrentResponse(
  run: VectorLessonRun,
  choiceId: VectorLessonChoiceId | null,
  now: string,
): void {
  const item = run.currentItemId === null ? null : itemById(run.currentItemId);
  if (item === null) throw new Error('There is no active lesson response to commit');
  const correct = commitResponse(run, item, choiceId, now);
  const body = feedbackBody(item, choiceId);
  const commonCorrectHeading = correct
    ? 'That relationship is consistent.'
    : 'Recheck the first divergent step.';

  switch (run.stage) {
    case 'ENTRY':
      enterFeedback(
        run,
        {
          sourceItemId: item.item_id,
          heading: 'Starting point recorded',
          outcome: correct ? 'CORRECT' : 'TRY_A_DIFFERENT_ANGLE',
          body: [
            body,
            'This baseline response does not complete an exit and does not select the lesson route.',
          ],
          nextStage: 'ORIENTATION',
          primaryActionLabel: 'Begin the lesson',
        },
        now,
      );
      return;
    case 'GUIDED':
      enterFeedback(
        run,
        {
          sourceItemId: item.item_id,
          heading: commonCorrectHeading,
          outcome: correct ? 'CORRECT' : 'TRY_A_DIFFERENT_ANGLE',
          body: [body],
          nextStage: correct ? 'LIGHT' : 'GUIDED_FRESH',
          primaryActionLabel: correct ? 'Use less help' : 'Try a fresh supported example',
        },
        now,
      );
      return;
    case 'GUIDED_FRESH':
      if (!correct) run.supportReturnStage = 'LIGHT';
      enterFeedback(
        run,
        {
          sourceItemId: item.item_id,
          heading: commonCorrectHeading,
          outcome: correct ? 'CORRECT' : 'TRY_A_DIFFERENT_ANGLE',
          body: [body],
          nextStage: correct ? 'LIGHT' : 'SUPPORT_RESTORE',
          primaryActionLabel: correct ? 'Continue with one cue' : 'Restore the model',
        },
        now,
      );
      return;
    case 'LIGHT':
      if (!correct) run.supportReturnStage = 'LIGHT_FRESH';
      enterFeedback(
        run,
        {
          sourceItemId: item.item_id,
          heading: commonCorrectHeading,
          outcome: correct ? 'CORRECT' : 'TRY_A_DIFFERENT_ANGLE',
          body: [body],
          nextStage: correct ? 'SOLO' : 'SUPPORT_RESTORE',
          primaryActionLabel: correct ? 'Work on your own' : 'Restore the model',
        },
        now,
      );
      return;
    case 'LIGHT_FRESH':
      enterFeedback(
        run,
        {
          sourceItemId: item.item_id,
          heading: commonCorrectHeading,
          outcome: correct ? 'CORRECT' : 'REPAIR_EXHAUSTED',
          body: correct
            ? [body]
            : [
                body,
                'Support cannot fade safely after this fresh A1 miss. The exact checkpoint is preserved for planner handoff.',
              ],
          nextStage: correct ? 'SOLO' : 'BLOCKED',
          primaryActionLabel: correct ? 'Work on your own' : 'Pause at this checkpoint',
        },
        now,
      );
      return;
    case 'SOLO':
      enterFeedback(
        run,
        {
          sourceItemId: item.item_id,
          heading: commonCorrectHeading,
          outcome: correct ? 'CORRECT' : 'TRY_A_DIFFERENT_ANGLE',
          body: [body],
          nextStage: 'CONTRAST',
          primaryActionLabel: 'Compare the boundary case',
        },
        now,
      );
      return;
    case 'NEAR_INITIAL':
    case 'CHANGED_INITIAL': {
      const failedFunction = run.stage === 'NEAR_INITIAL' ? 'NEAR_USE' : 'CHANGED_TASK';
      if (correct) {
        markExitFunction(run, failedFunction);
        if (failedFunction === 'CHANGED_TASK') {
          const kcId = currentKc(run).kc_id;
          if (!run.exitedKcIds.includes(kcId)) {
            run.exitedKcIds.push(kcId);
            recordEvent(run, 'kc_instructional_exit_recorded', now);
          }
        }
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'This exit function is complete.',
            outcome: 'CORRECT',
            body: [body],
            nextStage: failedFunction === 'NEAR_USE' ? 'CHANGED_INITIAL' : 'RECAP',
            primaryActionLabel:
              failedFunction === 'NEAR_USE' ? 'Try the changed task' : 'Review this part',
          },
          now,
        );
      } else {
        if (!beginRepair(run, failedFunction, now)) return;
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'Review the exact step that changed the result.',
            outcome: 'TRY_A_DIFFERENT_ANGLE',
            body: [body],
            nextStage: 'REPAIR_CONTENT',
            primaryActionLabel: 'Review the model',
          },
          now,
        );
      }
      return;
    }
    case 'REPAIR_CONFIRM_1':
    case 'REPAIR_CONFIRM_2': {
      if (run.repair === null) throw new Error('Repair confirmation has no repair state');
      if (correct) {
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'The repaired step is consistent.',
            outcome: 'REPAIR_CONFIRMED',
            body: [
              body,
              'This confirmation is repair-process evidence only. A fresh exact re-entry still follows.',
            ],
            nextStage: 'REENTRY',
            primaryActionLabel: 'Return to the fresh check',
          },
          now,
        );
      } else if (run.repair.confirmationAttempt < MAX_INTERNAL_PILOT_REPAIR_CONFIRMATIONS) {
        run.repair.confirmationAttempt = 2;
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'Use one alternate model.',
            outcome: 'TRY_A_DIFFERENT_ANGLE',
            body: [body],
            nextStage: 'REPAIR_ALT_CONTENT',
            primaryActionLabel: 'See the alternate model',
          },
          now,
        );
      } else {
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'This repair stops here for now.',
            outcome: 'REPAIR_EXHAUSTED',
            body: [
              body,
              'The finite internal-pilot repair path is exhausted. Your exact re-entry point is preserved for planner handoff.',
            ],
            nextStage: 'BLOCKED',
            primaryActionLabel: 'Pause at this checkpoint',
          },
          now,
        );
      }
      return;
    }
    case 'REENTRY': {
      if (run.repair === null) throw new Error('Exact re-entry has no repair state');
      const failedFunction = run.repair.failedFunction;
      if (correct) {
        markExitFunction(run, failedFunction);
        if (failedFunction === 'CHANGED_TASK') {
          const kcId = currentKc(run).kc_id;
          if (!run.exitedKcIds.includes(kcId)) {
            run.exitedKcIds.push(kcId);
            recordEvent(run, 'kc_instructional_exit_recorded', now);
          }
        }
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'The fresh exact re-entry is complete.',
            outcome: 'CORRECT',
            body: [body],
            nextStage: failedFunction === 'NEAR_USE' ? 'CHANGED_INITIAL' : 'RECAP',
            primaryActionLabel:
              failedFunction === 'NEAR_USE' ? 'Try the changed task' : 'Review this part',
          },
          now,
        );
      } else {
        enterFeedback(
          run,
          {
            sourceItemId: item.item_id,
            heading: 'This repair stops here for now.',
            outcome: 'REPAIR_EXHAUSTED',
            body: [
              body,
              'A fresh exact-reentry miss returns control to the planner; the open exit function remains preserved.',
            ],
            nextStage: 'BLOCKED',
            primaryActionLabel: 'Pause at this checkpoint',
          },
          now,
        );
      }
      return;
    }
    default:
      throw new Error('A response is not authorized at this lesson stage');
  }
}

function continueFromContent(run: VectorLessonRun, now: string): void {
  switch (run.stage) {
    case 'FEEDBACK':
      if (run.feedback === null) throw new Error('Feedback checkpoint is incomplete');
      enterStage(run, run.feedback.nextStage, now);
      return;
    case 'ORIENTATION':
      enterStage(run, 'EXPLANATION', now);
      return;
    case 'EXPLANATION':
      enterStage(run, 'MODEL', now);
      return;
    case 'MODEL':
      enterStage(run, 'THINK_ALOUD', now);
      return;
    case 'THINK_ALOUD':
      enterStage(run, 'WORKED', now);
      return;
    case 'WORKED':
      enterStage(run, 'GUIDED', now);
      return;
    case 'SUPPORT_RESTORE':
      {
        const returnStage = run.supportReturnStage ?? 'LIGHT';
        run.supportReturnStage = null;
        enterStage(run, returnStage, now);
      }
      return;
    case 'CONTRAST':
      enterStage(run, 'NEAR_INITIAL', now);
      return;
    case 'REPAIR_CONTENT':
      enterStage(run, 'REPAIR_CONFIRM_1', now);
      return;
    case 'REPAIR_ALT_CONTENT':
      enterStage(run, 'REPAIR_CONFIRM_2', now);
      return;
    case 'RECAP': {
      const currentId = currentKc(run).kc_id;
      if (!run.exitedKcIds.includes(currentId)) {
        throw new Error('The KC recap cannot advance before both exit functions pass');
      }
      if (run.currentKcIndex < TARGET_ORDERED_KC_IDS.length - 1) {
        run.currentKcIndex += 1;
        run.repair = null;
        run.reentryCoordinate = null;
        const nextKcId = currentKc(run).kc_id;
        const nextResolution = createStandardVectorLessonPilotResolution(nextKcId, now);
        const validated = validateVectorLessonPlannerResolution(nextResolution, nextKcId, now);
        run.resolvedRoute = validated.route;
        run.plannerResolutionId = validated.resolutionId;
        run.stage = 'ENTRY';
        run.feedback = null;
        presentItem(run, null);
        run.supportReturnStage = null;
        recordEvent(run, 'kc_microcycle_started', now);
        exposeCurrentStage(run, now);
        recordEvent(run, 'checkpoint_committed', now);
        updateCheckpoint(run);
      } else {
        if (JSON.stringify(run.exitedKcIds) !== JSON.stringify(TARGET_ORDERED_KC_IDS)) {
          throw new Error('Lesson delivery cannot complete before every required KC exits');
        }
        run.status = 'DELIVERY_COMPLETE';
        run.stage = 'COMPLETE';
        presentItem(run, null);
        run.feedback = null;
        recordEvent(run, 'lesson_delivery_completed', now);
        updateCheckpoint(run);
      }
      return;
    }
    case 'BLOCKED':
    case 'COMPLETE':
      return;
    default:
      throw new Error('Continue is not authorized at this lesson stage');
  }
}

export function applyVectorLessonAction(
  run: VectorLessonRun,
  command: {
    readonly runId: string;
    readonly screenToken: string;
    readonly action: VectorLessonAction;
  },
  now: string,
): VectorLessonRun {
  const next = cloneRun(run);
  if (command.runId !== next.runId) throw new Error('Lesson run identity does not match');
  if (command.screenToken !== screenToken(next)) {
    throw new Error('The lesson screen is stale or its first attempt is already committed');
  }
  if (next.status !== 'IN_PROGRESS' || next.paused) {
    throw new Error('The lesson run is not accepting an action');
  }
  switch (command.action.type) {
    case 'SUBMIT_RESPONSE':
      submitCurrentResponse(next, command.action.choiceId, now);
      break;
    case 'CONTINUE':
      continueFromContent(next, now);
      break;
    case 'REQUEST_SUPPORT': {
      // Authorized from the delivery ledger, which is also what the screen and
      // the observation read, so a cue can never be released on an
      // administration the record will describe as unoffered.
      if (!next.supportOffered) {
        throw new Error('Support is not authorized for this administration');
      }
      next.supportRequested = true;
      recordEvent(next, 'hint_requested', now);
      updateCheckpoint(next);
      break;
    }
    case 'PAUSE':
      next.paused = true;
      next.pauseCount += 1;
      recordEvent(next, 'lesson_shell_paused', now);
      updateCheckpoint(next);
      break;
  }
  return next;
}

export function invalidateCurrentVectorLessonItem(
  run: VectorLessonRun,
  now: string,
): VectorLessonRun {
  const next = cloneRun(run);
  if (next.status !== 'IN_PROGRESS' || next.currentItemId === null) {
    throw new Error('There is no active item to invalidate');
  }
  const invalidItem = itemById(next.currentItemId);
  recordEvent(next, 'item_invalidated', now);

  if (next.stage === 'GUIDED') {
    const replacement = itemForStage(next, 'GUIDED_FRESH');
    if (replacement !== null && !next.exposedFamilyIds.includes(replacement.semantic_family_id)) {
      enterStage(next, 'GUIDED_FRESH', now);
      return next;
    }
  }

  const failedFunction =
    next.stage === 'NEAR_INITIAL'
      ? 'NEAR_USE'
      : next.stage === 'CHANGED_INITIAL'
        ? 'CHANGED_TASK'
        : null;
  if (failedFunction !== null) {
    const replacementRole = failedFunction === 'NEAR_USE' ? 'NEAR_EXIT' : 'CHANGED_EXIT';
    const replacement = currentKc(next).items.find(
      (item) => item.activity_role === replacementRole && item.item_id.endsWith('reentry'),
    );
    if (
      replacement !== undefined &&
      !next.exposedFamilyIds.includes(replacement.semantic_family_id)
    ) {
      // Presented through the one door rather than hand-set. The replacement's
      // own design decides its screen; assuming `A0` here would have described
      // an unscaffolded administration for any assisted replacement.
      presentItem(next, replacement);
      next.exposedFamilyIds.push(replacement.semantic_family_id);
      recordEvent(next, 'item_presented', now);
      updateCheckpoint(next);
      return next;
    }
    next.reentryCoordinate = {
      failedFunction,
      originCheckpointId: `checkpoint-${next.runId}-${next.eventSequence}`,
      destination:
        failedFunction === 'NEAR_USE' ? 'NEAR_USE_EXIT_PENDING' : 'CHANGED_TASK_EXIT_PENDING',
      freshItemId: replacement?.item_id ?? invalidItem.item_id,
    };
  }

  next.status = 'BLOCKED';
  next.stage = 'BLOCKED';
  presentItem(next, null);
  next.feedback = null;
  recordEvent(next, 'kc_planner_handoff_requested', now);
  updateCheckpoint(next);
  return next;
}

function stageLabel(stage: KcStage): string {
  if (stage === 'ENTRY') return 'Starting check';
  if (stage === 'ORIENTATION') return 'Focus now';
  if (['EXPLANATION', 'MODEL', 'THINK_ALOUD'].includes(stage)) return 'Explain';
  if (stage === 'WORKED') return 'Worked example';
  if (['GUIDED', 'GUIDED_FRESH'].includes(stage)) return 'Guided practice';
  if (stage === 'LIGHT' || stage === 'LIGHT_FRESH') return 'Less help';
  if (stage === 'SUPPORT_RESTORE') return 'Review the model';
  if (stage === 'SOLO') return 'On your own';
  if (stage === 'CONTRAST') return 'Compare';
  if (['NEAR_INITIAL', 'CHANGED_INITIAL'].includes(stage)) return 'Final check';
  if (stage.startsWith('REPAIR')) return 'Review and retry';
  if (stage === 'REENTRY') return 'Fresh check';
  if (stage === 'FEEDBACK') return 'Feedback';
  if (stage === 'RECAP') return 'Recap';
  if (stage === 'BLOCKED') return 'Paused';
  return 'Complete';
}

function visualFor(
  kc: VectorLessonKcAuthoring,
  item: VectorLessonSafeItem | null,
): VectorLessonRunView['screen'] extends infer _Screen
  ? {
      kind: 'COMPONENTS' | 'RIGHT_TRIANGLE' | 'DIRECTIONAL';
      title: string;
      textEquivalent: string;
      tokens: { label: string; value: string }[];
    } | null
  : never {
  if (kc.slug === 'vectors') {
    return {
      kind: 'COMPONENTS',
      title: 'Signed component ledger',
      textEquivalent:
        item === null
          ? 'A signed ordered pair states horizontal first and vertical second; east and north are positive, west and south negative.'
          : 'Use the prompt’s stated horizontal and vertical directions as signed inputs; the result is not supplied.',
      tokens: [
        { label: 'Horizontal axis', value: 'east + / west −' },
        { label: 'Vertical axis', value: 'north + / south −' },
      ],
    };
  }
  if (kc.slug === 'trig') {
    return {
      kind: 'RIGHT_TRIANGLE',
      title: 'Right-triangle relationship',
      textEquivalent:
        item === null
          ? 'The reference angle determines opposite and adjacent; the hypotenuse remains opposite the right angle.'
          : 'Use the reference angle and named sides in the prompt; no ratio or result is supplied here.',
      tokens: [
        { label: 'sin', value: 'opposite / hypotenuse' },
        { label: 'cos', value: 'adjacent / hypotenuse' },
        { label: 'tan', value: 'opposite / adjacent' },
      ],
    };
  }
  return {
    kind: 'DIRECTIONAL',
    title: 'Three-dimensional direction key',
    textEquivalent:
      item === null
        ? 'Directions are named east, west, north, south, into the page, or out of the page; the requested output is not supplied.'
        : 'Use only the ordered directions stated in the prompt; the requested output is not supplied.',
    tokens: [
      { label: 'Out of page', value: '⊙ arrow tip' },
      { label: 'Into page', value: '⊗ arrow tail' },
    ],
  };
}

function contentForStage(run: VectorLessonRun): {
  heading: string;
  body: readonly string[];
  action: string;
  visual: ReturnType<typeof visualFor>;
} {
  const kc = currentKc(run);
  const generic = {
    action: 'Continue',
    visual: visualFor(kc, null),
  };
  const misconceptionPrelude =
    run.resolvedRoute !== 'MISCONCEPTION'
      ? []
      : [
          kc.slug === 'vectors'
            ? 'A prior observed response pattern reversed a stated axis sign. Treat that conflict as a hypothesis to test, not a label: the replacement model preserves direction as sign.'
            : kc.slug === 'trig'
              ? 'A prior observed response pattern swapped side roles relative to the stated angle. Treat that conflict as a hypothesis to test, not a label: name the sides before choosing a ratio.'
              : 'A prior observed response pattern reversed the ordered input directions. Treat that conflict as a hypothesis to test, not a label: assign each input before reading the output.',
        ];
  switch (run.stage) {
    case 'ORIENTATION':
      return {
        heading: `Focus now: ${kc.display_label}`,
        body: [...misconceptionPrelude, ...kc.orientation],
        ...generic,
      };
    case 'EXPLANATION':
      return { heading: 'Build the relationship', body: kc.explanation, ...generic };
    case 'MODEL':
      return { heading: 'Use this mental model', body: kc.mental_model, ...generic };
    case 'THINK_ALOUD':
      return {
        heading: 'Watch the decisions, not just the result',
        body: kc.expert_think_aloud,
        ...generic,
      };
    case 'WORKED': {
      const worked = kc.worked_example;
      return {
        heading: 'Worked example',
        body: [
          `Cue: ${worked.cue}`,
          `Principle: ${worked.principle}`,
          `Operation: ${worked.operation}`,
          `Intermediate state: ${worked.intermediate_state}`,
          `Rejected alternative: ${worked.rejected_alternative}`,
          `Check: ${worked.check}`,
        ],
        ...generic,
      };
    }
    case 'SUPPORT_RESTORE':
      return {
        heading: 'Restore the model before working alone',
        body:
          kc.slug === 'vectors'
            ? kc.near_repair
            : kc.slug === 'trig'
              ? kc.near_repair
              : kc.near_repair,
        ...generic,
      };
    case 'CONTRAST':
      return {
        heading: 'Hold most features still; change the decisive one',
        body: kc.contrast,
        ...generic,
      };
    case 'REPAIR_CONTENT':
      return {
        heading: 'Repair the exact failed function',
        body: run.repair?.failedFunction === 'CHANGED_TASK' ? kc.changed_repair : kc.near_repair,
        action: 'Try a fresh confirmation',
        visual: visualFor(kc, null),
      };
    case 'REPAIR_ALT_CONTENT':
      return {
        heading: 'Use one alternate angle',
        body: [
          ...(run.repair?.failedFunction === 'CHANGED_TASK' ? kc.changed_repair : kc.near_repair),
          'This is the final immediate repair model in the uncalibrated internal-pilot branch.',
        ],
        action: 'Try the final fresh confirmation',
        visual: visualFor(kc, null),
      };
    case 'RECAP':
      return { heading: `Recap: ${kc.display_label}`, body: kc.recap, ...generic };
    default:
      throw new Error('This lesson stage is not a content screen');
  }
}

function supportFor(kc: VectorLessonKcAuthoring): string {
  if (kc.slug === 'vectors') {
    return 'Write each direction as a sign first, then align horizontal with horizontal and vertical with vertical.';
  }
  if (kc.slug === 'trig') {
    return 'Name the known side and target side relative to the stated angle before selecting a ratio.';
  }
  return 'Name the requested relationship, assign each input to the hand, then read the requested output.';
}

export function renderVectorLessonRun(run: VectorLessonRun): VectorLessonRunView {
  const kc = currentKc(run);
  const progress = {
    currentPart: kc.canonical_ordinal,
    totalParts: 3 as const,
    currentPartLabel: kc.display_label,
    stageLabel: stageLabel(run.stage),
  };
  const token = screenToken(run);
  if (run.paused) {
    return VectorLessonRunViewSchema.parse({
      lessonTitle: 'Vectors and Trigonometry',
      runId: run.runId,
      state: 'PAUSED',
      progress: { ...progress, stageLabel: 'Paused' },
      screen: {
        kind: 'PAUSED',
        screenToken: token,
        heading: 'This lesson is paused.',
        body: ['Continue from the curriculum to restore this exact checkpoint.'],
        primaryActionLabel: 'Back to curriculum',
      },
    });
  }
  if (run.status === 'DELIVERY_COMPLETE' || run.stage === 'COMPLETE') {
    return VectorLessonRunViewSchema.parse({
      lessonTitle: 'Vectors and Trigonometry',
      runId: run.runId,
      state: 'DELIVERY_COMPLETE',
      progress: { ...progress, currentPart: 3, stageLabel: 'Complete' },
      screen: {
        kind: 'COMPLETION',
        screenToken: token,
        heading: 'You finished this lesson’s required instruction.',
        body: [],
        primaryActionLabel: 'Back to curriculum',
      },
    });
  }
  if (run.status === 'BLOCKED' || run.stage === 'BLOCKED') {
    return VectorLessonRunViewSchema.parse({
      lessonTitle: 'Vectors and Trigonometry',
      runId: run.runId,
      state: 'BLOCKED',
      progress,
      screen: {
        kind: 'BLOCKED',
        screenToken: token,
        heading: 'This lesson is paused here.',
        body: [
          'The immediate repair path ended. Your exact checkpoint is saved so the next valid support can return here.',
        ],
        primaryActionLabel: 'Back to curriculum',
      },
    });
  }
  if (run.stage === 'FEEDBACK') {
    if (run.feedback === null) throw new Error('Feedback checkpoint is incomplete');
    return VectorLessonRunViewSchema.parse({
      lessonTitle: 'Vectors and Trigonometry',
      runId: run.runId,
      state: 'IN_PROGRESS',
      progress,
      screen: {
        kind: 'FEEDBACK',
        screenToken: token,
        heading: run.feedback.heading,
        outcome: run.feedback.outcome,
        body: [...run.feedback.body],
        primaryActionLabel: run.feedback.primaryActionLabel,
      },
    });
  }
  const activeItem = run.currentItemId === null ? null : itemById(run.currentItemId);
  if (activeItem !== null) {
    return VectorLessonRunViewSchema.parse({
      lessonTitle: 'Vectors and Trigonometry',
      runId: run.runId,
      state: 'IN_PROGRESS',
      progress,
      screen: {
        kind: 'QUESTION',
        screenToken: token,
        heading: `${stageLabel(run.stage)}: ${kc.display_label}`,
        prompt: activeItem.prompt,
        choices: activeItem.choices.map((choice) => ({ ...choice })),
        primaryActionLabel:
          activeItem.activity_role === 'ENTRY_CHECK'
            ? 'Record my starting point'
            : 'Check my answer',
        // Every one of these three reads the delivery ledger rather than
        // re-deriving from the item, so what the learner sees and what the
        // record says were displayed are the same fact.
        supportActionLabel: !run.supportRequested && run.supportOffered ? 'Show one cue' : null,
        support:
          run.supportRequested && run.supportOffered
            ? { label: 'One helpful cue', text: supportFor(kc) }
            : null,
        visual: run.scaffoldPresented ? visualFor(kc, activeItem) : null,
      },
    });
  }
  const content = contentForStage(run);
  return VectorLessonRunViewSchema.parse({
    lessonTitle: 'Vectors and Trigonometry',
    runId: run.runId,
    state: 'IN_PROGRESS',
    progress,
    screen: {
      kind: 'CONTENT',
      screenToken: token,
      heading: content.heading,
      body: [...content.body],
      primaryActionLabel: content.action,
      visual: content.visual,
    },
  });
}

export function restoreVectorLessonRun(value: unknown): VectorLessonRun {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted lesson checkpoint has an invalid shape');
  }
  const run = structuredClone(value) as VectorLessonRun;
  if (
    run.lessonId !== TARGET_LESSON_ID ||
    run.definitionHash !== DEFINITION_HASH ||
    JSON.stringify(run.orderedKcIds) !== JSON.stringify(TARGET_ORDERED_KC_IDS) ||
    !/^[0-9a-f-]{36}$/i.test(run.runId) ||
    run.currentKcIndex < 0 ||
    run.currentKcIndex >= TARGET_ORDERED_KC_IDS.length ||
    !KC_STAGES.includes(run.stage) ||
    !VECTOR_LESSON_ROUTES.includes(run.resolvedRoute)
  ) {
    throw new Error('Persisted lesson checkpoint cannot be replayed under this definition');
  }
  const kc = currentKc(run);
  const exitedPrefix = TARGET_ORDERED_KC_IDS.slice(0, run.exitedKcIds.length);
  const checkpointValid =
    run.checkpoint.lessonRunId === run.runId &&
    run.checkpoint.lessonDefinitionHash === run.definitionHash &&
    run.checkpoint.kcId === kc.kc_id &&
    run.checkpoint.canonicalOrdinal === kc.canonical_ordinal &&
    run.checkpoint.nodeId === stageNodeId(run) &&
    run.checkpoint.eventStreamSequence === run.eventSequence &&
    run.checkpoint.supportReturnStage === run.supportReturnStage &&
    JSON.stringify(run.checkpoint.exposedItemFamilyIds) === JSON.stringify(run.exposedFamilyIds) &&
    JSON.stringify(run.exitedKcIds) === JSON.stringify(exitedPrefix) &&
    (run.stage === 'FEEDBACK') === (run.feedback !== null) &&
    (run.status === 'DELIVERY_COMPLETE') === (run.stage === 'COMPLETE') &&
    (run.status === 'BLOCKED') === (run.stage === 'BLOCKED');
  if (!checkpointValid) {
    throw new Error('Persisted lesson checkpoint failed cross-field validation');
  }
  if (run.currentItemId !== null) {
    const item = itemById(run.currentItemId);
    if (!run.exposedFamilyIds.includes(item.semantic_family_id)) {
      throw new Error('Persisted lesson checkpoint references an unexposed item family');
    }
  }
  assertDeliveryLedgerMatchesDefinition(run);
  return run;
}

/**
 * The delivery ledger must be what the definition would actually have produced.
 *
 * `restoreVectorLessonRun` casts unvalidated JSON, so without this the ledger is
 * a learner-writable field — and it is now the sole input to the assistance
 * level. A tampered projection claiming `observedScaffoldDisplayed: false` on a
 * scaffolded item would mint an `A0` administration, which is fail-open 6
 * arriving through a different door. `scaffoldPresented` and `supportOffered`
 * are pure functions of the item, so the claim is RE-DERIVED and a mismatch is
 * refused. `supportRequested` is a real event and is not re-derivable, but it
 * can only ever raise the level, so a lie about it cannot manufacture
 * independence.
 *
 * An ABSENT observation is left alone rather than refused: a record persisted
 * before the ledger existed has no observation, and the seam's `assistanceTaken`
 * fail-closes it to unobserved. Deleting the field therefore costs the tamperer
 * the qualification it was trying to buy.
 */
function assertDeliveryLedgerMatchesDefinition(run: VectorLessonRun): void {
  const current = presentedSupportFor(
    run.currentItemId === null ? null : itemById(run.currentItemId),
  );
  if (
    run.scaffoldPresented !== current.scaffoldPresented ||
    run.supportOffered !== current.supportOffered
  ) {
    throw new Error('Persisted lesson checkpoint claims support this definition does not present');
  }
  for (const response of Object.values(run.committedResponses)) {
    if (typeof response.observedScaffoldDisplayed !== 'boolean') continue;
    const presented = presentedSupportFor(itemById(response.itemId));
    if (
      response.observedScaffoldDisplayed !== presented.scaffoldPresented ||
      response.observedSupportOffered !== presented.supportOffered ||
      (response.observedSupportRequested && !presented.supportOffered)
    ) {
      throw new Error(
        'A persisted lesson response claims support this definition does not present',
      );
    }
  }
}

export function resumeVectorLessonRun(run: VectorLessonRun, now: string): VectorLessonRun {
  const next = restoreVectorLessonRun(run);
  if (next.status === 'DELIVERY_COMPLETE') return next;
  next.paused = false;
  next.resumeCount += 1;
  next.sessionCount += 1;
  recordEvent(next, 'lesson_shell_resumed', now);
  updateCheckpoint(next);
  return next;
}
