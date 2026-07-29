import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, fixedClock, type Clock } from '@mcat/contracts';
import { Authority } from './authority';
import type { LearnerState } from './types';

/**
 * WS0 — diagnose-before-reveal capture (docs/master-build-spec.md).
 *
 * The prerequisite for calibration (WS1) and the Mistakes upgrade (WS3): every
 * practice/study attempt now carries its response time and answer-change count.
 * Three gaps this pins closed —
 *
 *  - the in-process attempt event hardcoded `elapsedMs = 0`,
 *  - adaptive practice emitted no attempt event at all, so a practice answer's
 *    timing reached nothing,
 *  - `attempt_results` had nowhere to store either.
 *
 * CAPTURE ONLY: it writes no extra mastery and adds no prompt. Absent timing is
 * stored as NULL, not a false `0`, so WS1's "fast" band can tell "not captured"
 * apart from "instant".
 */

const CLOCK = fixedClock('2026-07-27T12:00:00.000Z');
const SPEC_ID = 'sci:bb1-enzyme-inhibition:EXPLAIN:train';

function learner(clock: Clock = CLOCK): { authority: Authority; state: LearnerState } {
  const authority = new Authority(undefined, clock);
  return { authority, state: authority.createGuest() };
}

/** Serve-then-answer through the port, standing in for the queue (see mistakes.test.ts). */
async function answerAdaptive(
  authority: Authority,
  state: LearnerState,
  questionId: string,
  cmd: { chosenChoiceId: 'A' | 'B'; elapsedMs?: number; answerChanges?: number },
): Promise<void> {
  await authority.practiceBank.issueAttemptGrant(state.learnerId, {
    questionId,
    specId: SPEC_ID,
    contentRelease: authority.bank.contentRelease,
    expiresAt: UtcTimestampSchema.parse('2099-01-01T00:00:00.000Z'),
  });
  await authority.submitPracticeAttempt(state, { questionId, specId: SPEC_ID, ...cmd });
}

/** Drive the real Study loop to its first question and answer it with timing. */
async function studyAnswer(
  authority: Authority,
  state: LearnerState,
  choice: string,
  timing?: { elapsedMs: number; answerChanges: number },
): Promise<string> {
  let next = authority.diagnosticNext(state);
  while (!next.done) {
    authority.submitDiagnosticAnswer(state, next.questionId!, 'A');
    next = authority.diagnosticNext(state);
  }
  authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
  authority.continueStep(state);
  const step = authority.getSession(state);
  expect(step.kind).toBe('question');
  await authority.submitAttempt(state, choice, timing);
  return (step as { question: { id: string } }).question.id;
}

const attemptPayloads = (state: LearnerState, questionId?: string) =>
  state.events
    .filter((e) => e.type === 'attempt_submitted')
    .map((e) => e.payload as { questionId: string; elapsedMs: number; answerChanges: number })
    .filter((p) => questionId === undefined || p.questionId === questionId);

const bktCount = (state: LearnerState) =>
  state.events.filter((e) => e.type === 'bkt_observation_applied').length;

describe('WS0 — adaptive practice captures response time + answer-changes', () => {
  it('persists real elapsed_ms/answer_changes on the attempt log', async () => {
    const { authority, state } = learner();
    await answerAdaptive(authority, state, 'q-enz-indep-competitive', {
      chosenChoiceId: 'B',
      elapsedMs: 8_400,
      answerChanges: 2,
    });

    const attempts = await authority.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: 10,
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.elapsedMs).toBe(8_400);
    expect(attempts[0]!.answerChanges).toBe(2);
  });

  it('emits an attempt_submitted event carrying the timing (it used to emit none)', async () => {
    const { authority, state } = learner();
    await answerAdaptive(authority, state, 'q-enz-indep-competitive', {
      chosenChoiceId: 'B',
      elapsedMs: 8_400,
      answerChanges: 2,
    });

    const payloads = attemptPayloads(state, 'q-enz-indep-competitive');
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.elapsedMs).toBe(8_400);
    expect(payloads[0]!.answerChanges).toBe(2);
  });

  it('stores absent timing as NULL, not a false zero', async () => {
    const { authority, state } = learner();
    // A caller that measured nothing (a non-UI path): no elapsedMs/answerChanges.
    await answerAdaptive(authority, state, 'q-enz-indep-competitive', { chosenChoiceId: 'B' });

    const attempts = await authority.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: 10,
    });
    expect(attempts[0]!.elapsedMs).toBeNull();
    expect(attempts[0]!.answerChanges).toBeNull();
    // The event still carries the schema's non-nullable `0` — the log's NULL is
    // the "not captured" signal WS1 reads, and the two are deliberately distinct.
    expect(attemptPayloads(state, 'q-enz-indep-competitive')[0]!.elapsedMs).toBe(0);
  });

  it('adds no mastery write: the attempt event is not a ledger record', async () => {
    const { authority, state } = learner();
    await answerAdaptive(authority, state, 'q-enz-indep-competitive', {
      chosenChoiceId: 'A',
      elapsedMs: 1_000,
      answerChanges: 0,
    });

    // Exactly one capability write on a first attempt — the pre-existing BKT
    // ledger record — and the new attempt event sits beside it, not among it.
    expect(bktCount(state)).toBe(1);
    expect(attemptPayloads(state)).toHaveLength(1);
  });
});

describe('WS0 — Study captures timing before the reveal, with no added prompt', () => {
  it('logs the study attempt with the pre-reveal timing', async () => {
    const { authority, state } = learner();
    const questionId = await studyAnswer(authority, state, 'B', {
      elapsedMs: 5_000,
      answerChanges: 1,
    });

    const attempts = await authority.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: 50,
    });
    const study = attempts.find((a) => a.activityType === 'study');
    expect(study).toBeDefined();
    expect(study!.questionId).toBe(questionId);
    expect(study!.elapsedMs).toBe(5_000);
    expect(study!.answerChanges).toBe(1);
  });

  it('carries the timing on the study attempt event too', async () => {
    const { authority, state } = learner();
    const questionId = await studyAnswer(authority, state, 'B', {
      elapsedMs: 5_000,
      answerChanges: 1,
    });

    const payloads = attemptPayloads(state, questionId);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.elapsedMs).toBe(5_000);
    expect(payloads[0]!.answerChanges).toBe(1);
  });
});
