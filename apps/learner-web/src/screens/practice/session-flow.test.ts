import { describe, expect, it } from 'vitest';
import { feedbackFor, subAfterAttempt } from './session-flow';

/**
 * The practice miss flow: no cause naming, and — since the 2026-07-29 amendment to
 * docs/design/error-handling-design.md §3.3, which reverses the 2026-07-28 one —
 * the key disclosed immediately on a miss, with no same-item re-ask at all. The
 * re-test a miss earns is a different item on the same KC × skill, owned by the
 * cross-session repair path. See docs/research/practice-feedback/00-DECISIONS.md.
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

describe('practice attempt flow', () => {
  it('lands every scored attempt on the disclosing card, right or wrong', () => {
    expect(subAfterAttempt()).toBe('reveal');
  });

  it('exposes no step that defers the key and no re-ask offset', async () => {
    // The withhold and the same-item resurface were removed together: the deferral
    // was only licensed by the guarantee that the same item returned, so neither
    // survives without the other. Guarding the module surface keeps a future change
    // from reintroducing one half alone.
    // Named symbols rather than an exact export list: the module legitimately grows
    // (`queueNotices` arrived with the queue-shortfall work), and freezing its whole
    // surface would make an unrelated addition look like a regression here.
    const flow = (await import('./session-flow')) as Record<string, unknown>;
    for (const gone of [
      'RETRY_GAP',
      'resurfaceAt',
      'subAfterFirstAttempt',
      'subAfterSecondAttempt',
    ]) {
      expect(flow[gone], `${gone} must not come back`).toBeUndefined();
    }
    expect(flow.subAfterAttempt).toBeTypeOf('function');
  });
});

describe('a MISS discloses everything at once', () => {
  const feedback = feedbackFor(RESULT, 'B');

  it('refutes the specific option that was chosen', () => {
    expect(feedback.correct).toBe(false);
    expect(feedback.wrongChoiceId).toBe('B');
    expect(feedback.wrongChoiceRationale).toBe(RESULT.choiceRationales.B);
  });

  it('gives the key AND the explanation of the key, not one or the other', () => {
    // The explanation is the half that carries transfer to unseen items (Butler,
    // Godbole & Marsh 2013: .45 with it vs .30 for the bare key and .28 for no
    // feedback at all), so a card with the letter and no prose is not sufficient.
    expect(feedback.correctChoiceId).toBe('D');
    expect(feedback.rationale).toBe(RESULT.rationale);
  });

  it('discloses on every wrong option, not just the one this fixture picked', () => {
    for (const pick of ['A', 'B', 'C'] as const) {
      const f = feedbackFor(RESULT, pick);
      expect(f.correctChoiceId).toBe('D');
      expect(f.rationale).toBe(RESULT.rationale);
      expect(f.wrongChoiceRationale).toBe(RESULT.choiceRationales[pick]);
    }
  });

  it('carries exactly the fields the card renders', () => {
    expect(Object.keys(feedback).sort()).toEqual([
      'correct',
      'correctChoiceId',
      'rationale',
      'wrongChoiceId',
      'wrongChoiceRationale',
    ]);
  });
});

describe('a correct attempt', () => {
  const feedback = feedbackFor(RESULT, 'D');

  it('confirms with the key and the general rationale, and refutes nothing', () => {
    expect(feedback.correct).toBe(true);
    expect(feedback.correctChoiceId).toBe('D');
    expect(feedback.rationale).toBe(RESULT.rationale);
    // Not "Correct: D" over a callout explaining why some other option misses.
    expect(feedback.wrongChoiceId).toBeNull();
    expect(feedback.wrongChoiceRationale).toBeNull();
  });
});

describe('an unanswered step', () => {
  it('names no wrong choice when nothing was picked, but still shows the key', () => {
    expect(feedbackFor(RESULT, null)).toMatchObject({
      correct: false,
      correctChoiceId: 'D',
      rationale: RESULT.rationale,
      wrongChoiceId: null,
      wrongChoiceRationale: null,
    });
  });

  it('tolerates an item with no refutation authored for the chosen option', () => {
    const sparse = { ...RESULT, choiceRationales: { D: 'only the key is explained' } };
    const f = feedbackFor(sparse, 'B');
    expect(f.wrongChoiceRationale).toBeNull();
    // The key still lands: a missing distractor refutation must not suppress it.
    expect(f.correctChoiceId).toBe('D');
    expect(f.rationale).toBe(sparse.rationale);
  });
});
