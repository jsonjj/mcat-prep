import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, fixedClock, type Clock } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { PRIOR_PL0 } from '@mcat/policies';
import { Authority, PracticeAttemptNotAuthorizedError } from './authority';
import {
  SyntheticPracticeBankPort,
  type PracticeExposure,
  type PracticeItemClassification,
} from './practice';
import type { LearnerState } from './types';

/**
 * WHO may answer an adaptive-practice item.
 *
 * The defect: `PracticeAttemptCommand.specId` was parsed by the route and then
 * never read by `submitPracticeAttempt`. Nothing else on the request said where
 * the item came from either, so a caller who never asked for a queue could name
 * any corpus question, invent a spec, and receive an independent evidence
 * record and a BKT write. Every server-side decision about what a learner
 * should be practising — teach-before-test, the per-KC taught-set gate,
 * selection itself — lives inside `getPracticeQueue`, so "answer without
 * queueing" was a way past all of them at once. A field the server merely reads
 * is not a gate.
 *
 * The fix is a `PracticeAttemptGrant`: the server's own record, written when it
 * serves an item, of which learner may answer which question under which spec
 * and content release, expiring, and spendable once as a capability claim.
 *
 * What this file does NOT re-litigate: `firstAttempt` is still derived from the
 * exposure records, and exposure is still written on the ANSWER. Those belong
 * to `practice-gating.test.ts` and `practice-exposure-timing.test.ts`, and the
 * last case here checks that issuing a grant did not quietly become a
 * serve-time exposure, which is the one way this change could have broken them.
 */

const NOW = '2026-07-27T12:00:00.000Z';
const CLOCK = fixedClock(NOW);

/**
 * The synthetic bank holds at most one item per KC; routing every item to one
 * grain is how a second answer against the same grain becomes observable.
 */
const FIXED_KC_ID = 'V3-KC-525816';

class FixedGrainPracticeBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null
      ? null
      : { ...base, domain: 'science', kcId: FIXED_KC_ID, skill: 'IDENTIFY' };
  }
}

/** Counts exposure writes without moving when they happen. */
class CountingExposureBank extends FixedGrainPracticeBank {
  public exposureWrites = 0;

  override async recordExposure(
    learnerId: string,
    questionId: string,
    now: ReturnType<Clock['now']>,
  ): Promise<PracticeExposure> {
    this.exposureWrites += 1;
    return super.recordExposure(learnerId, questionId, now);
  }
}

/**
 * Teach every KC the bank can serve, so teach-before-test admits this learner.
 *
 * The queue is gated per-KC on `state.taughtKcIds` — the union of completed
 * lessons' KCs — and that gate fails closed on an EMPTY taught set as well as on
 * a miss, so a guest who has completed no lesson is served no science material
 * and therefore holds no grant. This file is about the GRANT, so its learners
 * have to be past the gate; the untaught learner below is constructed
 * deliberately, and stays untaught.
 */
async function teachTheWholeBank(authority: Authority, state: LearnerState): Promise<void> {
  const units = await authority.practiceBank.listUnits({ limit: 400 });
  state.taughtKcIds = [...new Set(units.map((u) => u.kcId))];
}

async function learnerWith<T extends SyntheticPracticeBankPort>(
  make: (bank: ReturnType<typeof loadSyntheticBank>) => T,
  clock: Clock = CLOCK,
): Promise<{ authority: Authority; state: LearnerState; bank: T }> {
  const loaded = loadSyntheticBank();
  const bank = make(loaded);
  const authority = new Authority(loaded, clock, bank);
  const state = authority.createGuest();
  await teachTheWholeBank(authority, state);
  return { authority, state, bank };
}

function movableClock(initial: string): { clock: Clock; set: (iso: string) => void } {
  let value = UtcTimestampSchema.parse(initial);
  return {
    clock: { now: () => value },
    set: (iso: string) => {
      value = UtcTimestampSchema.parse(iso);
    },
  };
}

async function scienceItem(authority: Authority, state: LearnerState) {
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item');
  return item;
}

const bktRecords = (state: LearnerState) =>
  state.events.filter((event) => event.type === 'bkt_observation_applied');

/** Any real corpus id, obtained without going near the practice queue. */
function corpusQuestionId(authority: Authority): string {
  const id = authority.bank.questions[0]?.id;
  if (id === undefined) throw new Error('expected the loaded bank to hold a question');
  return id;
}

describe('an adaptive-practice answer requires a server-issued attempt', () => {
  /**
   * The reviewer's probe, verbatim in substance: a real corpus question, a spec
   * string the caller made up, and no queue request at any point. It used to
   * return a scored result with a BKT write behind it.
   */
  it('refuses a submission for an item the queue never served', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));

    await expect(
      authority.submitPracticeAttempt(state, {
        questionId: corpusQuestionId(authority),
        specId: 'sci:whatever-i-like:EXPLAIN:train',
        chosenChoiceId: 'A',
      }),
    ).rejects.toThrow(PracticeAttemptNotAuthorizedError);

    // Nothing at all was written: no grain, no ledger record, no evidence, and
    // no exposure. A refusal that still left a warrant behind would be the same
    // defect with a smaller number.
    expect(state.mastery?.kc[FIXED_KC_ID]).toBeUndefined();
    expect(bktRecords(state)).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(
      await authority.practiceBank.recentlySeenIds(state.learnerId, {
        withinDays: 14,
        limit: 50,
      }),
    ).toEqual([]);
  });

  it('names the refusal rather than reporting a generic failure', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const error = await authority
      .submitPracticeAttempt(state, {
        questionId: corpusQuestionId(authority),
        specId: 'sci:forged:EXPLAIN:train',
        chosenChoiceId: 'A',
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(PracticeAttemptNotAuthorizedError);
    expect((error as PracticeAttemptNotAuthorizedError).reason).toBe('PRACTICE_ATTEMPT_NOT_ISSUED');
  });

  /**
   * The other half of the "done" condition. A gate that also blocks the real
   * flow is not a fix, so the legitimate path is measured end to end: the queue
   * serves, the learner answers, and the capability signal, the ledger record
   * and the evidence record all land exactly as they did before.
   */
  it('scores a queue-then-answer flow end to end', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const item = await scienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);

    const result = await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
    });

    expect(result.correct).toBe(true);
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(state.mastery!.kc[FIXED_KC_ID]!.pL).toBeGreaterThan(PRIOR_PL0);
    expect(bktRecords(state)).toHaveLength(1);
    expect(state.evidence).toHaveLength(1);
    expect(state.evidence[0]!.independent).toBe(true);
  });

  /**
   * The grant binds the SELECTION DECISION, not just the item. Echoing a
   * different spec back is how a caller would claim a repair rep for an item
   * served as a probe, so the served spec is compared rather than trusted.
   */
  it('refuses a served item answered under a spec it was not served with', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const item = await scienceItem(authority, state);

    const error = await authority
      .submitPracticeAttempt(state, {
        questionId: item.question.id,
        specId: `${item.specId}-tampered`,
        chosenChoiceId: 'A',
      })
      .catch((thrown: unknown) => thrown);

    expect((error as PracticeAttemptNotAuthorizedError).reason).toBe(
      'PRACTICE_ATTEMPT_SPEC_MISMATCH',
    );
    expect(state.evidence).toEqual([]);
  });

  it('refuses an answer to an item served under a superseded content release', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const item = await scienceItem(authority, state);

    // Re-issue by hand at the wrong release: the same shape a serve from a
    // previous release leaves behind once the bank rolls forward.
    await authority.practiceBank.issueAttemptGrant(state.learnerId, {
      questionId: item.question.id,
      specId: item.specId,
      contentRelease: `${authority.bank.contentRelease}-previous`,
      expiresAt: UtcTimestampSchema.parse('2099-01-01T00:00:00.000Z'),
    });

    const error = await authority
      .submitPracticeAttempt(state, {
        questionId: item.question.id,
        specId: item.specId,
        chosenChoiceId: 'A',
      })
      .catch((thrown: unknown) => thrown);

    expect((error as PracticeAttemptNotAuthorizedError).reason).toBe(
      'PRACTICE_ATTEMPT_CONTENT_RELEASE_STALE',
    );
  });

  it('refuses an answer after the grant has expired', async () => {
    const { clock, set } = movableClock(NOW);
    const { authority, state } = await learnerWith(
      (bank) => new FixedGrainPracticeBank(bank),
      clock,
    );
    const item = await scienceItem(authority, state);

    // A day later, without ever refetching the queue.
    set('2026-07-28T12:00:01.000Z');
    const error = await authority
      .submitPracticeAttempt(state, {
        questionId: item.question.id,
        specId: item.specId,
        chosenChoiceId: 'A',
      })
      .catch((thrown: unknown) => thrown);

    expect((error as PracticeAttemptNotAuthorizedError).reason).toBe('PRACTICE_ATTEMPT_EXPIRED');
    expect(state.evidence).toEqual([]);
  });

  /**
   * One-use, and what one-use means here. The grant is spent by the answer it
   * authorizes, so it can never buy a second capability claim — but the second
   * answer is still ADMITTED and still recorded as the repeat it is, because
   * that is a documented outcome and refusing it would delete behaviour rather
   * than gate anything.
   */
  it('spends the grant on the first answer, so a replay can only be a repeat', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const item = await scienceItem(authority, state);
    const wire = {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: 'A',
    } as const;

    await authority.submitPracticeAttempt(state, wire);
    const afterFirst = state.mastery!.kc[FIXED_KC_ID]!.pL;
    await authority.submitPracticeAttempt(state, wire);

    expect(state.mastery!.kc[FIXED_KC_ID]!.pL).toBe(afterFirst);
    expect(bktRecords(state)).toHaveLength(1);
    expect(state.evidence).toHaveLength(2);
    expect(state.evidence[1]!.independent).toBe(false);
  });

  /**
   * The consequence that motivated the whole finding, stated as behaviour. The
   * taught-set gate fails closed inside `getPracticeQueue`, so a learner whose
   * taught set shares nothing with the bank gets no science items — and now
   * that means no grants, so there is no scored science answer available to
   * them at all. Before, the gate could be walked around by not calling the
   * queue.
   */
  it('puts the taught-set gate in front of every scored answer, not just the queued ones', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const reachable = await scienceItem(authority, state);

    const untaught = authority.createGuest();
    untaught.taughtKcIds = ['kc-never-taught-by-any-lesson'];
    const gapped = await authority.getPracticeQueue(untaught, 8);
    expect(gapped.items.filter((i) => i.domain === 'science')).toHaveLength(0);
    expect(gapped.taughtGap).toBe(true);

    // The item the gate withheld cannot be answered by naming it directly.
    await expect(
      authority.submitPracticeAttempt(untaught, {
        questionId: reachable.question.id,
        specId: reachable.specId,
        chosenChoiceId: 'A',
      }),
    ).rejects.toThrow(PracticeAttemptNotAuthorizedError);
    expect(untaught.evidence).toEqual([]);
  });

  /**
   * The interaction that was easiest to break: issuing a grant is NOT recording
   * an exposure. Serve-time exposure was measured to stop `P(L)` moving at all
   * (`practice-exposure-timing.test.ts`), so the new serve-time write has to
   * leave the exposure store alone — and the first answer after it has to still
   * be a first attempt.
   */
  it('issues grants on the serve without recording an exposure', async () => {
    const { authority, state, bank } = await learnerWith((b) => new CountingExposureBank(b));

    const item = await scienceItem(authority, state);
    await authority.getPracticeQueue(state, 5);
    await authority.getPracticeQueue(state, 5);
    expect(bank.exposureWrites).toBe(0);

    const answer = await authority.practiceBank.getAnswer(item.question.id);
    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
    });

    expect(bank.exposureWrites).toBe(1);
    expect(state.mastery!.kc[FIXED_KC_ID]!.pL).toBeGreaterThan(PRIOR_PL0);
    expect(state.evidence[0]!.independent).toBe(true);
  });
});
