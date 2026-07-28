import { describe, expect, it } from 'vitest';
import {
  blockKeyOf,
  blockNavigationReducer,
  countAnswered,
  initialBlockState,
  type BlockNavigationSnapshot,
  type BlockQuestion,
} from './use-block-navigation';

const block = (...ids: string[]): BlockQuestion[] => ids.map((questionId) => ({ questionId }));

const stateFor = (questions: readonly BlockQuestion[]): BlockNavigationSnapshot =>
  initialBlockState(blockKeyOf(questions), questions.length);

describe('blockKeyOf', () => {
  it('is stable across separate arrays with the same questions', () => {
    expect(blockKeyOf(block('q1', 'q2', 'q3'))).toBe(blockKeyOf(block('q1', 'q2', 'q3')));
  });

  it('changes when the stage serves different questions', () => {
    expect(blockKeyOf(block('q1', 'q2'))).not.toBe(blockKeyOf(block('q1', 'q3')));
    expect(blockKeyOf(block('q1', 'q2'))).not.toBe(blockKeyOf(block('q2', 'q1')));
    expect(blockKeyOf(block('q1', 'q2'))).not.toBe(blockKeyOf(block('q1', 'q2', 'q3')));
  });

  it('cannot be spoofed by ids that concatenate to the same string', () => {
    expect(blockKeyOf(block('a', 'bc'))).not.toBe(blockKeyOf(block('ab', 'c')));
  });
});

describe('blockNavigationReducer navigation', () => {
  it('clamps goTo instead of throwing', () => {
    const state = stateFor(block('q1', 'q2', 'q3'));

    expect(blockNavigationReducer(state, { type: 'goTo', index: -5 }).currentIndex).toBe(0);
    expect(blockNavigationReducer(state, { type: 'goTo', index: 99 }).currentIndex).toBe(2);
    expect(blockNavigationReducer(state, { type: 'goTo', index: 1.7 }).currentIndex).toBe(1);
    expect(blockNavigationReducer(state, { type: 'goTo', index: Number.NaN }).currentIndex).toBe(0);
  });

  it('clamps goTo to 0 for an empty block', () => {
    expect(blockNavigationReducer(stateFor([]), { type: 'goTo', index: 3 }).currentIndex).toBe(0);
  });

  it('stops at both ends when stepping', () => {
    const state = stateFor(block('q1', 'q2'));

    expect(blockNavigationReducer(state, { type: 'step', delta: -1 }).currentIndex).toBe(0);

    const last = blockNavigationReducer(state, { type: 'step', delta: 1 });
    expect(last.currentIndex).toBe(1);
    expect(blockNavigationReducer(last, { type: 'step', delta: 1 }).currentIndex).toBe(1);
  });

  it('returns the same object when nothing moves, so React can skip a render', () => {
    const state = stateFor(block('q1', 'q2'));
    expect(blockNavigationReducer(state, { type: 'goTo', index: 0 })).toBe(state);
    expect(blockNavigationReducer(state, { type: 'step', delta: -1 })).toBe(state);
  });
});

describe('blockNavigationReducer answers', () => {
  it('lets an answer be changed any number of times before submit', () => {
    let state = stateFor(block('q1', 'q2'));
    state = blockNavigationReducer(state, { type: 'answer', questionId: 'q1', choiceId: 'A' });
    state = blockNavigationReducer(state, { type: 'answer', questionId: 'q1', choiceId: 'C' });
    state = blockNavigationReducer(state, { type: 'answer', questionId: 'q1', choiceId: 'B' });

    expect(state.answers).toEqual({ q1: 'B' });
  });

  it('does not mutate the previous answers object', () => {
    const state = stateFor(block('q1'));
    const next = blockNavigationReducer(state, { type: 'answer', questionId: 'q1', choiceId: 'A' });

    expect(state.answers).toEqual({});
    expect(next.answers).not.toBe(state.answers);
  });

  it('keeps navigation independent of answering', () => {
    let state = stateFor(block('q1', 'q2', 'q3'));
    state = blockNavigationReducer(state, { type: 'goTo', index: 2 });
    state = blockNavigationReducer(state, { type: 'answer', questionId: 'q3', choiceId: 'D' });

    expect(state.currentIndex).toBe(2);
    expect(state.answers.q3).toBe('D');
  });
});

describe('blockNavigationReducer flags', () => {
  it('toggles a flag on and back off', () => {
    let state = stateFor(block('q1'));
    state = blockNavigationReducer(state, { type: 'toggleFlag', questionId: 'q1' });
    expect(state.flagged.has('q1')).toBe(true);

    state = blockNavigationReducer(state, { type: 'toggleFlag', questionId: 'q1' });
    expect(state.flagged.has('q1')).toBe(false);
  });

  it('produces a new set so consumers re-render', () => {
    const state = stateFor(block('q1'));
    const next = blockNavigationReducer(state, { type: 'toggleFlag', questionId: 'q1' });

    expect(next.flagged).not.toBe(state.flagged);
    expect(state.flagged.size).toBe(0);
  });
});

describe('block reset', () => {
  it('drops answers, flags and position when the stage changes', () => {
    const stageOne = block('q1', 'q2');
    let state = stateFor(stageOne);
    state = blockNavigationReducer(state, { type: 'goTo', index: 1 });
    state = blockNavigationReducer(state, { type: 'answer', questionId: 'q2', choiceId: 'A' });
    state = blockNavigationReducer(state, { type: 'toggleFlag', questionId: 'q2' });

    const stageTwo = block('q7', 'q8', 'q9');
    expect(state.key).not.toBe(blockKeyOf(stageTwo));

    const reset = stateFor(stageTwo);
    expect(reset.currentIndex).toBe(0);
    expect(reset.answers).toEqual({});
    expect(reset.flagged.size).toBe(0);
    expect(reset.count).toBe(3);
  });
});

describe('countAnswered', () => {
  it('counts only questions in the current block', () => {
    expect(countAnswered(block('q1', 'q2'), { q1: 'A', q9: 'B' })).toBe(1);
  });

  it('is zero for an empty block', () => {
    expect(countAnswered([], { q1: 'A' })).toBe(0);
  });
});
