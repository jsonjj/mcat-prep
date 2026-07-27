/**
 * Recall ↔ Today's Path contract ("recall-today" implementation file).
 *
 * The daily scheduler (Today's Path) owns pacing; Recall owns cards. When the
 * scheduler builds the day it will hand Recall a **minutes budget** for the recall
 * slice; Recall converts that to a card count using a rolling seconds-per-card
 * estimate, fills the queue due-first then new (no internal cap), and returns a
 * session report the scheduler reads to apply its review-debt bands
 * (MCAT_APP_LEARNING_FLOW_PLAN §6: 20–30% ordinary; 30–40% reduce new; 50–60%
 * pause new). Until the real scheduler exists, the standalone Recall tab drives
 * itself and reports the same shape.
 *
 * Producer/consumer summary:
 *  - Today's Path PRODUCES: a RecallRequest (minutesBudget preferred, or maxCards).
 *  - Recall PRODUCES back: RecallLoad (forecast, read before the session) and a
 *    RecallSessionReport (after). Recall CONSUMES nothing authoritative from the
 *    scheduler beyond the budget.
 *  - Recall NEVER returns not-yet-due reviews early; the scheduler enforces the cap.
 */
import type { RecallRating } from './card';
import type { RecallLoad } from './selection';
import { DEFAULT_SECONDS_PER_CARD } from './selection';

/** What Today's Path asks Recall for. Prefer `minutesBudget`; `maxCards` wins if both set. */
export interface RecallRequest {
  minutesBudget?: number;
  maxCards?: number;
}

/** What Recall reports back after a session (feeds review-debt banding + minutes surfacing). */
export interface RecallSessionReport {
  cardsReviewed: number;
  minutesSpent: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  /** Remaining load right after the session. */
  remaining: RecallLoad;
}

/** Convert a scheduler minutes budget to a card count via a seconds-per-card estimate. */
export function minutesToCardCount(
  minutes: number,
  secondsPerCard: number = DEFAULT_SECONDS_PER_CARD,
): number {
  const spc = secondsPerCard > 0 ? secondsPerCard : DEFAULT_SECONDS_PER_CARD;
  return Math.max(0, Math.floor((minutes * 60) / spc));
}

/** Rolling seconds-per-card from recent review durations (adapter feeds elapsed times). */
export function rollingSecondsPerCard(
  recentElapsedSeconds: readonly number[],
  fallback: number = DEFAULT_SECONDS_PER_CARD,
): number {
  const usable = recentElapsedSeconds.filter((s) => s > 0 && Number.isFinite(s));
  if (usable.length === 0) return fallback;
  const mean = usable.reduce((sum, s) => sum + s, 0) / usable.length;
  return mean > 0 ? mean : fallback;
}

/** Tally a session's ratings for the report / daily recap. */
export function tallyRatings(
  ratings: readonly RecallRating[],
): Pick<RecallSessionReport, 'again' | 'hard' | 'good' | 'easy'> {
  const tally = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const rating of ratings) tally[rating] += 1;
  return tally;
}
