import type { SkillCluster } from '@mcat/contracts';
import { CLUSTER_INFO } from '@mcat/contracts';
import { FC_AXIS_DATA } from './data/fc-axis.generated';
import { FC_LESSON } from './data/fc-lessons.generated';
import { UNLOCK_WEIGHT } from './diagnostic';
import type { AxisBucket, DiagnosticAxis } from './diagnostic-axis';

/**
 * The 10 AAMC Foundational Concepts as a diagnostic axis — the alternative
 * partition the simulation sweeps against `CLUSTER_AXIS`.
 *
 * Weights and sections are generated from the V3 lesson manifest by
 * scripts/generate-fc-axis.mjs; that script's header documents the aggregation
 * rule and what it rejected.
 */

/**
 * The manifest tags lessons with bare `FC1`…`FC10` and carries no names for
 * them, so these are the AAMC concept statements condensed to a learner-facing
 * phrase, cross-checked against the region names in
 * `packages/contracts/src/atlas-region-groups.json` (which was grouped off the
 * same axis). Real concepts, shortened — not placeholders.
 */
const FC_TITLE: Readonly<Record<string, string>> = {
  FC1: 'Biomolecular Structure and Function',
  FC2: 'Cells and Organized Assemblies',
  FC3: 'Organ Systems and Homeostasis',
  FC4: 'Physical Principles in Living Systems',
  FC5: 'Chemical Interactions and Reactions',
  FC6: 'Sensation, Perception, and Cognition',
  FC7: 'Behavior and Behavior Change',
  FC8: 'Self, Others, and Social Interaction',
  FC9: 'Social and Cultural Differences in Well-Being',
  FC10: 'Social Stratification and Access to Resources',
};

/**
 * What each concept actually asks of the learner, in the register
 * `CLUSTER_INFO.tested` uses — the diagnostic shows this line under a reported
 * priority, so an FC bucket needs one for the same reason a cluster does.
 * Condensed from the AAMC content categories beneath each concept.
 */
const FC_TESTED: Readonly<Record<string, string>> = {
  FC1: 'Amino acids, proteins, enzymes, nucleic acids, lipids, carbohydrates, and how their structure sets their function',
  FC2: 'Cell structure, membranes and transport, the genetic code, gene expression, cell division, and microbiology',
  FC3: 'Nervous, endocrine, circulatory, respiratory, renal, digestive, immune, and reproductive systems, and how they hold conditions steady',
  FC4: 'Motion, forces, energy, fluids, electrostatics, circuits, sound, light, and optics as they act on living systems',
  FC5: 'Atomic and molecular structure, bonding, thermodynamics, kinetics, equilibrium, acids and bases, and separation methods',
  FC6: 'Sensation and perception, attention, memory, language, problem solving, consciousness, and their biological basis',
  FC7: 'Learning, motivation, attitudes, personality, psychological disorders, and how behaviour changes',
  FC8: 'Self-identity, group processes, social influence, attribution, discrimination, and interpersonal interaction',
  FC9: 'Culture, socialisation, demographics, social institutions, and how they shape well-being',
  FC10: 'Social class, health disparities, access to resources, and how inequality is produced and reproduced',
};

const FC_IDS: readonly string[] = Array.from({ length: 10 }, (_, i) => `FC${i + 1}`);

const buckets: readonly AxisBucket[] = FC_IDS.map((id) => {
  const data = FC_AXIS_DATA[id];
  const title = FC_TITLE[id];
  const tested = FC_TESTED[id];
  if (data === undefined || title === undefined || tested === undefined) {
    throw new Error(`foundational concept ${id} is missing from the generated axis data`);
  }
  return { id, title, tested, section: data.section, unlockWeight: data.unlockWeight };
});

export const FC_AXIS: DiagnosticAxis = { id: 'fc-10', buckets };

/**
 * Reasoning and CARS, which no FC-tagged lesson reaches — the 297 bank questions
 * in these five clusters are exactly the ones `FC_AXIS` cannot see.
 */
const OFF_FC_CLUSTERS: readonly SkillCluster[] = ['R1', 'R2', 'R3', 'CA1', 'CA2'];

/**
 * The 10 Foundational Concepts for content plus the 5 reasoning/CARS clusters
 * the FC tagging does not cover — a partition of the whole bank, unlike
 * `FC_AXIS`.
 *
 * The R/CA buckets are lifted unchanged from the cluster tables rather than from
 * `CLUSTER_AXIS` itself, which would close an import cycle back through
 * diagnostic-axis.ts; diagnostic-axis.test.ts pins them equal.
 *
 * This restores the leverage spread that aggregating to FC level flattened away:
 * R1 at 1.00 down to CA2 at 0.15, against `FC_AXIS`'s 0.20–0.44 — the same 0.85
 * range as `CLUSTER_AXIS`, since both extremes are clusters. Five FCs still tie
 * at 0.20 in the middle. That is the point of the composite: it is the only axis
 * of the three that varies both the partition and the leverage ranking.
 */
export const FC_PLUS_AXIS: DiagnosticAxis = {
  id: 'fc-15',
  buckets: [
    ...buckets,
    ...OFF_FC_CLUSTERS.map((c) => ({
      id: c,
      title: CLUSTER_INFO[c].title,
      tested: CLUSTER_INFO[c].tested,
      section: CLUSTER_INFO[c].section,
      unlockWeight: UNLOCK_WEIGHT[c] ?? 0,
    })),
  ],
};

// --- Question -> bucket, and bucket -> lessons ------------------------------

/**
 * The Foundational Concept a lesson is reported under, or null when it carries
 * no FC tag.
 *
 * Questions are tagged with a cluster, a KC and a lesson but never with an FC,
 * so this is the only route from an item to an FC bucket. A null here means the
 * item is outside what this axis can measure at all — not that it is unplaced.
 */
export const fcForLesson = (lessonId: string | null | undefined): string | null =>
  lessonId === null || lessonId === undefined ? null : FC_LESSON[lessonId] ?? null;

let lessonsByFcCache: ReadonlyMap<string, readonly string[]> | null = null;

/**
 * Lessons grouped by Foundational Concept — the bucket -> unit map the mastery
 * seeder needs, and the FC counterpart of `lessonsByCluster`.
 *
 * Built off the same first-listed-FC table as item bucketing, so a bucket's read
 * is distributed over exactly the lessons whose questions produced it.
 */
export function lessonsByFc(): ReadonlyMap<string, readonly string[]> {
  if (lessonsByFcCache !== null) return lessonsByFcCache;
  const map = new Map<string, string[]>();
  for (const [lessonId, fc] of Object.entries(FC_LESSON)) {
    const list = map.get(fc) ?? [];
    list.push(lessonId);
    map.set(fc, list);
  }
  for (const list of map.values()) list.sort();
  lessonsByFcCache = map;
  return map;
}

/**
 * KCs grouped by Foundational Concept — the bucket -> unit map for seeding at the
 * grain the mastery engine actually stores.
 *
 * A lesson is not a mastery grain: `P(L)` lives on the primary KC and the primary
 * reasoning operation, and a lesson readout is rolled up from its required member
 * KCs on read. So a concept's read has to reach the KCs beneath that concept,
 * which is what this map expresses.
 *
 * `kcsForLesson` is INJECTED rather than imported: the authoritative ordered
 * membership lives in `@mcat/content` (`orderedKcsForLesson`), and this package
 * must not depend on it (asserted by `tests/architecture/boundaries.test.ts`).
 * Duplicating the table here instead would create a second derivation of one
 * fact, which is worse than the parameter.
 *
 * Uncached, because the resolver is the caller's. A lesson with no resolvable
 * membership contributes no KCs — its concept still seeds the KCs it can
 * identify, and an unidentifiable KC is left at the default prior rather than
 * guessed at. Cardinality is what carries that through: certainty is attenuated
 * by the number of units actually returned here, so a concept whose membership is
 * thin is credited less, not more.
 */
export function kcsByFc(
  kcsForLesson: (lessonId: string) => readonly string[] | null | undefined,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const [fc, lessons] of lessonsByFc()) {
    const kcIds = new Set<string>();
    for (const lessonId of lessons) {
      for (const kcId of kcsForLesson(lessonId) ?? []) kcIds.add(kcId);
    }
    map.set(fc, [...kcIds].sort());
  }
  return map;
}
