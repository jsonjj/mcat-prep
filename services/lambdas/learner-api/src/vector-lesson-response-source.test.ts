import { buildVectorLessonArtifacts } from '@mcat/content/v3-vector-lesson';
import { clusterForLesson } from '@mcat/content';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  LessonItemBindingSchema,
  UtcTimestampSchema,
} from '@mcat/contracts';
import { adaptLessonResponse } from '@mcat/domain';
import { describe, expect, it } from 'vitest';

import { VECTOR_LESSON_PROTECTED_ANSWERS } from './vector-lesson-protected';
import {
  loadAuthoredLessonBindings,
  resolveVectorLessonScoring,
  vectorLessonResponseSubmission,
  vectorLessonResponseSubmissions,
  VECTOR_LESSON_BINDING_LOAD_ISSUES,
} from './vector-lesson-response-source';
import {
  applyVectorLessonAction,
  createVectorLessonRun,
  renderVectorLessonRun,
  type VectorLessonResponseRecord,
  type VectorLessonRun,
} from './vector-lesson-runtime';

const NOW = '2026-07-27T18:00:00.000Z';
const IDENTITY = {
  observationId: '9c0ffee0-0000-4000-8000-000000000001',
  eventId: EventIdSchema.parse('9c0ffee0-0000-4000-8000-000000000002'),
  learnerId: LearnerIdSchema.parse('9c0ffee0-0000-4000-8000-000000000003'),
  idempotencyKey: IdempotencyKeySchema.parse('9c0ffee0-0000-4000-8000-000000000004'),
  evidenceId: '9c0ffee0-0000-4000-8000-000000000005',
};

const SCRIPT = buildVectorLessonArtifacts().script;
const AUTHORED_BINDINGS = SCRIPT.payload.question_evidence_plan;

function record(
  overrides: Partial<VectorLessonResponseRecord> & Pick<VectorLessonResponseRecord, 'itemId'>,
): VectorLessonResponseRecord {
  return {
    responseId: `response-${overrides.itemId}`,
    itemVersion: 'internal-draft-1',
    itemFamilyId: `fam-${overrides.itemId}`,
    kcId: 'V3-KC-866848',
    activityRole: 'ENTRY_CHECK',
    assistanceState: 'A0',
    observedSupportRequested: false,
    observedAnswerRevealed: false,
    firstAttempt: true,
    choiceId: 'A',
    correct: true,
    omissionType: null,
    observedResponseFeatures: [],
    committedAt: NOW,
    feedbackState: 'AUTHORIZED_AFTER_COMMITMENT',
    ...overrides,
  };
}

function adapt(submission: ReturnType<typeof vectorLessonResponseSubmission>) {
  const cluster = clusterForLesson(submission.lessonId);
  if (cluster === null) throw new Error('the lesson has no cluster');
  return adaptLessonResponse({
    binding: submission.binding,
    response: submission.response,
    scoring: submission.scoring,
    identity: IDENTITY,
    cluster,
    envelopeBindingVersion: submission.envelopeBindingVersion,
    acceptedAt: UtcTimestampSchema.parse(NOW),
    sequence: 1,
    contentRelease: 'test',
    policies: [],
  });
}

describe('vector lesson response source', () => {
  it('resolves an immutable binding for every authored item, and none for anything else', () => {
    expect(AUTHORED_BINDINGS.length).toBe(42);
    for (const authored of AUTHORED_BINDINGS) {
      const submission = vectorLessonResponseSubmission(
        record({ itemId: authored.item_binding_id }),
      );
      expect(submission.binding, authored.item_binding_id).not.toBeNull();
      expect(submission.binding?.measurementKind).toBe('MEASURABLE');
      expect(submission.binding?.itemBindingId).toBe(authored.item_binding_id);
      expect(submission.lessonId).toBe(SCRIPT.payload.lesson_id);
    }

    const unknown = vectorLessonResponseSubmission(record({ itemId: 'vtr-not-an-item' }));
    expect(unknown.binding).toBeNull();
    expect(unknown.scoring).toEqual({ scoringValid: false });
    expect(adapt(unknown)).toMatchObject({
      status: 'binding_unresolved',
      evidence: null,
      qualification: { status: 'rejected', rejectionCodes: ['BINDING_NOT_FOUND'] },
    });
  });

  it('emits facts only: no correctness, independence, or mastery claim', () => {
    const submission = vectorLessonResponseSubmission(record({ itemId: 'vtr-vec-entry-check-1' }));
    const keys = Object.keys(submission.response);

    for (const forbidden of ['correct', 'independent', 'pL', 'mastered', 'kind', 'outcome']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(submission.response).toMatchObject({
      questionId: 'vtr-vec-entry-check-1',
      itemBindingId: 'vtr-vec-entry-check-1',
      attemptIndex: 1,
      isRetry: false,
      isDiagnosticRetry: false,
      revealUsed: false,
      occurredAt: NOW,
    });
  });

  it('never lets the authored assistance_state become the runtime assistanceLevel', () => {
    // The defect this asserts against: `assistance_state` is authoring metadata
    // describing help the design OFFERS, and it used to be emitted as the
    // learner's assistance TAKEN. That handed the author `independent` and,
    // through ASSISTANCE_NOT_A0, P(L).
    const authoredLevels = new Set(AUTHORED_BINDINGS.map((b) => b.assistance_state));
    expect(authoredLevels.size).toBeGreaterThan(1);

    for (const authored of AUTHORED_BINDINGS) {
      const emitted = vectorLessonResponseSubmission(
        record({ itemId: authored.item_binding_id, assistanceState: authored.assistance_state }),
      ).response.assistanceLevel;

      // Not the authored value, and never the one value that unlocks BKT.
      expect(emitted, authored.item_binding_id).toBe('A3');
      expect(emitted, authored.item_binding_id).not.toBe('A0');
    }

    // Independent of the authored byte in both directions: an item the author
    // marked A0 and one marked A2 emit the same unobserved level.
    for (const assistanceState of ['A0', 'A1', 'A2', 'A3'] as const) {
      expect(
        vectorLessonResponseSubmission(record({ itemId: 'vtr-vec-entry-check-1', assistanceState }))
          .response.assistanceLevel,
      ).toBe('A3');
    }
  });

  it('establishes no independent administration and no BKT-eligible attempt, for any item', () => {
    let independent = 0;
    for (const authored of AUTHORED_BINDINGS) {
      const answer = VECTOR_LESSON_PROTECTED_ANSWERS[authored.item_binding_id]!;
      const adaptation = adapt(
        vectorLessonResponseSubmission(
          record({
            itemId: authored.item_binding_id,
            assistanceState: authored.assistance_state,
            choiceId: answer.correctChoiceId,
          }),
        ),
      );
      if (adaptation.evidence?.independent === true) independent += 1;
      expect(adaptation.evidence?.kind, authored.item_binding_id).toBe('instruction');
    }
    // Was 12 of 18 fabricated `independent: true` across a full lesson walk.
    expect(independent).toBe(0);
  });

  it('refuses BKT on assistance grounds even when the binding is made eligible', () => {
    // The reviewer's P3b: declare an eligible mode and label the operation —
    // the two edits §6 legitimately permits — and change nothing about the
    // administration. Before the fix, the item whose author wrote `A0`
    // qualified and moved P(L) from the 0.20 prior to 0.5717.
    const qualifiedItemIds: string[] = [];

    for (const authored of AUTHORED_BINDINGS) {
      const answer = VECTOR_LESSON_PROTECTED_ANSWERS[authored.item_binding_id]!;
      const submission = vectorLessonResponseSubmission(
        record({
          itemId: authored.item_binding_id,
          assistanceState: authored.assistance_state,
          choiceId: answer.correctChoiceId,
        }),
      );
      const eligible = LessonItemBindingSchema.parse({
        ...submission.binding,
        candidateEvidenceModes: ['INDEPENDENT'],
        reasoningOperation: 'QUANTIFY',
      });

      const adaptation = adapt({ ...submission, binding: eligible });
      if (adaptation.qualification.status === 'qualified') {
        qualifiedItemIds.push(authored.item_binding_id);
      } else {
        expect(adaptation.qualification.rejectionCodes).toContain('ASSISTANCE_NOT_A0');
      }
    }

    expect(qualifiedItemIds).toEqual([]);
  });

  it('reports a content-bearing hint from the observed request, not the authored level', () => {
    // An item the author marked A0 whose learner did take a released cue.
    expect(
      vectorLessonResponseSubmission(
        record({
          itemId: 'vtr-vec-entry-check-1',
          assistanceState: 'A0',
          observedSupportRequested: true,
        }),
      ).response.contentBearingHintUsed,
    ).toBe(true);

    // An item the author marked A2 whose learner never asked for the cue.
    expect(
      vectorLessonResponseSubmission(
        record({
          itemId: 'vtr-vec-guided-practice-1',
          assistanceState: 'A2',
          observedSupportRequested: false,
        }),
      ).response.contentBearingHintUsed,
    ).toBe(false);
  });

  it('fails closed when a persisted record predates the help-taken observations', () => {
    const legacy = record({ itemId: 'vtr-vec-entry-check-1' }) as unknown as Record<
      string,
      unknown
    >;
    delete legacy.observedSupportRequested;
    delete legacy.observedAnswerRevealed;

    const response = vectorLessonResponseSubmission(
      legacy as unknown as VectorLessonResponseRecord,
    ).response;
    expect(response.contentBearingHintUsed).toBe(true);
    expect(response.revealUsed).toBe(true);
  });

  it('records the hint the real runtime actually released', () => {
    // Driven through the runtime rather than a fixture, so the observation is
    // proved to survive `commitResponse` before `enterFeedback` clears it.
    const token = (value: VectorLessonRun) => renderVectorLessonRun(value).screen.screenToken;
    let run = createVectorLessonRun({ now: NOW });
    while (run.currentItemId !== 'vtr-vec-guided-practice-1') {
      run = applyVectorLessonAction(
        run,
        {
          runId: run.runId,
          screenToken: token(run),
          action:
            run.currentItemId === null
              ? { type: 'CONTINUE' }
              : {
                  type: 'SUBMIT_RESPONSE',
                  choiceId: VECTOR_LESSON_PROTECTED_ANSWERS[run.currentItemId]!.correctChoiceId,
                },
        },
        NOW,
      );
    }

    const withCue = applyVectorLessonAction(
      run,
      { runId: run.runId, screenToken: token(run), action: { type: 'REQUEST_SUPPORT' } },
      NOW,
    );
    const answered = applyVectorLessonAction(
      withCue,
      {
        runId: withCue.runId,
        screenToken: token(withCue),
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
      },
      NOW,
    );

    const [submission] = vectorLessonResponseSubmissions(withCue, answered);
    expect(submission?.response.contentBearingHintUsed).toBe(true);
    expect(submission?.response.assistanceLevel).toBe('A3');
  });

  it('takes administration conditions from the runtime, never from the binding', () => {
    // Every binding declares an exit or telemetry eligibility label, and none of
    // those may stamp a warrant-bearing condition onto the attempt.
    for (const itemId of ['vtr-vec-entry-check-1', 'vtr-vec-near-exit-initial']) {
      const submission = vectorLessonResponseSubmission(record({ itemId }));
      expect(submission.response.mixedAdministration).toBe(false);
      expect(submission.response.passageAdministration).toBe(false);
      expect(submission.response.timedAdministration).toBe(false);

      const evidence = adapt(submission).evidence;
      expect(evidence?.conditions).toMatchObject({
        mixed: false,
        passage: false,
        timed: false,
        protected: false,
      });
    }
  });

  it('scores from the protected authority and ignores the persisted outcome', () => {
    const itemId = 'vtr-vec-entry-check-1';
    const correctChoiceId = VECTOR_LESSON_PROTECTED_ANSWERS[itemId]!.correctChoiceId;
    const wrongChoiceId = correctChoiceId === 'A' ? 'B' : 'A';

    // A persisted run claiming the wrong answer was right changes nothing.
    expect(
      vectorLessonResponseSubmission(record({ itemId, choiceId: wrongChoiceId, correct: true }))
        .scoring,
    ).toMatchObject({ scoringValid: true, outcome: 'incorrect' });
    expect(
      vectorLessonResponseSubmission(record({ itemId, choiceId: correctChoiceId, correct: false }))
        .scoring,
    ).toMatchObject({ scoringValid: true, outcome: 'correct' });
  });

  it('treats an omission as a scored outcome, not a scoring failure', () => {
    const submission = vectorLessonResponseSubmission(
      record({
        itemId: 'vtr-vec-solo-practice-1',
        choiceId: null,
        omissionType: 'INTENTIONAL_SKIP',
      }),
    );

    expect(submission.response.omitted).toBe(true);
    expect(submission.response.response).toEqual({
      kind: 'MULTIPLE_CHOICE',
      chosenChoiceId: null,
    });
    expect(submission.scoring).toMatchObject({ scoringValid: true, outcome: 'omitted' });

    const adaptation = adapt(submission);
    expect(adaptation.evidence?.outcome).toBe('omitted');
    expect(adaptation.qualification.status).toBe('rejected');
    if (adaptation.qualification.status === 'rejected') {
      expect(adaptation.qualification.rejectionCodes).not.toContain('SERVER_SCORING_INVALID');
    }
  });

  it('fails closed when the scoring authority was not cut against this binding version', () => {
    // The pinned scored version is the artifact cut the answer authority was
    // written for; anything else must resolve to no server item version.
    expect(SCRIPT.artifact_version).toBe('0.1.0-internal-draft');

    const submission = vectorLessonResponseSubmission(record({ itemId: 'vtr-vec-entry-check-1' }));
    const stale = {
      ...submission,
      response: { ...submission.response, bindingVersion: '0.2.0-internal-draft' },
      envelopeBindingVersion: '0.2.0-internal-draft',
      scoring: { scoringValid: false } as const,
    };

    const adaptation = adapt(stale);
    expect(adaptation.evidence).toBeNull();
    expect(adaptation.qualification.status).toBe('rejected');
    if (adaptation.qualification.status === 'rejected') {
      expect(adaptation.qualification.rejectionCodes).toContain('SERVER_SCORING_INVALID');
    }
  });

  it('produces one evidence record and zero BKT observations for all 42 items', () => {
    let evidenceRecords = 0;
    let qualified = 0;
    const rejectionCodes = new Set<string>();

    for (const authored of AUTHORED_BINDINGS) {
      const answer = VECTOR_LESSON_PROTECTED_ANSWERS[authored.item_binding_id];
      expect(answer, authored.item_binding_id).toBeDefined();
      const adaptation = adapt(
        vectorLessonResponseSubmission(
          record({ itemId: authored.item_binding_id, choiceId: answer!.correctChoiceId }),
        ),
      );

      expect(adaptation.status).toBe('adapted');
      if (adaptation.evidence !== null) evidenceRecords += 1;
      if (adaptation.qualification.status === 'qualified') qualified += 1;
      else for (const code of adaptation.qualification.rejectionCodes) rejectionCodes.add(code);
    }

    expect(evidenceRecords).toBe(AUTHORED_BINDINGS.length);
    // Every binding normalizes to instructional-only, and the runtime observes
    // no help taken, so P(L) must not move for two independent reasons.
    expect(qualified).toBe(0);
    expect([...rejectionCodes].sort()).toEqual([
      'ASSISTANCE_NOT_A0',
      'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
    ]);
  });

  it('surfaces unrecognized author keys and withheld bindings instead of dropping them', () => {
    // The real lesson loads clean, and every response says so rather than
    // saying nothing.
    expect(VECTOR_LESSON_BINDING_LOAD_ISSUES).toEqual([]);
    expect(
      vectorLessonResponseSubmission(record({ itemId: 'vtr-vec-entry-check-1' })).bindingResolution,
    ).toEqual({ status: 'parsed', unrecognizedKeys: [] });
    expect(
      vectorLessonResponseSubmission(record({ itemId: 'vtr-not-an-item' })).bindingResolution,
    ).toEqual({ status: 'absent', unrecognizedKeys: [] });

    const authored = AUTHORED_BINDINGS[0] as unknown as Record<string, unknown>;
    const load = loadAuthoredLessonBindings(
      { lessonId: SCRIPT.payload.lesson_id, artifactVersion: SCRIPT.artifact_version },
      [
        { ...authored, item_binding_id: 'recut-with-new-key', a_key_authored_tomorrow: 'value' },
        { ...authored, item_binding_id: 'recut-broken', primary_kc_id: '' },
      ],
    );

    expect(load.issues).toEqual([
      {
        itemBindingId: 'recut-with-new-key',
        status: 'parsed',
        unrecognizedKeys: ['a_key_authored_tomorrow'],
        issuePaths: [],
      },
      {
        itemBindingId: 'recut-broken',
        status: 'invalid',
        unrecognizedKeys: [],
        issuePaths: ['primaryKcId'],
      },
    ]);
    // Withheld, so the response fails closed — but visibly.
    expect(load.bindings.has('recut-broken')).toBe(false);
    expect(load.resolutionByItemBindingId.get('recut-broken')?.status).toBe('invalid');
  });

  it('resolves scoring through the binding scoring-authority ref, not the runtime item id', () => {
    const itemId = 'vtr-vec-entry-check-1';
    const submission = vectorLessonResponseSubmission(record({ itemId }));
    if (submission.binding?.measurementKind !== 'MEASURABLE')
      throw new Error('expected measurable');

    // Retargeting the ref scores against whatever that ref serves. `B` is
    // correct for the guided item and wrong for this one, so the outcome
    // follows the ref rather than the item the learner answered.
    const retargeted = LessonItemBindingSchema.parse({
      ...submission.binding,
      serverScoringAuthorityRef: 'server-only:vtr-vec-guided-practice-1:internal-draft-1',
    });
    const version = SCRIPT.artifact_version;
    expect(
      resolveVectorLessonScoring(retargeted, record({ itemId, choiceId: 'B' }), version),
    ).toMatchObject({ scoringValid: true, outcome: 'correct' });

    // A ref the authority does not serve resolves to nothing.
    const unserved = LessonItemBindingSchema.parse({
      ...submission.binding,
      serverScoringAuthorityRef: 'server-only:not-a-scored-item:internal-draft-1',
    });
    expect(resolveVectorLessonScoring(unserved, record({ itemId }), version)).toEqual({
      scoringValid: false,
    });
  });

  it('yields exactly one submission per newly committed response, and none otherwise', () => {
    const screenToken = (run: VectorLessonRun): string =>
      renderVectorLessonRun(run).screen.screenToken;

    const run = createVectorLessonRun({ now: NOW });
    const answered = applyVectorLessonAction(
      run,
      {
        runId: run.runId,
        screenToken: screenToken(run),
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
      },
      NOW,
    );

    const submissions = vectorLessonResponseSubmissions(run, answered);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]?.response.itemBindingId).toBe(run.currentItemId);
    expect(vectorLessonResponseSubmissions(answered, answered)).toEqual([]);

    const continued = applyVectorLessonAction(
      answered,
      { runId: answered.runId, screenToken: screenToken(answered), action: { type: 'CONTINUE' } },
      NOW,
    );
    expect(vectorLessonResponseSubmissions(answered, continued)).toEqual([]);
  });
});
