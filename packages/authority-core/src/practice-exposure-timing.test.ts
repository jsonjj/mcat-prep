import { describe, expect, it } from 'vitest';
import { fixedClock, type UtcTimestamp } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import {
  SyntheticPracticeBankPort,
  type PracticeExposure,
  type PracticeItemClassification,
} from './practice';
import type { LearnerState } from './types';

/**
 * WHEN an exposure is recorded, and why it is on the answer rather than on the
 * serve.
 *
 * The observation this pins the answer to: an item served in a queue and then
 * abandoned unanswered stays fully unseen to `recentlySeenIds`, so the next
 * request can serve it again. That is deliberate, and it is load-bearing in a
 * way the obvious alternative is not.
 *
 * ONE record carries both facts. `practice_exposure` holds a single row per
 * learner × item — `last_seen_at`, which `recentlySeenIds` reads for queue
 * rotation, and `seen_count`, which `recordExposure` returns as
 * `priorExposures` and `submitPracticeAttempt` derives `firstAttempt` from
 * (see `services/persistence-postgres/src/practice-exposure-repository.ts`).
 * The two readers cannot be moved independently, so recording on serve is not
 * a rotation change that happens to touch mastery — it IS a mastery change.
 * `every answer becomes a repeat` below measures what that costs: with the
 * serve counted, no practice answer is ever a first attempt again, so P(L)
 * stops moving, the ledger stops recording, and no miss queues a repair.
 *
 * The cost of the choice made here is real and is pinned too: a learner who
 * abandons a session can meet the same item in the next one
 * (`stays eligible for the next queue`). The cost of the alternative is
 * measured beside it (`burns items the learner never engaged with`) — a queue
 * refetch, which `usePracticeQueue` performs on every mount, would spend a
 * whole session's worth of fresh items on a learner who answered nothing.
 *
 * A distinct served-but-unanswered state — a third state, neither unseen nor
 * answered — is the option that avoids both harms. It needs a schema column
 * and a write on a GET, so it is recorded in `key-docs/roadmap-todo.md` rather
 * than guessed at here.
 */

const NOW = '2026-07-27T12:00:00.000Z';
const CLOCK = fixedClock(NOW);

/**
 * The synthetic bank holds at most one item per KC, so routing several items to
 * one grain is the only way to observe a second answer against it. The deployed
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

/**
 * Counts exposure writes without changing when they happen. `recordExposure` is
 * the ONLY exposure writer on the port, so a serve-time write — however it were
 * spelled — has to come through here to have any effect.
 */
class CountingExposureBank extends FixedGrainPracticeBank {
  public exposureWrites = 0;

  override async recordExposure(
    learnerId: string,
    questionId: string,
    now: UtcTimestamp,
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
 * a miss, so a guest who has completed no lesson is served no science material at
 * all. This file is about WHEN exposure is written, which needs items to exist.
 * `listUnits` writes no exposure, so this cannot disturb the counts below.
 */
async function teachTheWholeBank(authority: Authority, state: LearnerState): Promise<void> {
  const units = await authority.practiceBank.listUnits({ limit: 400 });
  state.taughtKcIds = [...new Set(units.map((u) => u.kcId))];
}

async function learnerWith<T extends SyntheticPracticeBankPort>(
  make: (bank: ReturnType<typeof loadSyntheticBank>) => T,
): Promise<{ authority: Authority; state: LearnerState; bank: T }> {
  const loaded = loadSyntheticBank();
  const bank = make(loaded);
  const authority = new Authority(loaded, CLOCK, bank);
  const state = authority.createGuest();
  await teachTheWholeBank(authority, state);
  return { authority, state, bank };
}

const ids = (items: readonly { question: { id: string } }[]): string[] =>
  items.map((i) => i.question.id);

const bktRecords = (state: LearnerState) =>
  state.events.filter((event) => event.type === 'bkt_observation_applied');

async function scienceItem(authority: Authority, state: LearnerState) {
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item');
  return item;
}

describe('exposure is recorded on the answer, not on the serve', () => {
  /**
   * The behaviour the decision keeps. Serving is not an event the learner
   * participated in, so it leaves no trace and the item comes back.
   */
  it('leaves a served-but-unanswered item eligible for the next queue', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));

    const first = await authority.getPracticeQueue(state, 4);
    expect(first.items.length).toBeGreaterThan(0);

    // Nothing was answered, so nothing is on record as seen.
    expect(
      await authority.practiceBank.recentlySeenIds(state.learnerId, {
        withinDays: 14,
        limit: 500,
        now: CLOCK.now(),
      }),
    ).toEqual([]);

    const second = await authority.getPracticeQueue(state, 4);
    expect(ids(second.items)).toEqual(ids(first.items));
  });

  /**
   * The guard, rather than the behaviour: a serve-time write is counted the
   * moment it appears, wherever in the queue path it is added. Asserting only
   * the re-serve above would still pass if a future author wrote the exposure
   * on serve and then compensated for it somewhere in selection.
   */
  it('writes no exposure while building a queue, and exactly one per answer', async () => {
    const { authority, state, bank } = await learnerWith((b) => new CountingExposureBank(b));

    await authority.getPracticeQueue(state, 6);
    expect(bank.exposureWrites).toBe(0);

    const item = await scienceItem(authority, state);
    expect(bank.exposureWrites).toBe(0);

    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: 'A',
    });
    expect(bank.exposureWrites).toBe(1);
  });

  /**
   * `firstAttempt` is derived from the exposure count (`f976695`), so the whole
   * question of when exposure is recorded is a question about what a first
   * attempt means. Serving an item repeatedly must not spend it: the learner
   * who is handed the same question three times and answers once has answered
   * once.
   */
  it('does not let repeated serves consume the first attempt', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));

    const item = await scienceItem(authority, state);
    await authority.getPracticeQueue(state, 5);
    await authority.getPracticeQueue(state, 5);
    expect((await authority.getPracticeQueue(state, 5)).items.map((i) => i.question.id)).toContain(
      item.question.id,
    );

    const answer = await authority.practiceBank.getAnswer(item.question.id);
    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
    });

    // Scored as the first attempt it is: the grain moved, the ledger recorded
    // it, and the evidence record is independent.
    expect(state.mastery!.kc[FIXED_KC_ID]!.pL).toBeGreaterThan(PRIOR_PL0);
    expect(bktRecords(state)).toHaveLength(1);
    expect(state.evidence[0]!.independent).toBe(true);
  });
});

/**
 * What recording on serve would cost, measured rather than asserted. Both cases
 * do exactly what a serve-time write would do — call the port's one exposure
 * writer for each item as it is served — and then observe the consequence.
 */
describe('the cost of recording exposure on the serve instead', () => {
  const serve = async (
    authority: Authority,
    state: LearnerState,
    items: readonly { question: { id: string } }[],
  ): Promise<void> => {
    for (const item of items) {
      await authority.practiceBank.recordExposure(state.learnerId, item.question.id, CLOCK.now());
    }
  };

  it('makes every subsequent answer a repeat, so practice moves no mastery at all', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const item = await scienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);

    await serve(authority, state, [item]);
    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: answer!.correctChoiceId,
    });

    // The learner answered correctly, unassisted, on their only attempt — and
    // none of it counted. This is the whole of practice, not an edge case:
    // every item is served before it is answered.
    expect(state.mastery!.kc[FIXED_KC_ID]).toBeUndefined();
    expect(bktRecords(state)).toHaveLength(0);
    expect(state.evidence[0]!.independent).toBe(false);
  });

  it('drops the repair a miss should have queued', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));
    const item = await scienceItem(authority, state);
    const answer = await authority.practiceBank.getAnswer(item.question.id);
    const wrong = (['A', 'B', 'C', 'D'] as const).find((c) => c !== answer!.correctChoiceId)!;

    await serve(authority, state, [item]);
    await authority.submitPracticeAttempt(state, {
      questionId: item.question.id,
      specId: item.specId,
      chosenChoiceId: wrong,
    });

    expect(await authority.practiceBank.recentMisses(state.learnerId, { limit: 5 })).toEqual([]);
  });

  /**
   * The pedagogical half of the cost, independent of the mastery half. The
   * practice queue is refetched on every mount (`usePracticeQueue` sets
   * `staleTime: 0`), so a page refresh is one of these rounds — and each round
   * spends items on a learner who has answered nothing.
   *
   * Note where it ends up: an empty queue and a full shortfall, which is the
   * exact degraded state Phase 6 added `shortfall` to report. Recording on
   * serve would manufacture the condition the signal exists to explain.
   */
  it('burns items the learner never engaged with, one queue per refetch', async () => {
    const { authority, state } = await learnerWith((bank) => new FixedGrainPracticeBank(bank));

    // The shipped behaviour first, as the control: refetching spends nothing.
    const first = await authority.getPracticeQueue(state, 3);
    expect(first.items).toHaveLength(3);
    expect(first.shortfall).toBe(0);
    const refetched = await authority.getPracticeQueue(state, 3);
    expect(ids(refetched.items)).toEqual(ids(first.items));
    expect(refetched.shortfall).toBe(0);

    // Now the alternative, over the same three-item request: each round spends
    // whatever it served, and the next round can only reach what is left.
    const spent = new Set<string>();
    let round = first;
    for (let i = 0; i < 3; i += 1) {
      await serve(authority, state, round.items);
      for (const id of ids(round.items)) spent.add(id);
      round = await authority.getPracticeQueue(state, 3);
      expect(ids(round.items).filter((id) => spent.has(id))).toEqual([]);
    }

    // Five items, all the fixture holds, gone in three rounds — and the fourth
    // request comes back empty with a full shortfall.
    expect(spent.size).toBe(5);
    expect(round.items).toEqual([]);
    expect(round.shortfall).toBe(3);
    // Still not one answer on record to have spent them on.
    expect(state.evidence).toEqual([]);
  });
});
