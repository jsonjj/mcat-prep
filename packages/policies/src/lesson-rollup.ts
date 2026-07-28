/**
 * Lesson mastery ROLLUP (mastery-bkt / provisional-v1).
 *
 * A lesson has no BKT state of its own. Only two grains receive direct
 * observations — the primary KC and the primary reasoning operation (see
 * ./mastery-attempt.ts) — so a lesson's view is DERIVED from its required member
 * KCs on read:
 *
 *   pL       = arithmetic mean of the current (lazily decayed) member `P(L)`s
 *   mastered = EVERY required member KC is at or above the mastery threshold
 *   reviewDue = ANY previously practiced required member KC is due for review
 *
 * A high mean with one weak KC is deliberately NOT mastery.
 *
 * Fail-closed: a missing or empty lesson-to-KC mapping yields an `unavailable`
 * result with rejection codes, never a defaulted view. Decay is read through
 * `currentPL` (the single lazy-decay read path); no formula lives here.
 *
 * Pure functions only.
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
  'LESSON_KC_MAP_MISSING',
  'LESSON_KC_MAP_EMPTY',
] as const;
export type LessonRollupRejectionCode = (typeof LESSON_ROLLUP_REJECTION_CODES)[number];

/** One required member KC as it reads right now. */
export interface LessonKcMemberView {
  kcId: string;
  /** Current value after lazy decay; the BKT prior when the KC has no state yet. */
  pL: number;
  /** False when the KC has no persisted state (prior applied). */
  hasState: boolean;
  mastered: boolean;
  /** Only a previously practiced KC can be due for review. */
  reviewDue: boolean;
}

export interface LessonRollupView {
  lessonId: string;
  /** Arithmetic mean of the members' current `P(L)`. */
  pL: number;
  mastered: boolean;
  reviewDue: boolean;
  requiredKcCount: number;
  weakestKcId: string;
  weakestPL: number;
  members: readonly LessonKcMemberView[];
}

export type LessonRollupResult =
  | { status: 'available'; view: LessonRollupView }
  | {
      status: 'unavailable';
      lessonId: string;
      rejectionCodes: readonly LessonRollupRejectionCode[];
    };

export interface LessonRollupInput {
  lessonId: string;
  /** EVERY required member KC of the lesson. Missing/empty fails closed. */
  requiredKcIds: readonly string[] | null | undefined;
  /** Persisted KC memory states by KC id; an absent entry uses the BKT prior. */
  kcStates: Readonly<Record<string, MemoryState | undefined>>;
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

export function rollUpLessonMastery(
  input: LessonRollupInput,
  cfg: LessonRollupConfig = LESSON_ROLLUP_CONFIG,
): LessonRollupResult {
  if (input.requiredKcIds === null || input.requiredKcIds === undefined) {
    return {
      status: 'unavailable',
      lessonId: input.lessonId,
      rejectionCodes: ['LESSON_KC_MAP_MISSING'],
    };
  }

  // A KC listed twice must not double-weight the mean.
  const kcIds = [
    ...new Set(input.requiredKcIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (kcIds.length === 0) {
    return {
      status: 'unavailable',
      lessonId: input.lessonId,
      rejectionCodes: ['LESSON_KC_MAP_EMPTY'],
    };
  }

  const members: LessonKcMemberView[] = kcIds.map((kcId) => {
    const state = input.kcStates[kcId];
    const pL = state === undefined ? cfg.bkt.priorPL0 : currentPL(state, input.now);
    return {
      kcId,
      pL,
      hasState: state !== undefined,
      mastered: pL >= cfg.bkt.masteryThreshold,
      reviewDue:
        state !== undefined && state.lastPracticedAt !== null && isDueReview(pL, cfg.forgetting),
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
