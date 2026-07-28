import type { UtcTimestamp } from '@mcat/contracts';
import type { DecisionReason, EvidenceReason, MasteryReason } from './reason-codes';
import type { EvidenceKind } from './evidence';

/**
 * Evidence-warrant types.
 *
 * These describe the QUALITY and CURRENCY of the evidence behind a skill — how
 * independent it is, how many item families it spans, whether transfer/delayed/
 * mixed/passage/timed/protected conditions have been covered, and how fresh it
 * all is. They are NOT a learner-facing capability scale: the capability estimate
 * (`P(L)`, decay, review-due, the mastery percentage and the 0.95 threshold) is
 * owned by the BKT engine in @mcat/policies. Planners consume the two as separate
 * signals: "P(L) is 0.94" AND "transfer and delayed evidence are missing".
 *
 * The tier values are the historical ladder positions, kept verbatim so recipe
 * mechanics and persisted rows are unchanged.
 */
export const EVIDENCE_QUALITY_TIERS = [
  'not_assessed',
  'foundation_needed',
  'learning',
  'independent',
  'retained',
  'strong',
] as const;
export type EvidenceQualityTier = (typeof EVIDENCE_QUALITY_TIERS)[number];

const RANK: Readonly<Record<EvidenceQualityTier, number>> = {
  not_assessed: 0,
  foundation_needed: 1,
  learning: 2,
  independent: 3,
  retained: 4,
  strong: 5,
};

export const evidenceQualityRank = (t: EvidenceQualityTier): number => RANK[t];

/** Whether moving from `a` to `b` is a gain in evidence quality (higher rank). */
export const evidenceQualityAdvances = (a: EvidenceQualityTier, b: EvidenceQualityTier): boolean =>
  evidenceQualityRank(b) > evidenceQualityRank(a);

/** Why a recipe slot is not yet satisfied. */
export const EVIDENCE_GAP_REASONS = [
  'KIND_ABSENT',
  'FAMILY_DIVERSITY_GAP',
  'CHANGE_DIMENSION_GAP',
  'DELAY_WINDOW_GAP',
] as const;
export type EvidenceGapReason = (typeof EVIDENCE_GAP_REASONS)[number];

/** A recipe slot that the eligible evidence already covers. */
export interface EvidenceSlotStatus {
  /** The recipe whose slots are being reported (the full warrant). */
  target: EvidenceQualityTier;
  kind: EvidenceKind;
  requiredFamilies: number;
  observedFamilies: number;
}

/** A recipe slot that is still open, with the specific reasons it is open. */
export interface EvidenceGap extends EvidenceSlotStatus {
  reasons: readonly EvidenceGapReason[];
}

/** Freshness of the warrant: what is still inside its window, and what aged out. */
export interface EvidenceFreshness {
  /** Highest tier satisfied by evidence still inside its freshness window. */
  freshEvidenceQuality: EvidenceQualityTier | null;
  /** True when the warrant is stale or contradicted. History is never erased. */
  refreshNeeded: boolean;
  /** Freshest timestamp observed per evidence kind (for freshness windows). */
  freshestByKind: Partial<Record<EvidenceKind, UtcTimestamp>>;
}

/** The evidence system's whole readout for one skill: quality, freshness, gaps, audit. */
export interface SkillEvidenceState extends EvidenceFreshness {
  skillId: string;
  /** Highest recipe tier ever satisfied by eligible evidence. */
  evidenceQuality: EvidenceQualityTier;
  satisfiedSlots: readonly EvidenceSlotStatus[];
  missingSlots: readonly EvidenceGap[];
  supportingEvidenceIds: readonly string[];
  reasons: readonly DecisionReason<EvidenceReason>[];
  policyVersion: string;
}

/**
 * @deprecated Compatibility alias for the pre-reframe ladder type; the name
 * wrongly implies a capability scale. Use `EvidenceQualityTier`.
 * Remaining consumers: `MasterySkillState.base` below, and
 * `apps/learner-web/src/components/{EvidenceAtlas,BrainScene}.tsx`.
 */
export type BaseMasteryState = EvidenceQualityTier;
/**
 * @deprecated Compatibility alias. Use `evidenceQualityRank`.
 * Remaining consumers: `packages/authority-core/src/authority.test.ts`,
 * `packages/domain/src/domain.test.ts`, and
 * `apps/learner-web/src/components/{EvidenceAtlas,BrainScene}.tsx`.
 */
export const baseStateRank = evidenceQualityRank;
/**
 * @deprecated Compatibility alias. Use `evidenceQualityAdvances`.
 * Remaining consumer: `packages/domain/src/domain.test.ts`.
 */
export const advances = evidenceQualityAdvances;

/**
 * @deprecated Legacy projection of `SkillEvidenceState` for consumers that still
 * read `base`. It is a view, NOT the definition of mastery — see the BKT engine.
 * Remaining consumers: `packages/authority-core/src/types.ts` (`MasteryMapEntry`)
 * and the `evaluateMastery` wrapper in @mcat/policies.
 */
export interface MasterySkillState {
  skillId: string;
  base: BaseMasteryState;
  refreshNeeded: boolean;
  supportingEvidenceIds: string[];
  freshestByKind: Partial<Record<EvidenceKind, UtcTimestamp>>;
  reasons: DecisionReason<MasteryReason>[];
  policyVersion: string;
}

/** An evidence "recipe" slot that must be independently satisfied for a tier. */
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
  target: EvidenceQualityTier;
  slots: RecipeSlot[];
}
