import { describe, expect, it } from 'vitest';

import type { NormalizedItem } from '@mcat/content/lesson-normalization';

import { createRepoLessonContentProvider, type LessonContentProvider } from './lesson-content-provider';
import {
  applyNormalizedLessonAction,
  createNormalizedLessonRun,
  renderNormalizedLessonRun,
  restoreNormalizedLessonRun,
  type EngineResponse,
  type NormalizedLessonRun,
} from './normalized-lesson-runtime';

const NOW = '2026-07-30T18:00:00.000Z';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';

const provider: LessonContentProvider = createRepoLessonContentProvider();

// The engine's targets are the normalized grammars (L2/L3); L1 keeps its bespoke
// machine. These helpers derive a learner's response FROM the server answer key,
// so the walk exercises the real sequencing without hard-coding any answer.
function correctResponseFor(lessonId: string, itemId: string): EngineResponse {
  const answer = provider.getAnswerKey(lessonId).byItemId[itemId];
  if (answer === undefined) throw new Error(`no answer for ${itemId}`);
  if (answer.correctChoiceId !== null) {
    return { kind: 'MULTIPLE_CHOICE', choiceId: answer.correctChoiceId };
  }
  if (answer.structuredAuthority !== undefined) {
    return {
      kind: 'CONSTRUCTED',
      fields: Object.fromEntries(answer.acceptedResponses.map((part, index) => [`f${index}`, part])),
    };
  }
  return { kind: 'SHORT', text: answer.acceptedResponses[0] ?? '' };
}

function wrongResponseFor(lessonId: string, itemId: string): EngineResponse {
  const answer = provider.getAnswerKey(lessonId).byItemId[itemId];
  if (answer === undefined) throw new Error(`no answer for ${itemId}`);
  if (answer.correctChoiceId !== null) {
    const item = provider.getNormalizedLesson(lessonId).items.find((i) => i.itemId === itemId);
    const wrong = item?.projection.choices.find((c) => c.choiceId !== answer.correctChoiceId);
    return { kind: 'MULTIPLE_CHOICE', choiceId: wrong?.choiceId ?? null };
  }
  if (answer.structuredAuthority !== undefined) {
    return { kind: 'CONSTRUCTED', fields: { f0: '__definitely wrong__' } };
  }
  return { kind: 'SHORT', text: '__definitely wrong__' };
}

/**
 * Walk a run to a terminal state (COMPLETE or BLOCKED), answering every question
 * correctly except the ids in `missOnce`, which are answered wrong exactly once.
 */
function driveToEnd(
  start: NormalizedLessonRun,
  lessonId: string,
  missOnce: ReadonlySet<string> = new Set(),
): NormalizedLessonRun {
  const missed = new Set<string>();
  let run = start;
  for (let guard = 0; guard < 2000; guard += 1) {
    if (run.status !== 'IN_PROGRESS') return run;
    const { screen } = renderNormalizedLessonRun(run, provider);
    if (screen.kind === 'QUESTION') {
      const shouldMiss = missOnce.has(screen.itemId) && !missed.has(screen.itemId);
      if (shouldMiss) missed.add(screen.itemId);
      const response = shouldMiss
        ? wrongResponseFor(lessonId, screen.itemId)
        : correctResponseFor(lessonId, screen.itemId);
      run = applyNormalizedLessonAction(run, { type: 'SUBMIT_RESPONSE', response }, NOW, provider);
    } else if (screen.kind === 'FEEDBACK' || screen.kind === 'EXPOSITION') {
      run = applyNormalizedLessonAction(run, { type: 'CONTINUE' }, NOW, provider);
    } else {
      return run;
    }
  }
  throw new Error(`walk did not terminate for ${lessonId}`);
}

const isBranch = (item: NormalizedItem): boolean =>
  item.activityRole === 'REPAIR_CONFIRMATION' || item.isReentry;

describe('NormalizedLesson delivery engine — a correct learner walks each lesson to completion', () => {
  for (const lessonId of [L2, L3]) {
    it(`${lessonId}: completes, committing EXACTLY the scored baseline items, all correct`, () => {
      const run = driveToEnd(
        createNormalizedLessonRun({ lessonId, now: NOW, runId: `run-${lessonId}`, provider }),
        lessonId,
      );

      expect(run.status).toBe('DELIVERY_COMPLETE');
      expect(run.definitionHash).toBe(provider.getDefinitionHash(lessonId));

      // A no-miss walk never enters a repair branch, so the committed set is
      // precisely the scored, non-branch (baseline) items — no re-entry, no
      // repair-confirmation, no worked example.
      const lesson = provider.getNormalizedLesson(lessonId);
      const expected = lesson.items
        .filter((item) => item.scored && !isBranch(item))
        .map((item) => item.itemId)
        .sort();
      expect(expected.length).toBeGreaterThan(0);
      expect(Object.keys(run.responses).sort()).toEqual(expected);
      expect(Object.values(run.responses).every((record) => record.correct)).toBe(true);
    });
  }

  it('renders learner-safe questions only — a rendered screen never carries the correct answer', () => {
    let run = createNormalizedLessonRun({ lessonId: L3, now: NOW, provider });
    // Advance to the first QUESTION screen.
    for (let guard = 0; guard < 50; guard += 1) {
      const { screen } = renderNormalizedLessonRun(run, provider);
      if (screen.kind === 'QUESTION') {
        const key = provider.getAnswerKey(L3).byItemId[screen.itemId];
        const serialized = JSON.stringify(screen);
        // The winning choiceId must not appear as a rendered field, and no
        // choice is marked correct.
        expect(Object.prototype.hasOwnProperty.call(screen, 'correctChoiceId')).toBe(false);
        if (key?.correctChoiceId !== null && key !== undefined) {
          expect(serialized).not.toContain(`"correctChoiceId"`);
        }
        expect(screen.choices.length).toBeGreaterThan(0);
        return;
      }
      run = applyNormalizedLessonAction(run, { type: 'CONTINUE' }, NOW, provider);
    }
    throw new Error('no QUESTION screen reached for L3');
  });
});

describe('NormalizedLesson delivery engine — a missed exit routes through repair', () => {
  it('L3: missing a CHANGED exit delivers its repair→re-entry; a correct re-entry confirms and completes', () => {
    const lesson = provider.getNormalizedLesson(L3);
    const changedExit = lesson.items.find(
      (item) => item.activityRole === 'CHANGED_EXIT' && !item.isReentry && item.scored,
    );
    expect(changedExit, 'L3 has a baseline CHANGED exit').toBeDefined();
    if (changedExit === undefined) return;

    const reentry = lesson.items.find(
      (item) =>
        item.isReentry &&
        item.primaryKcId === changedExit.primaryKcId &&
        (item.exitFunction === changedExit.exitFunction ||
          item.repairsFunction === changedExit.exitFunction),
    );
    expect(reentry, 'L3 authors an exact re-entry for the changed exit').toBeDefined();

    const run = driveToEnd(
      createNormalizedLessonRun({ lessonId: L3, now: NOW, provider }),
      L3,
      new Set([changedExit.itemId]),
    );

    // The initial exit was missed; the fresh re-entry was administered and
    // passed; the lesson still completes (repair is not a dead end when a
    // re-entry exists).
    expect(run.responses[changedExit.itemId]?.correct).toBe(false);
    expect(reentry && run.responses[reentry.itemId]?.correct).toBe(true);
    expect(run.status).toBe('DELIVERY_COMPLETE');
    expect(run.passedExits[changedExit.primaryKcId]).toContain('CHANGED_TASK');
  });

  it('L2: missing an exit has no fresh re-entry to confirm it → the run BLOCKS (never a fabricated pass)', () => {
    const lesson = provider.getNormalizedLesson(L2);
    const exit = lesson.items.find(
      (item) =>
        (item.activityRole === 'CHANGED_EXIT' || item.activityRole === 'NEAR_EXIT') &&
        !item.isReentry &&
        item.scored,
    );
    expect(exit, 'L2 has a baseline exit').toBeDefined();
    if (exit === undefined) return;
    // Precondition for this lesson's grammar: L2 authors no re-entry items.
    expect(lesson.items.some((item) => item.isReentry)).toBe(false);

    const run = driveToEnd(
      createNormalizedLessonRun({ lessonId: L2, now: NOW, provider }),
      L2,
      new Set([exit.itemId]),
    );

    expect(run.responses[exit.itemId]?.correct).toBe(false);
    expect(run.status).toBe('BLOCKED');
    expect(renderNormalizedLessonRun(run, provider).screen.kind).toBe('BLOCKED');
  });
});

describe('NormalizedLesson delivery engine — persistence round-trips and pins the revision', () => {
  it('restores a mid-run blob to an identical run and keeps advancing', () => {
    const run = applyNormalizedLessonAction(
      createNormalizedLessonRun({ lessonId: L2, now: NOW, runId: 'round-trip', provider }),
      { type: 'SUBMIT_RESPONSE', response: correctResponseFor(L2, firstQuestionItemId(L2)) },
      NOW,
      provider,
    );
    const restored = restoreNormalizedLessonRun(JSON.parse(JSON.stringify(run)), provider);
    expect(restored).toEqual(run);
    // The restored run drives to the same terminal state as a fresh walk.
    expect(driveToEnd(restored, L2).status).toBe('DELIVERY_COMPLETE');
  });

  it('rejects a blob whose pinned definitionHash no longer matches the catalog', () => {
    const run = createNormalizedLessonRun({ lessonId: L3, now: NOW, provider });
    const stale = { ...run, definitionHash: 'sha256:0000000000000000' };
    expect(() => restoreNormalizedLessonRun(stale, provider)).toThrow(/pinned revision/);
  });
});

function firstQuestionItemId(lessonId: string): string {
  let run = createNormalizedLessonRun({ lessonId, now: NOW, provider });
  for (let guard = 0; guard < 50; guard += 1) {
    const { screen } = renderNormalizedLessonRun(run, provider);
    if (screen.kind === 'QUESTION') return screen.itemId;
    run = applyNormalizedLessonAction(run, { type: 'CONTINUE' }, NOW, provider);
  }
  throw new Error(`no question item for ${lessonId}`);
}
