import { describe, expect, it } from 'vitest';
import {
  applyVectorLessonAction,
  createStandardVectorLessonPilotResolution,
  createVectorLessonRun,
  invalidateCurrentVectorLessonItem,
  renderVectorLessonRun,
  restoreVectorLessonRun,
  resumeVectorLessonRun,
  validateVectorLessonPlannerResolution,
  type VectorLessonRun,
} from './vector-lesson-runtime';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import { VECTOR_LESSON_KCS } from '@mcat/content/v3-vector-lesson';

const NOW = '2026-07-23T18:00:00.000Z';
const RUN_ID = '10000000-0000-4000-8000-000000000010';

function correctChoice(run: VectorLessonRun) {
  const itemId = run.currentItemId;
  if (itemId === null) throw new Error('Expected an active item');
  return VECTOR_LESSON_PROTECTED_ANSWERS[itemId]!.correctChoiceId;
}

function wrongChoice(run: VectorLessonRun) {
  const correct = correctChoice(run);
  return (['A', 'B', 'C', 'D'] as const).find((choice) => choice !== correct)!;
}

function act(
  run: VectorLessonRun,
  action:
    | { type: 'CONTINUE' }
    | { type: 'SUBMIT_RESPONSE'; choiceId: 'A' | 'B' | 'C' | 'D' | null }
    | { type: 'REQUEST_SUPPORT' }
    | { type: 'PAUSE' },
) {
  const view = renderVectorLessonRun(run);
  return applyVectorLessonAction(
    run,
    {
      runId: run.runId,
      screenToken: view.screen.screenToken,
      action,
    },
    NOW,
  );
}

function advanceCorrectly(run: VectorLessonRun, stop: (run: VectorLessonRun) => boolean) {
  let current = run;
  for (let guard = 0; guard < 500 && !stop(current); guard += 1) {
    const view = renderVectorLessonRun(current);
    if (view.screen.kind === 'QUESTION') {
      current = act(current, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(current) });
    } else if (view.screen.kind === 'CONTENT' || view.screen.kind === 'FEEDBACK') {
      current = act(current, { type: 'CONTINUE' });
    } else {
      break;
    }
  }
  return current;
}

describe('V3-LES-130923 target-specific lesson runtime', () => {
  it('keeps every key in the server-only authority with non-cueing answer positions', () => {
    const safeItems = VECTOR_LESSON_KCS.flatMap((kc) => kc.items);
    expect(Object.keys(VECTOR_LESSON_PROTECTED_ANSWERS).sort()).toEqual(
      safeItems.map((item) => item.item_id).sort(),
    );
    expect(
      new Set(
        Object.values(VECTOR_LESSON_PROTECTED_ANSWERS).map((answer) => answer.correctChoiceId),
      ),
    ).toEqual(new Set(['A', 'B', 'C', 'D']));
    for (const answer of Object.values(VECTOR_LESSON_PROTECTED_ANSWERS)) {
      expect(answer.derivation.length).toBeGreaterThan(40);
      expect(Object.values(answer.choiceFeedback).every((feedback) => feedback.length > 20)).toBe(
        true,
      );
    }
    expect(JSON.stringify(safeItems)).not.toMatch(
      /correctChoiceId|correct_choice_id|correct_answer|answerKey|rationales/,
    );
  });

  it('starts only the canonical lesson at the first KC with a server-created STANDARD pilot', () => {
    const resolution = createStandardVectorLessonPilotResolution('V3-KC-866848', NOW);
    const run = createVectorLessonRun({ runId: RUN_ID, now: NOW, resolution });

    expect(run.lessonId).toBe('V3-LES-130923');
    expect(run.orderedKcIds).toEqual(['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529']);
    expect(run.currentKcIndex).toBe(0);
    expect(run.resolvedRoute).toBe('STANDARD');
    expect(run).toMatchObject({
      estimatedCoreSegmentMinutes: null,
      estimatedBranchSegmentMinutes: null,
      estimatedKcCoreMinutes: null,
      estimatedKcBranchMinutes: null,
      estimatedShellCoreMinutes: null,
      estimatedShellBranchMinutes: null,
      timingPolicyVersion: 'v3-les-130923-uncalibrated-segment-hypothesis-v1',
    });
    expect(run.exposedFamilyIds).toContain('fam-vtr-vec-entry-check-1');
    expect(renderVectorLessonRun(run).screen).toMatchObject({
      kind: 'QUESTION',
      visual: null,
    });
    expect(JSON.stringify(renderVectorLessonRun(run))).not.toMatch(
      /correctChoiceId|answerKey|rationales|STANDARD|"A[0-3]"/,
    );
  });

  it('validates all four route values without letting entry responses select one', () => {
    expect(
      validateVectorLessonPlannerResolution(
        {
          ...createStandardVectorLessonPilotResolution('V3-KC-866848', NOW),
          resolvedInstructionRoute: 'CONCISE',
        },
        'V3-KC-866848',
        NOW,
      ),
    ).toMatchObject({ route: 'CONCISE', disposition: 'ACCEPTED' });

    expect(
      validateVectorLessonPlannerResolution(
        {
          ...createStandardVectorLessonPilotResolution('V3-KC-866848', NOW),
          resolvedInstructionRoute: 'MISCONCEPTION',
          misconceptionHypothesisId: 'vtr-observed-sign-reversal-v1',
        },
        'V3-KC-866848',
        NOW,
      ),
    ).toMatchObject({ route: 'MISCONCEPTION', disposition: 'ACCEPTED' });

    expect(
      validateVectorLessonPlannerResolution(
        {
          ...createStandardVectorLessonPilotResolution('V3-KC-866848', NOW),
          resolvedInstructionRoute: 'PREREQUISITE_SUPPORT',
        },
        'V3-KC-866848',
        NOW,
      ),
    ).toMatchObject({
      route: 'STANDARD',
      disposition: 'DOWNGRADED',
      reason: 'NO_AUTHORIZED_HARD_PREDECESSOR_FOR_TARGET',
    });

    expect(() =>
      validateVectorLessonPlannerResolution(
        {
          ...createStandardVectorLessonPilotResolution('V3-KC-866848', NOW),
          expiresAt: 'not-a-timestamp',
        },
        'V3-KC-866848',
        NOW,
      ),
    ).toThrow(/invalid/i);
    expect(() =>
      validateVectorLessonPlannerResolution(
        {
          ...createStandardVectorLessonPilotResolution('V3-KC-866848', NOW),
          resolvedInstructionRoute: 'UNAUTHORIZED_ROUTE',
        } as never,
        'V3-KC-866848',
        NOW,
      ),
    ).toThrow(/invalid/i);
  });

  it('names an observed conflict without labeling the learner on the misconception route', () => {
    const resolution = {
      ...createStandardVectorLessonPilotResolution('V3-KC-866848', NOW),
      resolvedInstructionRoute: 'MISCONCEPTION' as const,
      misconceptionHypothesisId: 'vtr-observed-sign-reversal-v1',
    };
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW, resolution });
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    const view = renderVectorLessonRun(run);
    expect(view.screen).toMatchObject({ kind: 'CONTENT' });
    expect(JSON.stringify(view.screen)).toMatch(/observed response pattern/i);
    expect(JSON.stringify(view.screen)).not.toMatch(/your misconception|you believe/i);
  });

  it('preserves the immutable first attempt and rejects a stale duplicate screen command', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    const firstView = renderVectorLessonRun(run);
    expect(firstView.screen.kind).toBe('QUESTION');

    run = applyVectorLessonAction(
      run,
      {
        runId: run.runId,
        screenToken: firstView.screen.screenToken,
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'B' },
      },
      NOW,
    );
    const itemId = Object.keys(run.committedResponses)[0]!;
    expect(run.committedResponses[itemId]).toMatchObject({
      firstAttempt: true,
      choiceId: 'B',
    });

    expect(() =>
      applyVectorLessonAction(
        run,
        {
          runId: run.runId,
          screenToken: firstView.screen.screenToken,
          action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
        },
        NOW,
      ),
    ).toThrow(/stale|already committed/i);
    expect(run.committedResponses[itemId]?.choiceId).toBe('B');
  });

  it('uses a fresh supported family after a guided miss before continuing to lighter support', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-guided-practice-1',
    );
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });

    expect(run.currentItemId).toBe('vtr-vec-guided-practice-fresh');
    expect(run.exposedFamilyIds).toContain('fam-vtr-vec-guided-practice-fresh');
    expect(run.assistanceState).toBe('A2');
  });

  it('does not reduce support after a second guided miss', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-guided-practice-1',
    );
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    expect(run.stage).toBe('SUPPORT_RESTORE');
    run = act(run, { type: 'CONTINUE' });
    expect(run.currentItemId).toBe('vtr-vec-light-support-practice-1');
    expect(run.assistanceState).toBe('A1');
  });

  it('requires a fresh successful A1 predicate before solo work', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-light-support-practice-1',
    );
    expect(renderVectorLessonRun(run).screen).toMatchObject({
      kind: 'QUESTION',
      visual: { kind: 'COMPONENTS' },
    });
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    expect(run.stage).toBe('SUPPORT_RESTORE');
    run = act(run, { type: 'CONTINUE' });
    expect(run.currentItemId).toBe('vtr-vec-light-support-practice-fresh');
    expect(run.assistanceState).toBe('A1');
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    expect(run.currentItemId).toBe('vtr-vec-solo-practice-1');
    expect(run.assistanceState).toBe('A0');
  });

  it('records a requested cue as assistance and releases it without answer material', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-guided-practice-1',
    );
    expect(renderVectorLessonRun(run).screen).toMatchObject({
      kind: 'QUESTION',
      supportActionLabel: 'Show one cue',
      support: null,
    });
    run = act(run, { type: 'REQUEST_SUPPORT' });
    expect(renderVectorLessonRun(run).screen).toMatchObject({
      kind: 'QUESTION',
      supportActionLabel: null,
      support: { label: 'One helpful cue' },
    });
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    // The delivery ledger as it stood at commitment: what the screen carried,
    // and what the learner took off it.
    expect(run.committedResponses['vtr-vec-guided-practice-1']).toMatchObject({
      observedScaffoldDisplayed: true,
      observedSupportOffered: true,
      observedSupportRequested: true,
      observedAnswerRevealed: false,
    });
  });

  it('records an empty delivery ledger for a check that carries no help', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-changed-exit-initial',
    );
    expect(renderVectorLessonRun(run).screen).toMatchObject({
      kind: 'QUESTION',
      visual: null,
      supportActionLabel: null,
      support: null,
    });
    expect(() => act(run, { type: 'REQUEST_SUPPORT' })).toThrow(/not authorized/i);

    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    expect(run.committedResponses['vtr-vec-changed-exit-initial']).toMatchObject({
      observedScaffoldDisplayed: false,
      observedSupportOffered: false,
      observedSupportRequested: false,
      observedAnswerRevealed: false,
    });
  });

  it('refuses a persisted run whose delivery ledger the definition would not produce', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-guided-practice-1',
    );
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    expect(() => restoreVectorLessonRun(structuredClone(run))).not.toThrow();

    // The ledger is the sole input to the assistance level, and a restored run is
    // unvalidated JSON, so a claim of "no scaffold" on a scaffolded item would
    // mint an independent administration. It is re-derived and refused.
    const forged = structuredClone(run) as unknown as {
      committedResponses: Record<string, { observedScaffoldDisplayed: boolean }>;
    };
    forged.committedResponses['vtr-vec-guided-practice-1']!.observedScaffoldDisplayed = false;
    expect(() => restoreVectorLessonRun(forged)).toThrow(/does not present/i);
  });

  it('repairs a near-use miss and returns to the exact near-use function on a fresh family', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-near-exit-initial',
    );
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    expect(run.repair?.failedFunction).toBe('NEAR_USE');
    expect(run.repair).toMatchObject({
      registryRepairTemplateIds: ['R14-REM-BB-129', 'R14-REM-CP-156'],
      instantiatedRegistryRelationId: null,
      originSequenceRelationId: 'R14-FD-130923',
    });
    expect(run.preservedExitSuccesses['V3-KC-866848']?.nearUse).toBe(false);

    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'CONTINUE' });
    expect(run.currentItemId).toBe('vtr-vec-repair-confirmation-near-1');
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    run = act(run, { type: 'CONTINUE' });

    expect(run.currentItemId).toBe('vtr-vec-near-exit-reentry');
    expect(run.reentryCoordinate).toMatchObject({
      failedFunction: 'NEAR_USE',
      destination: 'NEAR_USE_EXIT_PENDING',
    });
    expect(run.exposedFamilyIds).toContain('fam-vtr-vec-near-exit-reentry');
  });

  it('records an omitted exit attempt without diagnosing ignorance and enters bounded repair', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-near-exit-initial',
    );
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: null });
    expect(run.committedResponses['vtr-vec-near-exit-initial']).toMatchObject({
      choiceId: null,
      omissionType: 'INTENTIONAL_SKIP',
      observedResponseFeatures: ['submitted no response'],
    });
    expect(run.repair?.failedFunction).toBe('NEAR_USE');
  });

  it('preserves invalid-family exposure and uses one untouched parallel replacement', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-near-exit-initial',
    );
    run = invalidateCurrentVectorLessonItem(run, NOW);
    expect(run.currentItemId).toBe('vtr-vec-near-exit-reentry');
    expect(run.exposedFamilyIds).toEqual(
      expect.arrayContaining(['fam-vtr-vec-near-exit-initial', 'fam-vtr-vec-near-exit-reentry']),
    );
    expect(run.committedResponses).not.toHaveProperty('vtr-vec-near-exit-initial');

    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    expect(run.status).toBe('BLOCKED');
    expect(run.events.at(-1)?.type).toBe('kc_planner_handoff_requested');
  });

  it('preserves a passed near exit when changed-task repair reenters the changed function', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-changed-exit-initial',
    );
    expect(run.preservedExitSuccesses['V3-KC-866848']?.nearUse).toBe(true);

    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'CONTINUE' });
    expect(run.currentItemId).toBe('vtr-vec-repair-confirmation-changed-1');
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
    run = act(run, { type: 'CONTINUE' });

    expect(run.currentItemId).toBe('vtr-vec-changed-exit-reentry');
    expect(run.preservedExitSuccesses['V3-KC-866848']?.nearUse).toBe(true);
    expect(run.reentryCoordinate?.destination).toBe('CHANGED_TASK_EXIT_PENDING');
  });

  it('executes near and changed repair with exact fresh re-entry for every ordered KC', () => {
    for (const [slug, kcId] of [
      ['vec', 'V3-KC-866848'],
      ['trig', 'V3-KC-700208'],
      ['dir', 'V3-KC-159529'],
    ] as const) {
      let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
      run = advanceCorrectly(
        run,
        (candidate) => candidate.currentItemId === `vtr-${slug}-near-exit-initial`,
      );
      run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
      run = act(run, { type: 'CONTINUE' });
      run = act(run, { type: 'CONTINUE' });
      expect(run.currentItemId).toBe(`vtr-${slug}-repair-confirmation-near-1`);
      run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
      run = act(run, { type: 'CONTINUE' });
      expect(run.currentItemId).toBe(`vtr-${slug}-near-exit-reentry`);
      run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
      run = act(run, { type: 'CONTINUE' });

      expect(run.currentItemId).toBe(`vtr-${slug}-changed-exit-initial`);
      run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
      run = act(run, { type: 'CONTINUE' });
      run = act(run, { type: 'CONTINUE' });
      expect(run.currentItemId).toBe(`vtr-${slug}-repair-confirmation-changed-1`);
      run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });
      run = act(run, { type: 'CONTINUE' });
      expect(run.currentItemId).toBe(`vtr-${slug}-changed-exit-reentry`);
      run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: correctChoice(run) });

      expect(run.preservedExitSuccesses[kcId]).toEqual({
        nearUse: true,
        changedTask: true,
      });
      expect(run.exitedKcIds).toContain(kcId);
    }
  });

  it('terminates at a safe planner handoff when the internal pilot repair bound is exhausted', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-near-exit-initial',
    );
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'CONTINUE' });
    run = act(run, { type: 'SUBMIT_RESPONSE', choiceId: wrongChoice(run) });
    run = act(run, { type: 'CONTINUE' });

    expect(run.status).toBe('BLOCKED');
    expect(renderVectorLessonRun(run).screen.kind).toBe('BLOCKED');
    expect(run.reentryCoordinate?.destination).toBe('NEAR_USE_EXIT_PENDING');
  });

  it('round-trips the exact checkpoint and resumes without losing exposure or commitment', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(
      run,
      (candidate) => candidate.currentItemId === 'vtr-vec-light-support-practice-1',
    );
    run = act(run, { type: 'PAUSE' });
    expect(renderVectorLessonRun(run)).toMatchObject({
      state: 'PAUSED',
      screen: { kind: 'PAUSED', heading: 'This lesson is paused.' },
    });
    const restored = restoreVectorLessonRun(JSON.parse(JSON.stringify(run)));
    const resumed = resumeVectorLessonRun(restored, NOW);

    expect(resumed.stage).toBe(run.stage);
    expect(resumed.currentItemId).toBe(run.currentItemId);
    expect(resumed.exposedFamilyIds).toEqual(run.exposedFamilyIds);
    expect(resumed.committedResponses).toEqual(run.committedResponses);
    expect(resumed.resumeCount).toBe(run.resumeCount + 1);

    const corrupted = structuredClone(run);
    corrupted.checkpoint = { ...corrupted.checkpoint, nodeId: 'wrong-node' };
    expect(() => restoreVectorLessonRun(corrupted)).toThrow(/checkpoint/i);
  });

  it('records all three KC exits in order and derives neutral delivery completion only afterward', () => {
    let run = createVectorLessonRun({ runId: RUN_ID, now: NOW });
    run = advanceCorrectly(run, (candidate) => candidate.status === 'DELIVERY_COMPLETE');

    expect(run.exitedKcIds).toEqual(['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529']);
    expect(run.status).toBe('DELIVERY_COMPLETE');
    expect(run).not.toHaveProperty('mastery');
    expect(renderVectorLessonRun(run).screen).toMatchObject({
      kind: 'COMPLETION',
      heading: 'You finished this lesson’s required instruction.',
    });
  });
});
