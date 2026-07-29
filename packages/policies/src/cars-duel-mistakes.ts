import type { CarsSkill } from '@mcat/contracts';
import { rubricToR, type DuelRubric } from './cars';

/**
 * WS7 — turning a weak CARS Duel into a concrete, spaced repair in Mistakes.
 *
 * Pure functions only (no I/O, no clock, no bank). The authority calls these at
 * the `recordCarsDuel` seam to decide (a) whether a duel was weak enough to earn
 * a repair and (b) which CARS sub-skill to target; the authority then selects a
 * specific real CARS bank item for that sub-skill and surfaces it in Mistakes.
 * The duel stays FORMATIVE — nothing here mints mastery.
 *
 * The CARS Duel is scored on three rubric micro-judgments (each 0–3). The mastery
 * pipeline already maps each one to a single AAMC CARS sub-skill
 * (docs/mastery-pipeline.md §5.4, mirrored by `Authority.recordCarsDuel`):
 *
 *   position    → FOC  (Foundations of Comprehension)
 *   argument    → RWT  (Reasoning Within the Text)
 *   application → RBT  (Reasoning Beyond the Text)
 *
 * WS7 reuses that SAME correspondence in reverse: the WEAKEST scored dimension
 * names the sub-skill to repair. Keeping one mapping for both directions means a
 * duel's ability nudge and its repair can never disagree about what a dimension
 * measures.
 */
export const DUEL_DIMENSION_TO_CARS_SKILL = {
  position: 'FOC',
  argument: 'RWT',
  application: 'RBT',
} as const satisfies Record<keyof DuelRubric, CarsSkill>;

/**
 * The competence bar for a CARS Duel, expressed on the rubric hold-rate
 * `R = rubricToR(rubric)` in [0,1]. 0.75 is the FLOOR of the researched 75–85%
 * desirable-difficulty band the duel intensity engine steers toward
 * (`CARS_DUEL_CONFIG.targetHoldRate` = 0.80, and the same 0.75 the Defend unlock
 * uses as its rolling competence gate — see `cars-duel.ts`). Holding BELOW the
 * band floor means the difficulty overwhelmed the learner rather than desirably
 * stretching them, which is exactly the signal that earns a spaced retrieval
 * repair. A/B-tunable, like the other CARS thresholds.
 */
export const CARS_DUEL_COMPETENCE_BAR = 0.75;

/**
 * Whether a duel's rubric hold-rate is below the competence bar — i.e. the
 * learner did poorly enough to earn a repair. Returns false when the rubric
 * scored nothing (`rubricToR` is null): with no signal there is nothing to weigh
 * and nothing to repair.
 */
export function isWeakCarsDuel(rubric: DuelRubric, bar: number = CARS_DUEL_COMPETENCE_BAR): boolean {
  const r = rubricToR(rubric);
  return r !== null && r < bar;
}

/**
 * The CARS sub-skill a weak duel should repair: the sub-skill mapped from the
 * WEAKEST scored rubric dimension (the lowest 0–3 score). Only dimensions the
 * duel actually exercised (a defined score) are considered.
 *
 * Ties break toward the more FOUNDATIONAL sub-skill — position→FOC ahead of
 * argument→RWT ahead of application→RBT — because comprehension underlies both
 * within-text and beyond-text reasoning, so when two are equally weak the base is
 * repaired first. The fixed iteration order is also the rubric's own field order,
 * and the strict `<` comparison keeps the earliest (most foundational) dimension
 * on a tie. Returns null when no dimension was scored.
 */
export function weakestCarsSkill(rubric: DuelRubric): CarsSkill | null {
  const order = ['position', 'argument', 'application'] as const;
  let weakest: keyof DuelRubric | null = null;
  let weakestScore = Number.POSITIVE_INFINITY;
  for (const dimension of order) {
    const score = rubric[dimension];
    if (score === undefined) continue;
    if (score < weakestScore) {
      weakestScore = score;
      weakest = dimension;
    }
  }
  return weakest === null ? null : DUEL_DIMENSION_TO_CARS_SKILL[weakest];
}
