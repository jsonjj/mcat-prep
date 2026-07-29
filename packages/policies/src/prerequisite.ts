/**
 * Prerequisite reinforcement for the mastery engine (mastery-bkt).
 *
 * Practicing a later concept partially reinforces its DIRECT (1-hop) prerequisites:
 * on an independent-correct answer on B, each direct prerequisite A gets a small
 * half-life stretch and a small `P(L)` nudge (MCAT_MASTERY_PLAN.md §4). Longer
 * chains are ignored for now. The prerequisite edges come from the V3 registry and
 * are supplied by the authority; until that graph is loaded, no edges are passed
 * and this layer is inert.
 *
 * Pure functions only.
 */
import type { UtcTimestamp } from '@mcat/contracts';
import { LEARN_RATE_T } from './bkt';
import { currentPL, type MemoryState } from './forgetting';

/** Default edge weight `w`: how strongly practicing B exercises prerequisite A. */
export const PREREQ_DEFAULT_WEIGHT = 0.5;

export interface PrereqConfig {
  weight: number;
  learnRate: number;
}

export const PREREQ_CONFIG: PrereqConfig = {
  weight: PREREQ_DEFAULT_WEIGHT,
  learnRate: LEARN_RATE_T,
};

/**
 * Reinforce one direct prerequisite `A` after an independent-correct answer on a
 * dependent concept. Decays `A` to `now` first, then:
 *   H_A    = H_A * (1 + w)
 *   P(L)_A = P(L)_A + (1 - P(L)_A) * (w * T)
 * Anchors the reinforced value at `now` (a light touch that also refreshes
 * recency), so lazy decay stays consistent.
 */
export function reinforcePrerequisite(
  state: MemoryState,
  now: UtcTimestamp,
  cfg: PrereqConfig = PREREQ_CONFIG,
): MemoryState {
  const decayed = currentPL(state, now);
  const boosted = decayed + (1 - decayed) * (cfg.weight * cfg.learnRate);
  return {
    pL: Math.min(1, Math.max(0, boosted)),
    halfLifeDays: state.halfLifeDays * (1 + cfg.weight),
    lastPracticedAt: now,
    lastDueReviewAt: state.lastDueReviewAt,
  };
}
