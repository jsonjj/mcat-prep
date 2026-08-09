import { randomUUID } from 'node:crypto';

import {
  ACTIVITY_ROLES,
  type ActivityRole,
  type ExitFunction,
  type NormalizedBranchBinding,
  type NormalizedDeliveryStep,
  type NormalizedItem,
  type NormalizedKc,
  type NormalizedLesson,
  type NormalizedPrerequisiteGate,
  type NormalizedResponseControl,
} from '@mcat/content/lesson-normalization';
import type { AssistanceLevel } from '@mcat/contracts';

import type { LoadedLessonRevision, ServerItemAnswer } from './lesson-content-provider';

const RUN_STATE_VERSION = 'CANONICAL_STEP_GRAPH_V1' as const;

export type NormalizedLessonSubmittedResponse =
  | { readonly kind: 'MULTIPLE_CHOICE'; readonly choiceId: string | null }
  | { readonly kind: 'SHORT'; readonly text: string | null }
  | {
      readonly kind: 'CONSTRUCTED';
      readonly fields: readonly {
        readonly fieldId: string;
        readonly value: string | null;
      }[];
    };

/**
 * Immutable response representation retained for the existing WP-05D mastery
 * seam. The wire keeps structured fields as a list until validation; persisted
 * records use a field-id map only after exact control validation succeeds.
 */
export type EngineResponse =
  | { readonly kind: 'MULTIPLE_CHOICE'; readonly choiceId: string | null }
  | { readonly kind: 'SHORT'; readonly text: string | null }
  | { readonly kind: 'CONSTRUCTED'; readonly fields: Readonly<Record<string, string | null>> };

export type NormalizedLessonAction =
  | {
      readonly type: 'SUBMIT_RESPONSE';
      /**
       * `EngineResponse` remains accepted at the server-internal seam while
       * legacy direct callers migrate. HTTP accepts only the strict contract's
       * `NormalizedLessonSubmittedResponse`.
       */
      readonly response: NormalizedLessonSubmittedResponse | EngineResponse;
    }
  | { readonly type: 'CONTINUE' };

export type NormalizedRunStatus = 'IN_PROGRESS' | 'BLOCKED' | 'DELIVERY_COMPLETE';
export type NormalizedFeedbackOutcome = 'CORRECT' | 'INCORRECT' | 'OMITTED' | 'INVALID';

/**
 * Facts the normalized runner directly observed before an immutable commitment.
 * Authored assistance affordances never enter this object. Older WP-05C records
 * may omit it; the response source treats that absence as unobserved and fails
 * mastery qualification closed.
 */
export interface NormalizedResponseRuntimeFacts {
  readonly responseId: string;
  readonly attemptIndex: number;
  readonly firstAttempt: boolean;
  readonly isRetry: boolean;
  readonly isDiagnosticRetry: boolean;
  readonly assistanceRequested: boolean;
  readonly assistanceTaken: boolean;
  readonly assistanceLevel: AssistanceLevel;
  readonly contentBearingHintUsed: boolean;
  readonly revealUsed: boolean;
  readonly mixedAdministration: boolean;
  readonly passageAdministration: boolean;
  readonly timedAdministration: boolean;
}

export interface NormalizedResponseRecord {
  readonly stepId: string;
  readonly itemId: string;
  readonly primaryKcId: string;
  readonly activityRole: ActivityRole;
  readonly exitFunction: ExitFunction;
  readonly isReentry: boolean;
  readonly response: EngineResponse;
  readonly outcome: NormalizedFeedbackOutcome;
  readonly correct: boolean;
  readonly committedAt: string;
  readonly runtimeFacts?: NormalizedResponseRuntimeFacts;
}

export interface NormalizedRunBranch {
  readonly kcId: string;
  readonly failedStepId: string;
  readonly failedFunction: Exclude<ExitFunction, 'NONE'>;
}

/**
 * Persisted normalized-run state. `currentStepId` is the only graph cursor;
 * every position and transition is resolved against the exact loaded revision.
 */
export interface NormalizedLessonRun {
  readonly stateVersion: typeof RUN_STATE_VERSION;
  readonly runId: string;
  readonly lessonId: string;
  readonly definitionHash: string;
  readonly status: NormalizedRunStatus;
  readonly paused: boolean;
  readonly currentStepId: string | null;
  readonly display: 'CONTENT' | 'FEEDBACK';
  readonly branch: NormalizedRunBranch | null;
  /** True only while displaying an authored planner handoff before BLOCKED. */
  readonly blockAfterCurrentStep: boolean;
  readonly responses: Readonly<Record<string, NormalizedResponseRecord>>;
  /** kcId -> exact exit functions confirmed by a clean exit or fresh re-entry. */
  readonly passedExits: Readonly<Record<string, readonly ExitFunction[]>>;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export type NormalizedLessonRuntimeErrorCode =
  | 'ACTION_NOT_ALLOWED'
  | 'ANSWER_AUTHORITY_MISSING'
  | 'GRAPH_INVALID'
  | 'LEGACY_STATE_UNSUPPORTED'
  | 'RESPONSE_CONTROL_MISMATCH'
  | 'RESPONSE_IMMUTABLE'
  | 'REVISION_MISMATCH'
  | 'STATE_MALFORMED'
  | 'STATE_VERSION_UNSUPPORTED'
  | 'STRUCTURED_FIELDS_MISMATCH'
  | 'UNKNOWN_CHOICE';

export class NormalizedLessonRuntimeError extends Error {
  constructor(
    readonly code: NormalizedLessonRuntimeErrorCode,
    message: string,
    readonly detail: {
      readonly lessonId: string;
      readonly runId?: string;
      readonly stepId?: string;
      readonly itemId?: string;
    },
  ) {
    super(message);
    this.name = 'NormalizedLessonRuntimeError';
  }
}

function fail(
  code: NormalizedLessonRuntimeErrorCode,
  message: string,
  detail: NormalizedLessonRuntimeError['detail'],
): never {
  throw new NormalizedLessonRuntimeError(code, message, detail);
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function assertLoadedRevision(revision: LoadedLessonRevision): void {
  if (
    revision.lessonId !== revision.lesson.lessonId ||
    revision.definitionHash !== revision.lesson.definitionHash ||
    revision.lessonId !== revision.protectedAuthority.answerKey.lessonId ||
    revision.definitionHash !== revision.protectedAuthority.answerKey.definitionHash
  ) {
    fail('REVISION_MISMATCH', 'loaded lesson revision components do not share one identity', {
      lessonId: revision.lessonId,
    });
  }
  assertPrerequisiteGateGraph(revision.lesson);
}

function assertRunRevision(run: NormalizedLessonRun, revision: LoadedLessonRevision): void {
  assertLoadedRevision(revision);
  if (run.lessonId !== revision.lessonId || run.definitionHash !== revision.definitionHash) {
    fail(
      'REVISION_MISMATCH',
      `run ${run.lessonId}@${run.definitionHash} cannot use ${revision.lessonId}@${revision.definitionHash}`,
      { lessonId: run.lessonId, runId: run.runId },
    );
  }
}

const allSteps = (lesson: NormalizedLesson): readonly NormalizedDeliveryStep[] =>
  lesson.kcs.flatMap((kc) => kc.deliverySteps);

function stepOf(lesson: NormalizedLesson, stepId: string): NormalizedDeliveryStep {
  const step = allSteps(lesson).find((candidate) => candidate.stepId === stepId);
  if (step === undefined) {
    fail('GRAPH_INVALID', `delivery step "${stepId}" does not exist in the pinned revision`, {
      lessonId: lesson.lessonId,
      stepId,
    });
  }
  return step;
}

function kcForStep(lesson: NormalizedLesson, step: NormalizedDeliveryStep): NormalizedKc {
  const kc = lesson.kcs.find((candidate) => candidate.kcId === step.primaryKcId);
  if (kc === undefined) {
    fail('GRAPH_INVALID', `delivery step "${step.stepId}" has no canonical KC`, {
      lessonId: lesson.lessonId,
      stepId: step.stepId,
    });
  }
  return kc;
}

function itemOf(lesson: NormalizedLesson, itemId: string): NormalizedItem {
  const item = lesson.items.find((candidate) => candidate.itemId === itemId);
  if (item === undefined) {
    fail('GRAPH_INVALID', `item "${itemId}" does not exist in the pinned revision`, {
      lessonId: lesson.lessonId,
      itemId,
    });
  }
  return item;
}

function itemsForStep(
  lesson: NormalizedLesson,
  step: NormalizedDeliveryStep,
): readonly NormalizedItem[] {
  return step.itemIds.map((itemId) => itemOf(lesson, itemId));
}

function exactStepForNode(
  lesson: NormalizedLesson,
  nodeId: string,
  itemId: string,
): NormalizedDeliveryStep {
  const matches = allSteps(lesson).filter((step) => step.nodeIds.includes(nodeId));
  if (matches.length !== 1) {
    fail(
      'GRAPH_INVALID',
      `prerequisite gate "${itemId}" node "${nodeId}" resolves ${matches.length} delivery steps`,
      { lessonId: lesson.lessonId, itemId },
    );
  }
  return matches[0] as NormalizedDeliveryStep;
}

function prerequisiteGateForItem(
  lesson: NormalizedLesson,
  itemId: string,
): NormalizedPrerequisiteGate | undefined {
  return lesson.prerequisiteGates.find((gate) => gate.itemId === itemId);
}

function assertPrerequisiteGateGraph(lesson: NormalizedLesson): void {
  if (!Array.isArray(lesson.prerequisiteGates)) {
    fail('GRAPH_INVALID', 'normalized lesson has no prerequisite-gate admission result', {
      lessonId: lesson.lessonId,
    });
  }
  const itemIds = new Set<string>();
  const activityIds = new Set<string>();
  const entryNodeIds = new Set<string>();
  for (const gate of lesson.prerequisiteGates) {
    if (
      itemIds.has(gate.itemId) ||
      activityIds.has(gate.activityId) ||
      entryNodeIds.has(gate.entryNodeId)
    ) {
      fail('GRAPH_INVALID', `duplicate prerequisite gate identity for "${gate.itemId}"`, {
        lessonId: lesson.lessonId,
        itemId: gate.itemId,
      });
    }
    itemIds.add(gate.itemId);
    activityIds.add(gate.activityId);
    entryNodeIds.add(gate.entryNodeId);
    const item = itemOf(lesson, gate.itemId);
    if (
      item.activityRole !== 'ENTRY_CHECK' ||
      !item.scored ||
      item.exitFunction !== 'NONE' ||
      item.isReentry ||
      item.activityId !== gate.activityId ||
      item.primaryKcId !== gate.primaryKcId ||
      gate.prerequisiteLessonId.length === 0 ||
      gate.prerequisiteLessonId === lesson.lessonId
    ) {
      fail('GRAPH_INVALID', `prerequisite gate "${gate.itemId}" has invalid item ownership`, {
        lessonId: lesson.lessonId,
        itemId: gate.itemId,
      });
    }
    const entryStep = exactStepForNode(lesson, gate.entryNodeId, gate.itemId);
    if (
      entryStep.branchOnly ||
      !entryStep.itemIds.includes(gate.itemId) ||
      interactiveItem(lesson, entryStep)?.itemId !== gate.itemId
    ) {
      fail('GRAPH_INVALID', `prerequisite gate "${gate.itemId}" has an invalid entry step`, {
        lessonId: lesson.lessonId,
        itemId: gate.itemId,
        stepId: entryStep.stepId,
      });
    }
    const passStep = exactStepForNode(lesson, gate.passNodeId, gate.itemId);
    if (passStep.branchOnly) {
      fail('GRAPH_INVALID', `prerequisite gate "${gate.itemId}" pass target is branch-only`, {
        lessonId: lesson.lessonId,
        itemId: gate.itemId,
        stepId: passStep.stepId,
      });
    }
    const expectedDestinations =
      gate.failureHandoffNodeId === null
        ? [gate.passNodeId]
        : [gate.passNodeId, gate.failureHandoffNodeId];
    if (
      gate.allowedDestinationNodeIds.length !== expectedDestinations.length ||
      new Set(gate.allowedDestinationNodeIds).size !== gate.allowedDestinationNodeIds.length ||
      expectedDestinations.some((nodeId) => !gate.allowedDestinationNodeIds.includes(nodeId))
    ) {
      fail(
        'GRAPH_INVALID',
        `prerequisite gate "${gate.itemId}" has an invalid allowed-destination set`,
        { lessonId: lesson.lessonId, itemId: gate.itemId },
      );
    }
    if (gate.failureHandoffNodeId !== null) {
      const failureStep = exactStepForNode(lesson, gate.failureHandoffNodeId, gate.itemId);
      if (
        !failureStep.branchOnly ||
        failureStep.itemIds.some((failureItemId) => itemOf(lesson, failureItemId).scored)
      ) {
        fail(
          'GRAPH_INVALID',
          `prerequisite gate "${gate.itemId}" failure target is not branch-only noncredit`,
          {
            lessonId: lesson.lessonId,
            itemId: gate.itemId,
            stepId: failureStep.stepId,
          },
        );
      }
    }
  }
}

function interactiveItem(
  lesson: NormalizedLesson,
  step: NormalizedDeliveryStep,
): NormalizedItem | null {
  const scored = itemsForStep(lesson, step).filter((item) => item.scored);
  if (scored.length > 1) {
    fail('GRAPH_INVALID', `delivery step "${step.stepId}" contains multiple response items`, {
      lessonId: lesson.lessonId,
      stepId: step.stepId,
    });
  }
  return scored[0] ?? null;
}

function expositionBlocks(
  lesson: NormalizedLesson,
  step: NormalizedDeliveryStep,
): readonly string[] {
  if (step.contentBlocks.length > 0) return step.contentBlocks;
  const fallback = itemsForStep(lesson, step)
    .filter((item) => !item.scored)
    .map((item) => item.projection.prompt)
    .filter((text) => text.length > 0);
  if (fallback.length > 0) return fallback;
  fail('GRAPH_INVALID', `exposition step "${step.stepId}" has no learner-safe content`, {
    lessonId: lesson.lessonId,
    stepId: step.stepId,
  });
}

function firstBaselineStep(lesson: NormalizedLesson): NormalizedDeliveryStep | null {
  for (const kc of lesson.kcs) {
    const first = kc.cleanBaselineSteps[0];
    if (first !== undefined) return first;
  }
  return null;
}

function nextBaselineStep(
  lesson: NormalizedLesson,
  currentStepId: string,
  responses: NormalizedLessonRun['responses'],
): NormalizedDeliveryStep | null {
  const step = stepOf(lesson, currentStepId);
  const kcIndex = lesson.kcs.findIndex((kc) => kc.kcId === step.primaryKcId);
  if (kcIndex < 0) {
    fail('GRAPH_INVALID', `delivery step "${currentStepId}" has no canonical KC`, {
      lessonId: lesson.lessonId,
      stepId: currentStepId,
    });
  }
  const kc = lesson.kcs[kcIndex]!;
  const stepIndex = kc.cleanBaselineSteps.findIndex(
    (candidate) => candidate.stepId === currentStepId,
  );
  if (stepIndex < 0) {
    fail('GRAPH_INVALID', `step "${currentStepId}" is not on the clean baseline`, {
      lessonId: lesson.lessonId,
      stepId: currentStepId,
    });
  }
  const candidates: NormalizedDeliveryStep[] = [...kc.cleanBaselineSteps.slice(stepIndex + 1)];
  for (let index = kcIndex + 1; index < lesson.kcs.length; index += 1) {
    candidates.push(...(lesson.kcs[index]?.cleanBaselineSteps ?? []));
  }
  return (
    candidates.find((candidate) => {
      const committedGate = lesson.prerequisiteGates.find(
        (gate) =>
          candidate.nodeIds.includes(gate.entryNodeId) || candidate.itemIds.includes(gate.itemId),
      );
      return committedGate === undefined || responses[committedGate.itemId] === undefined;
    }) ?? null
  );
}

function exactForwardBaselineStepForNode(
  lesson: NormalizedLesson,
  currentStepId: string,
  nodeId: string,
): NormalizedDeliveryStep {
  const baseline = lesson.kcs.flatMap((kc) => kc.cleanBaselineSteps);
  const currentIndex = baseline.findIndex((step) => step.stepId === currentStepId);
  if (currentIndex < 0) {
    fail('GRAPH_INVALID', `step "${currentStepId}" is not on the clean baseline`, {
      lessonId: lesson.lessonId,
      stepId: currentStepId,
    });
  }
  const matches = baseline.filter((step) => step.nodeIds.includes(nodeId));
  if (matches.length !== 1) {
    fail(
      'GRAPH_INVALID',
      `success continuation "${nodeId}" resolves ${matches.length} clean baseline steps`,
      { lessonId: lesson.lessonId, stepId: currentStepId },
    );
  }
  const next = matches[0] as NormalizedDeliveryStep;
  if (baseline.indexOf(next) <= currentIndex) {
    fail('GRAPH_INVALID', `success continuation "${nodeId}" is not forward on the clean baseline`, {
      lessonId: lesson.lessonId,
      stepId: currentStepId,
    });
  }
  return next;
}

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');
const blank = (value: string | null): boolean => value === null || value.trim() === '';

export function isEngineResponseOmitted(response: EngineResponse): boolean {
  if (response.kind === 'MULTIPLE_CHOICE') return response.choiceId === null;
  if (response.kind === 'SHORT') return blank(response.text);
  return Object.values(response.fields).every(blank);
}

export function isEngineResponseInvalid(response: EngineResponse): boolean {
  if (response.kind !== 'CONSTRUCTED') return false;
  const values = Object.values(response.fields);
  return values.some(blank) && !values.every(blank);
}

function stringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((part) => typeof part === 'string')
    ? value
    : undefined;
}

function structuredResponseCorrect(
  answer: ServerItemAnswer,
  response: Extract<EngineResponse, { readonly kind: 'CONSTRUCTED' }>,
): boolean {
  const authority = asRecord(answer.structuredAuthority);
  const requiredFields = stringArray(authority?.required_fields);
  const expectedEquations = stringArray(authority?.expected_equation_forms);
  const expectedPair = stringArray(authority?.expected_solution_pair);

  if (
    requiredFields !== undefined &&
    expectedEquations !== undefined &&
    expectedPair !== undefined
  ) {
    const equationFields = requiredFields.filter((fieldId) => !fieldId.includes('solution'));
    const equationsCorrect =
      equationFields.length === expectedEquations.length &&
      equationFields.every((fieldId, index) => {
        const supplied = response.fields[fieldId];
        const expected = expectedEquations[index];
        return supplied !== undefined && supplied !== null && expected !== undefined
          ? normalizeText(supplied) === normalizeText(expected)
          : false;
      });
    const solutionField = requiredFields.find((fieldId) => fieldId.includes('solution'));
    const suppliedPair = solutionField === undefined ? undefined : response.fields[solutionField];
    const rightSides = expectedPair.map((part) => part.split('=').at(-1)?.trim() ?? part.trim());
    const pairVariants = [
      `(${rightSides.join(', ')})`,
      rightSides.join(', '),
      expectedPair.join(', '),
      `(${expectedPair.join(', ')})`,
    ].map(normalizeText);
    return (
      equationsCorrect &&
      suppliedPair !== undefined &&
      suppliedPair !== null &&
      pairVariants.includes(normalizeText(suppliedPair))
    );
  }

  const accepted = new Set(answer.acceptedResponses.map(normalizeText));
  const supplied = new Set<string>();
  for (const value of Object.values(response.fields)) {
    if (value === null) continue;
    supplied.add(normalizeText(value));
    value
      .replace(/^\(|\)$/g, '')
      .split(/[,;]/)
      .map(normalizeText)
      .forEach((part) => supplied.add(part));
  }
  return accepted.size > 0 && [...accepted].every((part) => supplied.has(part));
}

export function scoreEngineResponse(answer: ServerItemAnswer, response: EngineResponse): boolean {
  if (answer.correctChoiceId !== null) {
    return response.kind === 'MULTIPLE_CHOICE' && response.choiceId === answer.correctChoiceId;
  }
  const accepted = new Set(answer.acceptedResponses.map(normalizeText));
  if (response.kind === 'SHORT') {
    return response.text !== null && accepted.has(normalizeText(response.text));
  }
  if (response.kind === 'CONSTRUCTED') {
    return structuredResponseCorrect(answer, response);
  }
  return false;
}

function outcomeFor(answer: ServerItemAnswer, response: EngineResponse): NormalizedFeedbackOutcome {
  if (isEngineResponseOmitted(response)) return 'OMITTED';
  if (isEngineResponseInvalid(response)) return 'INVALID';
  return scoreEngineResponse(answer, response) ? 'CORRECT' : 'INCORRECT';
}

function toEngineResponse(
  control: NormalizedResponseControl,
  response: NormalizedLessonSubmittedResponse | EngineResponse,
  detail: NormalizedLessonRuntimeError['detail'],
): EngineResponse {
  if (control.kind === 'SINGLE_SELECT') {
    if (response.kind !== 'MULTIPLE_CHOICE') {
      fail('RESPONSE_CONTROL_MISMATCH', 'response kind does not match SINGLE_SELECT', detail);
    }
    if (
      response.choiceId !== null &&
      !control.choices.some((choice) => choice.choiceId === response.choiceId)
    ) {
      fail(
        'UNKNOWN_CHOICE',
        `choice "${response.choiceId}" is not authored for this question`,
        detail,
      );
    }
    return { kind: 'MULTIPLE_CHOICE', choiceId: response.choiceId };
  }
  if (control.kind === 'SHORT_TEXT') {
    if (response.kind !== 'SHORT') {
      fail('RESPONSE_CONTROL_MISMATCH', 'response kind does not match SHORT_TEXT', detail);
    }
    return { kind: 'SHORT', text: response.text };
  }
  if (response.kind !== 'CONSTRUCTED') {
    fail('RESPONSE_CONTROL_MISMATCH', 'response kind does not match STRUCTURED_FIELDS', detail);
  }
  const expected = control.fields.map(({ fieldId }) => fieldId);
  const submittedFields = Array.isArray(response.fields)
    ? response.fields
    : Object.entries(response.fields).map(([fieldId, value]) => ({ fieldId, value }));
  const supplied = submittedFields.map(({ fieldId }) => fieldId);
  if (
    new Set(supplied).size !== supplied.length ||
    supplied.length !== expected.length ||
    expected.some((fieldId) => !supplied.includes(fieldId)) ||
    supplied.some((fieldId) => !expected.includes(fieldId))
  ) {
    fail(
      'STRUCTURED_FIELDS_MISMATCH',
      `structured fields must match authored ids exactly: ${expected.join(', ')}`,
      detail,
    );
  }
  const byId = new Map(submittedFields.map(({ fieldId, value }) => [fieldId, value]));
  return {
    kind: 'CONSTRUCTED',
    fields: Object.fromEntries(expected.map((fieldId) => [fieldId, byId.get(fieldId) ?? null])),
  };
}

function sameResponse(left: EngineResponse, right: EngineResponse): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function markPassed(
  passedExits: NormalizedLessonRun['passedExits'],
  kcId: string,
  fn: ExitFunction,
): NormalizedLessonRun['passedExits'] {
  if (fn === 'NONE') return passedExits;
  const current = passedExits[kcId] ?? [];
  return current.includes(fn) ? passedExits : { ...passedExits, [kcId]: [...current, fn] };
}

function bindingFor(kc: NormalizedKc, fn: ExitFunction): NormalizedBranchBinding | undefined {
  return fn === 'NONE'
    ? undefined
    : kc.branchBindings.find((binding) => binding.failedFunction === fn);
}

function matchesStep(
  step: NormalizedDeliveryStep,
  nodeIds: readonly string[],
  itemIds: readonly string[],
): boolean {
  return (
    step.nodeIds.some((nodeId) => nodeIds.includes(nodeId)) ||
    step.itemIds.some((itemId) => itemIds.includes(itemId))
  );
}

function branchSequence(
  kc: NormalizedKc,
  binding: NormalizedBranchBinding,
): readonly NormalizedDeliveryStep[] {
  const repairs = kc.deliverySteps.filter((step) =>
    matchesStep(step, binding.repairNodeIds, binding.repairItemIds),
  );
  const reentry = kc.deliverySteps.find((step) =>
    matchesStep(step, [binding.reentryNodeId], [binding.reentryItemId]),
  );
  if (reentry === undefined) return repairs;
  return [...repairs.filter((step) => step.stepId !== reentry.stepId), reentry];
}

function plannerHandoffStep(
  kc: NormalizedKc,
  binding: NormalizedBranchBinding,
): NormalizedDeliveryStep | null {
  if (binding.plannerHandoffNodeId === null) return null;
  return (
    kc.deliverySteps.find((step) =>
      step.nodeIds.includes(binding.plannerHandoffNodeId as string),
    ) ?? null
  );
}

function terminal(
  run: NormalizedLessonRun,
  status: Extract<NormalizedRunStatus, 'BLOCKED' | 'DELIVERY_COMPLETE'>,
): NormalizedLessonRun {
  return {
    ...run,
    status,
    currentStepId: null,
    display: 'CONTENT',
    branch: null,
    blockAfterCurrentStep: false,
  };
}

function enterStep(run: NormalizedLessonRun, step: NormalizedDeliveryStep): NormalizedLessonRun {
  return {
    ...run,
    currentStepId: step.stepId,
    display: 'CONTENT',
    blockAfterCurrentStep: false,
  };
}

function enterBranch(
  lesson: NormalizedLesson,
  run: NormalizedLessonRun,
  failedStep: NormalizedDeliveryStep,
  failedItem: NormalizedItem,
): NormalizedLessonRun {
  const kc = kcForStep(lesson, failedStep);
  const binding = bindingFor(kc, failedItem.exitFunction);
  const first = binding === undefined ? undefined : branchSequence(kc, binding)[0];
  if (binding === undefined || first === undefined) {
    // No authored support/remediation branch for this missed checkpoint. The imported
    // lesson batch ships checkpoints WITHOUT repair branches, so branching here would
    // dead-end the learner at BLOCKED ("Let's pause here") and make the lesson
    // uncompletable past the first missed checkpoint. Instead, continue the baseline
    // sequence: the miss is already recorded as evidence and the learner has already seen
    // the correct-answer feedback, so advance to the next step (or complete). Lessons that
    // DO author a branch are unaffected and still remediate as designed.
    const next = nextBaselineStep(lesson, failedStep.stepId, run.responses);
    return next === null ? terminal(run, 'DELIVERY_COMPLETE') : enterStep(run, next);
  }
  return {
    ...enterStep(run, first),
    branch: {
      kcId: kc.kcId,
      failedStepId: failedStep.stepId,
      failedFunction: binding.failedFunction,
    },
  };
}

function handoffOrBlock(lesson: NormalizedLesson, run: NormalizedLessonRun): NormalizedLessonRun {
  const branch = run.branch;
  if (branch === null) return terminal(run, 'BLOCKED');
  const kc = lesson.kcs.find((candidate) => candidate.kcId === branch.kcId);
  const binding = kc?.branchBindings.find(
    (candidate) => candidate.failedFunction === branch.failedFunction,
  );
  if (kc === undefined || binding === undefined) return terminal(run, 'BLOCKED');
  const handoff = plannerHandoffStep(kc, binding);
  if (handoff === null) return terminal(run, 'BLOCKED');
  return {
    ...enterStep(run, handoff),
    blockAfterCurrentStep: true,
  };
}

function advancePrerequisiteOutcome(
  lesson: NormalizedLesson,
  run: NormalizedLessonRun,
  gate: NormalizedPrerequisiteGate,
  outcome: NormalizedFeedbackOutcome,
): NormalizedLessonRun {
  if (outcome === 'CORRECT') {
    return enterStep(run, exactStepForNode(lesson, gate.passNodeId, gate.itemId));
  }
  if (gate.failureHandoffNodeId === null) return terminal(run, 'BLOCKED');
  const handoff = exactStepForNode(lesson, gate.failureHandoffNodeId, gate.itemId);
  return {
    ...enterStep(run, handoff),
    branch: null,
    blockAfterCurrentStep: true,
  };
}

function resumeAfterReentry(
  lesson: NormalizedLesson,
  run: NormalizedLessonRun,
): NormalizedLessonRun {
  const branch = run.branch;
  if (branch === null) {
    fail('GRAPH_INVALID', 'fresh re-entry has no failed-function context', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  const kc = lesson.kcs.find((candidate) => candidate.kcId === branch.kcId);
  const binding = kc?.branchBindings.find(
    (candidate) => candidate.failedFunction === branch.failedFunction,
  );
  if (kc === undefined || binding === undefined) {
    fail('GRAPH_INVALID', 'fresh re-entry binding no longer resolves', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  let next: NormalizedDeliveryStep | null = null;
  if (binding.successNextNodeId !== null) {
    next = exactForwardBaselineStepForNode(lesson, branch.failedStepId, binding.successNextNodeId);
  } else {
    next = nextBaselineStep(lesson, branch.failedStepId, run.responses);
  }
  const resumed: NormalizedLessonRun = {
    ...run,
    branch: null,
    blockAfterCurrentStep: false,
  };
  return next === null ? terminal(resumed, 'DELIVERY_COMPLETE') : enterStep(resumed, next);
}

function advanceBranch(lesson: NormalizedLesson, run: NormalizedLessonRun): NormalizedLessonRun {
  const branch = run.branch;
  if (branch === null || run.currentStepId === null) {
    fail('GRAPH_INVALID', 'branch cursor has no exact branch context', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  const kc = lesson.kcs.find((candidate) => candidate.kcId === branch.kcId);
  const binding = kc?.branchBindings.find(
    (candidate) => candidate.failedFunction === branch.failedFunction,
  );
  if (kc === undefined || binding === undefined) {
    fail('GRAPH_INVALID', 'branch binding no longer resolves', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  const sequence = branchSequence(kc, binding);
  const index = sequence.findIndex((step) => step.stepId === run.currentStepId);
  if (index < 0) {
    fail('GRAPH_INVALID', `step "${run.currentStepId}" is not in the exact branch binding`, {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: run.currentStepId,
    });
  }
  const next = sequence[index + 1];
  return next === undefined ? handoffOrBlock(lesson, run) : enterStep(run, next);
}

function advanceAfterContent(
  lesson: NormalizedLesson,
  run: NormalizedLessonRun,
): NormalizedLessonRun {
  if (run.blockAfterCurrentStep) return terminal(run, 'BLOCKED');
  if (run.currentStepId === null) return terminal(run, 'DELIVERY_COMPLETE');
  if (run.branch !== null) return advanceBranch(lesson, run);
  const next = nextBaselineStep(lesson, run.currentStepId, run.responses);
  return next === null ? terminal(run, 'DELIVERY_COMPLETE') : enterStep(run, next);
}

function advanceAfterFeedback(
  lesson: NormalizedLesson,
  run: NormalizedLessonRun,
): NormalizedLessonRun {
  if (run.currentStepId === null) return terminal(run, 'DELIVERY_COMPLETE');
  const step = stepOf(lesson, run.currentStepId);
  const item = interactiveItem(lesson, step);
  const record = item === null ? undefined : run.responses[item.itemId];
  if (item === null || record === undefined) {
    fail('STATE_MALFORMED', 'feedback screen has no immutable response', {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: step.stepId,
    });
  }

  if (run.branch === null) {
    const prerequisiteGate = prerequisiteGateForItem(lesson, item.itemId);
    if (prerequisiteGate !== undefined) {
      return advancePrerequisiteOutcome(lesson, run, prerequisiteGate, record.outcome);
    }
    if (item.exitFunction !== 'NONE' && record.outcome !== 'CORRECT') {
      return enterBranch(lesson, run, step, item);
    }
    const next = nextBaselineStep(lesson, step.stepId, run.responses);
    return next === null ? terminal(run, 'DELIVERY_COMPLETE') : enterStep(run, next);
  }

  const kc = lesson.kcs.find((candidate) => candidate.kcId === run.branch?.kcId);
  const binding = kc?.branchBindings.find(
    (candidate) => candidate.failedFunction === run.branch?.failedFunction,
  );
  if (kc === undefined || binding === undefined) {
    fail('GRAPH_INVALID', 'feedback branch binding no longer resolves', {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: step.stepId,
    });
  }
  const reentry = matchesStep(step, [binding.reentryNodeId], [binding.reentryItemId]);
  if (reentry) {
    return record.outcome === 'CORRECT'
      ? resumeAfterReentry(lesson, run)
      : handoffOrBlock(lesson, run);
  }
  if (record.outcome === 'CORRECT') return advanceBranch(lesson, run);
  const repairs = kc.deliverySteps.filter((candidate) =>
    matchesStep(candidate, binding.repairNodeIds, binding.repairItemIds),
  );
  const repairIndex = repairs.findIndex((candidate) => candidate.stepId === step.stepId);
  if (repairIndex < 0) {
    fail('GRAPH_INVALID', `step "${step.stepId}" is neither a repair nor exact re-entry`, {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: step.stepId,
    });
  }
  const nextRepair = repairs[repairIndex + 1];
  return nextRepair === undefined ? handoffOrBlock(lesson, run) : enterStep(run, nextRepair);
}

export interface CreateNormalizedLessonRunOptions {
  readonly revision: LoadedLessonRevision;
  readonly now: string;
  readonly runId?: string;
}

export function createNormalizedLessonRun(
  options: CreateNormalizedLessonRunOptions,
): NormalizedLessonRun {
  assertLoadedRevision(options.revision);
  const first = firstBaselineStep(options.revision.lesson);
  return {
    stateVersion: RUN_STATE_VERSION,
    runId: options.runId ?? randomUUID(),
    lessonId: options.revision.lessonId,
    definitionHash: options.revision.definitionHash,
    status: first === null ? 'DELIVERY_COMPLETE' : 'IN_PROGRESS',
    paused: false,
    currentStepId: first?.stepId ?? null,
    display: 'CONTENT',
    branch: null,
    blockAfterCurrentStep: false,
    responses: {},
    passedExits: {},
    startedAt: options.now,
    updatedAt: options.now,
  };
}

export function applyNormalizedLessonAction(
  run: NormalizedLessonRun,
  action: NormalizedLessonAction,
  now: string,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  assertRunRevision(run, revision);
  if (run.status !== 'IN_PROGRESS' || run.currentStepId === null) {
    fail('ACTION_NOT_ALLOWED', 'lesson is no longer in progress', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  const step = stepOf(revision.lesson, run.currentStepId);
  const item = interactiveItem(revision.lesson, step);

  if (action.type === 'SUBMIT_RESPONSE') {
    if (item === null || item.projection.responseControl === null) {
      fail('ACTION_NOT_ALLOWED', 'this delivery step is exposition and accepts only CONTINUE', {
        lessonId: run.lessonId,
        runId: run.runId,
        stepId: step.stepId,
      });
    }
    const detail = {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: step.stepId,
      itemId: item.itemId,
    };
    const response = toEngineResponse(item.projection.responseControl, action.response, detail);
    if (run.display === 'FEEDBACK') {
      const existing = run.responses[item.itemId];
      if (existing !== undefined && sameResponse(existing.response, response)) return run;
      fail('RESPONSE_IMMUTABLE', 'the response for this step is already immutable', detail);
    }
    const answer = revision.protectedAuthority.answerKey.byItemId[item.itemId];
    if (answer === undefined) {
      fail(
        'ANSWER_AUTHORITY_MISSING',
        'scored item has no exact-revision answer authority',
        detail,
      );
    }
    const outcome = outcomeFor(answer, response);
    const record: NormalizedResponseRecord = {
      stepId: step.stepId,
      itemId: item.itemId,
      primaryKcId: item.primaryKcId,
      activityRole: item.activityRole,
      // Repair and fresh re-entry items are branch-scoped. Their normalized item
      // role is often REPAIR_CONFIRMATION, so the active failed function is the
      // only exact runtime source for the function this administration served.
      exitFunction: run.branch?.failedFunction ?? item.exitFunction,
      isReentry: item.isReentry,
      response,
      outcome,
      correct: outcome === 'CORRECT',
      committedAt: now,
      runtimeFacts: {
        responseId: `${run.runId}:${item.itemId}:1`,
        attemptIndex: 1,
        firstAttempt: true,
        isRetry: false,
        isDiagnosticRetry: false,
        // This runtime has no support-request, hint, reveal, timer, passage, or
        // mixed-administration action. These are observed absences at commit,
        // not values copied from authored affordance strings.
        assistanceRequested: false,
        assistanceTaken: false,
        assistanceLevel: 'A0',
        contentBearingHintUsed: false,
        revealUsed: false,
        mixedAdministration: false,
        passageAdministration: false,
        timedAdministration: false,
      },
    };
    let passedExits = run.passedExits;
    if (outcome === 'CORRECT') {
      if (run.branch === null && item.exitFunction !== 'NONE') {
        passedExits = markPassed(passedExits, item.primaryKcId, item.exitFunction);
      } else if (run.branch !== null) {
        const kc = revision.lesson.kcs.find((candidate) => candidate.kcId === run.branch?.kcId);
        const binding = kc?.branchBindings.find(
          (candidate) => candidate.failedFunction === run.branch?.failedFunction,
        );
        if (
          kc !== undefined &&
          binding !== undefined &&
          matchesStep(step, [binding.reentryNodeId], [binding.reentryItemId])
        ) {
          passedExits = markPassed(passedExits, kc.kcId, binding.failedFunction);
        }
      }
    }
    return {
      ...run,
      display: 'FEEDBACK',
      responses: { ...run.responses, [item.itemId]: record },
      passedExits,
      updatedAt: now,
    };
  }

  if (run.display === 'FEEDBACK') {
    return { ...advanceAfterFeedback(revision.lesson, run), updatedAt: now };
  }
  if (item !== null) {
    fail('ACTION_NOT_ALLOWED', 'this question requires a response before continuing', {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: step.stepId,
      itemId: item.itemId,
    });
  }
  return { ...advanceAfterContent(revision.lesson, run), updatedAt: now };
}

export function resumeNormalizedLessonRun(
  run: NormalizedLessonRun,
  now: string,
): NormalizedLessonRun {
  return { ...run, paused: false, updatedAt: now };
}

export type NormalizedLessonScreen =
  | {
      readonly kind: 'EXPOSITION';
      readonly heading: string;
      readonly contentBlocks: readonly string[];
      readonly prompt: string;
    }
  | {
      readonly kind: 'QUESTION';
      readonly itemId: string;
      readonly kcId: string;
      readonly heading: string;
      readonly contentBlocks: readonly string[];
      readonly prompt: string;
      readonly control:
        | {
            readonly kind: 'SINGLE_SELECT';
            readonly choices: readonly {
              readonly choiceId: string;
              readonly text: string;
            }[];
          }
        | {
            readonly kind: 'SHORT_TEXT';
            readonly inputConvention: {
              readonly normalization: 'TRIM_AND_COLLAPSE_WHITESPACE';
              readonly matching: 'AUTHORED_EQUIVALENTS_ONLY';
              readonly caseSensitive: true;
            };
          }
        | {
            readonly kind: 'STRUCTURED_FIELDS';
            readonly fields: readonly {
              readonly fieldId: string;
              readonly label: string;
            }[];
          };
      readonly choices: readonly { readonly choiceId: string; readonly text: string }[];
    }
  | {
      readonly kind: 'FEEDBACK';
      readonly itemId: string;
      readonly outcome: NormalizedFeedbackOutcome;
      readonly message: string;
    }
  | { readonly kind: 'BLOCKED' }
  | { readonly kind: 'COMPLETE' };

export interface NormalizedLessonRunView {
  readonly runId: string;
  readonly lessonId: string;
  readonly status: NormalizedRunStatus;
  readonly paused: boolean;
  readonly kcId: string | null;
  readonly kcOrdinal: number | null;
  readonly totalKcs: number;
  readonly screen: NormalizedLessonScreen;
}

function learnerControl(
  control: NormalizedResponseControl,
): Extract<NormalizedLessonScreen, { readonly kind: 'QUESTION' }>['control'] {
  if (control.kind === 'SINGLE_SELECT') {
    return {
      kind: 'SINGLE_SELECT',
      choices: control.choices.map(({ choiceId, text }) => ({ choiceId, text })),
    };
  }
  if (control.kind === 'SHORT_TEXT') {
    return { kind: 'SHORT_TEXT', inputConvention: { ...control.inputConvention } };
  }
  return {
    kind: 'STRUCTURED_FIELDS',
    fields: control.fields.map(({ fieldId, label }) => ({ fieldId, label })),
  };
}

function feedbackMessage(answer: ServerItemAnswer, outcome: NormalizedFeedbackOutcome): string {
  const authored = answer.learnerSafePostCommitmentFeedback?.trim();
  if (authored !== undefined && authored.length > 0) return authored;
  if (outcome === 'CORRECT') return 'Correct.';
  if (outcome === 'OMITTED') return 'No response was submitted.';
  if (outcome === 'INVALID') return 'The submitted fields were incomplete.';
  return 'Not quite.';
}

export function renderNormalizedLessonRun(
  run: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): NormalizedLessonRunView {
  assertRunRevision(run, revision);
  const base = {
    runId: run.runId,
    lessonId: run.lessonId,
    status: run.status,
    paused: run.paused,
  };
  if (run.status === 'BLOCKED') {
    return {
      ...base,
      kcId: null,
      kcOrdinal: null,
      totalKcs: revision.lesson.kcs.length,
      screen: { kind: 'BLOCKED' },
    };
  }
  if (run.status === 'DELIVERY_COMPLETE' || run.currentStepId === null) {
    return {
      ...base,
      kcId: null,
      kcOrdinal: null,
      totalKcs: revision.lesson.kcs.length,
      screen: { kind: 'COMPLETE' },
    };
  }

  const step = stepOf(revision.lesson, run.currentStepId);
  const kc = kcForStep(revision.lesson, step);
  const item = interactiveItem(revision.lesson, step);
  const withPosition = {
    ...base,
    kcId: kc.kcId,
    kcOrdinal: kc.canonicalOrdinal,
    totalKcs: revision.lesson.kcs.length,
  };

  if (run.display === 'FEEDBACK') {
    if (item === null) {
      fail('STATE_MALFORMED', 'feedback display points to exposition', {
        lessonId: run.lessonId,
        runId: run.runId,
        stepId: step.stepId,
      });
    }
    const record = run.responses[item.itemId];
    const answer = revision.protectedAuthority.answerKey.byItemId[item.itemId];
    if (record === undefined || answer === undefined) {
      fail('STATE_MALFORMED', 'feedback display lacks its exact immutable response', {
        lessonId: run.lessonId,
        runId: run.runId,
        stepId: step.stepId,
        itemId: item.itemId,
      });
    }
    return {
      ...withPosition,
      screen: {
        kind: 'FEEDBACK',
        itemId: item.itemId,
        outcome: record.outcome,
        message: feedbackMessage(answer, record.outcome),
      },
    };
  }

  if (item === null) {
    const blocks = expositionBlocks(revision.lesson, step);
    return {
      ...withPosition,
      screen: {
        kind: 'EXPOSITION',
        heading: step.heading ?? '',
        contentBlocks: blocks,
        prompt: blocks.join('\n\n'),
      },
    };
  }
  const control = item.projection.responseControl;
  if (control === null) {
    fail('GRAPH_INVALID', `scored item "${item.itemId}" has no response control`, {
      lessonId: run.lessonId,
      runId: run.runId,
      stepId: step.stepId,
      itemId: item.itemId,
    });
  }
  const choices =
    control.kind === 'SINGLE_SELECT'
      ? control.choices.map(({ choiceId, text }) => ({ choiceId, text }))
      : [];
  return {
    ...withPosition,
    screen: {
      kind: 'QUESTION',
      itemId: item.itemId,
      kcId: item.primaryKcId,
      heading: step.heading ?? item.projection.title ?? '',
      contentBlocks: step.contentBlocks,
      prompt: item.projection.prompt,
      control: learnerControl(control),
      choices,
    },
  };
}

function requiredString(raw: Record<string, unknown>, key: string, lessonId: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.length === 0) {
    fail('STATE_MALFORMED', `run state field "${key}" is not a non-empty string`, { lessonId });
  }
  return value;
}

export function normalizedRunRevisionAddress(value: unknown): {
  readonly lessonId: string;
  readonly definitionHash: string;
} {
  const raw = asRecord(value);
  if (raw === undefined) {
    fail('STATE_MALFORMED', 'run state is not an object', { lessonId: '(unknown)' });
  }
  if (raw.stateVersion === undefined) {
    fail(
      'LEGACY_STATE_UNSUPPORTED',
      'pre-WP-05C normalized run state cannot be shallow-cast into the canonical graph',
      {
        lessonId: typeof raw.lessonId === 'string' ? raw.lessonId : '(unknown)',
      },
    );
  }
  if (raw.stateVersion !== RUN_STATE_VERSION) {
    fail(
      'STATE_VERSION_UNSUPPORTED',
      `unsupported run state version "${String(raw.stateVersion)}"`,
      {
        lessonId: typeof raw.lessonId === 'string' ? raw.lessonId : '(unknown)',
      },
    );
  }
  const lessonId = requiredString(raw, 'lessonId', '(unknown)');
  return {
    lessonId,
    definitionHash: requiredString(raw, 'definitionHash', lessonId),
  };
}

function parseEngineResponse(value: unknown, lessonId: string, itemId: string): EngineResponse {
  const raw = asRecord(value);
  if (
    raw?.kind === 'MULTIPLE_CHOICE' &&
    (raw.choiceId === null || typeof raw.choiceId === 'string')
  ) {
    return { kind: 'MULTIPLE_CHOICE', choiceId: raw.choiceId };
  }
  if (raw?.kind === 'SHORT' && (raw.text === null || typeof raw.text === 'string')) {
    return { kind: 'SHORT', text: raw.text };
  }
  if (raw?.kind === 'CONSTRUCTED') {
    const fields = asRecord(raw.fields);
    if (
      fields !== undefined &&
      Object.values(fields).every((field) => field === null || typeof field === 'string')
    ) {
      return { kind: 'CONSTRUCTED', fields: fields as Record<string, string | null> };
    }
  }
  fail('STATE_MALFORMED', `response record for "${itemId}" is malformed`, {
    lessonId,
    itemId,
  });
}

function parseResponseRuntimeFacts(
  value: unknown,
  lessonId: string,
  itemId: string,
): NormalizedResponseRuntimeFacts | undefined {
  if (value === undefined) return undefined;
  const raw = asRecord(value);
  const attemptIndex = raw?.attemptIndex;
  const assistanceLevel = raw?.assistanceLevel;
  const booleanFields = [
    'firstAttempt',
    'isRetry',
    'isDiagnosticRetry',
    'assistanceRequested',
    'assistanceTaken',
    'contentBearingHintUsed',
    'revealUsed',
    'mixedAdministration',
    'passageAdministration',
    'timedAdministration',
  ] as const;
  if (
    raw === undefined ||
    typeof raw.responseId !== 'string' ||
    raw.responseId.length === 0 ||
    typeof attemptIndex !== 'number' ||
    !Number.isInteger(attemptIndex) ||
    attemptIndex < 1 ||
    (assistanceLevel !== 'A0' &&
      assistanceLevel !== 'A1' &&
      assistanceLevel !== 'A2' &&
      assistanceLevel !== 'A3') ||
    booleanFields.some((field) => typeof raw[field] !== 'boolean') ||
    raw.firstAttempt !== (attemptIndex === 1)
  ) {
    fail('STATE_MALFORMED', `response runtime facts for "${itemId}" are malformed`, {
      lessonId,
      itemId,
    });
  }
  return {
    responseId: raw.responseId,
    attemptIndex,
    firstAttempt: raw.firstAttempt as boolean,
    isRetry: raw.isRetry as boolean,
    isDiagnosticRetry: raw.isDiagnosticRetry as boolean,
    assistanceRequested: raw.assistanceRequested as boolean,
    assistanceTaken: raw.assistanceTaken as boolean,
    assistanceLevel,
    contentBearingHintUsed: raw.contentBearingHintUsed as boolean,
    revealUsed: raw.revealUsed as boolean,
    mixedAdministration: raw.mixedAdministration as boolean,
    passageAdministration: raw.passageAdministration as boolean,
    timedAdministration: raw.timedAdministration as boolean,
  };
}

function parseResponses(
  value: unknown,
  lessonId: string,
): Readonly<Record<string, NormalizedResponseRecord>> {
  const raw = asRecord(value);
  if (raw === undefined) {
    fail('STATE_MALFORMED', 'run responses are not an object', { lessonId });
  }
  const out: Record<string, NormalizedResponseRecord> = {};
  for (const [key, candidate] of Object.entries(raw)) {
    const record = asRecord(candidate);
    if (record === undefined) {
      fail('STATE_MALFORMED', `response record "${key}" is not an object`, {
        lessonId,
        itemId: key,
      });
    }
    const itemId = requiredString(record, 'itemId', lessonId);
    const activityRole = record.activityRole;
    const exitFunction = record.exitFunction;
    const outcome = record.outcome;
    if (
      key !== itemId ||
      !ACTIVITY_ROLES.includes(activityRole as ActivityRole) ||
      (exitFunction !== 'NEAR_USE' && exitFunction !== 'CHANGED_TASK' && exitFunction !== 'NONE') ||
      (outcome !== 'CORRECT' &&
        outcome !== 'INCORRECT' &&
        outcome !== 'OMITTED' &&
        outcome !== 'INVALID') ||
      typeof record.isReentry !== 'boolean' ||
      typeof record.correct !== 'boolean' ||
      record.correct !== (outcome === 'CORRECT')
    ) {
      fail('STATE_MALFORMED', `response record "${key}" has invalid metadata`, {
        lessonId,
        itemId,
      });
    }
    const runtimeFacts = parseResponseRuntimeFacts(record.runtimeFacts, lessonId, itemId);
    out[key] = {
      stepId: requiredString(record, 'stepId', lessonId),
      itemId,
      primaryKcId: requiredString(record, 'primaryKcId', lessonId),
      activityRole: activityRole as ActivityRole,
      exitFunction,
      isReentry: record.isReentry,
      response: parseEngineResponse(record.response, lessonId, itemId),
      outcome,
      correct: record.correct,
      committedAt: requiredString(record, 'committedAt', lessonId),
      ...(runtimeFacts === undefined ? {} : { runtimeFacts }),
    };
  }
  return out;
}

function parsePassedExits(
  value: unknown,
  lessonId: string,
): Readonly<Record<string, readonly ExitFunction[]>> {
  const raw = asRecord(value);
  if (raw === undefined) {
    fail('STATE_MALFORMED', 'run passedExits are not an object', { lessonId });
  }
  const out: Record<string, readonly ExitFunction[]> = {};
  for (const [kcId, candidate] of Object.entries(raw)) {
    if (
      !Array.isArray(candidate) ||
      !candidate.every((fn) => fn === 'NEAR_USE' || fn === 'CHANGED_TASK') ||
      new Set(candidate).size !== candidate.length
    ) {
      fail('STATE_MALFORMED', `passed exits for "${kcId}" are malformed`, { lessonId });
    }
    out[kcId] = candidate as ExitFunction[];
  }
  return out;
}

function parseBranch(value: unknown, lessonId: string): NormalizedRunBranch | null {
  if (value === null) return null;
  const raw = asRecord(value);
  if (
    raw === undefined ||
    (raw.failedFunction !== 'NEAR_USE' && raw.failedFunction !== 'CHANGED_TASK')
  ) {
    fail('STATE_MALFORMED', 'run branch context is malformed', { lessonId });
  }
  return {
    kcId: requiredString(raw, 'kcId', lessonId),
    failedStepId: requiredString(raw, 'failedStepId', lessonId),
    failedFunction: raw.failedFunction,
  };
}

function assertRestoredResponseBindings(
  run: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): void {
  for (const record of Object.values(run.responses)) {
    const item = itemOf(revision.lesson, record.itemId);
    const step = stepOf(revision.lesson, record.stepId);
    const expectedExitFunction = item.repairsFunction ?? item.exitFunction;
    if (
      !step.itemIds.includes(item.itemId) ||
      step.primaryKcId !== item.primaryKcId ||
      record.primaryKcId !== item.primaryKcId ||
      record.activityRole !== item.activityRole ||
      record.exitFunction !== expectedExitFunction ||
      record.isReentry !== item.isReentry
    ) {
      fail(
        'STATE_MALFORMED',
        `response record "${record.itemId}" contradicts its exact lesson revision`,
        {
          lessonId: run.lessonId,
          runId: run.runId,
          stepId: record.stepId,
          itemId: record.itemId,
        },
      );
    }
    const answer = revision.protectedAuthority.answerKey.byItemId[item.itemId];
    if (answer === undefined) {
      fail('STATE_MALFORMED', `response record "${record.itemId}" has no exact answer authority`, {
        lessonId: run.lessonId,
        runId: run.runId,
        stepId: record.stepId,
        itemId: record.itemId,
      });
    }
    const expectedOutcome = outcomeFor(answer, record.response);
    if (record.outcome !== expectedOutcome || record.correct !== (expectedOutcome === 'CORRECT')) {
      fail(
        'STATE_MALFORMED',
        `response outcome for "${record.itemId}" contradicts the exact answer authority`,
        {
          lessonId: run.lessonId,
          runId: run.runId,
          stepId: record.stepId,
          itemId: record.itemId,
        },
      );
    }
  }
}

function assertRestoredPrerequisiteCursor(
  run: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): void {
  const failedGates = revision.lesson.prerequisiteGates
    .map((gate) => ({ gate, record: run.responses[gate.itemId] }))
    .filter(
      (
        candidate,
      ): candidate is {
        readonly gate: NormalizedPrerequisiteGate;
        readonly record: NormalizedResponseRecord;
      } => candidate.record !== undefined && candidate.record.outcome !== 'CORRECT',
    );
  if (failedGates.length === 0) return;
  if (failedGates.length > 1) {
    fail('STATE_MALFORMED', 'run contains more than one failed prerequisite gate', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  const { gate, record } = failedGates[0]!;
  const entryStep = exactStepForNode(revision.lesson, gate.entryNodeId, gate.itemId);
  const validFeedback =
    run.status === 'IN_PROGRESS' &&
    run.display === 'FEEDBACK' &&
    run.currentStepId === entryStep.stepId &&
    run.branch === null &&
    !run.blockAfterCurrentStep;
  const validHandoff =
    gate.failureHandoffNodeId !== null &&
    run.status === 'IN_PROGRESS' &&
    run.display === 'CONTENT' &&
    run.currentStepId ===
      exactStepForNode(revision.lesson, gate.failureHandoffNodeId, gate.itemId).stepId &&
    run.branch === null &&
    run.blockAfterCurrentStep;
  const validTerminal =
    run.status === 'BLOCKED' &&
    run.currentStepId === null &&
    run.display === 'CONTENT' &&
    run.branch === null &&
    !run.blockAfterCurrentStep;
  if (!validFeedback && !validHandoff && !validTerminal) {
    fail(
      'STATE_MALFORMED',
      `failed prerequisite gate "${gate.itemId}" contradicts the restored graph cursor`,
      {
        lessonId: run.lessonId,
        runId: run.runId,
        stepId: record.stepId,
        itemId: gate.itemId,
      },
    );
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function samePassedExits(
  left: NormalizedLessonRun['passedExits'],
  right: NormalizedLessonRun['passedExits'],
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    sameStringSet(leftKeys, rightKeys) &&
    leftKeys.every((kcId) => sameStringSet(left[kcId] ?? [], right[kcId] ?? []))
  );
}

function sameBranch(
  left: NormalizedLessonRun['branch'],
  right: NormalizedLessonRun['branch'],
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.kcId === right.kcId &&
    left.failedStepId === right.failedStepId &&
    left.failedFunction === right.failedFunction
  );
}

function sameRestoredGraphAuthority(
  replayed: NormalizedLessonRun,
  restored: NormalizedLessonRun,
): boolean {
  return (
    replayed.status === restored.status &&
    replayed.currentStepId === restored.currentStepId &&
    replayed.display === restored.display &&
    sameBranch(replayed.branch, restored.branch) &&
    replayed.blockAfterCurrentStep === restored.blockAfterCurrentStep &&
    sameStringSet(Object.keys(replayed.responses), Object.keys(restored.responses)) &&
    samePassedExits(replayed.passedExits, restored.passedExits)
  );
}

function assertRestoredGraphReachable(
  restored: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): void {
  let replayed = createNormalizedLessonRun({
    revision,
    now: restored.startedAt,
    runId: restored.runId,
  });
  for (let guard = 0; guard < 10_000; guard += 1) {
    if (sameRestoredGraphAuthority(replayed, restored)) return;
    if (replayed.status !== 'IN_PROGRESS' || replayed.currentStepId === null) break;
    const step = stepOf(revision.lesson, replayed.currentStepId);
    const item = interactiveItem(revision.lesson, step);
    if (replayed.display === 'FEEDBACK') {
      replayed = applyNormalizedLessonAction(
        replayed,
        { type: 'CONTINUE' },
        restored.updatedAt,
        revision,
      );
      continue;
    }
    if (item !== null) {
      const committed = restored.responses[item.itemId];
      if (committed === undefined) break;
      replayed = applyNormalizedLessonAction(
        replayed,
        { type: 'SUBMIT_RESPONSE', response: committed.response },
        committed.committedAt,
        revision,
      );
      continue;
    }
    replayed = applyNormalizedLessonAction(
      replayed,
      { type: 'CONTINUE' },
      restored.updatedAt,
      revision,
    );
  }
  fail('STATE_MALFORMED', 'restored graph cursor has no exact committed response path', {
    lessonId: restored.lessonId,
    runId: restored.runId,
    ...(restored.currentStepId === null ? {} : { stepId: restored.currentStepId }),
  });
}

export function restoreNormalizedLessonRun(
  value: unknown,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  const address = normalizedRunRevisionAddress(value);
  const raw = asRecord(value)!;
  const status = raw.status;
  const display = raw.display;
  if (
    (status !== 'IN_PROGRESS' && status !== 'BLOCKED' && status !== 'DELIVERY_COMPLETE') ||
    (display !== 'CONTENT' && display !== 'FEEDBACK') ||
    typeof raw.paused !== 'boolean' ||
    typeof raw.blockAfterCurrentStep !== 'boolean' ||
    (raw.currentStepId !== null && typeof raw.currentStepId !== 'string')
  ) {
    fail('STATE_MALFORMED', 'run state has invalid status or cursor fields', {
      lessonId: address.lessonId,
    });
  }
  const run: NormalizedLessonRun = {
    stateVersion: RUN_STATE_VERSION,
    runId: requiredString(raw, 'runId', address.lessonId),
    lessonId: address.lessonId,
    definitionHash: address.definitionHash,
    status,
    paused: raw.paused,
    currentStepId: raw.currentStepId,
    display,
    branch: parseBranch(raw.branch, address.lessonId),
    blockAfterCurrentStep: raw.blockAfterCurrentStep,
    responses: parseResponses(raw.responses, address.lessonId),
    passedExits: parsePassedExits(raw.passedExits, address.lessonId),
    startedAt: requiredString(raw, 'startedAt', address.lessonId),
    updatedAt: requiredString(raw, 'updatedAt', address.lessonId),
  };
  assertRunRevision(run, revision);
  assertRestoredResponseBindings(run, revision);
  assertRestoredPrerequisiteCursor(run, revision);
  assertRestoredGraphReachable(run, revision);
  if (run.status === 'IN_PROGRESS') {
    if (run.currentStepId === null) {
      fail('STATE_MALFORMED', 'in-progress run has no currentStepId', {
        lessonId: run.lessonId,
        runId: run.runId,
      });
    }
    const step = stepOf(revision.lesson, run.currentStepId);
    if (run.display === 'FEEDBACK') {
      const item = interactiveItem(revision.lesson, step);
      if (item === null || run.responses[item.itemId] === undefined) {
        fail('STATE_MALFORMED', 'feedback cursor has no matching immutable response', {
          lessonId: run.lessonId,
          runId: run.runId,
          stepId: step.stepId,
        });
      }
    }
  } else if (run.currentStepId !== null) {
    fail('STATE_MALFORMED', 'terminal run retains a graph cursor', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  return run;
}
