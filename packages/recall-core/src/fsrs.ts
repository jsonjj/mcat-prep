/**
 * FSRS-6 scheduling wrapper (never hand-rolled — delegates to `ts-fsrs`).
 *
 * Config locked to the plan: desired retention 0.90, learning steps 1m/10m,
 * relearning step 10m, no fuzz. Only "Again" is a lapse (Hard/Good/Easy pass).
 * All conversions keep our serializable CardScheduling in sync with ts-fsrs.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as TsCard,
  type FSRS,
  type FSRSParameters,
  type Grade,
} from 'ts-fsrs';
import type { CardScheduling, CardState, RecallRating, TimeInput } from './card';

export const RECALL_DESIRED_RETENTION = 0.9;
export const RECALL_LEARNING_STEPS = ['1m', '10m'] as const;
export const RECALL_RELEARNING_STEPS = ['10m'] as const;
export const RECALL_LEECH_THRESHOLD = 8;

export const RECALL_FSRS_PARAMETERS: FSRSParameters = generatorParameters({
  request_retention: RECALL_DESIRED_RETENTION,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: RECALL_LEARNING_STEPS,
  relearning_steps: RECALL_RELEARNING_STEPS,
});

let scheduler: FSRS | null = null;
const getScheduler = (): FSRS => (scheduler ??= fsrs(RECALL_FSRS_PARAMETERS));

const STATE_TO_NAME: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const NAME_TO_STATE: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const RATING_TO_GRADE: Record<RecallRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const toDate = (t: TimeInput): Date => (t instanceof Date ? new Date(t.getTime()) : new Date(t));

function toTsCard(s: CardScheduling): TsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningStep,
    reps: s.reps,
    lapses: s.lapses,
    state: NAME_TO_STATE[s.state],
    ...(s.lastReviewedAt !== null ? { last_review: new Date(s.lastReviewedAt) } : {}),
  };
}

function fromTsCard(c: TsCard): CardScheduling {
  return {
    state: STATE_TO_NAME[c.state],
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningStep: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    lastReviewedAt: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** Fresh scheduling state for a brand-new card. */
export function newScheduling(now: TimeInput): CardScheduling {
  return fromTsCard(createEmptyCard(toDate(now)));
}

export interface RateResult {
  scheduling: CardScheduling;
  /** Interval in days until the next review. */
  intervalDays: number;
}

/** Apply one rating and return the next scheduling state. */
export function rateScheduling(
  scheduling: CardScheduling,
  rating: RecallRating,
  now: TimeInput,
): RateResult {
  const item = getScheduler().next(toTsCard(scheduling), toDate(now), RATING_TO_GRADE[rating]);
  return { scheduling: fromTsCard(item.card), intervalDays: item.card.scheduled_days };
}

/** Current probability of recall (0–1) given elapsed time since the last review. */
export function retrievability(scheduling: CardScheduling, now: TimeInput): number {
  return getScheduler().get_retrievability(toTsCard(scheduling), toDate(now), false);
}

/** Only "Again" is a failure/lapse. */
export const isFailingRating = (rating: RecallRating): boolean => rating === 'again';
