import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type {
  NormalizedBranchBinding,
  NormalizedDeliveryStep,
  NormalizedItem,
} from '@mcat/content/lesson-normalization';

import {
  createRepoLessonRevisionProvider,
  type LoadedLessonRevision,
  type RepoLessonCatalogDefinition,
  type ServerItemAnswer,
} from './lesson-content-provider';
import {
  applyNormalizedLessonAction,
  createNormalizedLessonRun,
  renderNormalizedLessonRun,
  restoreNormalizedLessonRun,
  type NormalizedLessonAction,
  type NormalizedLessonRun,
  type NormalizedLessonSubmittedResponse,
} from './normalized-lesson-runtime';

const NOW = '2026-07-30T18:00:00.000Z';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';
const provider = createRepoLessonRevisionProvider();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

async function loadTemplateRevision(): Promise<LoadedLessonRevision> {
  const definition: RepoLessonCatalogDefinition = {
    lessonId: 'V3-LES-000000',
    slug: 'v3-les-000000',
    title: 'Canonical lesson template',
    section: null,
    cluster: 'R1',
    estimatedMinutes: 10,
    orderedKcIds: ['V3-KC-452593'],
    prerequisiteLessonIds: [],
    runtimeKind: 'normalized',
    lifecycle: 'DRAFT',
    enabled: true,
    killSwitch: 'OPEN',
    routePath: '/app/lessons/v3-les-000000',
    candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
  };
  return createRepoLessonRevisionProvider({
    contentRoot: join(repoRoot, 'docs/lesson-authoring/template'),
    catalog: [definition],
  }).loadActiveRevision({ lessonId: definition.lessonId });
}

function stepFor(revision: LoadedLessonRevision, stepId: string): NormalizedDeliveryStep {
  const step = revision.lesson.kcs
    .flatMap((kc) => kc.deliverySteps)
    .find((candidate) => candidate.stepId === stepId);
  if (step === undefined) throw new Error(`missing step ${stepId}`);
  return step;
}

function itemForStep(revision: LoadedLessonRevision, stepId: string): NormalizedItem {
  const itemId = stepFor(revision, stepId).itemIds[0];
  const item = revision.lesson.items.find((candidate) => candidate.itemId === itemId);
  if (item === undefined) throw new Error(`step ${stepId} has no item`);
  return item;
}

function structuredResponse(
  item: NormalizedItem,
  answer: ServerItemAnswer,
): NormalizedLessonSubmittedResponse {
  const control = item.projection.responseControl;
  if (control?.kind !== 'STRUCTURED_FIELDS') throw new Error(`${item.itemId} is not structured`);
  const authority = answer.structuredAuthority as
    | {
        expected_equation_forms?: readonly string[];
        expected_solution_pair?: readonly string[];
      }
    | undefined;
  const equations = [...(authority?.expected_equation_forms ?? [])];
  const pair = (authority?.expected_solution_pair ?? []).map((part) =>
    part.split('=').at(-1)?.trim(),
  );
  let equationIndex = 0;
  return {
    kind: 'CONSTRUCTED',
    fields: control.fields.map(({ fieldId }) => ({
      fieldId,
      value: fieldId.includes('solution')
        ? `(${pair.join(', ')})`
        : (equations[equationIndex++] ?? '__missing_authority__'),
    })),
  };
}

function correctResponseFor(
  revision: LoadedLessonRevision,
  itemId: string,
): NormalizedLessonSubmittedResponse {
  const item = revision.lesson.items.find((candidate) => candidate.itemId === itemId);
  const answer = revision.protectedAuthority.answerKey.byItemId[itemId];
  if (item === undefined || answer === undefined) throw new Error(`no item/answer for ${itemId}`);
  const control = item.projection.responseControl;
  if (control?.kind === 'SINGLE_SELECT') {
    return { kind: 'MULTIPLE_CHOICE', choiceId: answer.correctChoiceId };
  }
  if (control?.kind === 'SHORT_TEXT') {
    return { kind: 'SHORT', text: answer.acceptedResponses[0] ?? '' };
  }
  return structuredResponse(item, answer);
}

function wrongResponseFor(
  revision: LoadedLessonRevision,
  itemId: string,
): NormalizedLessonSubmittedResponse {
  const item = revision.lesson.items.find((candidate) => candidate.itemId === itemId);
  const answer = revision.protectedAuthority.answerKey.byItemId[itemId];
  if (item === undefined || answer === undefined) throw new Error(`no item/answer for ${itemId}`);
  const control = item.projection.responseControl;
  if (control?.kind === 'SINGLE_SELECT') {
    return {
      kind: 'MULTIPLE_CHOICE',
      choiceId:
        control.choices.find((choice) => choice.choiceId !== answer.correctChoiceId)?.choiceId ??
        null,
    };
  }
  if (control?.kind === 'SHORT_TEXT') {
    return { kind: 'SHORT', text: '__definitely_wrong__' };
  }
  if (control?.kind !== 'STRUCTURED_FIELDS') throw new Error(`${itemId} has no control`);
  return {
    kind: 'CONSTRUCTED',
    fields: control.fields.map(({ fieldId }) => ({ fieldId, value: '__definitely_wrong__' })),
  };
}

function omittedResponseFor(
  revision: LoadedLessonRevision,
  itemId: string,
): NormalizedLessonSubmittedResponse {
  const item = revision.lesson.items.find((candidate) => candidate.itemId === itemId);
  const control = item?.projection.responseControl;
  if (control?.kind === 'SINGLE_SELECT') return { kind: 'MULTIPLE_CHOICE', choiceId: null };
  if (control?.kind === 'SHORT_TEXT') return { kind: 'SHORT', text: null };
  if (control?.kind !== 'STRUCTURED_FIELDS') throw new Error(`${itemId} has no control`);
  return {
    kind: 'CONSTRUCTED',
    fields: control.fields.map(({ fieldId }) => ({ fieldId, value: null })),
  };
}

function createRun(
  revision: LoadedLessonRevision,
  runId = crypto.randomUUID(),
): NormalizedLessonRun {
  return createNormalizedLessonRun({ revision, now: NOW, runId });
}

function submit(
  run: NormalizedLessonRun,
  response: NormalizedLessonSubmittedResponse,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  return applyNormalizedLessonAction(run, { type: 'SUBMIT_RESPONSE', response }, NOW, revision);
}

function continueRun(
  run: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  return applyNormalizedLessonAction(run, { type: 'CONTINUE' }, NOW, revision);
}

function advanceToStep(
  start: NormalizedLessonRun,
  targetStepId: string,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  let run = start;
  for (let guard = 0; guard < 1000; guard += 1) {
    if (run.status !== 'IN_PROGRESS') throw new Error(`terminated before ${targetStepId}`);
    if (run.currentStepId === targetStepId && run.display === 'CONTENT') return run;
    const screen = renderNormalizedLessonRun(run, revision).screen;
    run =
      screen.kind === 'QUESTION'
        ? submit(run, correctResponseFor(revision, screen.itemId), revision)
        : continueRun(run, revision);
  }
  throw new Error(`did not reach ${targetStepId}`);
}

function driveToEnd(
  start: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  let run = start;
  for (let guard = 0; guard < 3000; guard += 1) {
    if (run.status !== 'IN_PROGRESS') return run;
    const screen = renderNormalizedLessonRun(run, revision).screen;
    run =
      screen.kind === 'QUESTION'
        ? submit(run, correctResponseFor(revision, screen.itemId), revision)
        : continueRun(run, revision);
  }
  throw new Error(`walk did not terminate for ${revision.lessonId}`);
}

function branchStep(
  revision: LoadedLessonRevision,
  binding: NormalizedBranchBinding,
  kind: 'repair' | 'reentry' | 'handoff',
): NormalizedDeliveryStep | undefined {
  const nodeIds =
    kind === 'repair'
      ? binding.repairNodeIds
      : kind === 'reentry'
        ? [binding.reentryNodeId]
        : binding.plannerHandoffNodeId === null
          ? []
          : [binding.plannerHandoffNodeId];
  const itemIds =
    kind === 'repair' ? binding.repairItemIds : kind === 'reentry' ? [binding.reentryItemId] : [];
  return revision.lesson.kcs
    .flatMap((kc) => kc.deliverySteps)
    .find(
      (step) =>
        step.nodeIds.some((nodeId) => nodeIds.includes(nodeId)) ||
        step.itemIds.some((itemId) => itemIds.includes(itemId)),
    );
}

function withTwoRepairSteps(
  revision: LoadedLessonRevision,
  binding: NormalizedBranchBinding,
): LoadedLessonRevision {
  const cloned = structuredClone(revision);
  const kcIndex = cloned.lesson.kcs.findIndex((kc) =>
    kc.branchBindings.some((candidate) => candidate.failedFunction === binding.failedFunction),
  );
  const kc = cloned.lesson.kcs[kcIndex];
  const canonicalBinding = kc?.branchBindings.find(
    (candidate) => candidate.failedFunction === binding.failedFunction,
  );
  if (kc === undefined || canonicalBinding === undefined) throw new Error('branch binding missing');
  const firstRepairStep = branchStep(cloned, canonicalBinding, 'repair');
  const firstRepairItem =
    firstRepairStep === undefined ? undefined : itemForStep(cloned, firstRepairStep.stepId);
  if (firstRepairStep === undefined || firstRepairItem === undefined) {
    throw new Error('first repair step missing');
  }
  const secondItemId = `${firstRepairItem.itemId}-SYNTHETIC-SECOND`;
  const secondNodeId = `${firstRepairStep.nodeIds[0] ?? firstRepairStep.stepId}-SYNTHETIC-SECOND`;
  const secondStepId = `${firstRepairStep.stepId}-SYNTHETIC-SECOND`;
  const secondItem: NormalizedItem = {
    ...firstRepairItem,
    itemId: secondItemId,
    activityId: secondItemId,
    sourceRef: secondItemId,
  };
  const secondStep: NormalizedDeliveryStep = {
    ...firstRepairStep,
    stepId: secondStepId,
    nodeIds: [secondNodeId],
    itemIds: [secondItemId],
  };
  const firstStepIndex = kc.deliverySteps.findIndex(
    (step) => step.stepId === firstRepairStep.stepId,
  );
  const deliverySteps = [
    ...kc.deliverySteps.slice(0, firstStepIndex + 1),
    secondStep,
    ...kc.deliverySteps.slice(firstStepIndex + 1),
  ];
  const branchBindings = kc.branchBindings.map((candidate) =>
    candidate.failedFunction === canonicalBinding.failedFunction
      ? {
          ...candidate,
          repairNodeIds: [...candidate.repairNodeIds, secondNodeId],
          repairItemIds: [...candidate.repairItemIds, secondItemId],
        }
      : candidate,
  );
  const kcs = cloned.lesson.kcs.map((candidate, index) =>
    index === kcIndex
      ? {
          ...candidate,
          items: [...candidate.items, secondItem],
          deliverySteps,
          branchBindings,
        }
      : candidate,
  );
  const firstAnswer = cloned.protectedAuthority.answerKey.byItemId[firstRepairItem.itemId];
  if (firstAnswer === undefined) throw new Error('first repair answer missing');
  return {
    ...cloned,
    lesson: { ...cloned.lesson, kcs, items: [...cloned.lesson.items, secondItem] },
    protectedAuthority: {
      answerKey: {
        ...cloned.protectedAuthority.answerKey,
        byItemId: {
          ...cloned.protectedAuthority.answerKey.byItemId,
          [secondItemId]: { ...firstAnswer, itemId: secondItemId },
        },
      },
    },
  };
}

function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('canonical delivery-step baseline', () => {
  it('walks every L2 clean delivery step in authored order, including teaching, and excludes branch-only steps', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L2 });
    const expectedSteps = revision.lesson.kcs.flatMap((kc) =>
      kc.cleanBaselineSteps.map((step) => step.stepId),
    );
    const visited: string[] = [];
    let run = createRun(revision);

    for (let guard = 0; guard < 3000 && run.status === 'IN_PROGRESS'; guard += 1) {
      const screen = renderNormalizedLessonRun(run, revision).screen;
      if (run.display === 'CONTENT' && run.currentStepId !== null) visited.push(run.currentStepId);
      run =
        screen.kind === 'QUESTION'
          ? submit(run, correctResponseFor(revision, screen.itemId), revision)
          : continueRun(run, revision);
    }

    expect(run.status).toBe('DELIVERY_COMPLETE');
    expect(visited).toEqual(expectedSteps);
    expect(visited).not.toEqual(
      expect.arrayContaining(
        revision.lesson.kcs
          .flatMap((kc) => kc.deliverySteps)
          .filter((step) => step.branchOnly)
          .map((step) => step.stepId),
      ),
    );

    const orientationId = revision.lesson.kcs[0]?.cleanBaselineSteps[1]?.stepId;
    if (orientationId === undefined) throw new Error('L2 orientation missing');
    const orientation = renderNormalizedLessonRun(
      advanceToStep(createRun(revision), orientationId, revision),
      revision,
    ).screen;
    expect(orientation).toMatchObject({
      kind: 'EXPOSITION',
      heading: 'Focus now: Convert units and dimensions',
      contentBlocks: expect.arrayContaining([expect.stringContaining('conversion')]),
    });
  });

  it('renders L3 worked exposition from the authored grouped step and a closed structured control', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const worked = renderNormalizedLessonRun(
      advanceToStep(createRun(revision), 'GRAPH-SCREEN-WORKED', revision),
      revision,
    ).screen;
    expect(worked).toMatchObject({
      kind: 'EXPOSITION',
      heading: 'Watch the labels drive the calculation',
    });
    if (worked.kind !== 'EXPOSITION') return;
    expect(worked.contentBlocks).toHaveLength(3);
    expect(worked.contentBlocks.join(' ')).toContain('Worked visual');

    const structured = renderNormalizedLessonRun(
      advanceToStep(createRun(revision), 'SYS-SCREEN-CHANGED', revision),
      revision,
    ).screen;
    expect(structured).toMatchObject({
      kind: 'QUESTION',
      control: {
        kind: 'STRUCTURED_FIELDS',
        fields: [
          { fieldId: 'equation_1', label: 'Perimeter equation' },
          { fieldId: 'equation_2', label: 'Difference equation' },
          { fieldId: 'solution_pair', label: 'Ordered pair (L, W)' },
        ],
      },
    });
  });

  it('falls back to the unscored item prompt when an exposition step has no authored content blocks', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L3 });
    const stepId = 'GRAPH-SCREEN-WORKED';
    const revision: LoadedLessonRevision = {
      ...base,
      lesson: {
        ...base.lesson,
        kcs: base.lesson.kcs.map((kc) => ({
          ...kc,
          deliverySteps: kc.deliverySteps.map((step) =>
            step.stepId === stepId ? { ...step, contentBlocks: [] } : step,
          ),
        })),
      },
    };
    const expectedPrompts = stepFor(revision, stepId).itemIds.map(
      (itemId) => revision.lesson.items.find((item) => item.itemId === itemId)!.projection.prompt,
    );
    const screen = renderNormalizedLessonRun(
      advanceToStep(createRun(revision), stepId, revision),
      revision,
    ).screen;

    expect(screen).toMatchObject({
      kind: 'EXPOSITION',
      contentBlocks: expectedPrompts,
      prompt: expectedPrompts.join('\n\n'),
    });
  });

  it('keeps protected authority and feedback out of the precommit question', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const screen = renderNormalizedLessonRun(createRun(revision), revision).screen;
    expect(screen.kind).toBe('QUESTION');
    expect(JSON.stringify(screen)).not.toMatch(
      /correctChoiceId|acceptedResponses|structuredAuthority|rationale|sourceRef|nodeIds|definitionHash|message/i,
    );
  });
});

describe('canonical repair, exact re-entry, and bounded handoff', () => {
  it('L2 miss follows the exact repair binding, confirms only on fresh re-entry, then resumes after the failed exit', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L2 });
    const kc = revision.lesson.kcs[0];
    const binding = kc?.branchBindings.find(
      (candidate) => candidate.failedFunction === 'CHANGED_TASK',
    );
    if (kc === undefined || binding === undefined) throw new Error('L2 changed binding missing');
    const failedStep = kc.cleanBaselineSteps.find((step) =>
      step.itemIds.some(
        (itemId) =>
          revision.lesson.items.find((item) => item.itemId === itemId)?.exitFunction ===
          'CHANGED_TASK',
      ),
    );
    const repair = branchStep(revision, binding, 'repair');
    const reentry = branchStep(revision, binding, 'reentry');
    if (failedStep === undefined || repair === undefined || reentry === undefined) {
      throw new Error('L2 branch steps missing');
    }

    let run = advanceToStep(createRun(revision), failedStep.stepId, revision);
    const failedItem = itemForStep(revision, failedStep.stepId);
    run = submit(run, wrongResponseFor(revision, failedItem.itemId), revision);
    expect(renderNormalizedLessonRun(run, revision).screen).toMatchObject({
      kind: 'FEEDBACK',
      outcome: 'INCORRECT',
      message: expect.any(String),
    });
    // Replaying the immutable commitment is a pure no-op.
    expect(submit(run, wrongResponseFor(revision, failedItem.itemId), revision)).toEqual(run);

    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(repair.stepId);
    expect(renderNormalizedLessonRun(run, revision).screen).toMatchObject({
      kind: 'QUESTION',
      contentBlocks: expect.arrayContaining([expect.any(String)]),
    });

    const repairItem = itemForStep(revision, repair.stepId);
    run = submit(run, correctResponseFor(revision, repairItem.itemId), revision);
    expect(run.passedExits[kc.kcId] ?? []).not.toContain(binding.failedFunction);
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(reentry.stepId);

    const reentryItem = itemForStep(revision, reentry.stepId);
    const passedBeforeReentry = run.passedExits[kc.kcId] ?? [];
    run = submit(run, correctResponseFor(revision, reentryItem.itemId), revision);
    expect(
      (run.passedExits[kc.kcId] ?? []).filter((fn) => !passedBeforeReentry.includes(fn)),
    ).toEqual([binding.failedFunction]);
    run = continueRun(run, revision);

    const failedIndex = kc.cleanBaselineSteps.findIndex(
      (step) => step.stepId === failedStep.stepId,
    );
    expect(run.currentStepId).toBe(kc.cleanBaselineSteps[failedIndex + 1]?.stepId);
    expect(driveToEnd(run, revision).status).toBe('DELIVERY_COMPLETE');
  });

  it('follows an explicit forward cross-KC success continuation after fresh re-entry', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L2 });
    const sourceKc = base.lesson.kcs[0];
    const targetStep = base.lesson.kcs[1]?.cleanBaselineSteps[0];
    const sourceBinding = sourceKc?.branchBindings.find(
      (candidate) => candidate.failedFunction === 'CHANGED_TASK',
    );
    const targetNodeId = targetStep?.nodeIds[0];
    if (
      sourceKc === undefined ||
      sourceBinding === undefined ||
      targetStep === undefined ||
      targetNodeId === undefined
    ) {
      throw new Error('cross-KC branch fixture is incomplete');
    }
    const revision: LoadedLessonRevision = {
      ...base,
      lesson: {
        ...base.lesson,
        kcs: base.lesson.kcs.map((kc) =>
          kc.kcId === sourceKc.kcId
            ? {
                ...kc,
                branchBindings: kc.branchBindings.map((binding) =>
                  binding.failedFunction === sourceBinding.failedFunction
                    ? { ...binding, successNextNodeId: targetNodeId }
                    : binding,
                ),
              }
            : kc,
        ),
      },
    };
    const binding = revision.lesson.kcs[0]?.branchBindings.find(
      (candidate) => candidate.failedFunction === sourceBinding.failedFunction,
    );
    const failedStep = revision.lesson.kcs[0]?.cleanBaselineSteps.find((step) =>
      step.itemIds.some(
        (itemId) =>
          revision.lesson.items.find((item) => item.itemId === itemId)?.exitFunction ===
          binding?.failedFunction,
      ),
    );
    const repair = binding === undefined ? undefined : branchStep(revision, binding, 'repair');
    const reentry = binding === undefined ? undefined : branchStep(revision, binding, 'reentry');
    if (
      binding === undefined ||
      failedStep === undefined ||
      repair === undefined ||
      reentry === undefined
    ) {
      throw new Error('cross-KC branch steps are incomplete');
    }

    let run = advanceToStep(createRun(revision), failedStep.stepId, revision);
    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, failedStep.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(repair.stepId);
    run = submit(
      run,
      correctResponseFor(revision, itemForStep(revision, repair.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(reentry.stepId);
    run = submit(
      run,
      correctResponseFor(revision, itemForStep(revision, reentry.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);

    expect(run.currentStepId).toBe(targetStep.stepId);
    expect(run.passedExits[sourceKc.kcId]).toContain(binding.failedFunction);
    expect(driveToEnd(run, revision).status).toBe('DELIVERY_COMPLETE');
  });

  it('fails closed when an explicit success continuation points backward', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L2 });
    const sourceKc = base.lesson.kcs[0];
    const sourceBinding = sourceKc?.branchBindings.find(
      (candidate) => candidate.failedFunction === 'CHANGED_TASK',
    );
    const backwardNodeId = sourceKc?.cleanBaselineSteps[0]?.nodeIds[0];
    if (sourceKc === undefined || sourceBinding === undefined || backwardNodeId === undefined) {
      throw new Error('backward branch fixture is incomplete');
    }
    const revision: LoadedLessonRevision = {
      ...base,
      lesson: {
        ...base.lesson,
        kcs: base.lesson.kcs.map((kc) =>
          kc.kcId === sourceKc.kcId
            ? {
                ...kc,
                branchBindings: kc.branchBindings.map((binding) =>
                  binding.failedFunction === sourceBinding.failedFunction
                    ? { ...binding, successNextNodeId: backwardNodeId }
                    : binding,
                ),
              }
            : kc,
        ),
      },
    };
    const binding = revision.lesson.kcs[0]?.branchBindings.find(
      (candidate) => candidate.failedFunction === sourceBinding.failedFunction,
    );
    const failedStep = revision.lesson.kcs[0]?.cleanBaselineSteps.find((step) =>
      step.itemIds.some(
        (itemId) =>
          revision.lesson.items.find((item) => item.itemId === itemId)?.exitFunction ===
          binding?.failedFunction,
      ),
    );
    const repair = binding === undefined ? undefined : branchStep(revision, binding, 'repair');
    const reentry = binding === undefined ? undefined : branchStep(revision, binding, 'reentry');
    if (
      binding === undefined ||
      failedStep === undefined ||
      repair === undefined ||
      reentry === undefined
    ) {
      throw new Error('backward branch steps are incomplete');
    }

    let run = advanceToStep(createRun(revision), failedStep.stepId, revision);
    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, failedStep.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    run = submit(
      run,
      correctResponseFor(revision, itemForStep(revision, repair.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    run = submit(
      run,
      correctResponseFor(revision, itemForStep(revision, reentry.stepId).itemId),
      revision,
    );

    expect(() => continueRun(run, revision)).toThrow(/not forward on the clean baseline/);
  });

  it('uses the function-specific L3 repair and sends a failed confirmation to the authored handoff without exit credit', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const kc = revision.lesson.kcs[0];
    const binding = kc?.branchBindings.find((candidate) => candidate.failedFunction === 'NEAR_USE');
    if (kc === undefined || binding === undefined) throw new Error('L3 near binding missing');
    const failedStep = kc.cleanBaselineSteps.find((step) =>
      step.itemIds.some(
        (itemId) =>
          revision.lesson.items.find((item) => item.itemId === itemId)?.exitFunction === 'NEAR_USE',
      ),
    );
    const repair = branchStep(revision, binding, 'repair');
    const handoff = branchStep(revision, binding, 'handoff');
    if (failedStep === undefined || repair === undefined || handoff === undefined) {
      throw new Error('L3 near branch incomplete');
    }
    expect(repair.stepId).toBe('GRAPH-SCREEN-REPAIR-SLOPE');

    let run = advanceToStep(createRun(revision), failedStep.stepId, revision);
    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, failedStep.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(repair.stepId);

    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, repair.stepId).itemId),
      revision,
    );
    expect(run.passedExits[kc.kcId] ?? []).not.toContain(binding.failedFunction);
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(handoff.stepId);
    expect(renderNormalizedLessonRun(run, revision).screen.kind).toBe('EXPOSITION');
    run = continueRun(run, revision);
    expect(run.status).toBe('BLOCKED');
    expect(renderNormalizedLessonRun(run, revision).screen.kind).toBe('BLOCKED');
  });

  it('sends a failed exact re-entry to the authored bounded handoff instead of looping or advancing', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const kc = revision.lesson.kcs[0];
    const binding = kc?.branchBindings.find(
      (candidate) => candidate.failedFunction === 'CHANGED_TASK',
    );
    if (kc === undefined || binding === undefined) throw new Error('L3 changed binding missing');
    const failedStep = kc.cleanBaselineSteps.find((step) =>
      step.itemIds.some(
        (itemId) =>
          revision.lesson.items.find((item) => item.itemId === itemId)?.exitFunction ===
          'CHANGED_TASK',
      ),
    );
    const repair = branchStep(revision, binding, 'repair');
    const reentry = branchStep(revision, binding, 'reentry');
    const handoff = branchStep(revision, binding, 'handoff');
    if (
      failedStep === undefined ||
      repair === undefined ||
      reentry === undefined ||
      handoff === undefined
    ) {
      throw new Error('L3 changed branch incomplete');
    }

    let run = advanceToStep(createRun(revision), failedStep.stepId, revision);
    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, failedStep.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    run = submit(
      run,
      correctResponseFor(revision, itemForStep(revision, repair.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(reentry.stepId);
    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, reentry.stepId).itemId),
      revision,
    );
    expect(run.responses[binding.reentryItemId]?.exitFunction).toBe(binding.failedFunction);
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(handoff.stepId);
    expect(run.passedExits[kc.kcId] ?? []).not.toContain(binding.failedFunction);
    expect(continueRun(run, revision).status).toBe('BLOCKED');
  });

  it('continues to the next authored repair after an earlier failed confirmation, then hands off after the final failed repair', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L3 });
    const originalKc = base.lesson.kcs[0];
    const originalBinding = originalKc?.branchBindings.find(
      (candidate) => candidate.failedFunction === 'NEAR_USE',
    );
    if (originalKc === undefined || originalBinding === undefined) {
      throw new Error('L3 near branch missing');
    }
    const revision = withTwoRepairSteps(base, originalBinding);
    const kc = revision.lesson.kcs[0]!;
    const binding = kc.branchBindings.find((candidate) => candidate.failedFunction === 'NEAR_USE')!;
    const failedStep = kc.cleanBaselineSteps.find((step) =>
      step.itemIds.some(
        (itemId) =>
          revision.lesson.items.find((item) => item.itemId === itemId)?.exitFunction === 'NEAR_USE',
      ),
    );
    const repairSteps = binding.repairItemIds.map((itemId) => {
      const step = kc.deliverySteps.find((candidate) => candidate.itemIds.includes(itemId));
      if (step === undefined) throw new Error(`repair step missing for ${itemId}`);
      return step;
    });
    const handoff = branchStep(revision, binding, 'handoff');
    if (failedStep === undefined || repairSteps.length !== 2 || handoff === undefined) {
      throw new Error('synthetic two-repair branch incomplete');
    }

    let run = advanceToStep(createRun(revision), failedStep.stepId, revision);
    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, failedStep.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(repairSteps[0]?.stepId);

    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, repairSteps[0]!.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(repairSteps[1]?.stepId);

    run = submit(
      run,
      wrongResponseFor(revision, itemForStep(revision, repairSteps[1]!.stepId).itemId),
      revision,
    );
    run = continueRun(run, revision);
    expect(run.currentStepId).toBe(handoff.stepId);
    expect(run.passedExits[kc.kcId] ?? []).not.toContain(binding.failedFunction);
    expect(continueRun(run, revision).status).toBe('BLOCKED');
  });

  it('continues past a missed checkpoint when no support branch is authored, but still branches when one exists', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L3 });
    const exitStep = base.lesson.kcs
      .flatMap((kc) => kc.cleanBaselineSteps)
      .find((step) =>
        step.itemIds.some(
          (itemId) =>
            (base.lesson.items.find((item) => item.itemId === itemId)?.exitFunction ?? 'NONE') !==
            'NONE',
        ),
      );
    if (exitStep === undefined) throw new Error('L3 has no exit checkpoint step');
    const exitItemId = exitStep.itemIds.find(
      (itemId) =>
        (base.lesson.items.find((item) => item.itemId === itemId)?.exitFunction ?? 'NONE') !==
        'NONE',
    );
    if (exitItemId === undefined) throw new Error('L3 exit step has no exit item');

    // Control: with the authored branch present, a miss still enters remediation.
    let control = advanceToStep(createRun(base), exitStep.stepId, base);
    control = continueRun(submit(control, wrongResponseFor(base, exitItemId), base), base);
    expect(control.branch).not.toBeNull();
    expect(control.status).toBe('IN_PROGRESS');

    // Imported-lesson gap: checkpoints present, but no repair/re-entry branches authored.
    // A miss must not dead-end at BLOCKED ("Let's pause here") — it continues the baseline.
    const noBranch: LoadedLessonRevision = {
      ...base,
      lesson: {
        ...base.lesson,
        kcs: base.lesson.kcs.map((kc) => ({ ...kc, branchBindings: [] })),
      },
    };
    let run = advanceToStep(createRun(noBranch), exitStep.stepId, noBranch);
    run = submit(run, wrongResponseFor(noBranch, exitItemId), noBranch);
    expect(run.display).toBe('FEEDBACK');
    expect(run.responses[exitItemId]?.outcome).not.toBe('CORRECT');
    run = continueRun(run, noBranch);
    expect(run.status).not.toBe('BLOCKED');
    expect(renderNormalizedLessonRun(run, noBranch).screen.kind).not.toBe('BLOCKED');
    expect(run.branch).toBeNull();
  });
});

describe('response-control validation and feedback', () => {
  it('rejects response-kind mismatch and unknown single-select choices before commitment', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const run = createRun(revision);
    expect(errorCode(() => submit(run, { kind: 'SHORT', text: '2000' }, revision))).toBe(
      'RESPONSE_CONTROL_MISMATCH',
    );
    expect(
      errorCode(() =>
        submit(run, { kind: 'MULTIPLE_CHOICE', choiceId: '__unknown_choice__' }, revision),
      ),
    ).toBe('UNKNOWN_CHOICE');
    expect(run.responses).toEqual({});
  });

  it('rejects duplicate, missing, and extra structured fields against the exact authored control', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const run = advanceToStep(createRun(revision), 'SYS-SCREEN-CHANGED', revision);
    const correct = correctResponseFor(revision, itemForStep(revision, run.currentStepId!).itemId);
    if (correct.kind !== 'CONSTRUCTED') throw new Error('structured response expected');
    const duplicate = {
      kind: 'CONSTRUCTED' as const,
      fields: [correct.fields[0]!, correct.fields[0]!, ...correct.fields.slice(1)],
    };
    const missing = { kind: 'CONSTRUCTED' as const, fields: correct.fields.slice(0, -1) };
    const extra = {
      kind: 'CONSTRUCTED' as const,
      fields: [...correct.fields, { fieldId: 'extra', value: 'not authored' }],
    };

    expect(errorCode(() => submit(run, duplicate, revision))).toBe('STRUCTURED_FIELDS_MISMATCH');
    expect(errorCode(() => submit(run, missing, revision))).toBe('STRUCTURED_FIELDS_MISMATCH');
    expect(errorCode(() => submit(run, extra, revision))).toBe('STRUCTURED_FIELDS_MISMATCH');
    expect(
      errorCode(() => submit(run, { kind: 'MULTIPLE_CHOICE', choiceId: null }, revision)),
    ).toBe('RESPONSE_CONTROL_MISMATCH');
  });

  it('distinguishes omitted, invalid partial, incorrect, and correct immutable responses', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const selectRun = createRun(revision);
    const itemId = itemForStep(revision, selectRun.currentStepId!).itemId;
    const omitted = submit(selectRun, omittedResponseFor(revision, itemId), revision);
    const incorrect = submit(selectRun, wrongResponseFor(revision, itemId), revision);
    const correct = submit(selectRun, correctResponseFor(revision, itemId), revision);
    expect(renderNormalizedLessonRun(omitted, revision).screen).toMatchObject({
      kind: 'FEEDBACK',
      outcome: 'OMITTED',
    });
    expect(renderNormalizedLessonRun(incorrect, revision).screen).toMatchObject({
      kind: 'FEEDBACK',
      outcome: 'INCORRECT',
    });
    expect(renderNormalizedLessonRun(correct, revision).screen).toMatchObject({
      kind: 'FEEDBACK',
      outcome: 'CORRECT',
    });

    const structuredRun = advanceToStep(createRun(revision), 'SYS-SCREEN-CHANGED', revision);
    const structuredItem = itemForStep(revision, structuredRun.currentStepId!);
    const structured = correctResponseFor(revision, structuredItem.itemId);
    if (structured.kind !== 'CONSTRUCTED') throw new Error('structured response expected');
    const partial = {
      ...structured,
      fields: structured.fields.map((field, index) =>
        index === 0 ? { ...field, value: null } : field,
      ),
    };
    expect(
      renderNormalizedLessonRun(submit(structuredRun, partial, revision), revision).screen,
    ).toMatchObject({ kind: 'FEEDBACK', outcome: 'INVALID' });
  });

  it('persists observed commit-time facts and restores them without authored inference', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L3 });
    const initial = createRun(revision);
    const item = itemForStep(revision, initial.currentStepId!);
    const committed = submit(initial, correctResponseFor(revision, item.itemId), revision);
    const record = committed.responses[item.itemId] as
      | ((typeof committed.responses)[string] & {
          readonly runtimeFacts?: Readonly<Record<string, unknown>>;
        })
      | undefined;

    expect(record?.runtimeFacts).toEqual({
      responseId: `${initial.runId}:${item.itemId}:1`,
      attemptIndex: 1,
      firstAttempt: true,
      isRetry: false,
      isDiagnosticRetry: false,
      assistanceRequested: false,
      assistanceTaken: false,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      revealUsed: false,
      mixedAdministration: false,
      passageAdministration: false,
      timedAdministration: false,
    });
    expect(restoreNormalizedLessonRun(structuredClone(committed), revision)).toEqual(committed);
  });

  it('rejects a response to exposition and any action after a terminal state', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L2 });
    const expositionRun = advanceToStep(
      createRun(revision),
      'screen-qms-units-node-orientation',
      revision,
    );
    expect(
      errorCode(() => submit(expositionRun, { kind: 'SHORT', text: 'not allowed' }, revision)),
    ).toBe('ACTION_NOT_ALLOWED');

    const complete = driveToEnd(createRun(revision), revision);
    expect(
      errorCode(() =>
        applyNormalizedLessonAction(
          complete,
          { type: 'CONTINUE' } satisfies NormalizedLessonAction,
          NOW,
          revision,
        ),
      ),
    ).toBe('ACTION_NOT_ALLOWED');
  });

  it('never releases private L3 rationale and uses generic text for every outcome', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L3 });
    const sentinel = 'PRIVATE L3 RATIONALE MUST NEVER REACH THE WIRE';
    const byItemId = Object.fromEntries(
      Object.entries(base.protectedAuthority.answerKey.byItemId).map(([itemId, answer]) => [
        itemId,
        {
          ...answer,
          rationale: sentinel,
          learnerSafePostCommitmentFeedback: null,
        },
      ]),
    );
    const revision: LoadedLessonRevision = {
      ...base,
      protectedAuthority: {
        answerKey: { ...base.protectedAuthority.answerKey, byItemId },
      },
    };
    const selectRun = createRun(revision);
    const selectItemId = itemForStep(revision, selectRun.currentStepId!).itemId;
    const outcomes = [
      {
        response: correctResponseFor(revision, selectItemId),
        outcome: 'CORRECT',
        message: 'Correct.',
      },
      {
        response: wrongResponseFor(revision, selectItemId),
        outcome: 'INCORRECT',
        message: 'Not quite.',
      },
      {
        response: omittedResponseFor(revision, selectItemId),
        outcome: 'OMITTED',
        message: 'No response was submitted.',
      },
    ] as const;
    const screens = outcomes.map(({ response }) =>
      renderNormalizedLessonRun(submit(selectRun, response, revision), revision),
    );
    const structuredRun = advanceToStep(createRun(revision), 'SYS-SCREEN-CHANGED', revision);
    const structuredItem = itemForStep(revision, structuredRun.currentStepId!);
    const structured = correctResponseFor(revision, structuredItem.itemId);
    if (structured.kind !== 'CONSTRUCTED') throw new Error('structured response expected');
    const invalid = {
      ...structured,
      fields: structured.fields.map((field, index) =>
        index === 0 ? { ...field, value: null } : field,
      ),
    };
    screens.push(renderNormalizedLessonRun(submit(structuredRun, invalid, revision), revision));

    expect(screens.map((view) => view.screen)).toEqual([
      ...outcomes.map(({ outcome, message }) =>
        expect.objectContaining({ kind: 'FEEDBACK', outcome, message }),
      ),
      expect.objectContaining({
        kind: 'FEEDBACK',
        outcome: 'INVALID',
        message: 'The submitted fields were incomplete.',
      }),
    ]);
    expect(JSON.stringify(screens)).not.toContain(sentinel);
  });

  it('releases only explicitly approved L2 feedback after immutable commitment', async () => {
    const base = await provider.loadActiveRevision({ lessonId: L2 });
    const firstItemId = itemForStep(base, base.lesson.kcs[0]!.cleanBaselineSteps[0]!.stepId).itemId;
    const answer = base.protectedAuthority.answerKey.byItemId[firstItemId]!;
    const revision: LoadedLessonRevision = {
      ...base,
      protectedAuthority: {
        answerKey: {
          ...base.protectedAuthority.answerKey,
          byItemId: {
            ...base.protectedAuthority.answerKey.byItemId,
            [firstItemId]: {
              ...answer,
              rationale: 'PRIVATE L2 RATIONALE',
              learnerSafePostCommitmentFeedback: 'APPROVED L2 POST-COMMITMENT FEEDBACK',
            },
          },
        },
      },
    };
    const run = createRun(revision);
    expect(JSON.stringify(renderNormalizedLessonRun(run, revision))).not.toContain(
      'APPROVED L2 POST-COMMITMENT FEEDBACK',
    );
    const committed = submit(run, correctResponseFor(revision, firstItemId), revision);
    expect(renderNormalizedLessonRun(committed, revision).screen).toMatchObject({
      kind: 'FEEDBACK',
      message: 'APPROVED L2 POST-COMMITMENT FEEDBACK',
    });
    expect(JSON.stringify(renderNormalizedLessonRun(committed, revision))).not.toContain(
      'PRIVATE L2 RATIONALE',
    );
  });

  it('releases template-approved feedback only after immutable commitment', async () => {
    const revision = await loadTemplateRevision();
    const run = createRun(revision);
    const itemId = itemForStep(revision, run.currentStepId!).itemId;
    expect(itemId).toBe('TPL-GRAPH-ENTRY');
    expect(JSON.stringify(renderNormalizedLessonRun(run, revision))).not.toContain(
      'Each equal display step multiplies the labelled value by ten.',
    );
    const committed = submit(run, correctResponseFor(revision, itemId), revision);
    expect(renderNormalizedLessonRun(committed, revision).screen).toMatchObject({
      kind: 'FEEDBACK',
      message: 'Each equal display step multiplies the labelled value by ten.',
    });
    expect(JSON.stringify(renderNormalizedLessonRun(committed, revision))).not.toContain(
      'PRIVATE TEMPLATE RATIONALE',
    );
  });
});

describe('revision-bound persistence', () => {
  it('round-trips a canonical currentStepId state and rejects the pre-WP-05C cursor shape by name', async () => {
    const revision = await provider.loadActiveRevision({ lessonId: L2 });
    const run = submit(
      createRun(revision, '10000000-0000-4000-8000-000000000099'),
      correctResponseFor(
        revision,
        itemForStep(revision, revision.lesson.kcs[0]!.cleanBaselineSteps[0]!.stepId).itemId,
      ),
      revision,
    );
    expect(run.currentStepId).toBe(revision.lesson.kcs[0]?.cleanBaselineSteps[0]?.stepId);
    expect(restoreNormalizedLessonRun(JSON.parse(JSON.stringify(run)), revision)).toEqual(run);

    const legacy = {
      runId: run.runId,
      lessonId: run.lessonId,
      definitionHash: run.definitionHash,
      kcIndex: 0,
      phase: 'BASELINE',
      baselineCursor: 0,
      branchCursor: 0,
      currentItemId: 'legacy-item',
      responses: {},
      passedExits: {},
    };
    expect(errorCode(() => restoreNormalizedLessonRun(legacy, revision))).toBe(
      'LEGACY_STATE_UNSUPPORTED',
    );
  });

  it('rejects a different active revision instead of drifting an in-progress run', async () => {
    const exact = await provider.loadActiveRevision({ lessonId: L3 });
    const run = createRun(exact);
    const otherHash = '2'.repeat(64);
    const switched: LoadedLessonRevision = {
      ...exact,
      definitionHash: otherHash,
      lesson: { ...exact.lesson, definitionHash: otherHash },
      protectedAuthority: {
        answerKey: {
          ...exact.protectedAuthority.answerKey,
          definitionHash: otherHash,
        },
      },
    };
    expect(errorCode(() => renderNormalizedLessonRun(run, switched))).toBe('REVISION_MISMATCH');
    expect(errorCode(() => restoreNormalizedLessonRun(run, switched))).toBe('REVISION_MISMATCH');
  });
});
