import { describe, expect, it } from 'vitest';
import { CLUSTER_INFO, SKILL_CLUSTERS, type SkillCluster } from '@mcat/contracts';
import {
  DIAGNOSTIC_CONFIG,
  computeDiagnosticResult,
  isCoverageComplete,
  selectNextDiagnostic,
  shadowSmartStop,
  shouldStop,
  type DiagnosticCandidate,
  type DiagnosticResponse,
  type DiagnosticResult,
  type DiagnosticState,
} from './diagnostic';

// ---------------------------------------------------------------------------
// A synthetic full-coverage candidate pool: 3 families per cluster so every
// section floor and cluster family floor can be satisfied, exercising the real
// selection + stop loop end-to-end.
// ---------------------------------------------------------------------------
function buildCandidates(): DiagnosticCandidate[] {
  const out: DiagnosticCandidate[] = [];
  for (const cluster of SKILL_CLUSTERS) {
    const section = CLUSTER_INFO[cluster].section;
    for (let f = 0; f < 3; f += 1) {
      for (let i = 0; i < 2; i += 1) {
        out.push({
          questionId: `${cluster}-fam${f}-q${i}`,
          cluster,
          section,
          familyId: `${cluster}-fam${f}`,
          format: 'discrete_mcq',
          eligible: true,
        });
      }
    }
  }
  return out;
}

/** Drive the selection engine to completion, applying each pick to the state. */
function runSelectionToCompletion(candidates: readonly DiagnosticCandidate[]): {
  picked: DiagnosticCandidate[];
  finalState: DiagnosticState;
} {
  const byId = new Map(candidates.map((c) => [c.questionId, c] as const));
  const seen = new Set<string>();
  const familiesByCluster: Record<string, Set<string>> = {};
  const itemsBySection: Record<string, number> = { cp: 0, cars: 0, bb: 0, ps: 0 };
  const picked: DiagnosticCandidate[] = [];

  for (let guard = 0; guard < 1000; guard += 1) {
    const state: DiagnosticState = {
      itemsScored: seen.size,
      seenQuestionIds: seen,
      familiesByCluster: familiesByCluster as DiagnosticState['familiesByCluster'],
      itemsBySection: itemsBySection as DiagnosticState['itemsBySection'],
      seed: 'seed-test',
    };
    const sel = selectNextDiagnostic(state, candidates);
    if (sel.done) return { picked, finalState: state };
    const cand = byId.get(sel.questionId!)!;
    picked.push(cand);
    seen.add(cand.questionId);
    (familiesByCluster[cand.cluster] ??= new Set<string>()).add(cand.familyId);
    itemsBySection[cand.section] = (itemsBySection[cand.section] ?? 0) + 1;
  }
  throw new Error('selection did not terminate');
}

describe('diagnostic selection + stop rules', () => {
  it('respects the floor: never stops before minItems even with coverage', () => {
    // Coverage met but only a few items scored -> must keep going to the floor.
    const familiesByCluster: Record<string, Set<string>> = {};
    for (const c of SKILL_CLUSTERS) familiesByCluster[c] = new Set(['a', 'b']);
    const state: DiagnosticState = {
      itemsScored: 10,
      seenQuestionIds: new Set(),
      familiesByCluster: familiesByCluster as DiagnosticState['familiesByCluster'],
      itemsBySection: { cp: 8, cars: 6, bb: 8, ps: 8 },
      seed: 's',
    };
    expect(isCoverageComplete(state, DIAGNOSTIC_CONFIG)).toBe(true);
    expect(shouldStop(state, DIAGNOSTIC_CONFIG)).toBe(false); // below the 30 floor
  });

  it('stops at the ceiling (maxItems) unconditionally', () => {
    const state: DiagnosticState = {
      itemsScored: DIAGNOSTIC_CONFIG.maxItems,
      seenQuestionIds: new Set(),
      familiesByCluster: {},
      itemsBySection: { cp: 0, cars: 0, bb: 0, ps: 0 },
      seed: 's',
    };
    expect(shouldStop(state, DIAGNOSTIC_CONFIG)).toBe(true);
  });

  it('runs to full coverage: every cluster gets >= minFamilies and section floors are met', () => {
    const { picked, finalState } = runSelectionToCompletion(buildCandidates());

    expect(picked.length).toBeGreaterThanOrEqual(DIAGNOSTIC_CONFIG.minItems);
    expect(picked.length).toBeLessThanOrEqual(DIAGNOSTIC_CONFIG.maxItems);
    expect(isCoverageComplete(finalState, DIAGNOSTIC_CONFIG)).toBe(true);

    for (const cluster of SKILL_CLUSTERS) {
      const families = finalState.familiesByCluster[cluster]?.size ?? 0;
      expect(families).toBeGreaterThanOrEqual(DIAGNOSTIC_CONFIG.minFamiliesPerCluster);
    }
    for (const [section, floor] of Object.entries(DIAGNOSTIC_CONFIG.sectionFloors)) {
      expect(finalState.itemsBySection[section as keyof typeof finalState.itemsBySection]).toBeGreaterThanOrEqual(
        floor,
      );
    }
  });

  it('is deterministic: same seed selects the same first item', () => {
    const candidates = buildCandidates();
    const state: DiagnosticState = {
      itemsScored: 0,
      seenQuestionIds: new Set(),
      familiesByCluster: {},
      itemsBySection: { cp: 0, cars: 0, bb: 0, ps: 0 },
      seed: 'fixed-seed',
    };
    const a = selectNextDiagnostic(state, candidates);
    const b = selectNextDiagnostic(state, candidates);
    expect(a.questionId).toBe(b.questionId);
  });

  it('never selects ineligible or already-seen items', () => {
    const state: DiagnosticState = {
      itemsScored: 0,
      seenQuestionIds: new Set(['seen-1']),
      familiesByCluster: {},
      itemsBySection: { cp: 0, cars: 0, bb: 0, ps: 0 },
      seed: 's',
    };
    const candidates: DiagnosticCandidate[] = [
      { questionId: 'seen-1', cluster: 'BB1', section: 'bb', familyId: 'f', format: 'discrete_mcq', eligible: true },
      { questionId: 'inelig', cluster: 'BB1', section: 'bb', familyId: 'f', format: 'discrete_mcq', eligible: false },
      { questionId: 'ok', cluster: 'BB1', section: 'bb', familyId: 'g', format: 'discrete_mcq', eligible: true },
    ];
    expect(selectNextDiagnostic(state, candidates).questionId).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Result / output engine
// ---------------------------------------------------------------------------
const resp = (
  cluster: SkillCluster,
  correct: boolean,
  over: Partial<DiagnosticResponse> = {},
): DiagnosticResponse => ({
  questionId: `${cluster}-${Math.random()}`,
  cluster,
  section: CLUSTER_INFO[cluster].section,
  familyId: `${cluster}-fam`,
  correct,
  elapsedMs: 45_000,
  dokLevel: 2,
  ...over,
});

describe('computeDiagnosticResult', () => {
  it('marks unsampled clusters and never invents weakness from absence', () => {
    const result = computeDiagnosticResult([resp('BB1', true), resp('BB1', true)]);
    const unsampled = result.perCluster.filter((s) => s.classification === 'unsampled');
    // 14 of 15 clusters unsampled (only BB1 was touched).
    expect(unsampled.length).toBe(SKILL_CLUSTERS.length - 1);
    for (const s of unsampled) expect(s.gap).toBe(0);
    // Unsampled clusters are never surfaced as a confident priority.
    expect(result.topPriorities.some((p) => unsampled.map((u) => u.cluster).includes(p.cluster))).toBe(false);
  });

  it('classifies a well-answered cluster as provisionally_ready -> CONCISE_INSTRUCTION', () => {
    const result = computeDiagnosticResult([
      resp('BB2', true),
      resp('BB2', true),
      resp('BB2', true),
    ]);
    const bb2 = result.perCluster.find((s) => s.cluster === 'BB2')!;
    expect(bb2.classification).toBe('provisionally_ready');
    expect(bb2.recommendation).toBe('CONCISE_INSTRUCTION');
  });

  it('classifies a mostly-wrong cluster as likely_weak', () => {
    const result = computeDiagnosticResult([
      resp('PS2', false),
      resp('PS2', false),
      resp('PS2', false),
    ]);
    const ps2 = result.perCluster.find((s) => s.cluster === 'PS2')!;
    expect(ps2.classification).toBe('likely_weak');
    expect(ps2.gap).toBeGreaterThanOrEqual(0.5);
  });

  it('routes a weak foundational cluster to PREREQUISITE_SUPPORT_CANDIDATE', () => {
    const result = computeDiagnosticResult([resp('R1', false), resp('R1', false), resp('R1', false)]);
    const r1 = result.perCluster.find((s) => s.cluster === 'R1')!;
    expect(r1.classification).toBe('likely_weak');
    expect(r1.recommendation).toBe('PREREQUISITE_SUPPORT_CANDIDATE');
  });

  it('ranks Top 3 by leverage (weakness x unlock), foundations first', () => {
    // Equal raw weakness in a foundational (R1) and a leaf (CA2) cluster: R1 should
    // outrank CA2 because it unlocks more (higher leverage).
    const result = computeDiagnosticResult([
      resp('R1', false),
      resp('R1', false),
      resp('CA2', false),
      resp('CA2', false),
    ]);
    const clusters = result.topPriorities.map((p) => p.cluster);
    expect(clusters[0]).toBe('R1');
    expect(clusters).toContain('CA2');
    expect(result.topPriorities.length).toBeLessThanOrEqual(3);
  });

  it('puts under-evidenced weak clusters into stillConfirming, not Top 3', () => {
    // A single wrong answer -> certainty < 0.5 -> unresolved -> still confirming.
    const result = computeDiagnosticResult([resp('CP1', false)]);
    expect(result.topPriorities.some((p) => p.cluster === 'CP1')).toBe(false);
    expect(result.stillConfirming).toContain('CP1');
  });

  it('does not emit a numeric confidence for display, only a word label + internal score', () => {
    const result = computeDiagnosticResult([resp('BB1', true), resp('BB1', false)]);
    expect(['High', 'Medium', 'Still building']).toContain(result.confidenceLabel);
    expect(result.internalConfidence).toBeGreaterThanOrEqual(0);
    expect(result.internalConfidence).toBeLessThanOrEqual(100);
  });

  it('is deterministic for the same responses (stable ordering)', () => {
    const responses = [resp('R1', false), resp('R1', false), resp('R2', false), resp('R2', false)];
    const a = computeDiagnosticResult(responses);
    const b = computeDiagnosticResult(responses);
    expect(a.topPriorities.map((p) => p.cluster)).toEqual(b.topPriorities.map((p) => p.cluster));
    expect(a.internalConfidence).toBe(b.internalConfidence);
  });

  it('gives higher plan confidence with broader coverage', () => {
    const narrow = computeDiagnosticResult([resp('BB1', true), resp('BB1', false)]);
    const broadResponses: DiagnosticResponse[] = [];
    for (const c of SKILL_CLUSTERS) {
      broadResponses.push(resp(c, true), resp(c, false));
    }
    const broad = computeDiagnosticResult(broadResponses);
    expect(broad.internalConfidence).toBeGreaterThan(narrow.internalConfidence);
  });
});

describe('shadowSmartStop (shadow-only)', () => {
  const resultWith = (clusters: SkillCluster[], certainty: number): DiagnosticResult => ({
    perCluster: clusters.map((cluster) => ({
      cluster,
      section: CLUSTER_INFO[cluster].section,
      itemsSeen: 4,
      correct: 0,
      gap: 0.8,
      certainty,
      classification: 'likely_weak' as const,
      recommendation: 'STANDARD_INSTRUCTION' as const,
      slow: false,
    })),
    topPriorities: clusters.map((cluster) => ({
      cluster,
      title: CLUSTER_INFO[cluster].title,
      leverage: 1,
      classification: 'likely_weak' as const,
      recommendation: 'STANDARD_INSTRUCTION' as const,
    })),
    stillConfirming: [],
    confidenceLabel: 'Medium',
    internalConfidence: 70,
    itemsScored: 30,
  });

  it('requires enough history before stopping', () => {
    expect(shadowSmartStop([resultWith(['R1', 'R2', 'R3'], 0.7)]).reason).toBe('insufficient_history');
  });

  it('stops when the Top 3 is stable and confident', () => {
    const stable = resultWith(['R1', 'R2', 'R3'], 0.7);
    const decision = shadowSmartStop([stable, stable, stable]);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toBe('top3_stable_and_confident');
  });

  it('does not stop when the Top 3 keeps changing', () => {
    const decision = shadowSmartStop([
      resultWith(['R1', 'R2', 'R3'], 0.7),
      resultWith(['R1', 'R2', 'CP1'], 0.7),
      resultWith(['R1', 'CA1', 'CP1'], 0.7),
    ]);
    expect(decision.stop).toBe(false);
    expect(decision.reason).toBe('not_stable');
  });

  it('does not stop when evidence is thin even if stable', () => {
    const thin = resultWith(['R1', 'R2', 'R3'], 0.4);
    expect(shadowSmartStop([thin, thin, thin]).stop).toBe(false);
  });
});
