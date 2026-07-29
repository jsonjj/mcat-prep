/**
 * The practice session's step machine, kept separate from the screen so the flow
 * decisions are testable without the authority client.
 *
 * The flow on a miss is: answer → feedback refuting the option they picked, with
 * the key WITHHELD → the item is re-inserted a few questions later → a second
 * miss discloses everything. There is no step in between that asks the learner
 * what happened. See docs/design/error-handling-design.md §3.3 (amended
 * 2026-07-28) and §2.2–§2.3.
 */

/**
 * `feedback` and `reveal` are both answer-side cards; they differ only in whether
 * the key is disclosed, and that difference is the SINGLE thing that decides it —
 * see {@link feedbackFor}.
 */
export type Sub = 'answering' | 'retry' | 'feedback' | 'reveal';

/** The two answer-side steps, i.e. the ones {@link feedbackFor} builds a card for. */
export type AnswerSub = Extract<Sub, 'feedback' | 'reveal'>;

/** How many questions later a missed item comes back for its (spaced) second go. */
export const RETRY_GAP = 3;

/**
 * The step a scored FIRST attempt lands on. A correct answer is confirmed at
 * once, unchanged. A miss lands on `feedback`, which carries the refutation of
 * the option they chose and not the key; the item returns RETRY_GAP questions
 * later for the second go that discloses it.
 */
export const subAfterFirstAttempt = (correct: boolean): Sub => (correct ? 'reveal' : 'feedback');

/**
 * The step a SECOND attempt lands on: always `reveal`. Right or wrong, the second
 * go ends with the key — feedback that never contains the correct answer buys
 * "virtually no benefit" (Pashler et al. 2005), so the withhold is a single
 * deferral and not a policy of silence.
 */
export const subAfterSecondAttempt = (): Sub => 'reveal';

/**
 * Where a missed item is re-inserted for its spaced second go. Clamped to the end
 * of the sequence, so the last remaining step retries immediately rather than
 * dropping the second pass — the behaviour the removed cause picker used to
 * produce.
 */
export const resurfaceAt = (index: number, sequenceLength: number, gap = RETRY_GAP): number =>
  Math.min(index + 1 + gap, sequenceLength);

/**
 * The two ways a queue can arrive degraded, both reported by the authority on
 * `PracticeQueueView` and neither previously read by anything.
 *
 * - `taught-gap`: the authority found a real taught set that shared nothing
 *   with the loaded bank, so it served no science material rather than serving
 *   material the learner has not been taught. It means "not taught yet", not
 *   "something broke".
 * - `shortfall`: fewer items came back than were asked for.
 */
export type QueueNotice = 'taught-gap' | 'shortfall';

/** The queue facts a session has to be honest with the learner about. */
export interface QueueShape {
  readonly shortfall: number;
  readonly taughtGap: boolean;
}

/**
 * Which degraded-queue facts this session owes the learner, most specific
 * first. Both are reported independently, because they are not the same fact
 * and neither implies the other: a taught-set miss with CARS filling every
 * requested slot is a FULL queue (`shortfall === 0`) that is nonetheless
 * missing every science question the learner expected, and a shortfall with no
 * taught gap means the bank ran dry rather than the curriculum.
 */
export function queueNotices(view: QueueShape | undefined): QueueNotice[] {
  if (view === undefined) return [];
  const notices: QueueNotice[] = [];
  if (view.taughtGap) notices.push('taught-gap');
  if (view.shortfall > 0) notices.push('shortfall');
  return notices;
}

/**
 * The answer material a scored attempt returns. `PracticeAttemptResult` satisfies
 * it structurally; it is restated here so the redaction below is testable without
 * the contracts package and without a complete four-option rationale record.
 */
export interface ScoredAnswer {
  readonly correctChoiceId: string;
  readonly rationale: string;
  readonly choiceRationales: Readonly<Record<string, string | undefined>>;
}

/**
 * Everything the answer-side card is allowed to render, after redaction.
 *
 * The point of this type is that the withheld fields are `null` rather than
 * merely unrendered: the card component is handed a `Feedback`, never a
 * `PracticeAttemptResult`, so on a first miss the key is not reachable from the
 * component that draws the DOM. The server response legitimately carries the key
 * (the retry is scored locally, with no second round trip), so this redaction at
 * the render boundary is where the discipline has to live.
 */
export interface Feedback {
  readonly correct: boolean;
  /** The key, and the explanation of it. Both null while the key is withheld. */
  readonly correctChoiceId: string | null;
  readonly rationale: string | null;
  /** The wrong option just chosen, and its refutation. Shown on every miss. */
  readonly wrongChoiceId: string | null;
  readonly wrongChoiceRationale: string | null;
}

/**
 * Redact a scored result down to what `sub` licenses.
 *
 * `chosen` is the option picked on THIS attempt, which is why correctness is
 * recomputed here rather than read off `result.correct`: on a second go the
 * result object is the first attempt's, and its `correct` is false by
 * construction.
 */
export function feedbackFor(result: ScoredAnswer, chosen: string | null, sub: AnswerSub): Feedback {
  const correct = chosen !== null && chosen === result.correctChoiceId;
  const disclose = sub === 'reveal';
  const wrongChoiceId = correct ? null : chosen;
  return {
    correct,
    correctChoiceId: disclose ? result.correctChoiceId : null,
    rationale: disclose ? result.rationale : null,
    wrongChoiceId,
    wrongChoiceRationale:
      wrongChoiceId === null ? null : (result.choiceRationales[wrongChoiceId] ?? null),
  };
}
