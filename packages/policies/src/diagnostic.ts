import type { QuestionFormat, Section, SkillCluster } from '@mcat/contracts';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
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
  summary:
    'Stage-1 Bayesian item-response engine (per-cluster ability posterior, expected-information-gain selection, adaptive early-stop) is the active path. Item difficulty uses UNCALIBRATED DOK-derived priors; efficacy is pending empirical item calibration. The balanced-coverage router remains as a fallback.',
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
  maxItems: 60,
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
  /**
   * Author depth-of-knowledge (1–4), used by the Stage-1 Bayesian selector as an
   * UNCALIBRATED difficulty proxy for the item-response model. Optional so the
   * balanced-coverage fallback selector can ignore it.
   */
  dokLevel?: number;
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

// ===========================================================================
// Diagnostic result / output (provisional-v1)
// ---------------------------------------------------------------------------
// Turns scored responses into a *diagnostic decision envelope* per the learning
// flow §7.3/§8: per-cluster classification + recommendation + uncertainty, and
// the learner-facing Top-3 highest-*leverage* priorities.
//
// This is deliberately NOT calibrated ability estimation. It reads a gap signal
// from right/wrong + speed + author difficulty (dok) and ranks by
// leverage = weakness × how much fixing the area unlocks (prerequisite-first),
// matching the plan's "brain" and the existing planner's prerequisite ordering.
// It emits *recommendations*, never executable lesson routes or mastery.
// ===========================================================================

/** §7.3 classification of a cluster's diagnostic read. */
export type DiagnosticClassification =
  | 'provisionally_ready'
  | 'likely_weak'
  | 'unresolved'
  | 'unsampled';

/** §8 recommended next action. A recommendation for the planner — not a route. */
export type DiagnosticRecommendation =
  | 'CONCISE_INSTRUCTION'
  | 'STANDARD_INSTRUCTION'
  | 'MISCONCEPTION_INSTRUCTION'
  | 'PREREQUISITE_SUPPORT_CANDIDATE'
  | 'DIAGNOSTIC_PROBE';

/** One scored diagnostic response (server-side; correctness comes from the authority). */
export interface DiagnosticResponse {
  questionId: string;
  cluster: SkillCluster;
  section: Section;
  familyId: string;
  correct: boolean;
  elapsedMs: number;
  /**
   * Author depth-of-knowledge label (1–4) used only as a *descriptive* difficulty
   * facet for the gap read. It is NOT a calibrated item difficulty; calibrated
   * IRT/EIG selection stays shadow-only (see DIAGNOSTIC_MANIFEST).
   */
  dokLevel?: number;
}

/** Per-cluster diagnostic signal (the §7.3 output envelope, minus IDs/lineage). */
export interface ClusterSignal {
  cluster: SkillCluster;
  section: Section;
  itemsSeen: number;
  correct: number;
  /** Gap read in [0,1]; higher = more likely to need work. */
  gap: number;
  /** Read confidence in [0,1]; grows with evidence within this cluster. */
  certainty: number;
  classification: DiagnosticClassification;
  recommendation: DiagnosticRecommendation;
  /** Timing observation: correct-but-slow or a slow-wrong pattern. */
  slow: boolean;
}

/** A learner-facing highest-leverage priority (Top 3). */
export interface LeveragePriority {
  cluster: SkillCluster;
  title: string;
  /** leverage = weakness × prerequisite-unlock value. */
  leverage: number;
  classification: DiagnosticClassification;
  recommendation: DiagnosticRecommendation;
}

export type ConfidenceLabel = 'High' | 'Medium' | 'Still building';

/**
 * The diagnostic result the planner/learning-flow consumes. `internalConfidence`
 * (0–100) drives stopping and the word label; it is NEVER shown to the learner
 * as a number (the plan forbids fake-precision percentages on uncalibrated items).
 */
export interface DiagnosticResult {
  perCluster: ClusterSignal[];
  topPriorities: LeveragePriority[];
  stillConfirming: SkillCluster[];
  confidenceLabel: ConfidenceLabel;
  internalConfidence: number;
  itemsScored: number;
}

/**
 * Prerequisite-unlock weight: how much fixing a cluster tends to unblock others.
 * Reasoning foundations (R1 quant, R2 data/representations, R3 experiments) and
 * chemistry (CP3) unlock the most; leaf/applied clusters unlock the least. This
 * encodes the plan's leverage idea and mirrors the planner's prerequisite-first
 * priority ordering without inventing a full edge solve here.
 */
export const UNLOCK_WEIGHT: Readonly<Record<SkillCluster, number>> = {
  R1: 1.0,
  R2: 0.9,
  R3: 0.8,
  CP3: 0.5,
  BB1: 0.4,
  CA1: 0.35,
  CP1: 0.25,
  CP2: 0.25,
  BB2: 0.25,
  BB3: 0.2,
  BB4: 0.2,
  PS1: 0.3,
  PS2: 0.2,
  PS3: 0.2,
  CA2: 0.15,
};

/** A miss on an easier item is more diagnostic of weakness than a miss on a hard one. */
const dokMissWeight = (dok: number | undefined): number => {
  switch (dok) {
    case 1:
      return 1.0;
    case 2:
      return 0.85;
    case 3:
      return 0.7;
    case 4:
      return 0.55;
    default:
      return 0.85;
  }
};

/** Slow threshold: responses at/over this many ms are "slow" for the timing facet. */
const SLOW_MS = 90_000;

const classify = (
  itemsSeen: number,
  gap: number,
  certainty: number,
): DiagnosticClassification => {
  if (itemsSeen === 0) return 'unsampled';
  if (certainty < 0.5) return 'unresolved';
  if (gap >= 0.5) return 'likely_weak';
  if (gap <= 0.35) return 'provisionally_ready';
  return 'unresolved';
};

const recommend = (
  cluster: SkillCluster,
  classification: DiagnosticClassification,
  gap: number,
  fastWrongShare: number,
): DiagnosticRecommendation => {
  switch (classification) {
    case 'provisionally_ready':
      return 'CONCISE_INSTRUCTION';
    case 'likely_weak':
      // A foundational cluster that is weak is a prerequisite-support *candidate*
      // (the evidence-policy authority must still qualify it — §8.2).
      if ((UNLOCK_WEIGHT[cluster] ?? 0) >= 0.8) return 'PREREQUISITE_SUPPORT_CANDIDATE';
      // A strong fast-wrong pattern points at a misconception rather than a gap.
      if (gap >= 0.66 && fastWrongShare >= 0.5) return 'MISCONCEPTION_INSTRUCTION';
      return 'STANDARD_INSTRUCTION';
    case 'unresolved':
    case 'unsampled':
      return 'DIAGNOSTIC_PROBE';
  }
};

/** Build the per-cluster signal for one cluster from its responses. */
function clusterSignal(cluster: SkillCluster, responses: readonly DiagnosticResponse[]): ClusterSignal {
  const section = CLUSTER_INFO[cluster].section;
  const itemsSeen = responses.length;
  const correct = responses.filter((r) => r.correct).length;

  if (itemsSeen === 0) {
    return {
      cluster,
      section,
      itemsSeen: 0,
      correct: 0,
      gap: 0,
      certainty: 0,
      classification: 'unsampled',
      recommendation: 'DIAGNOSTIC_PROBE',
      slow: false,
    };
  }

  let wrongMass = 0;
  let fastWrong = 0;
  let slowCorrect = 0;
  for (const r of responses) {
    if (!r.correct) {
      wrongMass += dokMissWeight(r.dokLevel);
      if (r.elapsedMs > 0 && r.elapsedMs < SLOW_MS / 3) fastWrong += 1;
    } else if (r.elapsedMs >= SLOW_MS) {
      // Slow-correct is a small residual gap: low automaticity, not mastery.
      wrongMass += 0.15;
      slowCorrect += 1;
    }
  }
  const gap = Math.min(1, wrongMass / itemsSeen);
  // Certainty grows with evidence (2 items ≈ 0.5, 4 ≈ 0.67); locally dependent
  // families are already de-duplicated by the selection engine's family coverage.
  const certainty = itemsSeen / (itemsSeen + 2);
  const wrong = itemsSeen - correct;
  const fastWrongShare = wrong > 0 ? fastWrong / wrong : 0;
  const classification = classify(itemsSeen, gap, certainty);

  return {
    cluster,
    section,
    itemsSeen,
    correct,
    gap,
    certainty,
    classification,
    recommendation: recommend(cluster, classification, gap, fastWrongShare),
    slow: fastWrong === 0 && (slowCorrect > 0 || (wrong > 0 && fastWrong < wrong)),
  };
}

/**
 * Compute the full diagnostic result from scored responses. Deterministic:
 * ties break by the canonical cluster order.
 */
export function computeDiagnosticResult(
  responses: readonly DiagnosticResponse[],
  cfg: DiagnosticConfig = DIAGNOSTIC_CONFIG,
): DiagnosticResult {
  const byCluster = new Map<SkillCluster, DiagnosticResponse[]>();
  for (const c of SKILL_CLUSTERS) byCluster.set(c, []);
  for (const r of responses) byCluster.get(r.cluster)?.push(r);

  const perCluster = SKILL_CLUSTERS.map((c) => clusterSignal(c, byCluster.get(c) ?? []));

  // Leverage candidates: weak-leaning clusters with enough evidence to act on.
  const priorities: LeveragePriority[] = perCluster
    .filter((s) => s.certainty >= 0.5 && s.gap >= 0.35)
    .map((s) => ({
      cluster: s.cluster,
      title: CLUSTER_INFO[s.cluster].title,
      leverage: s.gap * (1 + (UNLOCK_WEIGHT[s.cluster] ?? 0)),
      classification: s.classification,
      recommendation: s.recommendation,
    }))
    .sort((a, b) => {
      if (b.leverage !== a.leverage) return b.leverage - a.leverage;
      return SKILL_CLUSTERS.indexOf(a.cluster) - SKILL_CLUSTERS.indexOf(b.cluster);
    });
  const topPriorities = priorities.slice(0, 3);

  // Still confirming: weak-leaning but under-evidenced (the plan's "shaky areas"
  // handed to silent week-1 confirmation), plus any weak cluster past the Top 3.
  const topSet = new Set(topPriorities.map((p) => p.cluster));
  const stillConfirming = perCluster
    .filter(
      (s) =>
        !topSet.has(s.cluster) &&
        s.itemsSeen > 0 &&
        s.gap >= 0.35 &&
        (s.certainty < 0.5 || priorities.some((p) => p.cluster === s.cluster)),
    )
    .map((s) => s.cluster);

  const internalConfidence = internalPlanConfidence(perCluster, priorities, cfg);
  const confidenceLabel: ConfidenceLabel =
    internalConfidence >= 82 ? 'High' : internalConfidence >= 65 ? 'Medium' : 'Still building';

  return {
    perCluster,
    topPriorities,
    stillConfirming,
    confidenceLabel,
    internalConfidence,
    itemsScored: responses.length,
  };
}

/**
 * Internal 0–100 *plan* confidence (never shown as a number). Confidence is in
 * the PLAN, not per-skill: it rises with broad coverage and with how cleanly the
 * Top-3 separate from the rest (a settled ranking). Kept monotonic and bounded.
 */
function internalPlanConfidence(
  perCluster: readonly ClusterSignal[],
  priorities: readonly LeveragePriority[],
  _cfg: DiagnosticConfig,
): number {
  const sampled = perCluster.filter((s) => s.itemsSeen > 0).length;
  const resolved = perCluster.filter((s) => s.certainty >= 0.5).length;
  const coverage = sampled / SKILL_CLUSTERS.length;
  const resolvedShare = resolved / SKILL_CLUSTERS.length;

  // Separation: gap in leverage between the #3 and #4 priority (0 if <4).
  const third = priorities[2]?.leverage ?? 0;
  const fourth = priorities[3]?.leverage ?? 0;
  const topLeverage = priorities[0]?.leverage ?? 0;
  const separation = topLeverage > 0 ? Math.min(1, (third - fourth) / topLeverage + 0.5) : 0.5;

  const score = 100 * (0.45 * coverage + 0.35 * resolvedShare + 0.2 * separation);
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ---------------------------------------------------------------------------
// SHADOW-ONLY smart stop (provisional; NOT wired into the active `shouldStop`).
// The plan's "smart stop" ends early once the Top-3 stops changing AND each has
// solid evidence. It fully turns on only after item calibration; until then the
// active path is the balanced-coverage `shouldStop` above. This is exported for
// the shadow evaluation harness and gated by DIAGNOSTIC_MANIFEST status.
// ---------------------------------------------------------------------------

export interface SmartStopDecision {
  stop: boolean;
  reason: 'top3_stable_and_confident' | 'not_stable' | 'insufficient_history';
}

/**
 * @remarks SHADOW-ONLY. Do not gate the live diagnostic on this until items are
 * calibrated and the manifest is promoted from `provisional_active`.
 */
export function shadowSmartStop(
  history: readonly DiagnosticResult[],
  opts: { stableWindow?: number; minCertainty?: number } = {},
): SmartStopDecision {
  const stableWindow = opts.stableWindow ?? 3;
  const minCertainty = opts.minCertainty ?? 0.6;
  if (history.length < stableWindow) return { stop: false, reason: 'insufficient_history' };

  const recent = history.slice(-stableWindow);
  const key = (r: DiagnosticResult): string =>
    r.topPriorities
      .map((p) => p.cluster)
      .sort()
      .join(',');
  const stable = recent.every((r) => key(r) === key(recent[0]!));
  if (!stable) return { stop: false, reason: 'not_stable' };

  const latest = recent[recent.length - 1]!;
  const confident = latest.topPriorities.every((p) => {
    const signal = latest.perCluster.find((s) => s.cluster === p.cluster);
    return (signal?.certainty ?? 0) >= minCertainty;
  });
  return confident
    ? { stop: true, reason: 'top3_stable_and_confident' }
    : { stop: false, reason: 'not_stable' };
}
