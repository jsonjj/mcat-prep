import type { UtcTimestamp } from '@mcat/contracts';
import type { DecisionReason, MasteryReason } from './reason-codes';
import type { EvidenceKind } from './evidence';

/**
 * Base mastery states form an ordered ladder. `exam_ready_now` is NOT a base
 * state — it is a separate, validated, time-bound readiness projection. Staleness
 * is represented by the `refreshNeeded` overlay, which never erases history.
 */
export const BASE_MASTERY_STATES = [
  'not_assessed',
  'foundation_needed',
  'learning',
  'independent',
  'retained',
  'strong',
] as const;
export type BaseMasteryState = (typeof BASE_MASTERY_STATES)[number];

const RANK: Readonly<Record<BaseMasteryState, number>> = {
  not_assessed: 0,
  foundation_needed: 1,
  learning: 2,
  independent: 3,
  retained: 4,
  strong: 5,
};

export const baseStateRank = (s: BaseMasteryState): number => RANK[s];

/** Whether transitioning from `a` to `b` is an advancement (higher rank). */
export const advances = (a: BaseMasteryState, b: BaseMasteryState): boolean =>
  baseStateRank(b) > baseStateRank(a);

export interface MasterySkillState {
  skillId: string;
  base: BaseMasteryState;
  /** Overlay: current evidence is stale, due, or contradicted. History is preserved. */
  refreshNeeded: boolean;
  supportingEvidenceIds: string[];
  /** Freshest timestamp observed per evidence kind (for freshness windows). */
  freshestByKind: Partial<Record<EvidenceKind, UtcTimestamp>>;
  reasons: DecisionReason<MasteryReason>[];
  policyVersion: string;
}

/** An evidence "recipe" slot that must be independently satisfied for a state. */
export interface RecipeSlot {
  kind: EvidenceKind;
  /** Distinct item families required for this slot. */
  minFamilies: number;
  /** Optional required change dimensions (transfer). */
  changeDimensions?: number;
  /** Optional minimum delay in hours (delayed callbacks). */
  minDelayHours?: number;
}

export interface EvidenceRecipe {
  target: BaseMasteryState;
  slots: RecipeSlot[];
}
