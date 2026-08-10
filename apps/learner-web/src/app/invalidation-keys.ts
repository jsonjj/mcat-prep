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
 * The CARS reasoning-pattern repair surface (WS7), read under its own key by
 * `useCarsReasoningPatterns`. Deliberately NOT one of `MISTAKE_KEYS`: those three
 * all read the practice attempt log, while this reads `state.carsRepairs`, which a
 * DUEL writes (not a scored practice attempt) and a later correct CARS answer
 * resolves. So it rides the duel mutation (`LEARNER_KEYS`) and the practice
 * attempt (`PRACTICE_INVALIDATE_KEYS`) rather than the mistakes-only set.
 */
export const CARS_REASONING_KEY = 'cars-reasoning-patterns';

/**
 * Mastery and progress readouts that a scored first attempt moves.
 *
 * `lesson-warrants` sits beside `mastery-lessons` because the two are one
 * reading split across two payloads (see `LessonWarrantViewSchema`): an answer
 * that changes whether a lesson is mastered changes why it is not, so refreshing
 * one without the other is how the Atlas would explain a state it is no longer
 * in.
 */
/**
 * DELIBERATELY NOT here (nor in any per-write set below): `'bootstrap'`. Refetching
 * `useBootstrap` calls `POST /v1/bootstrap`, which ROTATES the server session cookie and
 * immediately revokes the previous one. Invalidating it on every scored attempt fired a
 * bootstrap concurrently with the ~13 reads these sets refetch, so the rotation revoked
 * the cookie out from under those reads — a 401 storm — and whichever bootstrap lost the
 * race returned `authenticated:false`, bouncing the learner to /signin every ~minute.
 * A scored answer / plan build never changes auth or onboarding state, so bootstrap does
 * NOT need refetching here; the two mutations that DO change it (`confirmPlan`,
 * `resetProgress`) invalidate `['bootstrap']` explicitly.
 */
export const MASTERY_KEYS = [
  'mastery',
  'mastery-skills',
  'mastery-lessons',
  'lesson-warrants',
  'cars-readiness',
  'today',
] as const;

/**
 * Adaptive Practice: a scored first attempt moves P(L) and writes/clears a miss —
 * and a correct CARS answer can resolve a WS7 reasoning-pattern repair, so its key
 * rides here too.
 */
export const PRACTICE_INVALIDATE_KEYS: readonly string[] = [
  ...MASTERY_KEYS,
  ...MISTAKE_KEYS,
  CARS_REASONING_KEY,
];

/** Today's Path views rebuilt after any plan mutation. (No `'bootstrap'` — see above.) */
export const TODAYS_PATH_INVALIDATE: readonly string[] = ['today', 'todays-path'];

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
  // No `'bootstrap'` — see the note on MASTERY_KEYS. The Study/lesson/duel writes that
  // go through this set never change auth or onboarding, so they must not rotate the
  // session; `confirmPlan`/`resetProgress` refetch bootstrap explicitly.
  'goal',
  'today',
  'session',
  'mastery',
  'mastery-skills',
  'mastery-lessons',
  'lesson-warrants',
  'cars-readiness',
  ...MISTAKE_KEYS,
  // A CARS Duel is one of the learner mutations this set covers, and a weak duel
  // writes a WS7 reasoning-pattern repair, so its read key must be dropped too.
  CARS_REASONING_KEY,
  'vector-lesson-status',
  'vector-lesson-run',
];
