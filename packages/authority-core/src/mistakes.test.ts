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

/**
 * The real v3 KC the synthetic inhibition items carry ("Distinguish enzyme
 * inhibition and regulation"). Both write paths log this id space, which is what
 * lets a study miss and a practice miss on one concept form ONE pattern.
 */
const KC_INHIBITION = 'V3-KC-525816';

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

const SPEC_ID = 'sci:bb1-enzyme-inhibition:EXPLAIN:train';

/**
 * Serve, then answer — the two halves the product performs in that order.
 *
 * These tests name the exact items they want a mistake on, which the queue's
 * own selection will not reliably hand over, so the serve is issued directly
 * through the port. It has to be issued by SOMETHING: an adaptive-practice
 * answer is only scored for an item the server recorded serving to this
 * learner, which is what stops a caller answering straight out of the corpus.
 * Standing in for the queue is the point — nothing here is testing selection.
 */
const answer = async (
  authority: Authority,
  state: LearnerState,
  questionId: string,
  choice: string,
) => {
  await authority.practiceBank.issueAttemptGrant(state.learnerId, {
    questionId,
    specId: SPEC_ID,
    contentRelease: authority.bank.contentRelease,
    expiresAt: UtcTimestampSchema.parse('2099-01-01T00:00:00.000Z'),
  });
  return authority.submitPracticeAttempt(state, {
    questionId,
    specId: SPEC_ID,
    chosenChoiceId: choice as 'A' | 'B',
  });
};

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
    // Real grain, not the old `skillId: ENZYME_SKILL` hardcode. A v3 KC id: the
    // fixture reports the id space the deployed port reads out of `questions.kc_id`.
    expect(entry.kcId).toBe(KC_INHIBITION);
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
    expect(pattern.key).toBe(KC_INHIBITION);
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

/**
 * The regression this pins: pattern grouping keys on the logged `kcId`, and the two
 * write paths filled it from different fields — Practice from the corpus KC
 * (`V3-KC-525816`), Study from an internal skill-graph node
 * (`bb1-enzyme-inhibition`). Those never compare equal, so one concept produced two
 * patterns, each with half the evidence, on the surface whose whole job is to say
 * "this keeps happening".
 *
 * There is no crosswalk to build: the lesson graph and the question corpus use the
 * SAME 422 KCs — 422 distinct ids in each, all 422 present in both, none unique to
 * either side. Study just had to log the id the item already carries.
 */
describe('Mistakes — one KC, one pattern, whichever surface served it', () => {
  /** Drive the real Study loop to its first question, then answer it. */
  const studyAnswer = async (authority: Authority, state: LearnerState, choice: string) => {
    let next = authority.diagnosticNext(state);
    while (!next.done) {
      authority.submitDiagnosticAnswer(state, next.questionId!, 'A');
      next = authority.diagnosticNext(state);
    }
    authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
    authority.continueStep(state); // past the lesson, onto q-enz-indep-competitive
    const step = authority.getSession(state);
    expect(step.kind).toBe('question');
    await authority.submitAttempt(state, choice);
    return (step as { question: { id: string } }).question.id;
  };

  it('groups a study miss and a practice miss on the same KC into ONE pattern', async () => {
    const { authority, state } = learner();

    const studyItem = await studyAnswer(authority, state, WRONG);
    // A DIFFERENT item, same KC, through the other surface entirely.
    await answer(authority, state, 'q-enz-indep-noncompetitive', WRONG);

    const attempts = await authority.practiceBank.listPracticeAttempts(state.learnerId, {
      limit: 50,
    });
    // Both surfaces wrote, and both wrote the same KC — the thing that was broken.
    expect(attempts.map((a) => a.activityType).sort()).toEqual(['practice', 'study']);
    expect(new Set(attempts.map((a) => a.kcId))).toEqual(new Set([KC_INHIBITION]));

    const patterns = await authority.getMistakePatterns(state);
    expect(patterns).toHaveLength(1);
    const pattern = patterns[0]!;
    expect(pattern.grain).toBe('kc');
    expect(pattern.key).toBe(KC_INHIBITION);
    // Two distinct items missed across the two surfaces, not one item on each of
    // two patterns.
    expect(pattern.missedItems).toBe(2);
    expect(pattern.attemptedItems).toBe(2);
    expect(new Set([studyItem, 'q-enz-indep-noncompetitive']).size).toBe(2);
  });

  it('counts a correct answer from either surface in the same denominator', async () => {
    const { authority, state } = learner();

    await studyAnswer(authority, state, WRONG);
    await answer(authority, state, 'q-enz-indep-noncompetitive', WRONG);
    // A correct practice answer on a third item in the KC widens the denominator of
    // the pattern the study miss belongs to.
    await answer(authority, state, 'q-enz-transfer-lineweaver', CORRECT);

    const pattern = (await authority.getMistakePatterns(state))[0]!;
    expect(pattern.missedItems).toBe(2);
    expect(pattern.attemptedItems).toBe(3);
  });

  it('lets a practice answer resolve a study miss, because the KC is shared', async () => {
    const { authority, state } = learner();

    const studyItem = await studyAnswer(authority, state, WRONG);
    expect((await authority.getErrorLog(state))[0]!.resolved).toBe(false);

    // A later correct first attempt on a DIFFERENT item in the same KC — served by
    // the other surface. Resolution compares `kcId`, so this only lands now that
    // both paths log the same one.
    await answer(authority, state, 'q-enz-indep-noncompetitive', CORRECT);

    const row = (await authority.getErrorLog(state)).find((e) => e.questionId === studyItem)!;
    expect(row.resolved).toBe(true);
  });
});

/**
 * Not every logged row can carry a KC: the engine projection predates the grain, and
 * CARS items have no KC at all. Such a row must degrade, never disappear or throw.
 */
describe('Mistakes — a row with no KC id', () => {
  const log = (
    authority: Authority,
    state: LearnerState,
    questionId: string,
    over: Partial<Parameters<typeof authority.practiceBank.recordPracticeAttempt>[1]>,
  ) =>
    authority.practiceBank.recordPracticeAttempt(state.learnerId, {
      questionId,
      kcId: null,
      skill: 'EXPLAIN',
      cluster: 'BB1',
      familyId: null,
      chosenChoiceId: 'B',
      correct: false,
      firstAttempt: true,
      activityType: 'practice',
      occurredAt: UtcTimestampSchema.parse('2026-07-27T12:00:00.000Z'),
      ...over,
    });

  it('still appears in the history list', async () => {
    const { authority, state } = learner();
    await log(authority, state, 'q-enz-indep-competitive', {});

    const entries = await authority.getErrorLog(state);
    expect(entries.map((e) => e.questionId)).toEqual(['q-enz-indep-competitive']);
    expect(entries[0]!.kcId).toBeNull();
    // The row is still actionable: the cluster carries the re-attempt token.
    expect(entries[0]!.focus).toBe('bb1');
  });

  it('falls back to cluster grain rather than forming a null-keyed pattern', async () => {
    const { authority, state } = learner();
    await log(authority, state, 'q-enz-indep-competitive', {});
    await log(authority, state, 'q-enz-indep-noncompetitive', {});

    const patterns = await authority.getMistakePatterns(state);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.grain).toBe('cluster');
    expect(patterns[0]!.key).toBe('BB1');
    expect(patterns[0]!.missedItems).toBe(2);
  });

  it('joins no pattern when it has neither KC nor cluster, but is still listed', async () => {
    const { authority, state } = learner();
    await log(authority, state, 'q-enz-indep-competitive', { cluster: null });
    await log(authority, state, 'q-enz-indep-noncompetitive', { cluster: null });

    // Ungroupable is not the same as unlistable: the learner can still read the
    // miss back, it just cannot honestly be called a recurring pattern.
    expect(await authority.getMistakePatterns(state)).toEqual([]);
    expect((await authority.getErrorLog(state)).map((e) => e.questionId).sort()).toEqual([
      'q-enz-indep-competitive',
      'q-enz-indep-noncompetitive',
    ]);
  });

  it('does not let an unkeyed row swallow a real KC pattern', async () => {
    const { authority, state } = learner();
    await answer(authority, state, 'q-enz-indep-competitive', WRONG);
    await answer(authority, state, 'q-enz-transfer-lineweaver', WRONG);
    await log(authority, state, 'q-enz-passage-1', { cluster: null });

    const patterns = await authority.getMistakePatterns(state);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.key).toBe(KC_INHIBITION);
    expect(patterns[0]!.missedItems).toBe(2);
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
      kcId: KC_INHIBITION,
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
