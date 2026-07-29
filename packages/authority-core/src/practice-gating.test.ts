import { describe, expect, it } from 'vitest';
import {
  PracticeAttemptCommandSchema,
  PracticeAttemptSchema,
  UtcTimestampSchema,
  fixedClock,
  type Clock,
  type PracticeAttemptCommand,
} from '@mcat/contracts';
import { isMasteryEligible } from '@mcat/domain';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState } from './types';

/**
 * `firstAttempt` arrived as a browser boolean hardcoded `true`, so every
 * practice response claimed to be a first attempt and every piece of
 * first-attempt-conditioned logic was permanently satisfied. Lessons face
 * eleven conditions; practice faced none.
 *
 * The fix was to DERIVE it from the exposure records the server already
 * holds, not to validate a client claim against them — and then to remove the
 * claim from the wire entirely, so nothing downstream can ever re-trust it.
 * `PracticeAttemptCommandSchema` has no `firstAttempt` field at all; there is
 * no longer a value for the client to get right or wrong.
 */

const NOW = '2026-07-27T12:00:00.000Z';
const CLOCK = fixedClock(NOW);

function movableClock(initial: string): { clock: Clock; set: (iso: string) => void } {
  let value = UtcTimestampSchema.parse(initial);
  return {
    clock: { now: () => value },
    set: (iso: string) => {
      value = UtcTimestampSchema.parse(iso);
    },
  };
}

/**
 * The synthetic bank holds at most one item per KC, so a second attempt on ONE
 * grain needs a port that routes every item to the same one. The deployed
 * corpus has many items per KC.
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

/** The wire command. There is no `firstAttempt` claim to carry on it. */
const claiming = (
  questionId: string,
  specId: string,
  chosenChoiceId: 'A' | 'B' | 'C' | 'D' | null,
): PracticeAttemptCommand => ({ questionId, specId, chosenChoiceId });

function fixedGrainLearner(clock: Clock = CLOCK): {
  authority: Authority;
  state: LearnerState;
} {
  const bank = loadSyntheticBank();
  const authority = new Authority(bank, clock, new FixedGrainPracticeBank(bank));
  return { authority, state: authority.createGuest() };
}

async function firstQueuedScienceItem(authority: Authority, state: LearnerState) {
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item');
  return item;
}

const bktRecords = (state: LearnerState) =>
  state.events.filter((event) => event.type === 'bkt_observation_applied');

describe('the authority derives firstAttempt rather than reading it', () => {
  /** The named "done" condition for this task: a repeat is still a repeat. */
  it('classifies a second attempt on the same item as not-first', async () => {
    const { authority, state } = fixedGrainLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const wire = claiming(item.question.id, item.specId, answer!.correctChoiceId);

    await authority.submitPracticeAttempt(state, wire);
    const afterFirst = state.mastery!.kc[FIXED_KC_ID]!.pL;

    await authority.submitPracticeAttempt(state, wire);

    // The capability estimate did not move a second time on one item.
    expect(state.mastery!.kc[FIXED_KC_ID]!.pL).toBe(afterFirst);
    expect(bktRecords(state)).toHaveLength(1);

    // And the repeat is on record as a repeat, not simply absent.
    expect(state.evidence).toHaveLength(2);
    expect(state.evidence[1]!.independent).toBe(false);
    expect(isMasteryEligible(state.evidence[1]!)).toBe(false);
  });

  it('classifies a genuine first attempt as first', async () => {
    const { authority, state } = fixedGrainLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);

    await authority.submitPracticeAttempt(
      state,
      claiming(item.question.id, item.specId, answer!.correctChoiceId),
    );

    expect(state.mastery!.kc[FIXED_KC_ID]).toBeDefined();
    expect(bktRecords(state)).toHaveLength(1);
    expect(state.evidence[0]!.independent).toBe(true);
  });

  /**
   * The field is gone from both schemas, not merely unread by one of them. A
   * body that still carries it is rejected as an unknown key on either side —
   * there is no longer a "wire-only" shape for it to survive in.
   */
  it('has no firstAttempt field on the wire schema or the schema the authority consumes', () => {
    expect(Object.keys(PracticeAttemptCommandSchema.shape)).not.toContain('firstAttempt');
    expect(Object.keys(PracticeAttemptSchema.shape)).not.toContain('firstAttempt');
    for (const schema of [PracticeAttemptCommandSchema, PracticeAttemptSchema]) {
      expect(
        schema.safeParse({
          questionId: 'q',
          specId: 's',
          chosenChoiceId: 'A',
          firstAttempt: true,
        }).success,
      ).toBe(false);
    }
  });

  /**
   * Derived from exposure, which is unwindowed. A recency window would make a
   * repeat far enough in the past look like a first attempt again — the same
   * permanently-satisfied condition, only slower.
   */
  it('still classifies a repeat a year later as not-first', async () => {
    const { clock, set } = movableClock(NOW);
    const { authority, state } = fixedGrainLearner(clock);
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const wire = claiming(item.question.id, item.specId, answer!.correctChoiceId);

    await authority.submitPracticeAttempt(state, wire);
    set('2027-07-27T12:00:00.000Z');
    await authority.submitPracticeAttempt(state, wire);

    expect(bktRecords(state)).toHaveLength(1);
    expect(state.mastery!.kc[FIXED_KC_ID]!.lastPracticedAt).toBe(NOW);
    expect(state.evidence[1]!.independent).toBe(false);
  });

  it('classifies a different item as its own first attempt', async () => {
    const { authority, state } = fixedGrainLearner();
    const queue = await authority.getPracticeQueue(state, 6);
    const [one, two] = queue.items;
    expect(two).toBeDefined();

    await authority.submitPracticeAttempt(state, claiming(one!.question.id, one!.specId, 'A'));
    await authority.submitPracticeAttempt(state, claiming(two!.question.id, two!.specId, 'A'));

    expect(bktRecords(state)).toHaveLength(2);
    expect(state.evidence.every((e) => e.independent)).toBe(true);
  });
});

/**
 * The consequence the run ledger flagged: both Mistakes surfaces filter on
 * `a.firstAttempt`, and `Authority.resolved` compares logged attempts. What is
 * asserted here is the behaviour, not the mechanism — so it holds whether the
 * protection comes from the derived flag or from the log's own write-time
 * de-duplication.
 */
describe('a repeat attempt cannot inflate either Mistakes surface', () => {
  it('counts one miss for one item, however many times it is answered', async () => {
    const { authority, state } = fixedGrainLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== answer!.correctChoiceId)!;
    const wire = claiming(item.question.id, item.specId, wrong);

    await authority.submitPracticeAttempt(state, wire);
    await authority.submitPracticeAttempt(state, wire);
    await authority.submitPracticeAttempt(state, wire);

    const log = await authority.getErrorLog(state);
    expect(log).toHaveLength(1);
    expect(log[0]!.questionId).toBe(item.question.id);

    const patterns = await authority.getMistakePatterns(state);
    for (const pattern of patterns) {
      expect(pattern.missedItems).toBeLessThanOrEqual(pattern.attemptedItems);
      expect(pattern.missedItems).toBe(1);
    }
  });

  /**
   * A miss is resolved by a later correct attempt on a DIFFERENT item in the
   * same KC. Re-answering the logged item after seeing its rationale is the
   * measure that shows nothing, so it must not clear the row.
   */
  it('is not resolved by re-answering the same item correctly', async () => {
    const { authority, state } = fixedGrainLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== answer!.correctChoiceId)!;

    await authority.submitPracticeAttempt(state, claiming(item.question.id, item.specId, wrong));
    await authority.submitPracticeAttempt(
      state,
      claiming(item.question.id, item.specId, answer!.correctChoiceId),
    );

    const log = await authority.getErrorLog(state);
    expect(log).toHaveLength(1);
    expect(log[0]!.resolved).toBe(false);
  });

  it('is resolved by a later correct attempt on a different item in the same KC', async () => {
    const { clock, set } = movableClock(NOW);
    const { authority, state } = fixedGrainLearner(clock);
    const queue = await authority.getPracticeQueue(state, 6);
    const [missed, next] = queue.items;
    expect(next).toBeDefined();

    const missedAnswer = await authority.practiceBank.getAnswer(missed!.question.id);
    const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== missedAnswer!.correctChoiceId)!;
    await authority.submitPracticeAttempt(
      state,
      claiming(missed!.question.id, missed!.specId, wrong),
    );

    set('2026-07-27T12:30:00.000Z');
    const nextAnswer = await authority.practiceBank.getAnswer(next!.question.id);
    await authority.submitPracticeAttempt(
      state,
      claiming(next!.question.id, next!.specId, nextAnswer!.correctChoiceId),
    );

    const log = await authority.getErrorLog(state);
    expect(log).toHaveLength(1);
    expect(log[0]!.resolved).toBe(true);
  });
});
