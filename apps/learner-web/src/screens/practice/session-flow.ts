/**
 * The practice session's step machine, kept separate from the screen so the flow
 * decisions are testable without the authority client.
 *
 * The flow on a miss is: answer → the key, the rationale that explains it, and the
 * refutation of the option the learner picked, all at once. No step defers the
 * key, and no step asks the learner what happened.
 *
 * Why disclosure is immediate. Feedback that never carries the correct answer is
 * worth about nothing: Pashler et al. (2005) found right/wrong-only feedback
 * statistically indistinguishable from a blank screen, while supplying the key
 * raised one-week retention by 494%. A withhold is therefore only defensible as a
 * *deferral*, and only while something guarantees the key still arrives — which,
 * in the shape this file used to have, was the same item returning a few
 * questions later. That guarantee is what paid for the delay, and it is worth
 * roughly nothing on its own: the unaided retry it bought self-corrects 4–9% of
 * the time (Finn & Metcalfe 2010), and multiple-try versus single-try feedback is
 * a flat null (Butler, Karpicke & Roediger 2007: .71 vs .71, then .64 vs .65).
 *
 * The re-test that replaces it is a different question on the same KC × skill,
 * which is a retrieval attempt *after* feedback rather than before it, and which
 * measures the concept instead of memory of one item (.30 on a new item vs .62 on
 * a repeat — Butler et al. 2013). It also cannot be solved by elimination, which
 * a re-ask with one option already refuted can. That re-test is owned by the
 * cross-session repair path (`PracticeRepairTarget` in `@mcat/policies`), not by
 * this file: an in-session sibling needs an item this session's queue does not
 * contain, because the queue holds at most one item per KC × skill by
 * construction.
 *
 * What is deliberately absent. There is no lag-0 re-ask. Retrying an item
 * immediately is the one arrangement in this literature with direct evidence of
 * harm (Karpicke & Roediger 2007: .19 at two days against .60 at a lag of five,
 * and worse than not retrying at all, .36). The old end-of-session clamp produced
 * exactly that whenever a miss landed in the last few steps; it was tolerable
 * only because the re-ask was then the sole route to the key.
 *
 * See docs/design/error-handling-design.md §3.3 (amended 2026-07-29) and
 * docs/research/practice-feedback/00-DECISIONS.md.
 */

/**
 * `answering` collects the attempt; `reveal` is the only answer-side card, and it
 * always discloses in full. The absence of a third step is the design.
 */
export type Sub = 'answering' | 'reveal';

/** The step a scored attempt lands on. Right or wrong, the learner gets the key. */
export const subAfterAttempt = (): Sub => 'reveal';

/**
 * The answer material a scored attempt returns. `PracticeAttemptResult` satisfies
 * it structurally; it is restated here so the card's contents are testable
 * without the contracts package and without a complete four-option rationale
 * record.
 */
export interface ScoredAnswer {
  readonly correctChoiceId: string;
  readonly rationale: string;
  readonly choiceRationales: Readonly<Record<string, string | undefined>>;
}

/** Everything the answer-side card renders. */
export interface Feedback {
  readonly correct: boolean;
  /** The key, and the explanation of it. Always present. */
  readonly correctChoiceId: string;
  readonly rationale: string;
  /** The wrong option chosen, and its refutation. Null on a correct answer. */
  readonly wrongChoiceId: string | null;
  readonly wrongChoiceRationale: string | null;
}

/**
 * The card's contents for a scored result.
 *
 * Both halves are supplied on a miss, and they do different work. The refutation
 * of the chosen option is what makes the feedback a *refutation* rather than a
 * bare correction, which is the form under which Van Loon et al. (2015) observed
 * confident errors being corrected at all. The explanation of the key is what
 * carries transfer to items the learner has not seen: Butler, Godbole & Marsh
 * (2013) measured .45 on new inference questions with it, against .30 for the
 * bare key and .28 for no feedback whatsoever (d = 0.90). Since every real MCAT
 * item is novel, dropping either half would forfeit most of the benefit.
 */
export function feedbackFor(result: ScoredAnswer, chosen: string | null): Feedback {
  const correct = chosen !== null && chosen === result.correctChoiceId;
  const wrongChoiceId = correct ? null : chosen;
  return {
    correct,
    correctChoiceId: result.correctChoiceId,
    rationale: result.rationale,
    wrongChoiceId,
    wrongChoiceRationale:
      wrongChoiceId === null ? null : (result.choiceRationales[wrongChoiceId] ?? null),
  };
}
