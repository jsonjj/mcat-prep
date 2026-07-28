import { describe, expect, it } from 'vitest';
import { fixedClock } from '@mcat/contracts';
import { PRIOR_PL0 } from '@mcat/policies';
import { Authority } from './authority';
import type { LearnerState } from './types';

const CLOCK = fixedClock('2026-07-27T12:00:00.000Z');

function freshLearner(): { authority: Authority; state: LearnerState } {
  const authority = new Authority(undefined, CLOCK);
  return { authority, state: authority.createGuest() };
}

async function firstQueuedScienceItem(authority: Authority, state: LearnerState) {
  const queue = await authority.getPracticeQueue(state, 5);
  const item = queue.items.find((i) => i.domain === 'science');
  if (item === undefined) throw new Error('expected a science practice item from the synthetic bank');
  return item;
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
