import { describe, expect, it } from 'vitest';
import { fixedClock, type UtcTimestamp } from '@mcat/contracts';
import { loadSyntheticBank } from '@mcat/content';
import { Authority } from './authority';
import { SyntheticPracticeBankPort } from './practice';
import type { LearnerState, PracticeTestCompletion } from './types';

/**
 * WS5 (§6) DURABILITY: the periodic practice test's freshness (never-reuse set),
 * decay-weighted re-measure history, and its misses must not live only in the
 * in-memory server bank. They ride the persisted `LearnerState.practiceTests`
 * slice, so they SURVIVE A RESTART and its misses reach the same Mistakes queue
 * adaptive practice uses. These drive the authority commands + reads directly.
 */

const clock = fixedClock('2026-07-20T12:00:00.000Z');
const NOW = '2026-07-20T15:00:00.000Z' as UtcTimestamp;

const baseCompletion = (over: Partial<PracticeTestCompletion> = {}): PracticeTestCompletion => ({
  sittingId: 'sit-1',
  takenOn: NOW,
  tier: 'standard',
  itemsScored: 3,
  correct: 1,
  sections: [{ section: 'bb', pctCorrect: 33 }],
  scaledScore: 495,
  reviewTargets: [{ kcId: 'kc-a1', skill: 'IDENTIFY' }],
  scoredItemIds: ['pt-q1', 'pt-q2', 'pt-q3'],
  unitObservations: [
    { unitId: 'BB1', grain: 'cluster', correct: 1, total: 3, at: NOW },
  ],
  attempts: [],
  ...over,
});

describe('Authority — practice-test freshness is DURABLE (WS5, §6, Task 1)', () => {
  it('persists the never-reuse set + re-measure history and survives a JSON round-trip', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    await auth.recordPracticeTestResult(state, baseCompletion());

    // The durable freshness lives on the persisted slice, NOT the in-memory bank.
    expect(state.practiceTests!.scoredItemIds).toEqual(['pt-q1', 'pt-q2', 'pt-q3']);
    expect(state.practiceTests!.unitHistory).toHaveLength(1);

    // The projection persists via a plain JSON round-trip (the event-sourced
    // state_json blob) — no migration — so a "restart" is a re-read of that blob.
    const restarted = JSON.parse(JSON.stringify(state)) as LearnerState;
    const fresh = auth.practiceTestFreshness(restarted);
    expect(new Set(fresh.scoredItemIds)).toEqual(new Set(['pt-q1', 'pt-q2', 'pt-q3']));
    expect(fresh.unitHistory).toHaveLength(1);
    expect(fresh.unitHistory[0]!.unitId).toBe('BB1');
  });

  it('merges + dedups scored ids and appends history across sittings', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    await auth.recordPracticeTestResult(state, baseCompletion({ scoredItemIds: ['a', 'b'] }));
    await auth.recordPracticeTestResult(
      state,
      baseCompletion({ sittingId: 'sit-2', scoredItemIds: ['b', 'c'] }),
    );

    expect([...state.practiceTests!.scoredItemIds!].sort()).toEqual(['a', 'b', 'c']);
    // Two sittings → two dated observation batches for the re-measure.
    expect(state.practiceTests!.unitHistory).toHaveLength(2);
  });

  it('freshness is empty before any test (a first, all-fresh sitting)', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    const fresh = auth.practiceTestFreshness(state);
    expect(fresh.scoredItemIds).toEqual([]);
    expect(fresh.unitHistory).toEqual([]);
  });
});

describe('Authority — practice-test misses feed the SAME Mistakes queue (WS5, Task 2)', () => {
  it('logs each item as a first attempt so misses surface in the error log', async () => {
    const bank = loadSyntheticBank();
    const port = new SyntheticPracticeBankPort(bank);
    const auth = new Authority(bank, clock, port);
    const state = auth.createGuest();

    // Use real corpus ids so getErrorLog can hydrate them (as the file/Postgres
    // banks do for the pulled corpus the practice-test bank shares).
    const ids = [...auth.bank.compiled.keys()];
    const missId = ids[0]!;
    const winId = ids[1]!;

    await auth.recordPracticeTestResult(
      state,
      baseCompletion({
        attempts: [
          {
            questionId: missId,
            kcId: 'kc-x',
            skill: 'IDENTIFY',
            cluster: 'BB1',
            familyId: 'fam-1',
            chosenChoiceId: 'B',
            correct: false,
            elapsedMs: 9000,
          },
          {
            questionId: winId,
            kcId: 'kc-x',
            skill: 'IDENTIFY',
            cluster: 'BB1',
            familyId: 'fam-2',
            chosenChoiceId: 'A',
            correct: true,
            elapsedMs: null,
          },
        ],
      }),
    );

    // The attempt log — the very source getErrorLog reads — now carries both,
    // stamped as first practice attempts (the same shape submitPracticeAttempt logs).
    const logged = await port.listPracticeAttempts(state.learnerId, { limit: 100 });
    expect(logged.map((a) => a.questionId).sort()).toEqual([missId, winId].sort());
    const missRow = logged.find((a) => a.questionId === missId)!;
    expect(missRow.activityType).toBe('practice');
    expect(missRow.firstAttempt).toBe(true);
    expect(missRow.correct).toBe(false);
    expect(missRow.chosenChoiceId).toBe('B');

    // And "To fix" (getErrorLog) surfaces the MISS and not the win.
    const errors = await auth.getErrorLog(state);
    expect(errors.some((e) => e.questionId === missId)).toBe(true);
    expect(errors.some((e) => e.questionId === winId)).toBe(false);
  });

  it('still enqueues the per-KC repair targets (adaptive-practice repair path)', async () => {
    const bank = loadSyntheticBank();
    const port = new SyntheticPracticeBankPort(bank);
    const auth = new Authority(bank, clock, port);
    const state = auth.createGuest();
    await auth.recordPracticeTestResult(
      state,
      baseCompletion({ reviewTargets: [{ kcId: 'kc-a1' }, { kcId: 'kc-a1' }, { kcId: 'kc-b1' }] }),
    );
    const repairs = await port.recentMisses(state.learnerId, { limit: 10 });
    expect(repairs.map((r) => r.kcId).sort()).toEqual(['kc-a1', 'kc-b1']);
  });
});

describe('Authority — practice-test abandonment + one-open invariant (WS5, §6, Task 4)', () => {
  it('tracks the open sitting on start and clears it on completion', async () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    auth.recordPracticeTestStarted(state, { sittingId: 'sit-1', startedAt: NOW, tier: 'standard' });
    expect(state.practiceTests!.openSitting).toEqual({
      sittingId: 'sit-1',
      startedAt: NOW,
      tier: 'standard',
    });

    await auth.recordPracticeTestResult(state, baseCompletion({ sittingId: 'sit-1' }));
    expect(state.practiceTests!.openSitting).toBeNull();
  });

  it('a fresh start supersedes (abandons) a prior open sitting — at most one open', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();

    auth.recordPracticeTestStarted(state, { sittingId: 'sit-1', startedAt: NOW, tier: 'standard' });
    auth.recordPracticeTestStarted(state, { sittingId: 'sit-2', startedAt: NOW, tier: 'short' });

    expect(state.practiceTests!.openSitting!.sittingId).toBe('sit-2');
    // The abandoned sitting was never completed, so cadence math is untouched.
    expect(state.practiceTests!.testsCompleted).toBe(0);
    expect(state.practiceTests!.lastTestDate).toBeNull();
  });
});

describe('Authority — serve gate carries a typed next-eligible day (WS5, §6, Task 3)', () => {
  it('refuses a capped start with the reason and the next-eligible date', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    // Unlock practice (>= 3 completed lessons) + a reviewed test taken today.
    state.completedLessons = ['les-1', 'les-2', 'les-3'];
    state.practiceTests = { lastTestDate: '2026-07-20', lastTestReviewed: true, testsCompleted: 1 };

    const gate = auth.practiceTestServeGate(state);
    expect(gate.due).toBe(false);
    expect(gate.reason).toBe('capped_today');
    expect(gate.nextEligibleDate).toBe('2026-07-21');
  });

  it('refuses while the prior test is unreviewed (review gate)', () => {
    const auth = new Authority(loadSyntheticBank(), clock);
    const state = auth.createGuest();
    state.completedLessons = ['les-1', 'les-2', 'les-3'];
    state.practiceTests = { lastTestDate: '2026-06-01', lastTestReviewed: false, testsCompleted: 1 };

    const gate = auth.practiceTestServeGate(state);
    expect(gate.due).toBe(false);
    expect(gate.reason).toBe('blocked_unreviewed');
  });
});
