import { Authority } from '@mcat/authority-core';
import {
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { TARGET_LESSON_ID } from '@mcat/content/v3-vector-lesson';
import {
  VectorLessonCommandSchema,
  VectorLessonStartCommandSchema,
  fixedClock,
  hasEligibleEvidenceMode,
} from '@mcat/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createRepoLessonContentProvider,
  createRepoLessonRevisionProvider,
  type LessonContentProvider,
  type LoadedLessonRevision,
} from './lesson-content-provider';
import {
  normalizedLessonResponseSubmission,
  normalizedLessonResponseSubmissions,
} from './normalized-lesson-response-source';
import {
  applyNormalizedLessonAction,
  createNormalizedLessonRun,
  renderNormalizedLessonRun,
  type EngineResponse,
} from './normalized-lesson-runtime';
import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import { RepositoryLearnerKernel, type LessonResponseSubmission } from './workflow';

const NOW = '2026-07-30T18:00:00.000Z';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';

const provider: LessonContentProvider = createRepoLessonContentProvider();
const revisionProvider = createRepoLessonRevisionProvider();
const revisions = new Map<string, LoadedLessonRevision>();

beforeAll(async () => {
  await Promise.all(
    [L2, L3].map(async (lessonId) => {
      revisions.set(lessonId, await revisionProvider.loadActiveRevision({ lessonId }));
    }),
  );
});

function revisionFor(lessonId: string): LoadedLessonRevision {
  const revision = revisions.get(lessonId);
  if (revision === undefined) throw new Error(`revision not loaded for ${lessonId}`);
  return revision;
}

function correctResponseFor(revision: LoadedLessonRevision, itemId: string): EngineResponse {
  const answer = revision.protectedAuthority.answerKey.byItemId[itemId];
  const item = revision.lesson.items.find((candidate) => candidate.itemId === itemId);
  if (answer === undefined || item === undefined) throw new Error(`no answer for ${itemId}`);
  if (answer.correctChoiceId !== null)
    return { kind: 'MULTIPLE_CHOICE', choiceId: answer.correctChoiceId };
  if (answer.structuredAuthority !== undefined) {
    const control = item.projection.responseControl;
    if (control?.kind !== 'STRUCTURED_FIELDS')
      throw new Error(`no structured control for ${itemId}`);
    const authority = answer.structuredAuthority as {
      expected_equation_forms?: readonly string[];
      expected_solution_pair?: readonly string[];
    };
    const equations = [...(authority.expected_equation_forms ?? [])];
    const pair = (authority.expected_solution_pair ?? []).map((part) =>
      part.split('=').at(-1)?.trim(),
    );
    let equationIndex = 0;
    return {
      kind: 'CONSTRUCTED',
      fields: Object.fromEntries(
        control.fields.map(({ fieldId }) => [
          fieldId,
          fieldId.includes('solution')
            ? `(${pair.join(', ')})`
            : (equations[equationIndex++] ?? '__missing_authority__'),
        ]),
      ),
    };
  }
  return { kind: 'SHORT', text: answer.acceptedResponses[0] ?? '' };
}

/** Walk a lesson with correct answers, keyed by itemId → the submission the seam produced. */
function collectSubmissions(lessonId: string): Map<string, LessonResponseSubmission> {
  const out = new Map<string, LessonResponseSubmission>();
  const revision = revisionFor(lessonId);
  let run = createNormalizedLessonRun({ revision, now: NOW });
  for (let guard = 0; guard < 2000; guard += 1) {
    if (run.status !== 'IN_PROGRESS') break;
    const { screen } = renderNormalizedLessonRun(run, revision);
    if (screen.kind === 'QUESTION') {
      const before = run;
      run = applyNormalizedLessonAction(
        run,
        { type: 'SUBMIT_RESPONSE', response: correctResponseFor(revision, screen.itemId) },
        NOW,
        revision,
      );
      for (const submission of normalizedLessonResponseSubmissions(before, run, provider)) {
        out.set(submission.response.itemBindingId, submission);
      }
    } else if (screen.kind === 'FEEDBACK' || screen.kind === 'EXPOSITION') {
      run = applyNormalizedLessonAction(run, { type: 'CONTINUE' }, NOW, revision);
    } else {
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// A — the submission shape, over the real L2 + L3 corpus
// ---------------------------------------------------------------------------

describe('normalized-lesson-response-source — every committed response becomes valid seam vocabulary', () => {
  for (const lessonId of [L2, L3]) {
    it(`${lessonId}: each submission carries a parsed binding, the envelope version, and an A0 measured administration`, () => {
      const submissions = collectSubmissions(lessonId);
      const artifactVersion = provider.getAuthoredBindings(lessonId).artifactVersion;
      expect(submissions.size).toBeGreaterThan(0);

      for (const [itemId, submission] of submissions) {
        expect(submission.lessonId).toBe(lessonId);
        expect(submission.envelopeBindingVersion).toBe(artifactVersion);
        // A committed response is a scored item, so its binding parsed and resolves.
        expect(submission.bindingResolution.status, itemId).toBe('parsed');
        expect(submission.bindingResolution.unrecognizedKeys, itemId).toEqual([]);
        expect(submission.binding, itemId).not.toBeNull();
        expect(submission.binding?.itemBindingId, itemId).toBe(itemId);
        expect(submission.response.itemBindingId, itemId).toBe(itemId);
        // Independence is MEASURED, not defaulted: this engine shows no support.
        expect(submission.assistanceObserved, itemId).toBe(true);
        expect(submission.response.assistanceLevel, itemId).toBe('A0');
        expect(submission.response.contentBearingHintUsed, itemId).toBe(false);
        expect(submission.response.revealUsed, itemId).toBe(false);
        // Correct walk → the server re-derives 'correct' from the answer key.
        expect(submission.scoring.scoringValid, itemId).toBe(true);
        if (submission.scoring.scoringValid)
          expect(submission.scoring.outcome, itemId).toBe('correct');
      }
    });
  }

  it('L3: a changed exit is BKT-ELIGIBLE (TRANSFER + reasoning_operation) while an entry check is instruction-only', () => {
    const submissions = collectSubmissions(L3);

    const changed = submissions.get('ALG-GRAPH-CHANGED-01');
    expect(changed, 'the initial GRAPH changed exit is delivered on a correct walk').toBeDefined();
    expect(changed?.binding?.candidateEvidenceModes).toContain('TRANSFER');
    expect(changed?.binding?.reasoningOperation).toBe('PREDICT');
    expect(changed && hasEligibleEvidenceMode(changed.binding!)).toBe(true);

    const entry = submissions.get('ALG-GRAPH-ENTRY-01');
    expect(entry?.binding?.candidateEvidenceModes).toEqual(['INSTRUCTIONAL']);
    expect(entry && hasEligibleEvidenceMode(entry.binding!)).toBe(false);
  });

  it('re-derives the outcome from the answer key, not from a (possibly tampered) record.correct', () => {
    // Hand a WRONG choice but a record that lies "correct: true": scoring must
    // still resolve 'incorrect' from the server key.
    const key = provider.getAnswerKey(L3).byItemId['ALG-GRAPH-ENTRY-01'];
    const wrongChoice = provider
      .getNormalizedLesson(L3)
      .items.find((i) => i.itemId === 'ALG-GRAPH-ENTRY-01')!
      .projection.choices.find((c) => c.choiceId !== key?.correctChoiceId)!;
    const submission = normalizedLessonResponseSubmission(
      {
        stepId: 'GRAPH-SCREEN-ENTRY',
        itemId: 'ALG-GRAPH-ENTRY-01',
        primaryKcId: 'V3-KC-452593',
        activityRole: 'ENTRY_CHECK',
        exitFunction: 'NONE',
        isReentry: false,
        response: { kind: 'MULTIPLE_CHOICE', choiceId: wrongChoice.choiceId },
        outcome: 'CORRECT',
        correct: true, // the lie
        committedAt: NOW,
      },
      L3,
      provider,
    );
    expect(submission.scoring.scoringValid).toBe(true);
    if (submission.scoring.scoringValid) expect(submission.scoring.outcome).toBe('incorrect');
  });
});

// ---------------------------------------------------------------------------
// B — the whole chain: engine → seam → REAL kernel → BKT + evidence
// ---------------------------------------------------------------------------

const WIRED_LESSON_ID = TARGET_LESSON_ID;
const clock = fixedClock(NOW);

function envelope(expectedStreamVersion: number) {
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  };
}

interface PersistedState {
  readonly evidence: readonly Record<string, unknown>[];
  readonly mastery?: {
    readonly kc: Record<string, { readonly pL: number } | undefined>;
    readonly practicedLessonIds?: readonly string[];
  };
}

interface LessonResponseRecord {
  readonly status: string;
  readonly evidenceKind: string | null;
  readonly bkt: string;
  readonly rejectionCodes: readonly string[];
}

/**
 * Start the L1 command endpoint purely as TRANSPORT (it opens the transaction),
 * and inject a queued submission as the "runtime half" — exactly the seam a
 * second lesson's runtime plugs into. The submission itself is produced by the
 * normalized ENGINE + SEAM over the vendored (Phase-4-licensed) L3.
 */
async function startProbe() {
  const authority = new Authority(undefined, clock);
  const guest = authority.createGuest();
  guest.onboarding.diagnosticComplete = true;
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(guest, 0, NOW)]);
  const principal: Principal = {
    kind: 'guest',
    learnerId: guest.learnerId,
    sessionId: crypto.randomUUID(),
  };

  const queued: LessonResponseSubmission[] = [];
  const kernel = new RepositoryLearnerKernel({
    repository,
    clock,
    bank: authority.bank,
    lessonResponseSubmissions: () => queued.splice(0, 1),
  });

  let streamVersion = 0;
  const started = (await kernel.handleVectorLessonStart(
    VectorLessonStartCommandSchema.parse({
      envelope: envelope(streamVersion),
      lessonId: WIRED_LESSON_ID,
    }),
    principal,
  )) as { streamVersion: number };
  streamVersion = started.streamVersion;

  const persisted = (): PersistedState => {
    const projection = repository.projectionFor(principal.learnerId);
    if (projection === null) throw new Error('the learner projection is missing');
    return projection.state as unknown as PersistedState;
  };

  const submit = async (
    submission: LessonResponseSubmission,
  ): Promise<LessonResponseRecord | undefined> => {
    queued.push(submission);
    const view = (await kernel.vectorLessonRun(principal)) as unknown as {
      runId: string;
      screen: { kind: string; screenToken: string };
    };
    const run = repository.projectionFor(principal.learnerId)?.state.vectorLessonRun as
      | { currentItemId: string | null }
      | undefined;
    const action =
      view.screen.kind === 'QUESTION'
        ? {
            type: 'SUBMIT_RESPONSE',
            choiceId:
              VECTOR_LESSON_PROTECTED_ANSWERS[run?.currentItemId ?? '']?.correctChoiceId ?? null,
          }
        : { type: 'CONTINUE' };
    const accepted = (await kernel.handleVectorLessonCommand(
      VectorLessonCommandSchema.parse({
        envelope: envelope(streamVersion),
        runId: view.runId,
        screenToken: view.screen.screenToken,
        action,
      }),
      principal,
    )) as { streamVersion: number };
    streamVersion = accepted.streamVersion;
    if (queued.length > 0) throw new Error('the workflow never asked for the queued submission');
    const events = repository.eventsFor(principal.learnerId);
    return events.at(-1)?.payload.lessonResponse as LessonResponseRecord | undefined;
  };

  return { persisted, submit };
}

describe('normalized-lesson-response-source — an engine-produced submission moves BKT through the real kernel', () => {
  it('a licensed CHANGED exit (TRANSFER, clean A0) applies BKT and writes transfer evidence, moving P(L)', async () => {
    const submission = collectSubmissions(L3).get('ALG-GRAPH-CHANGED-01');
    expect(submission, 'the changed-exit submission exists').toBeDefined();
    if (submission === undefined) return;

    const probe = await startProbe();
    expect(probe.persisted().mastery).toBeUndefined();

    const recorded = await probe.submit(submission);
    expect(recorded?.status).toBe('adapted');
    expect(recorded?.rejectionCodes).toEqual([]);
    expect(recorded?.bkt).toBe('applied');
    expect(recorded?.evidenceKind).toBe('transfer');

    const after = probe.persisted();
    // P(L) moved off the prior on the changed exit's KC, and the lesson is audited.
    expect(after.mastery?.kc['V3-KC-452593']?.pL).toBeGreaterThan(0.2);
    expect(after.mastery?.practicedLessonIds).toEqual([L3]);
    expect(after.evidence).toHaveLength(1);
    expect(after.evidence[0]).toMatchObject({
      skillId: 'V3-KC-452593',
      kind: 'transfer',
      independent: true,
      assistanceLevel: 'A0',
      outcome: 'correct',
    });
  });

  it('an entry check on the same lesson records instruction evidence and moves no P(L)', async () => {
    const submission = collectSubmissions(L3).get('ALG-GRAPH-ENTRY-01');
    expect(submission).toBeDefined();
    if (submission === undefined) return;

    const probe = await startProbe();
    const recorded = await probe.submit(submission);
    expect(recorded?.status).toBe('adapted');
    expect(recorded?.evidenceKind).toBe('instruction');
    expect(recorded?.bkt).toBe('not_qualified');
    // Instruction warrant is recorded; capability is untouched (not zeroed, absent).
    expect(probe.persisted().evidence).toHaveLength(1);
    expect(probe.persisted().mastery).toBeUndefined();
  });
});
