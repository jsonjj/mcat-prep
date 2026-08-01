import { readFileSync } from 'node:fs';
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

interface AuthoredBindingEntry {
  readonly item_binding_id: string;
  readonly server_answer_authority_ref: string;
  readonly assistance_state: string;
  readonly [key: string]: unknown;
}
interface VendoredLessonScript {
  readonly artifact_version: string;
  readonly content_sha256: string;
  readonly payload: {
    readonly lesson_id: string;
    readonly question_evidence_plan: readonly AuthoredBindingEntry[];
  };
}
// L1's authored script, read from the vendored copy (Phase 7-4) rather than a
// generator — the same bytes the runtime now scores against.
const SCRIPT = JSON.parse(
  readFileSync(
    new URL('../../../../content/lessons/v3-les-130923/lesson-script.json', import.meta.url),
    'utf8',
  ),
) as VendoredLessonScript;
const AUTHORED_BINDINGS = SCRIPT.payload.question_evidence_plan;

/**
 * One committed response, with an EMPTY delivery ledger by default: no scaffold
 * on screen, no cue offered, no cue taken, no reveal. That is a genuine
 * unassisted administration, and it is the default here so that any test
 * asserting an assisted level has to say what help was displayed.
 *
 * There is no `assistanceState` to set. The record type does not have one.
 */
function record(
  overrides: Partial<VectorLessonResponseRecord> & Pick<VectorLessonResponseRecord, 'itemId'>,
): VectorLessonResponseRecord {
  return {
    responseId: `response-${overrides.itemId}`,
    itemVersion: 'internal-draft-1',
    itemFamilyId: `fam-${overrides.itemId}`,
    kcId: 'V3-KC-866848',
    activityRole: 'ENTRY_CHECK',
    observedScaffoldDisplayed: false,
    observedSupportOffered: false,
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

  it('derives the assistance level from the delivery ledger and from nothing else', () => {
    // The defect this asserts against: `assistance_state` is authoring metadata
    // describing help the design OFFERS, and it used to be emitted as the
    // learner's assistance TAKEN. That handed the author `independent` and,
    // through ASSISTANCE_NOT_A0, P(L).
    //
    // The corpus spans three authored levels, so an authored input would show up
    // as three different emitted levels below.
    const authoredLevels = new Set(AUTHORED_BINDINGS.map((b) => b.assistance_state));
    expect([...authoredLevels].sort()).toEqual(['A0', 'A1', 'A2']);

    // ONE delivery ledger, every item in the lesson. If any authored field
    // reached the level, these 42 answers could not all be equal.
    for (const ledger of [
      { observedScaffoldDisplayed: false, observedSupportRequested: false, level: 'A0' },
      { observedScaffoldDisplayed: false, observedSupportRequested: true, level: 'A1' },
      { observedScaffoldDisplayed: true, observedSupportRequested: false, level: 'A2' },
      // Both displayed: the standing scaffold is the greater help, and the cue is
      // not forgotten — it lands on `contentBearingHintUsed`, asserted below.
      { observedScaffoldDisplayed: true, observedSupportRequested: true, level: 'A2' },
    ] as const) {
      const emitted = new Set(
        AUTHORED_BINDINGS.map(
          (authored) =>
            vectorLessonResponseSubmission(
              record({
                itemId: authored.item_binding_id,
                observedScaffoldDisplayed: ledger.observedScaffoldDisplayed,
                // An OFFER never raises the level; only what was taken does.
                observedSupportOffered: true,
                observedSupportRequested: ledger.observedSupportRequested,
              }),
            ).response.assistanceLevel,
        ),
      );
      expect([...emitted], JSON.stringify(ledger)).toEqual([ledger.level]);
    }
  });

  it('does not reproduce the authored byte, and diverges from it where delivery does', () => {
    // The corpus is arranged so that the authored value and the delivered support
    // AGREE on 36 of the 42 items, which means "the level equals the authored
    // byte" would pass most of a lesson walk. The six A1 items are where the two
    // part company: an A1 screen carries the standing scaffold as well as
    // offering the cue, so the support actually displayed is A2-class. If this
    // ever went back to copying the byte, these six would read A1.
    const authoredA1 = AUTHORED_BINDINGS.filter((a) => a.assistance_state === 'A1');
    expect(authoredA1).toHaveLength(6);

    for (const authored of authoredA1) {
      expect(
        vectorLessonResponseSubmission(
          record({
            itemId: authored.item_binding_id,
            observedScaffoldDisplayed: true,
            observedSupportOffered: true,
          }),
        ).response.assistanceLevel,
        authored.item_binding_id,
      ).toBe('A2');
    }
  });

  it('leaves no authored assistance value on the record for a later reader to pick up', () => {
    // Fail-open 6 was a guard defeated by reading AROUND it: the adapter already
    // rewrote authored `A0`-`A3` bytes so they could not be parsed back into an
    // AssistanceLevel, and the runtime record carried the same byte untagged one
    // field over. So the assertion is not "the level is derived correctly" — it
    // is that there is no bare level string anywhere on the record to derive it
    // from, under any field name a future writer might choose.
    const token = (value: VectorLessonRun) => renderVectorLessonRun(value).screen.screenToken;
    let run = createVectorLessonRun({ now: NOW });
    run = applyVectorLessonAction(
      run,
      {
        runId: run.runId,
        screenToken: token(run),
        action: { type: 'SUBMIT_RESPONSE', choiceId: 'A' },
      },
      NOW,
    );

    const committed = Object.values(run.committedResponses);
    expect(committed).toHaveLength(1);
    for (const [key, value] of Object.entries(committed[0]!)) {
      expect(
        ['A0', 'A1', 'A2', 'A3'].includes(String(value)),
        `The committed response carries a bare AssistanceLevel in "${key}". A level-shaped ` +
          'string on this record is what fail-open 6 read; the record must carry only what the ' +
          'runtime observed about its own delivery.',
      ).toBe(false);
    }
  });

  it('records A0 for a terminal changed-task check completed with no help taken', () => {
    // The gate this task exists to open: a CHANGED_EXIT check administered with
    // an empty delivery ledger is an independent administration, and the record
    // says so. Driven through the REAL runtime, not a fixture, so what the
    // learner was shown and what the record claims are the same fact.
    const token = (value: VectorLessonRun) => renderVectorLessonRun(value).screen.screenToken;
    let run = createVectorLessonRun({ now: NOW });
    while (run.currentItemId !== 'vtr-vec-changed-exit-initial') {
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

    // The screen really carries no help: no scaffold, and no cue to ask for.
    const screen = renderVectorLessonRun(run).screen as Record<string, unknown>;
    expect(screen).toMatchObject({ kind: 'QUESTION', visual: null, supportActionLabel: null });
    expect(() =>
      applyVectorLessonAction(
        run,
        { runId: run.runId, screenToken: token(run), action: { type: 'REQUEST_SUPPORT' } },
        NOW,
      ),
    ).toThrow(/not authorized/i);

    const answered = applyVectorLessonAction(
      run,
      {
        runId: run.runId,
        screenToken: token(run),
        action: {
          type: 'SUBMIT_RESPONSE',
          choiceId:
            VECTOR_LESSON_PROTECTED_ANSWERS['vtr-vec-changed-exit-initial']!.correctChoiceId,
        },
      },
      NOW,
    );

    const [submission] = vectorLessonResponseSubmissions(run, answered);
    expect(submission?.response.assistanceLevel).toBe('A0');
    expect(submission?.response.contentBearingHintUsed).toBe(false);
    expect(submission?.response.revealUsed).toBe(false);
    expect(submission?.assistanceObserved).toBe(true);
    expect(submission?.binding?.activityRole).toBe('CHANGED_EXIT');

    // The administration is independent, and since `e579779` licensed this
    // binding it now moves P(L) too. Both blockers this test was written to
    // record are gone: `80ac186` removed the assistance one by observing the
    // help the screen carried, and `e579779` removed the declaration one.
    const adaptation = adapt(submission!);
    expect(adaptation.evidence?.independent).toBe(true);
    expect(adaptation.evidence?.assistanceLevel).toBe('A0');
    expect(adaptation.qualification.status).toBe('qualified');
    // `transfer`, not `independent`: the binding declares `TRANSFER`, and the
    // resolved kind is what BKT and the evidence record both read. That
    // distinction is the whole lesson-only mastery boundary — see
    // `tests/architecture/lesson-mastery-reachability.test.ts`.
    expect(adaptation.evidence?.kind).toBe('transfer');
  });

  it('qualifies an unassisted terminal check once its binding is declared eligible', () => {
    // The reviewer's P3b, now the other way round. Declaring an eligible mode and
    // labelling the operation — the two edits §6 permits — used to change nothing,
    // because the runtime marked every administration maximally assisted. It now
    // qualifies exactly the administrations that were genuinely unassisted, and
    // still refuses the assisted ones on assistance grounds.
    const qualified: string[] = [];
    const refusedOnAssistance: string[] = [];

    for (const authored of AUTHORED_BINDINGS) {
      const answer = VECTOR_LESSON_PROTECTED_ANSWERS[authored.item_binding_id]!;
      // The delivery ledger the real runtime produces for this item: a scaffold
      // whenever the design puts one on the screen, and no cue taken.
      const submission = vectorLessonResponseSubmission(
        record({
          itemId: authored.item_binding_id,
          observedScaffoldDisplayed: authored.assistance_state !== 'A0',
          observedSupportOffered: ['A1', 'A2'].includes(authored.assistance_state),
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
        qualified.push(authored.item_binding_id);
      } else if (adaptation.qualification.rejectionCodes.includes('ASSISTANCE_NOT_A0')) {
        refusedOnAssistance.push(authored.item_binding_id);
      }
    }

    // 30 unscaffolded administrations qualify, 12 scaffolded ones do not. Was
    // 0 and 42.
    expect(qualified).toHaveLength(30);
    expect(refusedOnAssistance).toHaveLength(12);
    expect(qualified).toContain('vtr-vec-changed-exit-initial');
    expect(refusedOnAssistance).toContain('vtr-vec-guided-practice-1');
  });

  it('reports a content-bearing hint from the released cue, not from the offer', () => {
    // A cue that was offered and taken.
    expect(
      vectorLessonResponseSubmission(
        record({
          itemId: 'vtr-vec-guided-practice-1',
          observedScaffoldDisplayed: true,
          observedSupportOffered: true,
          observedSupportRequested: true,
        }),
      ).response.contentBearingHintUsed,
    ).toBe(true);

    // The same offer, declined.
    expect(
      vectorLessonResponseSubmission(
        record({
          itemId: 'vtr-vec-guided-practice-1',
          observedScaffoldDisplayed: true,
          observedSupportOffered: true,
          observedSupportRequested: false,
        }),
      ).response.contentBearingHintUsed,
    ).toBe(false);
  });

  it('marks a record that predates the delivery ledger unobserved, not maximally assisted', () => {
    const legacy = record({ itemId: 'vtr-vec-entry-check-1' }) as unknown as Record<
      string,
      unknown
    >;
    delete legacy.observedScaffoldDisplayed;
    delete legacy.observedSupportRequested;
    delete legacy.observedAnswerRevealed;

    const submission = vectorLessonResponseSubmission(
      legacy as unknown as VectorLessonResponseRecord,
    );
    expect(submission.response.contentBearingHintUsed).toBe(true);
    expect(submission.response.revealUsed).toBe(true);

    // Fails closed for qualification — A3 can never satisfy ASSISTANCE_NOT_A0 —
    // while staying distinguishable from a measured level.
    expect(submission.response.assistanceLevel).toBe('A3');
    expect(submission.assistanceObserved).toBe(false);
    expect(adapt(submission).qualification).toMatchObject({ status: 'rejected' });
  });

  it('never emits A3 for an administration it did observe, so A3 means only "unobserved"', () => {
    // What keeps the borrowed fail-closed value from collapsing the two facts
    // again: this runtime has no mechanism that displays a worked solution path
    // beside a scored item, so A3 is not a level it can measure.
    for (const scaffold of [false, true]) {
      for (const requested of [false, true]) {
        for (const offered of [false, true]) {
          const submission = vectorLessonResponseSubmission(
            record({
              itemId: 'vtr-vec-guided-practice-1',
              observedScaffoldDisplayed: scaffold,
              observedSupportOffered: offered,
              observedSupportRequested: requested,
            }),
          );
          expect(submission.assistanceObserved).toBe(true);
          expect(
            submission.response.assistanceLevel,
            `observed (scaffold ${scaffold}, offered ${offered}, requested ${requested}) emitted A3`,
          ).not.toBe('A3');
        }
      }
    }
  });

  it('records the scaffold and the hint the real runtime actually put on the screen', () => {
    // Driven through the runtime rather than a fixture, so the observation is
    // proved to survive `commitResponse` before `enterFeedback` closes the ledger.
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
    expect(submission?.response.assistanceLevel).toBe('A2');
    expect(submission?.assistanceObserved).toBe(true);
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

  it('produces one evidence record for all 42 items and BKT observations for exactly the 6 licensed', () => {
    let evidenceRecords = 0;
    let independent = 0;
    const qualifiedIds: string[] = [];
    const rejectionCodes = new Set<string>();

    for (const authored of AUTHORED_BINDINGS) {
      const answer = VECTOR_LESSON_PROTECTED_ANSWERS[authored.item_binding_id];
      expect(answer, authored.item_binding_id).toBeDefined();
      const adaptation = adapt(
        vectorLessonResponseSubmission(
          record({
            itemId: authored.item_binding_id,
            choiceId: answer!.correctChoiceId,
            // The ledger the real runtime produces for this item, with no cue taken.
            observedScaffoldDisplayed: authored.assistance_state !== 'A0',
            observedSupportOffered: ['A1', 'A2'].includes(authored.assistance_state),
          }),
        ),
      );

      expect(adaptation.status).toBe('adapted');
      if (adaptation.evidence !== null) evidenceRecords += 1;
      if (adaptation.evidence?.independent === true) independent += 1;
      if (adaptation.qualification.status === 'qualified') {
        qualifiedIds.push(authored.item_binding_id);
      } else for (const code of adaptation.qualification.rejectionCodes) rejectionCodes.add(code);
    }

    expect(evidenceRecords).toBe(AUTHORED_BINDINGS.length);
    // 30 of the 42 are genuinely independent administrations, up from 0 — and
    // every one of the 12 fabricated `independent: true` records that
    // fail-open 6 produced is still absent, because none of these came from an
    // authored byte.
    expect(independent).toBe(30);
    // Exactly 6, up from 0: the `CHANGED_EXIT` pairs `e579779` licensed, one
    // `initial` and one `reentry` per KC. Named rather than counted, because a
    // count would pass just as well if the wrong six had been licensed, and
    // held exact in both directions — a floor would tolerate a silent slide
    // back toward zero, which is what the original `toBe(0)` guarded against
    // from the other side.
    expect(qualifiedIds.sort()).toEqual([
      'vtr-dir-changed-exit-initial',
      'vtr-dir-changed-exit-reentry',
      'vtr-trig-changed-exit-initial',
      'vtr-trig-changed-exit-reentry',
      'vtr-vec-changed-exit-initial',
      'vtr-vec-changed-exit-reentry',
    ]);
    // The other 36 still refuse, and for the same two reasons as before: 12
    // scaffolded administrations on assistance, the rest on the legacy
    // instructional-only label `NEAR_EXIT` and every non-terminal role keep.
    expect([...rejectionCodes].sort()).toEqual([
      'ASSISTANCE_NOT_A0',
      'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED',
    ]);
  });

  it('measures a whole lesson walked with no help taken', () => {
    // The end-to-end number this task is judged on, taken through the real
    // runtime rather than a fixture. The 18 committed responses of a clean walk
    // are the same 18 fail-open 6 measured, so the two figures are directly
    // comparable:
    //
    //   before: 18 × A3, 0 independent, 18 × ASSISTANCE_NOT_A0 — and 12 of the
    //           18 records carried `independent: true` FABRICATED from the
    //           authored byte before `9fcaea3` closed it.
    //   after:  12 × A0 and 6 × A2, all 18 observed, 12 independent — the same
    //           count as the fabricated one, and that is the point: the honest
    //           answer for this artifact was always 12. What changed is what the
    //           number is a function of. It is now the support the runtime put on
    //           the screen, re-derivable from the definition at restore, with the
    //           authored field deleted from the record rather than merely unread.
    const token = (value: VectorLessonRun) => renderVectorLessonRun(value).screen.screenToken;
    let run = createVectorLessonRun({ now: NOW });
    const submissions: ReturnType<typeof vectorLessonResponseSubmission>[] = [];

    for (let guard = 0; guard < 400 && run.status === 'IN_PROGRESS'; guard += 1) {
      const before = run;
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
      submissions.push(...vectorLessonResponseSubmissions(before, run));
    }

    // A clean walk really did finish the lesson, or the counts below are partial.
    expect(run.status).toBe('DELIVERY_COMPLETE');
    expect(submissions).toHaveLength(18);

    const levels = submissions.map((submission) => submission.response.assistanceLevel);
    expect(levels.filter((level) => level === 'A0')).toHaveLength(12);
    expect(levels.filter((level) => level === 'A2')).toHaveLength(6);
    // No response fell back to the unobserved level, so the fail-close is now
    // genuinely reserved for the case where the runtime cannot see.
    expect(levels.filter((level) => level === 'A3')).toHaveLength(0);
    expect(submissions.every((submission) => submission.assistanceObserved)).toBe(true);

    const adaptations = submissions.map(adapt);
    expect(adaptations.filter((a) => a.evidence?.independent === true)).toHaveLength(12);
    // THREE, not six. Six bindings are licensed, but a clean walk administers
    // only the `initial` half of each pair: the `reentry` exit is reachable
    // solely through the repair path, which a learner who answers correctly
    // never enters. That asymmetry is the reachability finding this number
    // belongs to — see `tests/architecture/lesson-mastery-reachability.test.ts`.
    expect(
      adaptations
        .filter((a) => a.qualification.status === 'qualified')
        .map((a) => a.evidence?.questionId)
        .sort(),
    ).toEqual([
      'vtr-dir-changed-exit-initial',
      'vtr-trig-changed-exit-initial',
      'vtr-vec-changed-exit-initial',
    ]);
    const codes = adaptations.flatMap((a) =>
      a.qualification.status === 'rejected' ? [...a.qualification.rejectionCodes] : [],
    );
    // 18 committed responses less the 3 that now qualify.
    expect(codes.filter((code) => code === 'INDEPENDENT_EVIDENCE_MODE_NOT_DECLARED')).toHaveLength(
      15,
    );
    expect(codes.filter((code) => code === 'ASSISTANCE_NOT_A0')).toHaveLength(6);
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
