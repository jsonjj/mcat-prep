import { describe, expect, it } from 'vitest';
import { UtcTimestampSchema, type Clock, type UtcTimestamp } from '@mcat/contracts';
import { Authority } from './authority';
import type { LearnerState } from './types';

/**
 * The Mistakes surfaces (docs/design/error-handling-design.md §6).
 *
 * The regression these pin down: adaptive practice captured which wrong answer a
 * learner picked and dropped it into an unread event payload, and `getErrorLog`
 * read only `attempt_submitted` events from the older Study flow — so a shipped
 * "Review Mistakes" slot sent learners to a page that could not show a single
 * practice miss.
 */

/** Advances a fixed step per read, so "a later attempt" is expressible. */
function steppingClock(startIso: string, stepMs = 60_000): Clock {
  let t = Date.parse(startIso);
  return {
    now: () => {
      const iso = new Date(t).toISOString();
      t += stepMs;
      return UtcTimestampSchema.parse(iso);
    },
  };
}

/** Every synthetic enzyme item keys 'A'; 'B' is always a real distractor. */
const CORRECT = 'A';
const WRONG = 'B';

const INHIBITION_ITEMS = [
  'q-enz-indep-competitive',
  'q-enz-indep-noncompetitive',
  'q-enz-transfer-lineweaver',
  'q-enz-passage-1',
  'q-enz-protected-1',
  'q-enz-sim-transfer-1',
] as const;

function learner(clock: Clock = steppingClock('2026-07-27T12:00:00.000Z')): {
  authority: Authority;
  state: LearnerState;
} {
  const authority = new Authority(undefined, clock);
  return { authority, state: authority.createGuest() };
}

const answer = (authority: Authority, state: LearnerState, questionId: string, choice: string) =>
  authority.submitPracticeAttempt(state, {
    questionId,
    specId: 'sci:bb1-enzyme-inhibition:EXPLAIN:train',
    chosenChoiceId: choice as 'A' | 'B',
    firstAttempt: true,
  });

describe('Mistakes — the practice attempt log is the source', () => {
  it('turns a practice miss into a readable entry that keeps the chosen distractor', async () => {
    const { authority, state } = learner();
    await answer(authority, state, 'q-enz-indep-competitive', WRONG);

    const log = await authority.getErrorLog(state);
    expect(log).toHaveLength(1);
    const entry = log[0]!;
    // The whole point: which wrong answer, and the refutation of THAT answer.
    expect(entry.chosenChoiceId).toBe(WRONG);
    expect(entry.chosenChoiceText.length).toBeGreaterThan(0);
    expect(entry.correctChoiceId).toBe(CORRECT);
    expect(entry.correctChoiceText.length).toBeGreaterThan(0);
    expect(entry.choiceRationale).not.toBeNull();
    expect(entry.stem.length).toBeGreaterThan(0);
    // Real grain, not the old `skillId: ENZYME_SKILL` hardcode.
    expect(entry.kcId).toBe('bb1-enzyme-inhibition');
    expect(entry.cluster).toBe('BB1');
    expect(entry.familyId).toBe('fam-competitive');
    expect(entry.focus).toBe('bb1');
    expect(entry.resolved).toBe(false);
  });

  it('carries no self-reported cause field', async () => {
    const { authority, state } = learner();
    await answer(authority, state, 'q-enz-indep-competitive', WRONG);
    const entry = (await authority.getErrorLog(state))[0]!;
    expect(entry).not.toHaveProperty('cause');
  });

  it('lists misses only — a correct first attempt is not a mistake', async () => {
    const { authority, state } = learner();
    await answer(authority, state, 'q-enz-indep-competitive', CORRECT);
    await answer(authority, state, 'q-enz-indep-noncompetitive', WRONG);

    const log = await authority.getErrorLog(state);
    expect(log.map((e) => e.questionId)).toEqual(['q-enz-indep-noncompetitive']);
  });

  it('resolves a miss only via a later correct answer on a DIFFERENT item in the KC', async () => {
    const { authority, state } = learner();
    await answer(authority, state, 'q-enz-indep-competitive', WRONG);
    expect((await authority.getErrorLog(state))[0]!.resolved).toBe(false);

    // Re-answering the logged item is not evidence of repair, and the queue never
    // re-serves it anyway — a fresh sibling is what counts.
    await answer(authority, state, 'q-enz-indep-noncompetitive', CORRECT);
    const log = await authority.getErrorLog(state);
    expect(log.find((e) => e.questionId === 'q-enz-indep-competitive')!.resolved).toBe(true);
  });

  it('does not move mastery when the log is written', async () => {
    const { authority, state } = learner();
    await answer(authority, state, 'q-enz-indep-competitive', WRONG);
    const before = JSON.stringify(state.mastery);
    await authority.getErrorLog(state);
    await authority.getMistakePatterns(state);
    expect(JSON.stringify(state.mastery)).toBe(before);
  });
});

describe('Mistakes — pattern analysis at KC grain', () => {
  it('groups distinct items and always carries a denominator', async () => {
    const { authority, state } = learner();
    await answer(authority, state, INHIBITION_ITEMS[0], WRONG);
    await answer(authority, state, INHIBITION_ITEMS[1], WRONG);
    await answer(authority, state, INHIBITION_ITEMS[2], CORRECT);

    const patterns = await authority.getMistakePatterns(state);
    expect(patterns).toHaveLength(1);
    const pattern = patterns[0]!;
    expect(pattern.grain).toBe('kc');
    expect(pattern.key).toBe('bb1-enzyme-inhibition');
    expect(pattern.missedItems).toBe(2);
    // The denominator counts every distinct item attempted in the group, which is
    // why correct attempts are logged at all.
    expect(pattern.attemptedItems).toBe(3);
    expect(pattern.focus).toBe('bb1');
  });

  it('hedges a tiny sample and only asserts once there is enough evidence', async () => {
    const { authority, state } = learner();
    await answer(authority, state, INHIBITION_ITEMS[0], WRONG);
    await answer(authority, state, INHIBITION_ITEMS[1], WRONG);
    expect((await authority.getMistakePatterns(state))[0]!.assertable).toBe(false);

    await answer(authority, state, INHIBITION_ITEMS[2], WRONG);
    await answer(authority, state, INHIBITION_ITEMS[3], CORRECT);
    await answer(authority, state, INHIBITION_ITEMS[4], CORRECT);
    const pattern = (await authority.getMistakePatterns(state))[0]!;
    expect(pattern.missedItems).toBe(3);
    expect(pattern.attemptedItems).toBe(5);
    expect(pattern.assertable).toBe(true);
  });

  it('shows no pattern from a single miss', async () => {
    const { authority, state } = learner();
    await answer(authority, state, INHIBITION_ITEMS[0], WRONG);
    expect(await authority.getMistakePatterns(state)).toEqual([]);
  });
});

describe('Mistakes — Today’s Path counts what the tab shows', () => {
  const EMPTY_LOAD = {
    dueLearning: 0,
    dueReviews: 0,
    newAvailable: 0,
    due: 0,
    estimatedMinutesForDue: 0,
  };

  it('plans no Mistakes session on a day that starts with nothing on the tab', async () => {
    const { authority, state } = learner();
    authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 1260 });
    const view = await authority.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: [],
      force: true,
    });
    expect(await authority.openMistakes(state)).toEqual([]);
    expect(view.activities.some((a) => a.kind === 'review_mistakes')).toBe(false);
  });

  it('injects a Review Mistakes session sized to the open misses on the tab', async () => {
    const { authority, state } = learner();
    authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 1260 });
    await authority.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: [],
      force: true,
    });

    // Five misses, no correct answer in the KC, so nothing resolves.
    for (const questionId of INHIBITION_ITEMS.slice(0, 5)) {
      await answer(authority, state, questionId, WRONG);
    }

    const open = await authority.openMistakes(state);
    const tab = (await authority.getErrorLog(state)).filter((e) => !e.resolved);
    expect(open.length).toBe(tab.length);
    expect(open.length).toBe(5);

    const first = state.plan!.activities[0]!;
    await authority.recordPlanActivity(state, first.activityId, 'complete');
    const session = state.plan!.activities.find((a) => a.kind === 'review_mistakes');
    expect(session).toBeDefined();
    // The slot's promise is the tab's content, not a free-floating tally.
    expect(session!.count).toBe(open.length);
  });

  it('stops re-scheduling reviewed misses without hiding them from the tab', async () => {
    const { authority, state } = learner();
    authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 1260 });
    await authority.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: [],
      force: true,
    });
    for (const questionId of INHIBITION_ITEMS.slice(0, 5)) {
      await answer(authority, state, questionId, WRONG);
    }
    const first = state.plan!.activities[0]!;
    await authority.recordPlanActivity(state, first.activityId, 'complete');
    const session = state.plan!.activities.find((a) => a.kind === 'review_mistakes')!;

    await authority.recordPlanActivity(state, session.activityId, 'complete');

    expect(await authority.openMistakes(state)).toEqual([]);
    // Being read is not repair: they stay visible until a fresh item is answered.
    expect((await authority.getErrorLog(state)).filter((e) => !e.resolved)).toHaveLength(5);
  });

  it('does not inject a mid-day session below the pile-up threshold', async () => {
    const { authority, state } = learner();
    authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 1260 });
    await authority.buildTodaysPath(state, {
      recallLoad: EMPTY_LOAD,
      candidateLessons: [],
      force: true,
    });
    for (const questionId of INHIBITION_ITEMS.slice(0, 4)) {
      await answer(authority, state, questionId, WRONG);
    }
    const first = state.plan!.activities[0]!;
    await authority.recordPlanActivity(state, first.activityId, 'complete');
    expect(state.plan!.activities.some((a) => a.kind === 'review_mistakes')).toBe(false);
  });
});

describe('Mistakes — display scope', () => {
  it('excludes CARS duels and lesson misses (practice only)', async () => {
    const { authority, state } = learner();
    authority.recordCarsDuel(state, { position: 1, argument: 1, application: 1 });
    expect(await authority.getErrorLog(state)).toEqual([]);
    expect(await authority.getMistakePatterns(state)).toEqual([]);
  });

  it('drops a miss whose item has left the corpus rather than rendering an empty row', async () => {
    const clock = steppingClock('2026-07-27T12:00:00.000Z');
    const { authority, state } = learner(clock);
    await authority.practiceBank.recordPracticeAttempt(state.learnerId, {
      questionId: 'q-retired-from-corpus',
      kcId: 'bb1-enzyme-inhibition',
      skill: 'EXPLAIN',
      cluster: 'BB1',
      familyId: null,
      chosenChoiceId: 'B',
      correct: false,
      firstAttempt: true,
      activityType: 'practice',
      occurredAt: clock.now() as UtcTimestamp,
    });
    expect(await authority.getErrorLog(state)).toEqual([]);
  });
});
