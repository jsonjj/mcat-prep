import type { Section, SkillCluster } from '@mcat/contracts';
import type { V7Section } from './schema';
import { KC_TO_LESSON, LESSON_TO_CLUSTER } from './data/v3-cluster-map.data';
import { LESSON_TO_ORDERED_KCS } from './data/lesson-to-ordered-kcs.data';

/**
 * ADAPTER SEAM — v7 sections/skills → the engine's rollups.
 *
 * The learning system is **KC-centric** (see docs/concept-tree-and-mapping.md):
 * mastery lives on the ~422 V3 KCs. The 4 exam **sections** and the 15 app
 * **clusters** (R1…CA2) are *presentation rollups derived from the KC*, not the
 * source of truth. This module implements that derivation:
 *
 *   primary_kc_id → owning V3 lesson → teaching module → one of the 15 clusters
 *
 * The mapping data (`./data/v3-cluster-map.data.ts`) is generated from the pinned
 * V3 registry and covers all 114 lessons / 422 KCs with zero gaps. The one
 * teaching module that spans two reasoning clusters (Scientific Models & Evidence
 * Entry) is split per the locked labels: SIRS1/SIRS4 → R2, SIRS2/SIRS3 → R3.
 *
 * The same seam also exposes the *ordered* membership of each lesson
 * (`./data/lesson-to-ordered-kcs.data.ts`, from the pinned authoring manifest),
 * which is what lesson-level mastery rolls up over.
 */

/**
 * Normalize a v7 section to one of the engine's 4 content sections.
 * `CROSS_SECTION` is its own reasoning strand (SIRS/math) with no content
 * section — it returns `null` by design, and its cluster still resolves to
 * R1–R3 via the KC path (see {@link resolveV7Cluster}).
 */
export function v7SectionToEngineSection(section: V7Section): Section | null {
  switch (section) {
    case 'BB':
      return 'bb';
    case 'CARS':
      return 'cars';
    case 'CP':
      return 'cp';
    case 'PS':
      return 'ps';
    case 'CROSS_SECTION':
      return null;
    default:
      return null;
  }
}

/** True for the cross-section reasoning strand (no content section of its own). */
export const isCrossSection = (section: V7Section): boolean => section === 'CROSS_SECTION';

/** Cluster for a V3 lesson id (`V3-LES-*`). Total over the 114 registry lessons. */
export function clusterForLesson(lessonId: string | null | undefined): SkillCluster | null {
  if (!lessonId) return null;
  return LESSON_TO_CLUSTER[lessonId] ?? null;
}

/**
 * The required KCs of a V3 lesson, in registry **curriculum order** — the
 * membership a lesson's mastery rollup is computed over (see
 * packages/policies/src/lesson-rollup.ts).
 *
 * Order is the teaching sequence, not id order; it is read from the pinned
 * authoring manifest and disagrees with sorting each lesson's KC ids for 100 of
 * the 114 lessons, so it can never be recovered by inverting {@link KC_TO_LESSON}.
 *
 * Returns `null` for an unknown lesson id (a data-integrity signal for callers,
 * same convention as {@link clusterForLesson}). Never returns an empty array:
 * every registry lesson has 1–5 required KCs.
 */
export function orderedKcsForLesson(lessonId: string | null | undefined): readonly string[] | null {
  if (!lessonId) return null;
  return LESSON_TO_ORDERED_KCS[lessonId] ?? null;
}

/**
 * Cluster for a V3 KC id (`V3-KC-*`) — the canonical path:
 * KC → owning lesson → cluster.
 */
export function clusterForKc(kcId: string | null | undefined): SkillCluster | null {
  if (!kcId) return null;
  const lessonId = KC_TO_LESSON[kcId];
  return lessonId ? clusterForLesson(lessonId) : null;
}

/**
 * Map a v7 AAMC skill code to a UI cluster. This is a *telemetry/label* facet,
 * NOT the mastery key — prefer the KC path. Honors the locked label choices
 * (SIRS4 → R2, CARS_RWT → CA1).
 */
export function v7SkillToCluster(skill: string | null | undefined): SkillCluster | null {
  if (!skill) return null;
  switch (skill.trim().toUpperCase()) {
    case 'MATH-ENABLING':
    case 'MATH_ENABLING':
      return 'R1';
    case 'SIRS1':
    case 'SIRS4': // locked: Data-Based & Statistical Reasoning shows under R2
      return 'R2';
    case 'SIRS2':
    case 'SIRS3':
      return 'R3';
    case 'CARS_FOC':
    case 'CARS_RWT': // locked: Reasoning Within the Text shows under CA1
      return 'CA1';
    case 'CARS_RBT':
      return 'CA2';
    default:
      return null;
  }
}

/** The minimal question shape needed to place a v7 item. */
export interface V7Placementable {
  section: V7Section;
  primary_kc_id?: string | undefined;
  lesson_id?: string | undefined;
  primary_skill?: string | undefined;
}

/**
 * Resolve a question's UI cluster. Canonical path first (KC → lesson → cluster),
 * then the question's own lesson id, then the skill facet as a last resort.
 * Returns `null` only if none resolve (a data-integrity signal for callers).
 */
export function resolveV7Cluster(q: V7Placementable): SkillCluster | null {
  return (
    clusterForKc(q.primary_kc_id) ??
    clusterForLesson(q.lesson_id) ??
    v7SkillToCluster(q.primary_skill)
  );
}

export interface V7Placement {
  /** Engine content section, or `null` for the cross-section reasoning strand. */
  section: Section | null;
  /** One of the 15 app clusters, or `null` if unresolved (data-integrity signal). */
  cluster: SkillCluster | null;
  /** True for the cross-section reasoning strand. */
  crossSection: boolean;
}

/** Resolve both the engine section and the UI cluster for a v7 question. */
export function resolveV7Placement(q: V7Placementable): V7Placement {
  return {
    section: v7SectionToEngineSection(q.section),
    cluster: resolveV7Cluster(q),
    crossSection: isCrossSection(q.section),
  };
}
