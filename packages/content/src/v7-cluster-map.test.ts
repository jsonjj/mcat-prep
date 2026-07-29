import { describe, expect, it } from 'vitest';
import { SKILL_CLUSTERS, type SkillCluster } from '@mcat/contracts';
import { KC_TO_LESSON, LESSON_TO_CLUSTER } from './data/v3-cluster-map.data';
import { LESSON_TO_ORDERED_KCS } from './data/lesson-to-ordered-kcs.data';
import { TARGET_LESSON_ID, TARGET_ORDERED_KC_IDS } from './v3-vector-lesson-artifacts';
import {
  clusterForKc,
  orderedKcsForLesson,
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

/**
 * Curriculum order transcribed straight from the pinned authoring manifest
 * (`curriculum/v3/v3-lesson-authoring-manifest.json`,
 * `curriculum.lessons[].ordered_required_kc_ids`). The first four differ from
 * their KC ids sorted alphabetically; `V3-LES-789208` is one of the 14 lessons
 * where the two happen to coincide, and is pinned here so a regression that
 * reverted to alphabetical order could not hide behind it.
 */
const MANIFEST_ORDER_FIXTURES: Record<string, readonly string[]> = {
  'V3-LES-006619': ['V3-KC-187351', 'V3-KC-010372', 'V3-KC-376473'],
  'V3-LES-018986': ['V3-KC-750511', 'V3-KC-909119', 'V3-KC-286877', 'V3-KC-200041'],
  'V3-LES-041222': ['V3-KC-168342', 'V3-KC-201790', 'V3-KC-982443', 'V3-KC-475515', 'V3-KC-569631'],
  'V3-LES-130923': ['V3-KC-866848', 'V3-KC-700208', 'V3-KC-159529'],
  'V3-LES-789208': ['V3-KC-399019', 'V3-KC-799492', 'V3-KC-919842', 'V3-KC-981438'],
};

/**
 * What you get if you (wrongly) rebuild lesson membership by inverting
 * `KC_TO_LESSON`: its keys are sorted by KC id, so each lesson's KCs come out
 * alphabetical rather than in teaching order.
 */
function alphabeticalInversionOfKcToLesson(): Record<string, string[]> {
  const byLesson: Record<string, string[]> = {};
  for (const kc of Object.keys(KC_TO_LESSON).sort()) {
    (byLesson[KC_TO_LESSON[kc]!] ??= []).push(kc);
  }
  return byLesson;
}

describe('lesson → ordered required KCs (curriculum order, not id order)', () => {
  it('covers exactly 114 lessons and all 422 KCs, with no empty lesson', () => {
    const lessons = Object.keys(LESSON_TO_ORDERED_KCS);
    expect(lessons).toHaveLength(114);

    const all = Object.values(LESSON_TO_ORDERED_KCS).flatMap((kcs) => [...kcs]);
    expect(all).toHaveLength(422);
    expect(new Set(all).size).toBe(422); // no KC claimed by two lessons

    for (const lesson of lessons) {
      expect(LESSON_TO_ORDERED_KCS[lesson]!.length, lesson).toBeGreaterThan(0);
      expect(orderedKcsForLesson(lesson), lesson).not.toHaveLength(0);
    }
  });

  it('spans exactly the lessons the cluster map knows about', () => {
    expect(Object.keys(LESSON_TO_ORDERED_KCS).sort()).toEqual(
      Object.keys(LESSON_TO_CLUSTER).sort(),
    );
  });

  it('agrees with KC_TO_LESSON on membership for every lesson (same members, own order)', () => {
    const inverted = alphabeticalInversionOfKcToLesson();
    for (const [lesson, kcs] of Object.entries(LESSON_TO_ORDERED_KCS)) {
      expect([...kcs].sort(), lesson).toEqual((inverted[lesson] ?? []).slice().sort());
    }
  });

  it('matches the manifest order exactly for the pinned sample', () => {
    for (const [lesson, expected] of Object.entries(MANIFEST_ORDER_FIXTURES)) {
      expect(orderedKcsForLesson(lesson), lesson).toEqual(expected);
    }
  });

  it('agrees with the independently pinned vector-lesson artifact ordering', () => {
    // v3-vector-lesson-artifacts.ts pins V3-LES-130923's ordering from the same
    // registry; that order is not alphabetical, so it corroborates the manifest.
    expect(orderedKcsForLesson(TARGET_LESSON_ID)).toEqual([...TARGET_ORDERED_KC_IDS]);
  });

  it('is NOT the alphabetical inversion of KC_TO_LESSON (the ordering trap)', () => {
    const inverted = alphabeticalInversionOfKcToLesson();
    const differing = Object.keys(LESSON_TO_ORDERED_KCS).filter(
      (lesson) =>
        JSON.stringify(LESSON_TO_ORDERED_KCS[lesson]) !== JSON.stringify(inverted[lesson] ?? []),
    );

    // Measured against the manifest: 100 of 114. A near-zero count here means the
    // data was rebuilt from the wrong source and 100 lessons teach in the wrong
    // order, so assert the bulk of the curriculum disagrees with id order.
    expect(differing.length).toBe(100);

    // At least three of the pinned fixtures must be lessons where it differs.
    const differingFixtures = Object.keys(MANIFEST_ORDER_FIXTURES).filter((l) =>
      differing.includes(l),
    );
    expect(differingFixtures.length).toBeGreaterThanOrEqual(3);
  });

  it('fails closed on unknown, empty, and nullish lesson ids', () => {
    expect(orderedKcsForLesson('V3-LES-does-not-exist')).toBeNull();
    expect(orderedKcsForLesson('')).toBeNull();
    expect(orderedKcsForLesson(null)).toBeNull();
    expect(orderedKcsForLesson(undefined)).toBeNull();
  });
});

describe('resolveV7Cluster / resolveV7Placement', () => {
  it('resolves via the KC path and agrees with the lesson path', () => {
    const [kc, lesson] = Object.entries(KC_TO_LESSON)[0]!;
    const expected = LESSON_TO_CLUSTER[lesson]!;
    expect(clusterForKc(kc)).toBe(expected);
    expect(resolveV7Cluster({ section: 'BB', primary_kc_id: kc, lesson_id: lesson })).toBe(
      expected,
    );
  });

  it('falls back to lesson id, then to the skill facet', () => {
    const [, lesson] = Object.entries(KC_TO_LESSON)[0]!;
    const expected = LESSON_TO_CLUSTER[lesson]!;
    // Unknown KC → use lesson id.
    expect(
      resolveV7Cluster({ section: 'BB', primary_kc_id: 'V3-KC-does-not-exist', lesson_id: lesson }),
    ).toBe(expected);
    // Unknown KC + unknown lesson → fall back to the skill facet.
    expect(
      resolveV7Cluster({
        section: 'CROSS_SECTION',
        primary_kc_id: 'x',
        lesson_id: 'y',
        primary_skill: 'SIRS4',
      }),
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
