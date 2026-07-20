import type { QuestionFormat, Section, SkillCluster } from '@mcat/contracts';
import { SKILL_CLUSTERS } from '@mcat/contracts';
import type { PolicyManifest } from './manifest';

/**
 * Placement diagnostic — constrained *balanced* routing (provisional-v1).
 *
 * Calibrated MD-CAT / expected-information-gain selection is intentionally NOT
 * active: it requires calibrated immutable items and passes fit/exposure/fairness
 * gates first. This fallback samples every cluster and section without inventing
 * ability estimates from author difficulty labels.
 */
export const DIAGNOSTIC_MANIFEST: PolicyManifest = {
  policyId: 'diagnostic',
  version: 'provisional-v1',
  status: 'provisional_active',
  summary: 'Constrained balanced routing; calibrated EIG selection is shadow-only.',
};

export interface DiagnosticConfig {
  minItems: number;
  targetItems: number;
  maxItems: number;
  minFamiliesPerCluster: number;
  sectionFloors: Readonly<Record<Section, number>>;
}

export const DIAGNOSTIC_CONFIG: DiagnosticConfig = {
  minItems: 30,
  targetItems: 36,
  maxItems: 48,
  minFamiliesPerCluster: 2,
  sectionFloors: { cp: 8, cars: 6, bb: 8, ps: 8 },
};

export interface DiagnosticCandidate {
  questionId: string;
  cluster: SkillCluster;
  section: Section;
  familyId: string;
  format: QuestionFormat;
  eligible: boolean; // reviewed, published, diagnostic-eligible, not protected/test-only
}

export interface DiagnosticState {
  itemsScored: number;
  seenQuestionIds: ReadonlySet<string>;
  familiesByCluster: Readonly<Record<string, ReadonlySet<string>>>;
  itemsBySection: Readonly<Record<Section, number>>;
  /** Deterministic tie-break seed for this session. */
  seed: string;
}

const clusterCoverageMet = (state: DiagnosticState, cfg: DiagnosticConfig): boolean =>
  SKILL_CLUSTERS.every(
    (c) => (state.familiesByCluster[c]?.size ?? 0) >= cfg.minFamiliesPerCluster,
  );

const sectionFloorsMet = (state: DiagnosticState, cfg: DiagnosticConfig): boolean =>
  (Object.keys(cfg.sectionFloors) as Section[]).every(
    (s) => (state.itemsBySection[s] ?? 0) >= cfg.sectionFloors[s],
  );

/** Coverage is complete when every cluster has enough families and section floors are met. */
export const isCoverageComplete = (state: DiagnosticState, cfg: DiagnosticConfig): boolean =>
  clusterCoverageMet(state, cfg) && sectionFloorsMet(state, cfg);

/** Whether the diagnostic may stop now. Must stop at maxItems. */
export const shouldStop = (state: DiagnosticState, cfg: DiagnosticConfig): boolean => {
  if (state.itemsScored >= cfg.maxItems) return true;
  return state.itemsScored >= cfg.minItems && isCoverageComplete(state, cfg);
};

// Stable, deterministic hash for tie-breaking (FNV-1a).
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export interface DiagnosticSelection {
  done: boolean;
  questionId?: string;
}

/**
 * Select the next diagnostic item lexicographically:
 * 1) feasibility (eligible, unseen), 2) reduce unmet cluster coverage,
 * 3) reduce unmet section floor, 4) stable deterministic tie-break.
 */
export function selectNextDiagnostic(
  state: DiagnosticState,
  candidates: readonly DiagnosticCandidate[],
  cfg: DiagnosticConfig = DIAGNOSTIC_CONFIG,
): DiagnosticSelection {
  if (shouldStop(state, cfg)) return { done: true };

  const feasible = candidates.filter((c) => c.eligible && !state.seenQuestionIds.has(c.questionId));
  if (feasible.length === 0) return { done: true };

  const clusterNeed = (c: DiagnosticCandidate): number => {
    const have = state.familiesByCluster[c.cluster]?.size ?? 0;
    const hasFamily = state.familiesByCluster[c.cluster]?.has(c.familyId) ?? false;
    // Prefer candidates that add a *new* family to an under-covered cluster.
    if (have >= cfg.minFamiliesPerCluster) return 0;
    return hasFamily ? 1 : 2;
  };

  const sectionNeed = (c: DiagnosticCandidate): number => {
    const have = state.itemsBySection[c.section] ?? 0;
    return Math.max(0, cfg.sectionFloors[c.section] - have);
  };

  const ranked = [...feasible].sort((a, b) => {
    const byCluster = clusterNeed(b) - clusterNeed(a);
    if (byCluster !== 0) return byCluster;
    const bySection = sectionNeed(b) - sectionNeed(a);
    if (bySection !== 0) return bySection;
    return hash(state.seed + a.questionId) - hash(state.seed + b.questionId);
  });

  return { done: false, questionId: ranked[0]!.questionId };
}
