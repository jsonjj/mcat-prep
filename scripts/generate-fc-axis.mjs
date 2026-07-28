/**
 * Derives a leverage weight and a section for each of the 10 AAMC Foundational
 * Concepts, so the diagnostic can be simulated over that partition instead of
 * the 15 skill clusters.
 *
 * AGGREGATION RULE — mean of the constituent lessons' cluster weights.
 * A lesson inherits the adopted UNLOCK_WEIGHT of the cluster that owns it
 * (via the baked atlas map), and an FC's weight is the arithmetic mean over the
 * lessons tagged with it. Lessons tagged with several FCs count once in each,
 * which is how the manifest tags them.
 *
 * Rejected alternatives:
 *  - Summing lesson weights, or counting downstream units the way
 *    generate-unlock-weights.mjs does at cluster level: both scale with how many
 *    lessons an FC happens to contain, so FC4 (25 lessons) would outrank FC10
 *    (3) mechanically rather than on leverage.
 *  - Deriving FC weights from the registry prerequisite graph directly. The
 *    lesson-level graph carries 56 directed edges over 114 lessons and nothing
 *    is more than 4 hops deep, so eight of ten FCs land under 0.1 and FC8 lands
 *    at exactly 0 — the same sparsity that keeps GENERATED_UNLOCK_WEIGHT
 *    unadopted (see unlock-weights.test.ts).
 *  - Max of the constituent weights: one chemistry lesson would saturate FC4
 *    and FC5 to the same value and throw away the rest of the composition.
 *
 * Taking the mean of the *adopted* cluster table also keeps FC weights on the
 * same leverage scale as CLUSTER_AXIS, so a sweep across the two axes compares
 * partitions rather than two different notions of leverage.
 *
 * Section is the plurality section of the constituent lessons' clusters, ties
 * broken by canonical section order.
 *
 * Run: node scripts/generate-fc-axis.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MANIFEST = 'curriculum/v3/v3-lesson-authoring-manifest.json';
const ATLAS = 'packages/contracts/src/atlas.ts';
const VOCAB = 'packages/contracts/src/vocab.ts';
const DIAGNOSTIC = 'packages/policies/src/diagnostic.ts';
const OUT = 'packages/policies/src/data/fc-axis.generated.ts';

const FCS = Array.from({ length: 10 }, (_, i) => `FC${i + 1}`);
const SECTION_ORDER = ['cp', 'cars', 'bb', 'ps'];

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// lesson -> cluster, read from the baked client-safe atlas map.
const lessonCluster = new Map();
for (const m of readFileSync(ATLAS, 'utf8').matchAll(/'(V3-LES-\d+)':\s*'([A-Z]+\d)'/g)) {
  lessonCluster.set(m[1], m[2]);
}
if (lessonCluster.size === 0) throw new Error('no lesson->cluster pairs found in atlas.ts');

// cluster -> section, from CLUSTER_INFO.
const clusterSection = new Map();
for (const m of readFileSync(VOCAB, 'utf8').matchAll(
  /(\w+): \{ cluster: '\w+', title: '[^']*', section: '(\w+)'/g,
)) {
  clusterSection.set(m[1], m[2]);
}
if (clusterSection.size === 0) throw new Error('no cluster->section pairs found in vocab.ts');

// The adopted hand-tuned table, not the generated one — see the header.
const unlockSource = readFileSync(DIAGNOSTIC, 'utf8').split('export const UNLOCK_WEIGHT')[1] ?? '';
const unlockWeight = new Map();
for (const m of unlockSource.split('};')[0].matchAll(/(\w+): ([\d.]+),/g)) {
  unlockWeight.set(m[1], Number(m[2]));
}
if (unlockWeight.size === 0) throw new Error('no UNLOCK_WEIGHT entries found in diagnostic.ts');

const lessonsByFc = new Map(FCS.map((fc) => [fc, []]));
let untagged = 0;
for (const lesson of manifest.curriculum.lessons) {
  const fcs = lesson.foundational_concepts ?? [];
  if (fcs.length === 0) untagged += 1;
  for (const fc of fcs) {
    if (!lessonsByFc.has(fc)) throw new Error(`unknown foundational concept ${fc}`);
    const cluster = lessonCluster.get(lesson.lesson_id);
    if (cluster === undefined) throw new Error(`lesson ${lesson.lesson_id} missing from atlas.ts`);
    lessonsByFc.get(fc).push(cluster);
  }
}

const rows = FCS.map((fc) => {
  const clusters = lessonsByFc.get(fc);
  if (clusters.length === 0) throw new Error(`${fc} has no lessons`);

  const weight = clusters.reduce((s, c) => s + (unlockWeight.get(c) ?? 0), 0) / clusters.length;

  const bySection = new Map();
  for (const c of clusters) {
    const s = clusterSection.get(c);
    bySection.set(s, (bySection.get(s) ?? 0) + 1);
  }
  const section = [...bySection].sort(
    (a, b) => b[1] - a[1] || SECTION_ORDER.indexOf(a[0]) - SECTION_ORDER.indexOf(b[0]),
  )[0][0];

  return { fc, lessons: clusters.length, weight, section, mix: bySection };
});

console.log(`lessons: ${manifest.curriculum.lessons.length} (${untagged} carry no FC tag)`);
console.log('fc    lessons  section  weight  section mix');
for (const r of rows) {
  console.log(
    `  ${r.fc.padEnd(4)} ${String(r.lessons).padStart(5)}   ${r.section.padEnd(6)}  ${r.weight.toFixed(3)}   ` +
      [...r.mix].map(([s, n]) => `${s}:${n}`).join(' '),
  );
}

const body = rows
  .map(
    (r) =>
      `  ${r.fc}: { lessons: ${r.lessons}, section: '${r.section}', unlockWeight: ${Number(r.weight.toFixed(4))} },`,
  )
  .join('\n');

writeFileSync(
  OUT,
  `// GENERATED by scripts/generate-fc-axis.mjs — do not edit by hand.
//
// Per-Foundational-Concept leverage weight and section, aggregated from the
// ${manifest.curriculum.lessons.length} V3 lessons (${untagged} of which carry no FC tag and so contribute to
// nothing here). \`unlockWeight\` is the mean of the constituent lessons' cluster
// UNLOCK_WEIGHT, so an FC with many lessons is not mechanically higher-leverage
// than one with few; \`section\` is their plurality section. See the script header
// for the rules that were rejected and why.
//
// The weights are far flatter than the cluster table they come from (range
// ${Math.min(...rows.map((r) => r.weight)).toFixed(2)}–${Math.max(...rows.map((r) => r.weight)).toFixed(2)} against 0.15–1.00): the FCs are a content axis, and no FC-tagged
// lesson belongs to the reasoning clusters (R1–R3) or CARS (CA1–CA2) that carry
// the high cluster weights. Five of the ten therefore tie exactly. Treat the FC
// axis as testing a different *partition*, not a different leverage ranking.
import type { Section } from '@mcat/contracts';

export interface FcAxisEntry {
  /** Lessons tagged with this FC. Multi-FC lessons are counted in each. */
  readonly lessons: number;
  readonly section: Section;
  readonly unlockWeight: number;
}

export const FC_AXIS_DATA: Readonly<Record<string, FcAxisEntry>> = {
${body}
};
`,
  'utf8',
);
console.log(`\nwrote ${OUT}`);
