import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, type Clock } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
import { SyntheticPracticeBankPort, type PracticeAttemptLogEntry } from './practice';
import type { LearnerState } from './types';

/**
 * `Authority.getRepairQueue` — the guided Review-Mistakes repair queue.
 *
 * Pins the LOCKED selection: a servability-filtered, prioritized, capped subset of
 * the four Mistakes buckets in the order the runner feeds them
 * (To fix → Patterns → CARS → Wins); science is dropped when its KC is untaught or
 * null (its fresh one can't be served / can't resolve), CARS is always kept; and a
 * correct fresh attempt on the same KC flips the mistake's COMPUTED `resolved`, so
 * it leaves the queue on the next read.
 */

const CORRECT = 'A';
const WRONG = 'B';
const NOW = '2026-07-27T12:00:00.000Z';

/** Two taught KCs (misses + a shaky win) and one untaught KC (dropped). */
const KC_A = 'kc-taught-a';
const KC_B = 'kc-taught-b';
const KC_UNTAUGHT = 'kc-untaught';

function learner(): { authority: Authority; state: LearnerState } {
  const bank = loadSyntheticBank();
  const clock: Clock = { now: () => UtcTimestampSchema.parse(NOW) };
  const authority = new Authority(bank, clock, new SyntheticPracticeBankPort(bank));
  const state = authority.createGuest();
  // The runner's fresh one is taught-gated per-KC; mark KC_A and KC_B taught so their
  // misses/wins are servable. KC_UNTAUGHT is deliberately left out.
  state.taughtKcIds = [KC_A, KC_B];
  return { authority, state };
}

/** Append one first-attempt row directly (stands in for a scored serve), kcId-controllable. */
const record = (
  authority: Authority,
  state: LearnerState,
  over: Partial<PracticeAttemptLogEntry> & { questionId: string; kcId: string | null },
): Promise<void> =>
  authority.practiceBank.recordPracticeAttempt(state.learnerId, {
    skill: 'EXPLAIN',
    cluster: 'BB1',
    familyId: null,
    chosenChoiceId: WRONG,
    correct: false,
    firstAttempt: true,
    activityType: 'practice',
    occurredAt: UtcTimestampSchema.parse(NOW),
    elapsedMs: 40_000,
    ...over,
  });

/** An open CARS reasoning-pattern repair on `state` (always servable). */
function seedCarsRepair(state: LearnerState): void {
  state.carsRepairs = [
    {
      skill: 'RBT',
      questionId: 'sim-cars-rbt-1',
      holdRate: 0.4,
      createdAt: UtcTimestampSchema.parse(NOW),
    },
  ];
}

/**
 * Seed all four buckets: two taught-KC misses (tofix + a pattern), one untaught-KC
 * miss and one kcId-null miss (both dropped), a CARS repair, and one shaky win.
 */
async function seedAllBuckets(authority: Authority, state: LearnerState): Promise<void> {
  // Two misses on KC_A → tofix ×2 and a KC-grain pattern.
  await record(authority, state, { questionId: 'q-enz-indep-competitive', kcId: KC_A });
  await record(authority, state, { questionId: 'q-enz-indep-noncompetitive', kcId: KC_A });
  // A miss whose KC is not taught, and one with no KC at all — both unservable.
  await record(authority, state, { questionId: 'q-enz-transfer-lineweaver', kcId: KC_UNTAUGHT });
  await record(authority, state, { questionId: 'q-enz-passage-1', kcId: null });
  // A shaky win: a slow correct on a DIFFERENT taught KC (so it does not resolve the
  // KC_A misses), which the WS1 classifier bands `shaky_win`.
  await record(authority, state, {
    questionId: 'q-enz-protected-1',
    kcId: KC_B,
    chosenChoiceId: CORRECT,
    correct: true,
    elapsedMs: 120_000,
  });
  seedCarsRepair(state);
}

describe('getRepairQueue — priority order and servability', () => {
  it('orders the buckets To fix → Patterns → CARS → Wins and drops unservable science', async () => {
    const { authority, state } = learner();
    await seedAllBuckets(authority, state);

    const { items } = await authority.getRepairQueue(state, 5);
    expect(items.map((i) => i.bucket)).toEqual(['tofix', 'tofix', 'patterns', 'cars', 'wins']);

    // The untaught-KC miss and the kcId-null miss never appear (their fresh one is
    // unservable / can never resolve).
    const ids = items.map((i) => i.questionId);
    expect(ids).not.toContain('q-enz-transfer-lineweaver');
    expect(ids).not.toContain('q-enz-passage-1');

    // The two servable KC_A misses ARE the To-fix rows.
    const tofix = items.filter((i) => i.bucket === 'tofix').map((i) => i.questionId);
    expect(tofix.sort()).toEqual(['q-enz-indep-competitive', 'q-enz-indep-noncompetitive']);

    // Each row carries the fresh-one focus (the cluster, here `bb1`) and an estimate.
    for (const item of items) {
      expect(item.freshFocus).not.toBeNull();
      expect(item.estMinutes).toBeGreaterThan(0);
    }
    // CARS is kept even though it is a `kcId: null` surface (its queue bypasses the gate).
    expect(items.find((i) => i.bucket === 'cars')?.freshFocus).toBe('cars-rbt');
  });

  it('caps the queue at the requested limit and at the per-day maximum', async () => {
    const { authority, state } = learner();
    await seedAllBuckets(authority, state);

    // A tight cap takes the highest-priority prefix.
    const three = await authority.getRepairQueue(state, 3);
    expect(three.requested).toBe(3);
    expect(three.items.map((i) => i.bucket)).toEqual(['tofix', 'tofix', 'patterns']);

    // An over-large request is clamped to the per-day ceiling (5), never unbounded.
    const many = await authority.getRepairQueue(state, 99);
    expect(many.requested).toBe(5);
    expect(many.items.length).toBeLessThanOrEqual(5);
  });

  it('keeps a CARS repair when there are no servable science misses at all', async () => {
    const { authority, state } = learner();
    // Only an untaught-KC miss (dropped) + a CARS repair (kept).
    await record(authority, state, { questionId: 'q-enz-indep-competitive', kcId: KC_UNTAUGHT });
    seedCarsRepair(state);

    const { items } = await authority.getRepairQueue(state, 5);
    expect(items.map((i) => i.bucket)).toEqual(['cars']);
  });
});

describe('getRepairQueue — resolution via the existing computed path', () => {
  it('drops a To-fix miss once a correct fresh attempt lands on the same KC', async () => {
    const { authority, state } = learner();
    await record(authority, state, {
      questionId: 'q-enz-indep-competitive',
      kcId: KC_A,
      occurredAt: UtcTimestampSchema.parse('2026-07-27T12:00:00.000Z'),
    });
    await record(authority, state, {
      questionId: 'q-enz-indep-noncompetitive',
      kcId: KC_A,
      occurredAt: UtcTimestampSchema.parse('2026-07-27T12:01:00.000Z'),
    });

    const before = await authority.getRepairQueue(state, 5);
    expect(before.items.filter((i) => i.bucket === 'tofix')).toHaveLength(2);

    // A LATER correct first attempt on a DIFFERENT item in the SAME KC — the fresh
    // one landing — flips both misses' computed `resolved`.
    await record(authority, state, {
      questionId: 'q-enz-transfer-lineweaver',
      kcId: KC_A,
      chosenChoiceId: CORRECT,
      correct: true,
      occurredAt: UtcTimestampSchema.parse('2026-07-27T12:05:00.000Z'),
    });

    const after = await authority.getRepairQueue(state, 5);
    expect(after.items.filter((i) => i.bucket === 'tofix')).toHaveLength(0);
  });
});

describe('getRepairQueue — a read that moves no mastery', () => {
  it('leaves mastery untouched', async () => {
    const { authority, state } = learner();
    await seedAllBuckets(authority, state);
    const before = JSON.stringify(state.mastery ?? null);
    await authority.getRepairQueue(state, 5);
    expect(JSON.stringify(state.mastery ?? null)).toBe(before);
  });
});
