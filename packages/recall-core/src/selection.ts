/**
 * Selection service — the core contract the app (and later Today's Path) calls to
 * get "the next X cards". Priority per the plan:
 *   1. due (re)learning cards,
 *   2. due/overdue reviews (most overdue first),
 *   3. new cards to fill remaining slots.
 * Never returns not-yet-due reviews early. No internal cap: the caller paces
 * volume by passing maxCards or a minutesBudget (converted via secondsPerCard).
 */
import { toMillis, type Card, type TimeInput } from './card';

export const DEFAULT_SECONDS_PER_CARD = 20;

export interface RecallLoad {
  dueLearning: number;
  dueReviews: number;
  newAvailable: number;
  /** Total cards due now (learning + relearning + review). */
  due: number;
  /** Rough minutes to clear the due queue at the supplied seconds/card. */
  estimatedMinutesForDue: number;
}

export interface ReviewQueueOptions {
  now: TimeInput;
  /** Hard cap on returned cards. Wins over minutesBudget when both are set. */
  maxCards?: number;
  /** The scheduler's daily recall time budget; converted to a count. */
  minutesBudget?: number;
  /** Rolling seconds-per-card estimate the adapter derives from the review log. */
  secondsPerCard?: number;
}

const isReviewable = (card: Card): boolean => card.deletedAt === null && !card.suspended;
const isDue = (card: Card, nowMs: number): boolean => toMillis(card.scheduling.due) <= nowMs;
const isLearning = (card: Card): boolean =>
  card.scheduling.state === 'learning' || card.scheduling.state === 'relearning';

function resolveLimit(options: ReviewQueueOptions): number | null {
  if (typeof options.maxCards === 'number') return Math.max(0, Math.floor(options.maxCards));
  if (typeof options.minutesBudget === 'number') {
    const spc =
      options.secondsPerCard && options.secondsPerCard > 0
        ? options.secondsPerCard
        : DEFAULT_SECONDS_PER_CARD;
    return Math.max(0, Math.floor((options.minutesBudget * 60) / spc));
  }
  return null;
}

/** Ordered review queue for the current learner. */
export function getReviewQueue(cards: readonly Card[], options: ReviewQueueOptions): Card[] {
  const nowMs = toMillis(options.now);
  const active = cards.filter(isReviewable);
  const byDue = (a: Card, b: Card): number =>
    toMillis(a.scheduling.due) - toMillis(b.scheduling.due);
  const byCreated = (a: Card, b: Card): number => toMillis(a.createdAt) - toMillis(b.createdAt);

  const learning = active.filter((c) => isLearning(c) && isDue(c, nowMs)).sort(byDue);
  const reviews = active
    .filter((c) => c.scheduling.state === 'review' && isDue(c, nowMs))
    .sort(byDue); // most overdue (smallest due) first
  const fresh = active.filter((c) => c.scheduling.state === 'new').sort(byCreated);

  const ordered = [...learning, ...reviews, ...fresh];
  const limit = resolveLimit(options);
  return limit === null ? ordered : ordered.slice(0, limit);
}

/** Load forecast the scheduler reads to decide the recall slice / review-debt band. */
export function estimateLoad(
  cards: readonly Card[],
  now: TimeInput,
  secondsPerCard: number = DEFAULT_SECONDS_PER_CARD,
): RecallLoad {
  const nowMs = toMillis(now);
  const active = cards.filter(isReviewable);
  const dueLearning = active.filter((c) => isLearning(c) && isDue(c, nowMs)).length;
  const dueReviews = active.filter(
    (c) => c.scheduling.state === 'review' && isDue(c, nowMs),
  ).length;
  const newAvailable = active.filter((c) => c.scheduling.state === 'new').length;
  const due = dueLearning + dueReviews;
  const spc = secondsPerCard > 0 ? secondsPerCard : DEFAULT_SECONDS_PER_CARD;
  return {
    dueLearning,
    dueReviews,
    newAvailable,
    due,
    estimatedMinutesForDue: Math.round((due * spc) / 60),
  };
}
