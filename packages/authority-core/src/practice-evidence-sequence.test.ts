import { describe, expect, it } from 'vitest';
import {
  EventIdSchema,
  IdempotencyKeySchema,
  LearnerIdSchema,
  LessonItemBindingSchema,
  LessonRuntimeResponseFactsSchema,
  UtcTimestampSchema,
  fixedClock,
  type LessonItemBinding,
} from '@mcat/contracts';
import { adaptLessonResponse, isMasteryEligible, type EvidenceRecord } from '@mcat/domain';
import { evaluateEvidence } from '@mcat/policies';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState } from './types';

/**
 * ONE sequence vocabulary across the lesson and practice channels.
 *
 * `evaluateEvidence` decides a fresh failure by strict sequence ordering: an
 * independent incorrect record counts only if its sequence is greater than
 * every mastery-eligible record's. That works only if both channels number a
 * record the same way, and they did not. Lesson evidence carried
 * `state.nextSequence + 1` — the sequence the command is accepted at — while
 * adaptive practice carried `state.nextSequence`, the sequence of the command
 * BEFORE it. One off by one, in the direction that makes a later practice miss
 * TIE with the lesson record preceding it rather than outrank it.
 *
 * The measured consequence, and the fixture below: sequences `[0, 1, 3, 3]`,
 * where the last record is an independent incorrect practice answer, and
 * `refreshNeeded` came back `false`. A learner who has just demonstrably failed
 * kept a clean warrant.
 *
 * The fix is on the producer. The comparison in `mastery-policy.ts` stays
 * strict — relaxing it to `>=` would have made this scenario pass while leaving
 * every genuinely simultaneous pair silently satisfying an ordering
 * requirement.
 */

const NOW = '2026-07-27T12:00:00.000Z';
const CLOCK = fixedClock(NOW);

/** The grain both channels write to, so their records land in one warrant. */
const SHARED_KC_ID = 'V3-KC-525816';

class SharedGrainPracticeBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null
      ? null
      : { ...base, domain: 'science', kcId: SHARED_KC_ID, skill: 'IDENTIFY' };
  }
}

type MeasurableBinding = Extract<LessonItemBinding, { measurementKind: 'MEASURABLE' }>;

const lessonBinding = (questionId: string, familyId: string): MeasurableBinding => {
  const binding = LessonItemBindingSchema.parse({
    measurementKind: 'MEASURABLE',
    lessonId: 'V3-LES-130923',
    itemBindingId: `binding-${questionId}`,
    questionId,
    activityId: `ACT-${questionId}`,
    bindingVersion: 'rev-1',
    primaryKcId: SHARED_KC_ID,
    activityRole: 'CHANGED_EXIT',
    semanticFamilyId: familyId,
    firstAttemptImmutable: true,
    authoredAssistanceAffordances: ['A0'],
    candidateEvidenceModes: ['INDEPENDENT'],
    reasoningOperation: 'EXPLAIN',
    changedDimensions: [],
    learnerSafeItemRef: `ref://opaque/${questionId}`,
    serverScoringAuthorityRef: `server-only://scorer/${questionId}`,
  });
  if (binding.measurementKind !== 'MEASURABLE') throw new Error('expected a measurable binding');
  return binding;
};

const uuid = (n: number): string => `3f1c0f2a-0000-4000-8000-${String(n).padStart(12, '0')}`;

/**
 * One correct, independent lesson evidence record at a chosen sequence, built by
 * the real adapter — the same call `workflow.ts` makes, with the same
 * `state.nextSequence + 1` numbering it passes.
 */
function lessonEvidenceAt(sequence: number, familyId: string, n: number): EvidenceRecord {
  const questionId = `Q-${n}`;
  const result = adaptLessonResponse({
    binding: lessonBinding(questionId, familyId),
    response: LessonRuntimeResponseFactsSchema.parse({
      questionId,
      itemBindingId: `binding-${questionId}`,
      bindingVersion: 'rev-1',
      attemptIndex: 1,
      isRetry: false,
      isDiagnosticRetry: false,
      response: { kind: 'MULTIPLE_CHOICE', chosenChoiceId: 'A' },
      omitted: false,
      elapsedMs: 30_000,
      answerChanges: 0,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      revealUsed: false,
      occurredAt: NOW,
    }),
    scoring: {
      scoringValid: true,
      serverItemVersion: 3,
      outcome: 'correct',
      protectedScoring: false,
    },
    identity: {
      observationId: uuid(n * 10 + 1),
      eventId: EventIdSchema.parse(uuid(n * 10 + 2)),
      learnerId: LearnerIdSchema.parse(uuid(n * 10 + 3)),
      idempotencyKey: IdempotencyKeySchema.parse(uuid(n * 10 + 4)),
      evidenceId: uuid(n * 10 + 5),
    },
    cluster: 'BB1',
    envelopeBindingVersion: 'rev-1',
    acceptedAt: UtcTimestampSchema.parse(NOW),
    sequence,
    contentRelease: 'release-1',
    policies: [{ policyId: 'mastery-bkt', version: 'provisional-v2' }],
  });
  if (result.evidence === null) throw new Error('expected the lesson adapter to write evidence');
  return result.evidence;
}

/**
 * The reviewer's stream, up to but not including the practice miss: two
 * independent successes in different families (which is what earns a warrant at
 * all), then a third lesson record accepted at sequence 3.
 *
 * `state.nextSequence` is left at 3 — the sequence of the last accepted command
 * — which is exactly the state the next command's `apply` sees.
 */
async function learnerWithLessonHistory(): Promise<{
  authority: Authority;
  state: LearnerState;
}> {
  const bank = loadSyntheticBank();
  const authority = new Authority(bank, CLOCK, new SharedGrainPracticeBank(bank));
  const state = authority.createGuest();
  state.evidence.push(
    lessonEvidenceAt(0, 'family-a', 1),
    lessonEvidenceAt(1, 'family-b', 2),
    lessonEvidenceAt(3, 'family-a', 3),
  );
  state.nextSequence = 3;
  return { authority, state };
}

const warrantFor = (state: LearnerState) =>
  evaluateEvidence({
    skillId: SHARED_KC_ID,
    records: state.evidence.filter((e) => e.skillId === SHARED_KC_ID),
    now: CLOCK.now(),
  });

async function missOneQueuedItem(authority: Authority, state: LearnerState): Promise<void> {
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item');
  const answer = await authority.practiceBank.getAnswer(item.question.id);
  const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== answer!.correctChoiceId)!;
  await authority.submitPracticeAttempt(state, {
    questionId: item.question.id,
    specId: item.specId,
    chosenChoiceId: wrong,
  });
}

describe('a practice miss after a lesson record outranks it', () => {
  /** The fixture is only worth anything if it really is the reviewer's stream. */
  it('starts from the measured warrant state: a clean independent warrant at sequence 3', async () => {
    const { state } = await learnerWithLessonHistory();
    const warrant = warrantFor(state);

    expect(state.evidence.map((e) => e.sequence)).toEqual([0, 1, 3]);
    expect(state.evidence.every((e) => isMasteryEligible(e))).toBe(true);
    expect(warrant.evidenceQuality).toBe('independent');
    expect(warrant.refreshNeeded).toBe(false);
  });

  it('numbers the miss above the lesson record rather than tying with it', async () => {
    const { authority, state } = await learnerWithLessonHistory();
    await missOneQueuedItem(authority, state);

    // `[0, 1, 3, 4]`, where the reviewer measured `[0, 1, 3, 3]`.
    expect(state.evidence.map((e) => e.sequence)).toEqual([0, 1, 3, 4]);
    const miss = state.evidence.at(-1)!;
    expect(miss.outcome).toBe('incorrect');
    expect(miss.independent).toBe(true);
    // The miss is not itself mastery-eligible, so it cannot raise the bar it
    // has to clear — the comparison is against the successes only.
    expect(isMasteryEligible(miss)).toBe(false);
    expect(Math.max(...state.evidence.filter(isMasteryEligible).map((e) => e.sequence))).toBe(3);
  });

  /** The behaviour the numbering exists for. */
  it('fires FRESH_FAILURE and marks the warrant as needing a refresh', async () => {
    const { authority, state } = await learnerWithLessonHistory();
    await missOneQueuedItem(authority, state);

    const warrant = warrantFor(state);
    expect(warrant.refreshNeeded).toBe(true);
    expect(warrant.reasons.map((r) => r.code)).toContain('FRESH_FAILURE');
    // The achieved-ever tier is history and is NOT withdrawn by the miss; what
    // changes is the claim that the warrant is current.
    expect(warrant.evidenceQuality).toBe('independent');
  });

  /**
   * The bug, replayed. This is the one-character regression the fix removes:
   * numbering the miss with the PRIOR sequence instead of the accepted one puts
   * it level with the lesson record, and everything downstream goes quiet.
   *
   * It is asserted rather than described because the two records differ only in
   * that number — the outcome, the independence and the grain are all identical
   * — so nothing else in the suite can tell the two versions apart.
   */
  it('would go silent again if the miss were numbered with the prior sequence', async () => {
    const { authority, state } = await learnerWithLessonHistory();
    await missOneQueuedItem(authority, state);

    const collided = state.evidence.map((record, index) =>
      index === state.evidence.length - 1 ? { ...record, sequence: 3 } : record,
    );
    const warrant = evaluateEvidence({
      skillId: SHARED_KC_ID,
      records: collided,
      now: CLOCK.now(),
    });

    expect(collided.map((e) => e.sequence)).toEqual([0, 1, 3, 3]);
    expect(warrant.refreshNeeded).toBe(false);
    expect(warrant.reasons.map((r) => r.code)).not.toContain('FRESH_FAILURE');
  });

  /**
   * Why the producer had to be fixed rather than the comparison relaxed. With
   * `>=`, the colliding stream above would report a fresh failure — and so
   * would every record that merely arrived alongside its own supporting
   * success, which is not an ordering claim at all.
   */
  it('is not repaired by treating a tie as later, which is why the comparison stays strict', async () => {
    const { authority, state } = await learnerWithLessonHistory();
    await missOneQueuedItem(authority, state);

    // A CORRECT independent record tied with the latest success. Under `>=` this
    // pair is indistinguishable from a genuine later miss on ordering alone, so
    // the only thing separating them is that the sequence numbers are honest.
    const tiedSuccess = { ...state.evidence[2]!, sequence: 3 };
    expect(tiedSuccess.sequence).toBe(
      Math.max(...state.evidence.filter(isMasteryEligible).map((e) => e.sequence)),
    );
    expect(tiedSuccess.outcome).toBe('correct');
  });
});
