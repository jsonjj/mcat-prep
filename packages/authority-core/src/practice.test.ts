import { describe, expect, it } from 'vitest';
import { fixedClock, UtcTimestampSchema, type Clock } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeItemClassification } from './practice';
import type { LearnerState } from './types';

const CLOCK = fixedClock('2026-07-27T12:00:00.000Z');

function freshLearner(): { authority: Authority; state: LearnerState } {
  const authority = new Authority(undefined, CLOCK);
  return { authority, state: authority.createGuest() };
}

/** A clock the test can move, so the monotonic floor has something to hold against. */
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
 * The synthetic bank reports `lessonId: null` for every unit, which is what the
 * deployed Postgres port fills in from `questions.lesson_id`. Tagging it here is
 * how the routing half of a practice write becomes observable at all.
 */
const PRACTICED_LESSON_ID = 'V3-LES-130923';

class LessonTaggedPracticeBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null ? null : { ...base, lessonId: PRACTICED_LESSON_ID };
  }
}

/**
 * The synthetic bank carries at most one item per KC, so re-practising ONE grain
 * — which is what a monotonic floor needs — requires a port that routes two
 * different items to the same grain. The deployed corpus has many items per KC.
 */
const FIXED_KC_ID = 'V3-KC-199229';

class FixedGrainPracticeBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null
      ? null
      : { ...base, domain: 'science', kcId: FIXED_KC_ID, skill: 'IDENTIFY' };
  }
}

/**
 * The synthetic bank cannot deliver a CARS unit — it reports `carsSkill: null`
 * for every question, and the snapshot drops those — so the CARS branch is only
 * reachable through a port that classifies one.
 */
class CarsPracticeBank extends SyntheticPracticeBankPort {
  override async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const base = await super.classify(questionId);
    return base === null
      ? null
      : { ...base, domain: 'cars', carsSkill: 'FOC', kcId: null, skill: null };
  }
}

async function firstQueuedScienceItem(authority: Authority, state: LearnerState) {
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item from the synthetic bank');
  return item;
}

/** A second, distinct deliverable item — the grain it routes to is the port's business. */
async function secondScienceItem(
  authority: Authority,
  state: LearnerState,
  excludeId: string,
): Promise<string> {
  const queue = await authority.getPracticeQueue(state, 8);
  const next = queue.items.find((i) => i.question.id !== excludeId);
  if (next === undefined) {
    throw new Error('expected a second practice item from the synthetic bank');
  }
  return next.question.id;
}

describe('Authority.getPracticeQueue (synthetic fallback)', () => {
  it('returns a learner-safe queue with no answer key or rationale', async () => {
    const { authority, state } = freshLearner();
    const queue = await authority.getPracticeQueue(state, 4);

    expect(queue.requested).toBe(4);
    expect(queue.items.length).toBeGreaterThan(0);
    expect(queue.items.length).toBeLessThanOrEqual(4);
    for (const item of queue.items) {
      expect(item.specId.length).toBeGreaterThan(0);
      expect(item.question.choices).toHaveLength(4);
    }
    const json = JSON.stringify(queue);
    expect(json).not.toMatch(/correct_choice_id|correctChoiceId|rationale/i);
  });

  it('never repeats an item within one queue', async () => {
    const { authority, state } = freshLearner();
    const queue = await authority.getPracticeQueue(state, 6);
    const ids = queue.items.map((i) => i.question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('excludes items the learner has already been served (exposure)', async () => {
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);
    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: 'A',
      firstAttempt: true,
    });
    const next = await authority.getPracticeQueue(state, 6);
    expect(next.items.map((i) => i.question.id)).not.toContain(item.question.id);
  });
});

describe('Authority.submitPracticeAttempt (test-out mastery)', () => {
  it('moves P(L) up on a correct first attempt and returns the rationale', async () => {
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    expect(answer).not.toBeNull();

    const result = await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
      firstAttempt: true,
    });

    expect(result.correct).toBe(true);
    expect(result.correctChoiceId).toBe(answer!.correctChoiceId);
    expect(result.rationale.length).toBeGreaterThan(0);

    // Mastery moved above the conservative prior on both grains it touched.
    expect(item.kcId).not.toBeNull();
    expect(item.skill).not.toBeNull();
    expect(state.mastery!.kc[item.kcId!]!.pL).toBeGreaterThan(PRIOR_PL0);
    expect(state.mastery!.skill[item.skill!]!.pL).toBeGreaterThan(PRIOR_PL0);
  });

  it('moves P(L) down on an incorrect first attempt and queues a repair', async () => {
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== answer!.correctChoiceId)!;

    const result = await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: wrong,
      firstAttempt: true,
    });

    expect(result.correct).toBe(false);
    expect(state.mastery!.kc[item.kcId!]!.pL).toBeLessThan(PRIOR_PL0);

    const misses = await authority.practiceBank.recentMisses(state.learnerId, { limit: 5 });
    expect(misses.some((r) => r.kcId === item.kcId)).toBe(true);
  });

  it('does not move mastery on a retry (firstAttempt=false)', async () => {
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);

    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
      firstAttempt: false,
    });

    expect(state.mastery?.kc[item.kcId!]).toBeUndefined();
  });

  it('rejects an unknown practice item', async () => {
    const { authority, state } = freshLearner();
    await expect(
      authority.submitPracticeAttempt(state, {
        questionId: 'not-a-real-item',
        specId: 'sci:x:EXPLAIN:train',
        chosenChoiceId: 'A',
        firstAttempt: true,
      }),
    ).rejects.toThrow();
  });
});

/**
 * Practice reaches the capability grains through the Authority's single
 * `stepDirectGrains` step, so it inherits the three things that step owns: the
 * bounded monotonic decay clock, the lesson routing the rollup reads, and the
 * audit record. It used to call the BKT engine inline and have none of them —
 * and because an unbounded write still succeeds, nothing failed.
 */
describe('Authority.submitPracticeAttempt (one write path)', () => {
  const bktRecords = (state: LearnerState) =>
    state.events
      .filter((event) => event.type === 'bkt_observation_applied')
      .map((event) => event.payload as Record<string, unknown>);

  it('records the lesson it practised, so the default rollup can see it', async () => {
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK, new LessonTaggedPracticeBank(bank));
    const state = authority.createGuest();
    const item = await firstQueuedScienceItem(authority, state);

    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: 'A',
      firstAttempt: true,
    });

    expect(state.mastery!.practicedLessonIds).toEqual([PRACTICED_LESSON_ID]);
    // The rollup's default set IS `practicedLessonIds`, so a lesson practised
    // only here was previously absent from `getMasteryLessons(state)` entirely.
    expect(
      authority
        .getLessonRollups(state)
        .map((r) => (r.status === 'available' ? r.view.lessonId : r.lessonId)),
    ).toContain(PRACTICED_LESSON_ID);
    expect(authority.getMasteryLessons(state).map((l) => l.lessonId)).toContain(
      PRACTICED_LESSON_ID,
    );
  });

  it('never routes a lesson the classification does not name', async () => {
    // The synthetic port reports `lessonId: null`; an absent id must stay absent
    // rather than becoming a placeholder the rollup would then report on.
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);

    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: 'A',
      firstAttempt: true,
    });

    expect(state.mastery!.practicedLessonIds).toEqual([]);
  });

  it('appends one audit record naming the practice source', async () => {
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);

    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
      firstAttempt: true,
    });

    expect(bktRecords(state)).toEqual([
      {
        source: 'adaptive_practice',
        // Practice is scored in-request: there is no observation to deduplicate
        // against and nothing to order, and the payload guard refuses a record
        // that claims otherwise.
        observationId: null,
        observationSequence: null,
        questionId: item.question.id,
        primaryKcId: item.kcId,
        reasoningOperation: item.skill,
        correct: true,
        reportedOccurredAt: CLOCK.now(),
        appliedOccurredAt: CLOCK.now(),
        clockAdjustment: 'none',
        outOfOrder: false,
        rejectionCodes: [],
      },
    ]);
  });

  it('writes no BKT record for CARS, which is the IRT authority', async () => {
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, CLOCK, new CarsPracticeBank(bank));
    const state = authority.createGuest();
    const item = await firstQueuedScienceItem(authority, state);

    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: 'A',
      firstAttempt: true,
    });

    // The ability moved, so the empty ledger is a CARS/BKT boundary rather than
    // a write that did not happen.
    expect(state.mastery!.cars.FOC).toBeDefined();
    expect(state.mastery!.kc).toEqual({});
    expect(bktRecords(state)).toEqual([]);
  });

  /**
   * The audit record and the stored grain are two derivations of one fact — the
   * decay clock this write used — so the invariant worth pinning is that they
   * AGREE. Asserting the ledger alone would pass just as happily if the record
   * described a clamp the grain never received.
   *
   * Note what this does NOT claim. `reportedAt` on the practice path IS the
   * Authority clock, so every bound in `boundDecayClock` is a no-op here and the
   * bypass produced identical numbers — which is exactly why nothing failed
   * while it was there, and why the unreachability guard is structural
   * (`tests/architecture/mastery-write-path.test.ts`) rather than a value
   * assertion. What is enforced by construction is that a future practice caller
   * which accepts a reported time cannot skip the clamp.
   */
  it('records the decay clock it actually wrote, on every touched grain', async () => {
    const NOW = '2026-07-27T12:00:00.000Z';
    const { clock } = movableClock(NOW);
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, clock, new FixedGrainPracticeBank(bank));
    const state = authority.createGuest();

    const first = await firstQueuedScienceItem(authority, state);
    await authority.submitPracticeAttempt(state, {
      questionId: first.question.id,
      specId: first.specId,
      chosenChoiceId: 'A',
      firstAttempt: true,
    });
    const second = await secondScienceItem(authority, state, first.question.id);
    await authority.submitPracticeAttempt(state, {
      questionId: second,
      specId: first.specId,
      chosenChoiceId: 'A',
      firstAttempt: true,
    });

    const records = bktRecords(state);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.clockAdjustment).toBe('none');
      expect(record.appliedOccurredAt).toBe(NOW);
    }
    expect(state.mastery!.kc[FIXED_KC_ID]!.lastPracticedAt).toBe(records.at(-1)!.appliedOccurredAt);
    expect(state.mastery!.skill.IDENTIFY!.lastPracticedAt).toBe(records.at(-1)!.appliedOccurredAt);
  });
});
