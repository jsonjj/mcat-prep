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
  if (item === undefined)
    throw new Error('expected a science practice item from the synthetic bank');
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
    });
    const next = await authority.getPracticeQueue(state, 6);
    expect(next.items.map((i) => i.question.id)).not.toContain(item.question.id);
  });

  /**
   * The taught-set gate used to fall back to the unfiltered bank whenever a
   * real, non-empty taught set shared nothing with the loaded bank — serving
   * untaught material while looking like graceful degradation. It must now
   * fail closed: fewer items, or none, never material outside the taught set.
   */
  it('fails closed on a taught-set miss instead of serving the unfiltered bank', async () => {
    const { authority, state } = freshLearner();

    // With no taught set recorded at all (a guest who hasn't run Today's Path),
    // the bank's science units ARE served — establishing the bank genuinely has
    // science content, so a later zero is the gate acting, not an empty bank.
    const untrackedTaught = await authority.getPracticeQueue(state, 8);
    expect(untrackedTaught.items.some((i) => i.domain === 'science')).toBe(true);
    expect(untrackedTaught.taughtGap).toBe(false);

    // A real taught set that shares nothing with the loaded bank's KCs is the
    // MISS this closes: previously this widened back out to every science
    // unit; now it must return no science material at all.
    state.taughtKcIds = ['kc-never-taught-by-any-lesson'];
    const gapped = await authority.getPracticeQueue(state, 8);

    expect(gapped.items.filter((i) => i.domain === 'science')).toHaveLength(0);
    expect(gapped.taughtGap).toBe(true);
  });

  /**
   * `itemCount` used to be read off `PracticeCandidateUnit` and then dropped on
   * the floor — nothing checked whether the bank could actually fill a request
   * before selection ran, so a request for more than the bank holds came back
   * short with no signal at all. `shortfall` is the caller-visible fix: always
   * present, and equal to exactly how many slots the queue could not fill.
   */
  it('surfaces a shortfall explicitly rather than silently truncating the queue', async () => {
    const { authority, state } = freshLearner();
    const requested = 50; // far more distinct items than the synthetic fixture holds
    const queue = await authority.getPracticeQueue(state, requested);

    expect(queue.items.length).toBeLessThan(requested);
    expect(queue.shortfall).toBe(requested - queue.items.length);
    expect(queue.shortfall).toBeGreaterThan(0);
  });

  it('reports zero shortfall when the queue fills the request', async () => {
    const { authority, state } = freshLearner();
    const queue = await authority.getPracticeQueue(state, 2);
    expect(queue.items.length).toBe(2);
    expect(queue.shortfall).toBe(0);
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
    });

    expect(result.correct).toBe(false);
    expect(state.mastery!.kc[item.kcId!]!.pL).toBeLessThan(PRIOR_PL0);

    const misses = await authority.practiceBank.recentMisses(state.learnerId, { limit: 5 });
    expect(misses.some((r) => r.kcId === item.kcId)).toBe(true);
  });

  /**
   * Retries are learning-only, and WHICH attempt this is is the server's call.
   * `packages/authority-core/src/practice-gating.test.ts` owns the derivation
   * itself; what belongs here is that a repeat leaves the grain where the first
   * attempt put it.
   */
  it('does not move mastery a second time on a repeat of the same item', async () => {
    const { authority, state } = freshLearner();
    const item = await firstQueuedScienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const attempt = {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
    };

    await authority.submitPracticeAttempt(state, attempt);
    const afterFirst = state.mastery!.kc[item.kcId!]!.pL;
    await authority.submitPracticeAttempt(state, attempt);

    expect(state.mastery!.kc[item.kcId!]!.pL).toBe(afterFirst);
  });

  it('rejects an unknown practice item', async () => {
    const { authority, state } = freshLearner();
    await expect(
      authority.submitPracticeAttempt(state, {
        questionId: 'not-a-real-item',
        specId: 'sci:x:EXPLAIN:train',
        chosenChoiceId: 'A',
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
    });

    expect(bktRecords(state)).toEqual([
      {
        source: 'adaptive_practice',
        // Practice is scored in-request: there is no observation to deduplicate
        // against and nothing to order, and the payload guard refuses a record
        // that claims otherwise — enforced, not merely typed, because
        // `recordBktObservationEvent` parses what it appends. The disagreement
        // cases are pinned in `packages/contracts/src/events.test.ts`.
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
    });
    const second = await secondScienceItem(authority, state, first.question.id);
    await authority.submitPracticeAttempt(state, {
      questionId: second,
      specId: first.specId,
      chosenChoiceId: 'A',
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

  /**
   * The case above holds the clock still, so every candidate coincides and a
   * mutation recording the wrong one passes unchanged. Here the clock ADVANCES
   * between the two writes, which separates them: the first record, the second
   * record and the grain now carry three distinguishable values, so recording a
   * stale clock, or failing to move the grain on the second write, fails by
   * name.
   *
   * What this deliberately does NOT try to do is make `reportedOccurredAt` and
   * `appliedOccurredAt` differ. On this path they CANNOT differ, and that is a
   * property of construction rather than of the fixture. `stepDirectGrains`
   * reads the Authority clock itself for a server-origin write, so the reported
   * time IS the ceiling; the grain floor is separately capped at the same
   * reading; and the applied clock is therefore pinned to it from both sides.
   * A test that pre-seeded a grain ahead of the clock to force
   * `held_at_last_practiced` here would be asserting something unreachable —
   * the cap exists precisely so a poisoned timestamp heals instead of becoming
   * a permanent floor. The separating cases belong to the one path that accepts
   * a caller-reported time, and `authority.test.ts` owns them
   * ('bounded_to_server_clock' and 'held_at_last_practiced' on
   * `applyQualifiedBktObservation`).
   */
  it('moves the recorded clock with the server clock, on the ledger and the grains', async () => {
    const FIRST = '2026-07-27T12:00:00.000Z';
    const SECOND = '2026-07-27T12:40:00.000Z';
    const { clock, set } = movableClock(FIRST);
    const bank = loadSyntheticBank();
    const authority = new Authority(bank, clock, new FixedGrainPracticeBank(bank));
    const state = authority.createGuest();

    const first = await firstQueuedScienceItem(authority, state);
    await authority.submitPracticeAttempt(state, {
      questionId: first.question.id,
      specId: first.specId,
      chosenChoiceId: 'A',
    });

    set(SECOND);
    const second = await secondScienceItem(authority, state, first.question.id);
    await authority.submitPracticeAttempt(state, {
      questionId: second,
      specId: first.specId,
      chosenChoiceId: 'A',
    });

    const records = bktRecords(state);
    expect(records).toHaveLength(2);
    // Distinguishable, which is what the still-clock version could not manage.
    expect(records[0]!.appliedOccurredAt).toBe(FIRST);
    expect(records[1]!.appliedOccurredAt).toBe(SECOND);

    for (const record of records) {
      expect(record.reportedOccurredAt).toBe(record.appliedOccurredAt);
      expect(record.clockAdjustment).toBe('none');
    }

    // The second write moved both grains to the newer clock, and the ledger's
    // last record is the one that describes them.
    expect(state.mastery!.kc[FIXED_KC_ID]!.lastPracticedAt).toBe(SECOND);
    expect(state.mastery!.skill.IDENTIFY!.lastPracticedAt).toBe(SECOND);
  });
});
