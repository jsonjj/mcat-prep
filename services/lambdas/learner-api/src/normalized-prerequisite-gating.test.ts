import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCanonicalLesson, type NormalizedLesson } from '@mcat/content/lesson-normalization';
import { hasEligibleEvidenceMode } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import type { LoadedLessonRevision } from './lesson-content-provider';
import { normalizedLessonResponseSubmission } from './normalized-lesson-response-source';
import {
  applyNormalizedLessonAction,
  createNormalizedLessonRun,
  renderNormalizedLessonRun,
  restoreNormalizedLessonRun,
  type NormalizedLessonRun,
  type NormalizedLessonSubmittedResponse,
} from './normalized-lesson-runtime';

type Json = Record<string, unknown>;
type Gate = {
  readonly itemId: string;
  readonly activityId: string;
  readonly primaryKcId: string;
  readonly entryNodeId: string;
  readonly prerequisiteLessonId: string;
  readonly passNodeId: string;
  readonly failureHandoffNodeId: string | null;
  readonly allowedDestinationNodeIds: readonly string[];
};
type LessonWithGates = NormalizedLesson & { prerequisiteGates?: Gate[] };

const NOW = '2026-08-05T18:00:00.000Z';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const fixtureRoot = join(
  repoRoot,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-09-primary-finalization/workspace',
);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function fixtureRevision(lessonId: string): LoadedLessonRevision {
  const directory = join(fixtureRoot, lessonId);
  const script = readJson(join(directory, 'lesson-script.json')) as Json;
  const artifacts = {
    script,
    learnerSafeItems: readJson(join(directory, 'learner-safe-items.json')),
    protectedItems: readJson(join(directory, 'protected-items.json')),
    presentationPlan: readJson(join(directory, 'lesson-presentation-plan.json')),
  };
  const compilation = compileCanonicalLesson(artifacts);
  const payload = script.payload as Json;
  return {
    lessonId,
    definitionHash: compilation.lesson.definitionHash,
    lifecycle: 'DRAFT',
    catalogEntry: {
      lessonId,
      slug: lessonId.toLowerCase(),
      title: lessonId,
      section: null,
      cluster: 'R1',
      estimatedMinutes: 1,
      orderedKcIds: [...compilation.lesson.orderedKcIds],
      prerequisiteLessonIds: [],
      runtimeKind: 'normalized',
      lifecycle: 'DRAFT',
      enabled: true,
      killSwitch: 'OPEN',
      routePath: `/app/lessons/${lessonId.toLowerCase()}`,
      candidateNonclaimStatus: 'INTERNAL_DRAFT_ONLY',
      activeDefinitionHash: compilation.lesson.definitionHash,
    },
    lesson: compilation.lesson,
    protectedAuthority: { answerKey: compilation.answerKey },
    authoredBindings: {
      lessonId,
      artifactVersion:
        typeof script.artifact_version === 'string' ? script.artifact_version : undefined,
      entries: (payload.question_evidence_plan as Json[]) ?? [],
    },
    artifactHashes: {
      lessonScript: '0'.repeat(64),
      learnerSafeItems: '0'.repeat(64),
      protectedItems: '0'.repeat(64),
      presentationPlan: '0'.repeat(64),
    },
    inputHashes: [],
  } as LoadedLessonRevision;
}

function responseFor(
  revision: LoadedLessonRevision,
  itemId: string,
  correct: boolean,
): NormalizedLessonSubmittedResponse {
  const item = revision.lesson.items.find((candidate) => candidate.itemId === itemId);
  const answer = revision.protectedAuthority.answerKey.byItemId[itemId];
  if (item === undefined || answer === undefined) throw new Error(`missing item ${itemId}`);
  const control = item.projection.responseControl;
  if (control?.kind === 'SINGLE_SELECT') {
    const choiceId = correct
      ? answer.correctChoiceId
      : (control.choices.find((choice) => choice.choiceId !== answer.correctChoiceId)?.choiceId ??
        null);
    return { kind: 'MULTIPLE_CHOICE', choiceId };
  }
  if (control?.kind === 'SHORT_TEXT') {
    return {
      kind: 'SHORT',
      text: correct ? (answer.acceptedResponses[0] ?? '') : '__definitely_wrong__',
    };
  }
  if (control?.kind !== 'STRUCTURED_FIELDS') throw new Error(`item ${itemId} has no control`);
  return {
    kind: 'CONSTRUCTED',
    fields: control.fields.map(({ fieldId }) => ({
      fieldId,
      value: correct ? (answer.acceptedResponses[0] ?? '') : '__definitely_wrong__',
    })),
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
  if (control?.kind !== 'STRUCTURED_FIELDS') throw new Error(`item ${itemId} has no control`);
  return {
    kind: 'CONSTRUCTED',
    fields: control.fields.map(({ fieldId }) => ({ fieldId, value: null })),
  };
}

function submit(
  run: NormalizedLessonRun,
  revision: LoadedLessonRevision,
  correct: boolean,
): NormalizedLessonRun {
  const screen = renderNormalizedLessonRun(run, revision).screen;
  if (screen.kind !== 'QUESTION') throw new Error(`step ${run.currentStepId} is not a question`);
  return applyNormalizedLessonAction(
    run,
    { type: 'SUBMIT_RESPONSE', response: responseFor(revision, screen.itemId, correct) },
    NOW,
    revision,
  );
}

function continueRun(
  run: NormalizedLessonRun,
  revision: LoadedLessonRevision,
): NormalizedLessonRun {
  return applyNormalizedLessonAction(run, { type: 'CONTINUE' }, NOW, revision);
}

function advanceToGate(revision: LoadedLessonRevision, itemId: string): NormalizedLessonRun {
  let run = createNormalizedLessonRun({ revision, now: NOW });
  for (let guard = 0; guard < 5000 && run.status === 'IN_PROGRESS'; guard += 1) {
    const screen = renderNormalizedLessonRun(run, revision).screen;
    if (screen.kind === 'QUESTION' && screen.itemId === itemId) return run;
    run = screen.kind === 'QUESTION' ? submit(run, revision, true) : continueRun(run, revision);
  }
  throw new Error(`gate ${itemId} was not reached`);
}

const cases = [
  {
    lessonId: 'V3-LES-191915',
    entryStepId: 'ENTH-SCREEN-ENTRY',
    entryItemId: 'ENTH-ITEM-ENTRY',
    passStepId: 'ENTH-SCREEN-ORIENTATION',
    failureStepId: 'ENTH-SCREEN-HANDOFF',
    targetInstructionStepId: 'ENTH-SCREEN-ORIENTATION',
  },
  {
    lessonId: 'V3-LES-128144',
    entryStepId: 'PAT-SCREEN-ENTRY',
    entryItemId: 'PAT-ITEM-ENTRY',
    passStepId: 'ERR-SCREEN-ENTRY',
    failureStepId: 'PREREQ-264240-SCREEN-HANDOFF',
    targetInstructionStepId: 'PAT-SCREEN-ORIENTATION',
  },
  {
    lessonId: 'V3-LES-320512',
    entryStepId: 'ERED-SCREEN-ENTRY',
    entryItemId: 'ERED-ITEM-ENTRY',
    passStepId: 'ERED-SCREEN-ORIENTATION',
    failureStepId: 'ERED-SCREEN-HANDOFF-1',
    targetInstructionStepId: 'ERED-SCREEN-ORIENTATION',
  },
] as const;

describe('normalized prerequisite gating over the exact derived lesson bytes', () => {
  for (const fixture of cases) {
    it(`${fixture.lessonId}: a wrong committed prerequisite outcome reaches only the exact handoff and BLOCKED`, () => {
      const revision = fixtureRevision(fixture.lessonId);
      let run = createNormalizedLessonRun({ revision, now: NOW });
      const visited = [run.currentStepId];
      expect(run.currentStepId).toBe(fixture.entryStepId);

      run = submit(run, revision, false);
      const record = run.responses[fixture.entryItemId];
      expect(record).toMatchObject({
        activityRole: 'ENTRY_CHECK',
        exitFunction: 'NONE',
        outcome: 'INCORRECT',
        correct: false,
      });
      expect(run.passedExits).toEqual({});

      run = continueRun(run, revision);
      visited.push(run.currentStepId);
      expect(run.currentStepId).toBe(fixture.failureStepId);
      expect(run.blockAfterCurrentStep).toBe(true);
      expect(renderNormalizedLessonRun(run, revision).screen.kind).toBe('EXPOSITION');

      run = continueRun(run, revision);
      visited.push(run.currentStepId);
      expect(run.status).toBe('BLOCKED');
      expect(renderNormalizedLessonRun(run, revision).screen.kind).toBe('BLOCKED');
      expect(visited).not.toContain(fixture.targetInstructionStepId);
      expect(Object.keys(run.responses)).toEqual([fixture.entryItemId]);
    });

    it(`${fixture.lessonId}: a correct committed prerequisite outcome follows the exact authored pass destination`, () => {
      const revision = fixtureRevision(fixture.lessonId);
      let run = createNormalizedLessonRun({ revision, now: NOW });
      run = submit(run, revision, true);
      run = continueRun(run, revision);
      expect(run.currentStepId).toBe(fixture.passStepId);
      expect(run.blockAfterCurrentStep).toBe(false);
      expect(run.status).toBe('IN_PROGRESS');
      expect(run.passedExits).toEqual({});
    });
  }

  it('V3-LES-128144 runs all four prerequisite checks once before target instruction', () => {
    const revision = fixtureRevision('V3-LES-128144');
    const entryIds = ['PAT-ITEM-ENTRY', 'ERR-ITEM-ENTRY', 'CON-ITEM-ENTRY', 'PRJ-ITEM-ENTRY'];
    const visited: string[] = [];
    let run = createNormalizedLessonRun({ revision, now: NOW });

    for (let guard = 0; guard < 3000 && run.status === 'IN_PROGRESS'; guard += 1) {
      if (run.display === 'CONTENT' && run.currentStepId !== null) visited.push(run.currentStepId);
      if (run.currentStepId === 'PAT-SCREEN-ORIENTATION') break;
      const screen = renderNormalizedLessonRun(run, revision).screen;
      run = screen.kind === 'QUESTION' ? submit(run, revision, true) : continueRun(run, revision);
    }

    expect(run.currentStepId).toBe('PAT-SCREEN-ORIENTATION');
    expect(visited).toEqual([
      'PAT-SCREEN-ENTRY',
      'ERR-SCREEN-ENTRY',
      'CON-SCREEN-ENTRY',
      'PRJ-SCREEN-ENTRY',
      'PAT-SCREEN-ORIENTATION',
    ]);
    expect(entryIds.every((itemId) => run.responses[itemId]?.outcome === 'CORRECT')).toBe(true);
    expect(visited).not.toEqual(
      expect.arrayContaining(['PREREQ-264240-SCREEN-HANDOFF', 'PREREQ-765609-SCREEN-HANDOFF']),
    );
  });

  it('skips already-committed preflight entries when later KCs begin', () => {
    const revision = fixtureRevision('V3-LES-128144');
    const entryStepIds = [
      'PAT-SCREEN-ENTRY',
      'ERR-SCREEN-ENTRY',
      'CON-SCREEN-ENTRY',
      'PRJ-SCREEN-ENTRY',
    ];
    const visited: string[] = [];
    let run = createNormalizedLessonRun({ revision, now: NOW });

    for (let guard = 0; guard < 5000 && run.status === 'IN_PROGRESS'; guard += 1) {
      if (run.display === 'CONTENT' && run.currentStepId !== null) visited.push(run.currentStepId);
      const screen = renderNormalizedLessonRun(run, revision).screen;
      run = screen.kind === 'QUESTION' ? submit(run, revision, true) : continueRun(run, revision);
    }

    expect(run.status).toBe('DELIVERY_COMPLETE');
    for (const stepId of entryStepIds) {
      expect(
        visited.filter((visitedId) => visitedId === stepId),
        stepId,
      ).toHaveLength(1);
    }
  });

  it('keeps the required V3-LES-320512 attachment handoffs on the clean route only', () => {
    const revision = fixtureRevision('V3-LES-320512');
    const visited: string[] = [];
    let run = createNormalizedLessonRun({ revision, now: NOW });
    for (let guard = 0; guard < 5000 && run.status === 'IN_PROGRESS'; guard += 1) {
      if (run.display === 'CONTENT' && run.currentStepId !== null) visited.push(run.currentStepId);
      const screen = renderNormalizedLessonRun(run, revision).screen;
      run = screen.kind === 'QUESTION' ? submit(run, revision, true) : continueRun(run, revision);
    }
    expect(run.status).toBe('DELIVERY_COMPLETE');
    expect(visited).toEqual(
      expect.arrayContaining(['BATT-SCREEN-CAPSTONE-359390', 'BATT-SCREEN-CAPSTONE-481386']),
    );
    expect(visited).not.toContain('ERED-SCREEN-HANDOFF-1');
  });

  it('supports an admitted explicit direct-block gate with no failure screen', () => {
    const base = fixtureRevision('V3-LES-320512');
    const lesson = structuredClone(base.lesson) as LessonWithGates;
    const gate = lesson.prerequisiteGates?.[0];
    expect(gate).toBeDefined();
    if (gate === undefined) return;
    lesson.prerequisiteGates = [
      {
        ...gate,
        failureHandoffNodeId: null,
        allowedDestinationNodeIds: [gate.passNodeId],
      },
    ];
    const revision = { ...base, lesson };
    let run = createNormalizedLessonRun({ revision, now: NOW });
    run = submit(run, revision, false);
    run = continueRun(run, revision);
    expect(run.status).toBe('BLOCKED');
    expect(run.currentStepId).toBeNull();
    expect(renderNormalizedLessonRun(run, revision).screen.kind).toBe('BLOCKED');
  });

  it('keeps prerequisite failure evidence instructional, noncredit, and revision-bound', () => {
    const revision = fixtureRevision('V3-LES-320512');
    const before = createNormalizedLessonRun({ revision, now: NOW });
    const after = submit(before, revision, false);
    const record = after.responses['ERED-ITEM-ENTRY'];
    if (record === undefined) throw new Error('entry response not committed');
    const submission = normalizedLessonResponseSubmission(record, revision);

    expect(submission.binding?.candidateEvidenceModes).toEqual(['INSTRUCTIONAL']);
    expect(submission.binding === null ? false : hasEligibleEvidenceMode(submission.binding)).toBe(
      false,
    );
    expect(submission.scoring).toMatchObject({ scoringValid: true, outcome: 'incorrect' });
    expect(submission.lessonAttribution).toMatchObject({
      lessonId: revision.lessonId,
      definitionHash: revision.definitionHash,
      itemBindingId: 'ERED-ITEM-ENTRY',
      activityRole: 'ENTRY_CHECK',
      exitFunction: 'NONE',
      isReentry: false,
    });
    expect(after.passedExits).toEqual({});
  });

  it('rejects a restored gate record whose claimed pass contradicts its committed response', () => {
    const revision = fixtureRevision('V3-LES-320512');
    const incorrect = submit(createNormalizedLessonRun({ revision, now: NOW }), revision, false);
    const forged = structuredClone(incorrect);
    const record = forged.responses['ERED-ITEM-ENTRY'];
    if (record === undefined) throw new Error('entry response not committed');
    (forged.responses as Record<string, typeof record>)['ERED-ITEM-ENTRY'] = {
      ...record,
      outcome: 'CORRECT',
      correct: true,
    };

    expect(() => restoreNormalizedLessonRun(forged, revision)).toThrowError(
      /response outcome.*exact answer authority/i,
    );
  });

  it('rejects a restored instruction cursor paired with an authentic failed gate response', () => {
    const revision = fixtureRevision('V3-LES-320512');
    const failed = submit(createNormalizedLessonRun({ revision, now: NOW }), revision, false);
    const forged = {
      ...structuredClone(failed),
      display: 'CONTENT' as const,
      currentStepId: 'ERED-SCREEN-ORIENTATION',
      blockAfterCurrentStep: false,
    };

    expect(() => restoreNormalizedLessonRun(forged, revision)).toThrowError(
      /failed prerequisite gate.*cursor/i,
    );
  });

  it('rejects a restored instruction cursor with the prerequisite response deleted', () => {
    const revision = fixtureRevision('V3-LES-320512');
    const forged = {
      ...structuredClone(createNormalizedLessonRun({ revision, now: NOW })),
      currentStepId: 'ERED-SCREEN-ORIENTATION',
    };

    expect(() => restoreNormalizedLessonRun(forged, revision)).toThrowError(
      /no exact committed response path/i,
    );
  });

  it('audits every admitted derived gate for wrong/omitted blocking and clean-route exclusion', () => {
    const expectedGateCounts = {
      'V3-LES-095827': 1,
      'V3-LES-128144': 4,
      'V3-LES-191915': 3,
      'V3-LES-199474': 1,
      'V3-LES-320512': 1,
    } as const;

    for (const [lessonId, expectedCount] of Object.entries(expectedGateCounts)) {
      const revision = fixtureRevision(lessonId);
      const gates = revision.lesson.prerequisiteGates;
      expect(gates, lessonId).toHaveLength(expectedCount);

      for (const gate of gates) {
        for (const outcome of ['wrong', 'omitted'] as const) {
          let run = advanceToGate(revision, gate.itemId);
          const response =
            outcome === 'wrong'
              ? responseFor(revision, gate.itemId, false)
              : omittedResponseFor(revision, gate.itemId);
          run = applyNormalizedLessonAction(
            run,
            { type: 'SUBMIT_RESPONSE', response },
            NOW,
            revision,
          );
          expect(run.responses[gate.itemId]?.outcome).toBe(
            outcome === 'wrong' ? 'INCORRECT' : 'OMITTED',
          );
          run = continueRun(run, revision);
          expect(run.blockAfterCurrentStep, `${lessonId}:${gate.itemId}:${outcome}`).toBe(true);
          expect(
            revision.lesson.kcs
              .flatMap((kc) => kc.deliverySteps)
              .find((step) => step.stepId === run.currentStepId)?.nodeIds,
          ).toContain(gate.failureHandoffNodeId);
          run = continueRun(run, revision);
          expect(run.status, `${lessonId}:${gate.itemId}:${outcome}`).toBe('BLOCKED');
          expect(run.passedExits[gate.primaryKcId] ?? []).toEqual([]);
        }
      }

      const visited: string[] = [];
      let clean = createNormalizedLessonRun({ revision, now: NOW });
      for (let guard = 0; guard < 5000 && clean.status === 'IN_PROGRESS'; guard += 1) {
        if (clean.display === 'CONTENT' && clean.currentStepId !== null) {
          visited.push(clean.currentStepId);
        }
        const screen = renderNormalizedLessonRun(clean, revision).screen;
        clean =
          screen.kind === 'QUESTION' ? submit(clean, revision, true) : continueRun(clean, revision);
      }
      expect(clean.status, lessonId).toBe('DELIVERY_COMPLETE');
      const failureStepIds = revision.lesson.kcs
        .flatMap((kc) => kc.deliverySteps)
        .filter((step) =>
          gates.some(
            (gate) =>
              gate.failureHandoffNodeId !== null &&
              step.nodeIds.includes(gate.failureHandoffNodeId),
          ),
        )
        .map((step) => step.stepId);
      expect(visited, lessonId).not.toEqual(expect.arrayContaining(failureStepIds));
    }
  });
});
