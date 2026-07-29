import { describe, expect, it } from 'vitest';
import {
  RETRY_GAP,
  feedbackFor,
  resurfaceAt,
  subAfterFirstAttempt,
  subAfterSecondAttempt,
} from './session-flow';

/**
 * The practice miss flow: no cause naming, spaced resurface kept, and — since the
 * 2026-07-28 amendment to docs/design/error-handling-design.md §3.3 — the correct
 * answer withheld until a SECOND miss. See also §2.2–§2.3 on what stayed dropped.
 */

/** A four-option item whose key is D, with a refutation for every distractor. */
const RESULT = {
  correctChoiceId: 'D',
  rationale: 'D is right because the inhibitor is competitive.',
  choiceRationales: {
    A: 'A assumes Vmax falls, which is the noncompetitive case.',
    B: 'B reverses the sign convention on ΔG.',
    C: 'C reads the intercept rather than the slope.',
    D: 'D is the competitive case.',
  },
} as const;

describe('practice miss flow', () => {
  it('confirms a correct first attempt at once and withholds on a miss', () => {
    expect(subAfterFirstAttempt(true)).toBe('reveal');
    expect(subAfterFirstAttempt(false)).toBe('feedback');
  });

  it('always discloses on the second attempt, right or wrong', () => {
    expect(subAfterSecondAttempt()).toBe('reveal');
  });

  it('still re-inserts the missed item a few questions later', () => {
    // Mid-session: the item comes back after a gap, not on the next screen.
    expect(resurfaceAt(0, 8)).toBe(1 + RETRY_GAP);
    expect(resurfaceAt(2, 8)).toBe(3 + RETRY_GAP);
    expect(resurfaceAt(0, 8)).toBeGreaterThan(1);
  });

  it('keeps the second pass on the last remaining step rather than dropping it', () => {
    // index 7 of an 8-step sequence: clamped to the end, so it retries next.
    expect(resurfaceAt(7, 8)).toBe(8);
    expect(resurfaceAt(6, 8)).toBe(8);
  });

  it('never re-inserts before the step that follows the miss', () => {
    for (const [index, length] of [
      [0, 1],
      [3, 4],
      [5, 12],
    ] as const) {
      expect(resurfaceAt(index, length)).toBeGreaterThanOrEqual(index + 1);
    }
  });
});

describe('a FIRST miss gets the refutation and nothing that names the key', () => {
  // 'feedback' is exactly what `subAfterFirstAttempt(false)` returns, asserted above.
  const feedback = feedbackFor(RESULT, 'B', 'feedback');

  it('refutes the specific option that was chosen', () => {
    expect(feedback.correct).toBe(false);
    expect(feedback.wrongChoiceId).toBe('B');
    expect(feedback.wrongChoiceRationale).toBe(RESULT.choiceRationales.B);
  });

  it('withholds the key and the explanation OF the key', () => {
    expect(feedback.correctChoiceId).toBeNull();
    // `rationale` explains why the correct answer is correct, so it names the key
    // as surely as the letter does.
    expect(feedback.rationale).toBeNull();
  });

  it('carries no other field the key could be read out of', () => {
    // The whole point of the redaction: the values reachable from the card cannot
    // spell, contain, or index the answer. Every rationale but the chosen one is
    // gone, so the correct choice's own explanation is not among them either.
    const rendered = Object.values(feedback).filter((v) => v !== null);
    expect(rendered).not.toContain('D');
    expect(rendered).not.toContain(RESULT.rationale);
    expect(rendered).not.toContain(RESULT.choiceRationales.D);
    expect(JSON.stringify(feedback)).not.toContain(RESULT.rationale);
    expect(Object.keys(feedback).sort()).toEqual([
      'correct',
      'correctChoiceId',
      'rationale',
      'wrongChoiceId',
      'wrongChoiceRationale',
    ]);
  });

  it('withholds on every wrong option, not just the one this fixture picked', () => {
    for (const pick of ['A', 'B', 'C'] as const) {
      const f = feedbackFor(RESULT, pick, 'feedback');
      expect(f.correctChoiceId).toBeNull();
      expect(f.rationale).toBeNull();
      expect(f.wrongChoiceRationale).toBe(RESULT.choiceRationales[pick]);
    }
  });
});

describe('a correct FIRST attempt is unchanged', () => {
  const feedback = feedbackFor(RESULT, 'D', 'reveal');

  it('confirms with the key and the general rationale, and refutes nothing', () => {
    expect(feedback.correct).toBe(true);
    expect(feedback.correctChoiceId).toBe('D');
    expect(feedback.rationale).toBe(RESULT.rationale);
    expect(feedback.wrongChoiceId).toBeNull();
    expect(feedback.wrongChoiceRationale).toBeNull();
  });
});

describe('the SECOND attempt', () => {
  it('discloses fully on a second miss: key, rationale, and the new refutation', () => {
    // The result object is still the FIRST attempt's, so correctness has to be
    // recomputed from this attempt's pick rather than read off `result.correct`.
    const feedback = feedbackFor(RESULT, 'C', 'reveal');
    expect(feedback.correct).toBe(false);
    expect(feedback.correctChoiceId).toBe('D');
    expect(feedback.rationale).toBe(RESULT.rationale);
    expect(feedback.wrongChoiceId).toBe('C');
    expect(feedback.wrongChoiceRationale).toBe(RESULT.choiceRationales.C);
  });

  it('reads as a plain correct answer when it lands, with nothing to contradict it', () => {
    const feedback = feedbackFor(RESULT, 'D', 'reveal');
    expect(feedback.correct).toBe(true);
    expect(feedback.correctChoiceId).toBe('D');
    expect(feedback.rationale).toBe(RESULT.rationale);
    // Not "Correct: D" over a callout explaining why the first pick misses.
    expect(feedback.wrongChoiceId).toBeNull();
    expect(feedback.wrongChoiceRationale).toBeNull();
  });

  it('does not treat the first attempt’s recorded miss as this attempt’s outcome', () => {
    const second = feedbackFor(RESULT, 'D', 'reveal');
    const first = feedbackFor(RESULT, 'B', 'feedback');
    expect(first.correct).toBe(false);
    expect(second.correct).toBe(true);
  });
});

describe('an unanswered step', () => {
  it('names no wrong choice when nothing was picked', () => {
    expect(feedbackFor(RESULT, null, 'feedback')).toMatchObject({
      correct: false,
      correctChoiceId: null,
      wrongChoiceId: null,
      wrongChoiceRationale: null,
    });
  });

  it('tolerates an item with no refutation authored for the chosen option', () => {
    const sparse = { ...RESULT, choiceRationales: { D: 'only the key is explained' } };
    expect(feedbackFor(sparse, 'B', 'feedback').wrongChoiceRationale).toBeNull();
  });
});
