/**
 * Lesson mastery ROLLUP (mastery-bkt / provisional-v1).
 *
 * A lesson has no BKT state of its own. Only two grains receive direct
 * observations — the primary KC and the primary reasoning operation (see
 * ./mastery-attempt.ts) — so a lesson's view is DERIVED from its required member
 * KCs on read:
 *
 *   pL        = arithmetic mean of the current (lazily decayed) member `P(L)`s
 *   mastered  = EVERY required member KC is at or above the mastery threshold
 *   reviewDue = ANY previously practiced required member KC is due for review
 *
 * A high mean with one weak KC is deliberately NOT mastery.
 *
 * FAIL-CLOSED ON PARTIAL INPUT. The rollup is only sound if it sees the lesson's
 * WHOLE membership, and "partial" is not otherwise representable: three of a
 * five-KC lesson looks exactly like a complete three-KC lesson, and real lessons
 * span 1–5 KCs, so no cardinality heuristic can recover the difference. Two
 * inputs are therefore cross-checked by IDENTITY:
 *
 *   1. `requiredKcIds` — the lesson's authoritative ordered membership. The caller
 *      resolves it with `orderedKcsForLesson()` from @mcat/content (this package
 *      must not depend on content, so the list arrives as an input, the same way
 *      cluster does elsewhere). A null/empty list is a data-integrity signal.
 *   2. `kcStates` — a `MemoryState` for EVERY required KC. A genuinely unstarted
 *      KC is passed explicitly as `initialMemoryState()`; absence is never read as
 *      "unstarted", because absence cannot be told apart from an under-supplied
 *      caller. Every uncovered required id is reported in `missingKcIds`.
 *
 * Identity, not count: five states for a five-KC lesson still fails closed when
 * two of them belong to other KCs. States outside the required list are ignored,
 * so a caller may pass a whole learner store.
 *
 * Decay is read through `currentPL` (the single lazy-decay read path); no formula
 * lives here. Pure functions only.
 */
import type { UtcTimestamp } from '@mcat/contracts';
import { BKT_CONFIG, type BktConfig } from './bkt';
import {
  currentPL,
  isDueReview,
  FORGETTING_CONFIG,
  type ForgettingConfig,
  type MemoryState,
} from './forgetting';

/** Why a lesson rollup could not be produced. */
export const LESSON_ROLLUP_REJECTION_CODES = [
  /** No membership resolved for this lesson id. */
  'LESSON_KC_MAP_MISSING',
  /** A membership resolved, but it lists no usable KC id. */
  'LESSON_KC_MAP_EMPTY',
  /** At least one required KC has no supplied `MemoryState` (partial input). */
  'LESSON_KC_STATE_MISSING',
] as const;
export type LessonRollupRejectionCode = (typeof LESSON_ROLLUP_REJECTION_CODES)[number];

/** One required member KC as it reads right now. */
export interface LessonKcMemberView {
  kcId: string;
  /** Current value after lazy decay. */
  pL: number;
  mastered: boolean;
  /** Only a previously practiced KC can be due for review. */
  reviewDue: boolean;
}

export interface LessonRollupView {
  lessonId: string;
  /**
   * Arithmetic mean of the members' current `P(L)`. A DISPLAY value: it is not a
   * probability of lesson mastery and must never be compared with the mastery
   * threshold. `mastered` below is the only lesson-grain verdict, and it requires
   * every member individually — thresholding the mean would be a third mastery
   * definition beside BKT's per-grain one.
   */
  pL: number;
  mastered: boolean;
  /** BKT decay, not the evidence warrant's `refreshNeeded`. */
  reviewDue: boolean;
  requiredKcCount: number;
  weakestKcId: string;
  weakestPL: number;
  /** In the authored curriculum order of `requiredKcIds`. */
  members: readonly LessonKcMemberView[];
}

export interface LessonRollupUnavailable {
  status: 'unavailable';
  lessonId: string;
  rejectionCodes: readonly LessonRollupRejectionCode[];
  /** Required KC ids with no supplied state; empty unless `LESSON_KC_STATE_MISSING`. */
  missingKcIds: readonly string[];
}

export type LessonRollupResult =
  | { status: 'available'; view: LessonRollupView }
  | LessonRollupUnavailable;

export interface LessonRollupInput {
  lessonId: string;
  /**
   * The lesson's authoritative required KC ids in curriculum order, as returned by
   * `orderedKcsForLesson()` in @mcat/content. `null`/`undefined` fails closed.
   */
  requiredKcIds: readonly string[] | null | undefined;
  /**
   * A state for EVERY required KC, keyed by KC id. Unstarted KCs are passed as
   * `initialMemoryState()`; extra keys are ignored. Any required KC left uncovered
   * fails closed — this is the only defence against a partial membership.
   */
  kcStates: Readonly<Record<string, MemoryState>>;
  now: UtcTimestamp;
}

export interface LessonRollupConfig {
  bkt: BktConfig;
  forgetting: ForgettingConfig;
}

export const LESSON_ROLLUP_CONFIG: LessonRollupConfig = {
  bkt: BKT_CONFIG,
  forgetting: FORGETTING_CONFIG,
};

export const isLessonRollupAvailable = (
  result: LessonRollupResult,
): result is { status: 'available'; view: LessonRollupView } => result.status === 'available';

const unavailable = (
  lessonId: string,
  code: LessonRollupRejectionCode,
  missingKcIds: readonly string[] = [],
): LessonRollupUnavailable => ({
  status: 'unavailable',
  lessonId,
  rejectionCodes: [code],
  missingKcIds,
});

export function rollUpLessonMastery(
  input: LessonRollupInput,
  cfg: LessonRollupConfig = LESSON_ROLLUP_CONFIG,
): LessonRollupResult {
  if (input.requiredKcIds === null || input.requiredKcIds === undefined) {
    return unavailable(input.lessonId, 'LESSON_KC_MAP_MISSING');
  }

  // A KC listed twice must not double-weight the mean; curriculum order is kept.
  const kcIds = [
    ...new Set(input.requiredKcIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (kcIds.length === 0) {
    return unavailable(input.lessonId, 'LESSON_KC_MAP_EMPTY');
  }

  // Completeness by identity: a count would wave through the wrong 3 of 5.
  const missingKcIds = kcIds.filter((kcId) => input.kcStates[kcId] === undefined);
  if (missingKcIds.length > 0) {
    return unavailable(input.lessonId, 'LESSON_KC_STATE_MISSING', missingKcIds);
  }

  const members: LessonKcMemberView[] = kcIds.map((kcId) => {
    const state = input.kcStates[kcId]!;
    const pL = currentPL(state, input.now);
    return {
      kcId,
      pL,
      mastered: pL >= cfg.bkt.masteryThreshold,
      reviewDue: state.lastPracticedAt !== null && isDueReview(pL, cfg.forgetting),
    };
  });

  const weakest = members.reduce((min, m) => (m.pL < min.pL ? m : min), members[0]!);

  return {
    status: 'available',
    view: {
      lessonId: input.lessonId,
      pL: members.reduce((sum, m) => sum + m.pL, 0) / members.length,
      mastered: members.every((m) => m.mastered),
      reviewDue: members.some((m) => m.reviewDue),
      requiredKcCount: members.length,
      weakestKcId: weakest.kcId,
      weakestPL: weakest.pL,
      members,
    },
  };
}
