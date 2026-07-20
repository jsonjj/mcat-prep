import type { Section } from '@mcat/contracts';
import type { PolicyManifest } from './manifest';

/**
 * Readiness & score prediction (provisional-v1).
 *
 * Numeric score prediction is HARD-GATED OFF. It requires a validated product
 * model AND a learner-data threshold. Until both pass, only a categorical,
 * multidimensional Readiness Trend is shown — never a scaled-score number.
 */
export const READINESS_MANIFEST: PolicyManifest = {
  policyId: 'readiness',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary: 'Categorical readiness trend; numeric prediction gated off until validation.',
};

export type ReadinessTrend = 'strengthening' | 'steady' | 'needs_refresh' | 'insufficient_evidence';

export interface ScorePredictionGateInput {
  /** Product-level: model calibrated + validated against held-out official outcomes. */
  modelValidated: boolean;
  /** Learner-level data. */
  independentAttempts: number;
  perSectionIndependent: Record<Section, number>;
  recentFullLengths: number;
  hasOfficialResult: boolean;
}

export interface ScorePredictionGateResult {
  numericAllowed: boolean;
  reasons: string[];
}

/** Faithfully encodes the two gates; numeric prediction stays off until all pass. */
export function scorePredictionGate(input: ScorePredictionGateInput): ScorePredictionGateResult {
  const reasons: string[] = [];
  if (!input.modelValidated) reasons.push('product_model_not_validated');
  if (input.independentAttempts < 250) reasons.push('need_250_independent_attempts');
  const sections: Section[] = ['cp', 'cars', 'bb', 'ps'];
  for (const s of sections) {
    if ((input.perSectionIndependent[s] ?? 0) < 40) reasons.push(`need_40_${s}`);
  }
  if (input.recentFullLengths < 2) reasons.push('need_2_recent_full_lengths');
  if (!input.hasOfficialResult) reasons.push('need_official_result');
  return { numericAllowed: reasons.length === 0, reasons };
}

export interface ReadinessTrendInput {
  /** Whether there is enough recent independent evidence to judge a direction at all. */
  hasSufficientEvidence: boolean;
  /** Count of skills whose current evidence is stale/contradicted. */
  refreshNeededCount: number;
  /** Net direction of fresh independent performance across recent windows (-1..1). */
  performanceDelta: number;
}

export function computeReadinessTrend(input: ReadinessTrendInput): ReadinessTrend {
  if (!input.hasSufficientEvidence) return 'insufficient_evidence';
  if (input.refreshNeededCount > 0 && input.performanceDelta <= 0) return 'needs_refresh';
  if (input.performanceDelta > 0.05) return 'strengthening';
  return 'steady';
}
