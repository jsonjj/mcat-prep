/**
 * The practice session's step machine, kept separate from the screen so the flow
 * decisions are testable without the authority client.
 *
 * The flow on a miss is: answer → immediate reveal (key + refutation of the
 * distractor they picked) → the item is re-inserted a few questions later for a
 * second pass. There is no step in between that asks the learner what happened.
 * See docs/design/error-handling-design.md §2.2–§2.3.
 */

export type Sub = 'answering' | 'retry' | 'reveal';

/** How many questions later a missed item comes back for its (spaced) second go. */
export const RETRY_GAP = 3;

/**
 * The step a scored first attempt lands on. Constant by design: a miss gets the
 * answer at the same moment a correct answer does. Feedback TIMING pools to
 * g = 0.03 while feedback CONTENT spans 0.05 → 0.49, so the screen is worth
 * spending on the refutation and not on a delay.
 */
export const subAfterFirstAttempt = (_correct: boolean): Sub => 'reveal';

/**
 * Where a missed item is re-inserted for its spaced second go. Clamped to the end
 * of the sequence, so the last remaining step retries immediately rather than
 * dropping the second pass — the behaviour the removed cause picker used to
 * produce.
 */
export const resurfaceAt = (index: number, sequenceLength: number, gap = RETRY_GAP): number =>
  Math.min(index + 1 + gap, sequenceLength);
