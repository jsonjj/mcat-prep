/**
 * Interaction state for one multistage-testing block: which question is on
 * screen, the learner's draft answers, and which questions they flagged to
 * revisit. Nothing here is committed — the whole block is submitted at once,
 * so an answer may be changed any number of times before then.
 *
 * Deliberately headless and HTTP-free: the screen owns fetching and submitting.
 */

import { useCallback, useMemo, useState } from 'react';

export interface BlockQuestion {
  questionId: string;
}

export interface BlockNavigationState {
  currentIndex: number;
  /** questionId -> chosen choiceId. Drafts; nothing is committed until block submit. */
  answers: Readonly<Record<string, string>>;
  /** questionIds the learner marked to come back to. */
  flagged: ReadonlySet<string>;
  answeredCount: number;
  allAnswered: boolean;
}

export interface BlockNavigationApi extends BlockNavigationState {
  goTo(index: number): void;
  next(): void;
  previous(): void;
  answer(questionId: string, choiceId: string): void;
  toggleFlag(questionId: string): void;
}

export type BlockNavigationAction =
  | { type: 'goTo'; index: number }
  | { type: 'step'; delta: number }
  | { type: 'answer'; questionId: string; choiceId: string }
  | { type: 'toggleFlag'; questionId: string };

/**
 * Reducer state. `count` travels with the state so clamping stays a pure
 * function of (state, action) and resets can never leave a stale bound behind.
 */
export interface BlockNavigationSnapshot {
  key: string;
  count: number;
  currentIndex: number;
  answers: Record<string, string>;
  flagged: ReadonlySet<string>;
}

const EMPTY_FLAGS: ReadonlySet<string> = new Set<string>();

/**
 * Content-derived identity for a block. Array identity is not usable: a parent
 * that maps the wire payload in render produces a new array every render, which
 * would wipe the learner's answers mid-block. Stage changes swap the question
 * ids, so the ids themselves are the honest signal. The separator is a
 * character that cannot appear in an id.
 */
export function blockKeyOf(questions: readonly BlockQuestion[]): string {
  return questions.map((q) => q.questionId).join('\u0000');
}

export function initialBlockState(key: string, count: number): BlockNavigationSnapshot {
  return { key, count, currentIndex: 0, answers: {}, flagged: EMPTY_FLAGS };
}

function clampIndex(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), count - 1);
}

export function blockNavigationReducer(
  state: BlockNavigationSnapshot,
  action: BlockNavigationAction,
): BlockNavigationSnapshot {
  switch (action.type) {
    case 'goTo': {
      const currentIndex = clampIndex(action.index, state.count);
      return currentIndex === state.currentIndex ? state : { ...state, currentIndex };
    }
    case 'step': {
      const currentIndex = clampIndex(state.currentIndex + action.delta, state.count);
      return currentIndex === state.currentIndex ? state : { ...state, currentIndex };
    }
    case 'answer': {
      if (state.answers[action.questionId] === action.choiceId) return state;
      return { ...state, answers: { ...state.answers, [action.questionId]: action.choiceId } };
    }
    case 'toggleFlag': {
      const flagged = new Set(state.flagged);
      if (!flagged.delete(action.questionId)) flagged.add(action.questionId);
      return { ...state, flagged };
    }
    default:
      return state;
  }
}

export function countAnswered(
  questions: readonly BlockQuestion[],
  answers: Readonly<Record<string, string>>,
): number {
  let seen = 0;
  for (const q of questions) {
    if (answers[q.questionId] !== undefined) seen += 1;
  }
  return seen;
}

export function useBlockNavigation(questions: readonly BlockQuestion[]): BlockNavigationApi {
  const key = useMemo(() => blockKeyOf(questions), [questions]);

  const [stored, setStored] = useState(() => initialBlockState(key, questions.length));

  // Reset during render rather than in an effect, so the caller never gets a
  // frame where stage 2's questions are paired with stage 1's answers.
  let state = stored;
  if (state.key !== key) {
    state = initialBlockState(key, questions.length);
    setStored(state);
  }

  const apply = useCallback((action: BlockNavigationAction) => {
    setStored((current) => blockNavigationReducer(current, action));
  }, []);

  const goTo = useCallback((index: number) => apply({ type: 'goTo', index }), [apply]);
  const next = useCallback(() => apply({ type: 'step', delta: 1 }), [apply]);
  const previous = useCallback(() => apply({ type: 'step', delta: -1 }), [apply]);
  const answer = useCallback(
    (questionId: string, choiceId: string) => apply({ type: 'answer', questionId, choiceId }),
    [apply],
  );
  const toggleFlag = useCallback(
    (questionId: string) => apply({ type: 'toggleFlag', questionId }),
    [apply],
  );

  const answeredCount = countAnswered(questions, state.answers);

  return {
    currentIndex: state.currentIndex,
    answers: state.answers,
    flagged: state.flagged,
    answeredCount,
    allAnswered: questions.length > 0 && answeredCount === questions.length,
    goTo,
    next,
    previous,
    answer,
    toggleFlag,
  };
}
