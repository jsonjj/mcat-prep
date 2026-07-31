import {
  loadPassagePool,
  type PassageChoiceId,
  type PassageOfTheDayEntry,
  type PassageQuestion,
} from '../../../content/passage-of-the-day/pool';

/**
 * Passage of the Day — server-side selection, learner-safe views, and scoring.
 *
 * FORMATIVE BY CONSTRUCTION. This module never touches the authority kernel: it
 * reads a vetted content pool, picks the day's passage deterministically, hands
 * the browser a learner-safe view, and scores an answer by comparing it with the
 * pool's key. It writes no mastery, no attempt log, and no CARS reasoning signal
 * — it is display + score only, exactly as the Passage of the Day is meant to be.
 *
 * Node-only: the pool it imports carries answer keys and per-choice rationales,
 * so like the diagnostic and practice banks this module runs solely inside the
 * dev/preview server (loaded via `ssrLoadModule`) and never enters the browser
 * bundle. The learner-safe view it produces cannot represent a key or rationale.
 */

/** A learner-safe answer option — text only, never a rationale. */
export interface PassageChoiceView {
  readonly id: PassageChoiceId;
  readonly text: string;
}

/** A learner-safe question — no key, no rationale. */
export interface PassageQuestionView {
  readonly id: string;
  readonly stem: string;
  readonly choices: readonly PassageChoiceView[];
}

/** The day's passage as delivered to the browser. Carries no scoring material. */
export interface PassageTodayView {
  readonly id: string;
  readonly title: string;
  readonly discipline: string;
  readonly body: readonly string[];
  readonly questions: readonly PassageQuestionView[];
  /** Which passage in the rotation this is, and how many exist — for display/telemetry. */
  readonly dayIndex: number;
  readonly poolSize: number;
  /** The learner-local day this selection is keyed to (`YYYY-MM-DD`), for display. */
  readonly localDate: string;
}

/**
 * Answer-bearing feedback, returned only after the learner commits an answer.
 * Mirrors the study/practice reveal shape so the runner renders it identically.
 */
export interface PassageGrade {
  readonly correct: boolean;
  readonly correctChoiceId: PassageChoiceId;
  /** Why the correct answer is correct. */
  readonly rationale: string;
  /** The explanation for the option the learner picked, or null if they picked none. */
  readonly choiceRationale: string | null;
}

const DAY_MS = 86_400_000;
/**
 * Learner-local day rollover, in hours. Matches the authority's Today's-Path day
 * boundary (`planDateFor` in `@mcat/authority-core`): the local day flips at
 * 4 AM, so a late-night session still counts as the same day. Reused here so the
 * passage rotates on exactly the boundary the rest of the app already uses.
 */
const DAY_ROLLOVER_HOURS = 4;

export function isPassageChoiceId(value: unknown): value is PassageChoiceId {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

/**
 * The learner-local day, shifted to a monotonic integer index.
 *
 * `timezoneOffsetMinutes` is the browser's `Date.getTimezoneOffset()` (UTC minus
 * local, in minutes), the same value the Today's-Path build already sends. We
 * shift UTC to local, back off the 4 AM rollover, and floor to whole days. The
 * result increases by exactly one each local day, so `index % poolSize` walks the
 * pool in order and repeats only after a full cycle.
 */
export function learnerLocalDayIndex(now: Date, timezoneOffsetMinutes: number): number {
  const offset = Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : 0;
  const shiftedMs = now.getTime() - offset * 60_000 - DAY_ROLLOVER_HOURS * 60 * 60 * 1000;
  return Math.floor(shiftedMs / DAY_MS);
}

/** The learner-local calendar date (`YYYY-MM-DD`) for a day index, for display. */
export function localDateFromDayIndex(dayIndex: number): string {
  // Re-add the rollover so the printed date is the local calendar day, not the
  // rollover-shifted midnight; slice keeps just the date.
  return new Date(dayIndex * DAY_MS + DAY_ROLLOVER_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Positive modulo, so a negative day index (pre-1970 clock) still maps into range. */
function cycleIndex(dayIndex: number, poolSize: number): number {
  if (poolSize <= 0) return 0;
  return ((dayIndex % poolSize) + poolSize) % poolSize;
}

export class PassageOfDayService {
  private readonly pool: readonly PassageOfTheDayEntry[];
  private readonly questionsById: ReadonlyMap<string, PassageQuestion>;

  constructor(pool: readonly PassageOfTheDayEntry[] = loadPassagePool()) {
    this.pool = pool;
    const byId = new Map<string, PassageQuestion>();
    for (const entry of pool) {
      for (const question of entry.questions) byId.set(question.id, question);
    }
    this.questionsById = byId;
  }

  /** How many passages are in the pool (0 → nothing to serve). */
  get size(): number {
    return this.pool.length;
  }

  /** The pool entry for a given learner-local day, or null when the pool is empty. */
  entryForDay(now: Date, timezoneOffsetMinutes: number): PassageOfTheDayEntry | null {
    if (this.pool.length === 0) return null;
    const dayIndex = learnerLocalDayIndex(now, timezoneOffsetMinutes);
    return this.pool[cycleIndex(dayIndex, this.pool.length)] ?? null;
  }

  /**
   * The learner-safe view of today's passage, or null when the pool is empty
   * (the runner renders an on-brand empty state for null).
   */
  todayView(now: Date, timezoneOffsetMinutes: number): PassageTodayView | null {
    if (this.pool.length === 0) return null;
    const dayIndex = learnerLocalDayIndex(now, timezoneOffsetMinutes);
    const index = cycleIndex(dayIndex, this.pool.length);
    const entry = this.pool[index];
    if (entry === undefined) return null;
    return {
      id: entry.id,
      title: entry.title,
      discipline: entry.discipline,
      body: entry.body,
      questions: entry.questions.map((q) => ({
        id: q.id,
        stem: q.stem,
        choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
      })),
      dayIndex: index,
      poolSize: this.pool.length,
      localDate: localDateFromDayIndex(dayIndex),
    };
  }

  /**
   * SERVER-ONLY scoring. Looks the question up by id (across the whole pool, so a
   * day-boundary flip between serve and submit still scores correctly) and
   * compares the choice with the key. Returns null for an unknown question id.
   */
  grade(questionId: string, choiceId: PassageChoiceId | null): PassageGrade | null {
    const question = this.questionsById.get(questionId);
    if (question === undefined) return null;
    return {
      correct: choiceId !== null && choiceId === question.correctChoiceId,
      correctChoiceId: question.correctChoiceId,
      rationale: question.rationale,
      choiceRationale: choiceId !== null ? (question.choiceRationales[choiceId] ?? null) : null,
    };
  }
}

/** Process-wide singleton for the dev/preview server. */
export const passageOfDayService = new PassageOfDayService();
