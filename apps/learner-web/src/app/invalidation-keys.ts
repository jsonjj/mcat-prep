/**
 * React Query keys each mutation invalidates, kept in one dependency-free module.
 *
 * The reason this is a module and not a literal next to each `useMutation`: the
 * Mistakes tab reads under its OWN keys — `errors` (`useErrorLog`) and
 * `error-patterns` (`useMistakePatterns`) — so every mutation that can write or
 * clear a miss has to name them, and there was no single place to check that.
 * Adaptive practice named six other keys and neither of these, so a miss the
 * server had already recorded was served from a stale cached list.
 *
 * Three writes reach a mistake:
 *  - a scored FIRST attempt (practice or study) writes the row,
 *  - a later correct first attempt on the same KC flips earlier rows to resolved,
 *  - completing a Review Mistakes activity moves the server's
 *    `mistakesReviewedThrough` watermark, which decides which open misses are
 *    still schedulable.
 *
 * Deliberately NOT here: Recall. An FSRS "Again" is the scheduler hitting its
 * target retention, never writes the attempt log and never appears on the tab
 * (docs/design/error-handling-design.md §6.4), so recall mutations invalidate
 * their own caches only.
 */

/**
 * The Mistakes tab's own query keys — misses (`errors`), the recurring-pattern
 * roll-up (`error-patterns`), and the correct-but-shaky wins (`shaky-wins`, WS3).
 * All three read the attempt log, so every write that can change a miss or a win
 * must drop all three.
 */
export const MISTAKE_KEYS = ['errors', 'error-patterns', 'shaky-wins'] as const;

/**
 * Mastery and progress readouts that a scored first attempt moves.
 *
 * `lesson-warrants` sits beside `mastery-lessons` because the two are one
 * reading split across two payloads (see `LessonWarrantViewSchema`): an answer
 * that changes whether a lesson is mastered changes why it is not, so refreshing
 * one without the other is how the Atlas would explain a state it is no longer
 * in.
 */
export const MASTERY_KEYS = [
  'bootstrap',
  'mastery',
  'mastery-skills',
  'mastery-lessons',
  'lesson-warrants',
  'cars-readiness',
  'today',
] as const;

/** Adaptive Practice: a scored first attempt moves P(L) and writes/clears a miss. */
export const PRACTICE_INVALIDATE_KEYS: readonly string[] = [...MASTERY_KEYS, ...MISTAKE_KEYS];

/** Today's Path views rebuilt after any plan mutation. */
export const TODAYS_PATH_INVALIDATE: readonly string[] = ['today', 'todays-path', 'bootstrap'];

/** Completing an activity can also be completing a Review Mistakes slot. */
export const PLAN_ACTIVITY_COMPLETE_INVALIDATE: readonly string[] = [
  ...TODAYS_PATH_INVALIDATE,
  ...MISTAKE_KEYS,
];

/**
 * The broad learner set, used by mutations that move learner state wholesale —
 * the Study loop's attempt/reveal/continue among them, which is why a study miss
 * already reached the tab.
 */
export const LEARNER_KEYS: readonly string[] = [
  'bootstrap',
  'goal',
  'today',
  'session',
  'mastery',
  'mastery-skills',
  'mastery-lessons',
  'lesson-warrants',
  'cars-readiness',
  ...MISTAKE_KEYS,
  'vector-lesson-status',
  'vector-lesson-run',
];
