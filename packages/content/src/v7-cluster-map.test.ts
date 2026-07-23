import { describe, expect, it } from 'vitest';
import { SKILL_CLUSTERS, type SkillCluster } from '@mcat/contracts';
import { KC_TO_LESSON, LESSON_TO_CLUSTER } from './data/v3-cluster-map.data';
import {
  clusterForKc,
  resolveV7Cluster,
  resolveV7Placement,
  v7SectionToEngineSection,
  v7SkillToCluster,
} from './v7-cluster-map';

/** Lessons-per-cluster from the V3 registry (see docs/concept-tree-and-mapping.md B.3). */
const EXPECTED_LESSONS_PER_CLUSTER: Record<SkillCluster, number> = {
  R1: 3,
  R2: 2,
  R3: 2,
  CP1: 7,
  CP2: 13,
  CP3: 12,
  BB1: 13,
  BB2: 11,
  BB3: 7,
  BB4: 5,
  PS1: 0, // empty by design: research/stats is the shared cross-section SIRS strand
  PS2: 15,
  PS3: 15,
  CA1: 4,
  CA2: 5,
};

describe('v7 section → engine section', () => {
  it('maps the 4 content sections and treats CROSS_SECTION as a strand (null)', () => {
    expect(v7SectionToEngineSection('BB')).toBe('bb');
    expect(v7SectionToEngineSection('CP')).toBe('cp');
    expect(v7SectionToEngineSection('PS')).toBe('ps');
    expect(v7SectionToEngineSection('CARS')).toBe('cars');
    expect(v7SectionToEngineSection('CROSS_SECTION')).toBeNull();
  });
});

describe('v7 skill → cluster (label facet, honoring locked choices)', () => {
  it('applies the locked labels and the AAMC skill groupings', () => {
    expect(v7SkillToCluster('MATH-ENABLING')).toBe('R1');
    expect(v7SkillToCluster('SIRS1')).toBe('R2');
    expect(v7SkillToCluster('SIRS4')).toBe('R2'); // locked
    expect(v7SkillToCluster('SIRS2')).toBe('R3');
    expect(v7SkillToCluster('SIRS3')).toBe('R3');
    expect(v7SkillToCluster('CARS_FOC')).toBe('CA1');
    expect(v7SkillToCluster('CARS_RWT')).toBe('CA1'); // locked
    expect(v7SkillToCluster('CARS_RBT')).toBe('CA2');
    expect(v7SkillToCluster('unknown')).toBeNull();
    expect(v7SkillToCluster(undefined)).toBeNull();
  });
});

describe('cluster map data integrity (zero gaps)', () => {
  it('covers exactly 114 lessons and 422 KCs', () => {
    expect(Object.keys(LESSON_TO_CLUSTER)).toHaveLength(114);
    expect(Object.keys(KC_TO_LESSON)).toHaveLength(422);
  });

  it('every lesson maps to a real cluster', () => {
    for (const cluster of Object.values(LESSON_TO_CLUSTER)) {
      expect(SKILL_CLUSTERS).toContain(cluster);
    }
  });

  it('every KC resolves through its owning lesson to a cluster (no orphans)', () => {
    for (const [kc, lesson] of Object.entries(KC_TO_LESSON)) {
      expect(LESSON_TO_CLUSTER[lesson], `KC ${kc} → lesson ${lesson}`).toBeDefined();
      expect(clusterForKc(kc)).not.toBeNull();
    }
  });

  it('lessons-per-cluster match the registry-derived distribution', () => {
    const counts: Record<string, number> = {};
    for (const c of Object.values(LESSON_TO_CLUSTER)) counts[c] = (counts[c] ?? 0) + 1;
    for (const cluster of SKILL_CLUSTERS) {
      expect(counts[cluster] ?? 0, cluster).toBe(EXPECTED_LESSONS_PER_CLUSTER[cluster]);
    }
  });
});

describe('resolveV7Cluster / resolveV7Placement', () => {
  it('resolves via the KC path and agrees with the lesson path', () => {
    const [kc, lesson] = Object.entries(KC_TO_LESSON)[0]!;
    const expected = LESSON_TO_CLUSTER[lesson]!;
    expect(clusterForKc(kc)).toBe(expected);
    expect(resolveV7Cluster({ section: 'BB', primary_kc_id: kc, lesson_id: lesson })).toBe(expected);
  });

  it('falls back to lesson id, then to the skill facet', () => {
    const [, lesson] = Object.entries(KC_TO_LESSON)[0]!;
    const expected = LESSON_TO_CLUSTER[lesson]!;
    // Unknown KC → use lesson id.
    expect(resolveV7Cluster({ section: 'BB', primary_kc_id: 'V3-KC-does-not-exist', lesson_id: lesson })).toBe(
      expected,
    );
    // Unknown KC + unknown lesson → fall back to the skill facet.
    expect(
      resolveV7Cluster({ section: 'CROSS_SECTION', primary_kc_id: 'x', lesson_id: 'y', primary_skill: 'SIRS4' }),
    ).toBe('R2');
  });

  it('places a cross-section item with no content section but a resolved cluster', () => {
    const placement = resolveV7Placement({
      section: 'CROSS_SECTION',
      primary_skill: 'MATH-ENABLING',
    });
    expect(placement.section).toBeNull();
    expect(placement.crossSection).toBe(true);
    expect(placement.cluster).toBe('R1');
  });
});
