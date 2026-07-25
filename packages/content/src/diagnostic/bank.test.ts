import { describe, expect, it } from 'vitest';
import { CLUSTER_INFO, SKILL_CLUSTERS, type Section } from '@mcat/contracts';
import { buildDiagnosticBank } from './bank';

const PROTECTED_FIELD_NAMES = ['correct_answer', 'explanations', 'correct_choice_id', 'rationales'];

describe('diagnostic v7 bank builder', () => {
  const bank = buildDiagnosticBank();

  it('builds a coverage-complete pool (>= 2 families per cluster)', () => {
    for (const cluster of SKILL_CLUSTERS) {
      const families = new Set(
        bank.filter((item) => item.cluster === cluster).map((item) => item.familyId),
      );
      expect(families.size, `cluster ${cluster}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('clears the DiagnosticConfig section floors', () => {
    const bySection: Record<Section, number> = { cp: 0, cars: 0, bb: 0, ps: 0 };
    for (const item of bank) bySection[item.section] += 1;
    expect(bySection.cp).toBeGreaterThanOrEqual(8);
    expect(bySection.cars).toBeGreaterThanOrEqual(6);
    expect(bySection.bb).toBeGreaterThanOrEqual(8);
    expect(bySection.ps).toBeGreaterThanOrEqual(8);
  });

  it('routes 14/15 clusters through the real adapter (PS1 uses the documented fallback)', () => {
    const adapterFallbackClusters = new Set(
      bank.filter((item) => !item.routedViaAdapter).map((item) => item.cluster),
    );
    expect([...adapterFallbackClusters]).toEqual(['PS1']);
  });

  it('every item resolves to a section matching its cluster rollup', () => {
    for (const item of bank) {
      expect(item.section).toBe(CLUSTER_INFO[item.cluster].section);
    }
  });

  it('NEVER leaks a protected field into the learner-safe payload', () => {
    for (const item of bank) {
      const safeJson = JSON.stringify(item.safe);
      for (const field of PROTECTED_FIELD_NAMES) {
        expect(safeJson.includes(`"${field}"`), `${item.safe.id} leaked ${field}`).toBe(false);
      }
      // The safe payload structurally cannot carry a key or explanations.
      expect('correct_answer' in item.safe).toBe(false);
      expect('explanations' in item.safe).toBe(false);
    }
  });

  it('keeps the answer key only on the protected half, and it references a real choice', () => {
    for (const item of bank) {
      expect(['A', 'B', 'C', 'D']).toContain(item.protected.correct_answer);
      expect(item.protected.id).toBe(item.safe.id);
    }
  });

  it('marks all fixture items diagnostic-eligible', () => {
    expect(bank.every((item) => item.eligible)).toBe(true);
  });
});
