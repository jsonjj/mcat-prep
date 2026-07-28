/**
 * Counts the real question bank per bucket per DOK level, for each of the three
 * diagnostic axes, so the simulation harness can model a bank of the shape it
 * will actually draw from instead of a hand-written approximation.
 *
 * BUCKETING RULES — one per axis, and they deliberately differ:
 *
 *  - cluster-15: `question.cluster` verbatim. A true partition; every question
 *    lands in exactly one of the 15 skill clusters.
 *
 *  - fc-10: lesson -> `foundational_concepts` from the V3 manifest, resolved to
 *    the lesson's FIRST listed concept — the rule fc-lessons.generated.ts ships
 *    and production buckets by. A partition of the FC-tagged bank; questions in
 *    FC-untagged lessons are out of the axis's scope and counted nowhere, so the
 *    column sums to the in-scope total rather than to the whole bank.
 *
 *    It counted a multi-FC lesson's questions once per concept until 2026-07,
 *    which handed the simulation 1,998 items for an 1,811-item in-scope bank and
 *    let one underlying question be drawn through several buckets. Every fc-10
 *    sweep before that date drew from inventory that does not exist.
 *
 *  - fc-15: the composite. R1/R2/R3/CA1/CA2 are taken from `question.cluster`
 *    and shadow the FC mapping entirely; everything else goes to its lesson's
 *    first listed FC, exactly as fc-10 does. Its FC rows are therefore fc-10
 *    bucket-for-bucket, and it adds the five off-FC clusters to reach a
 *    partition of the whole bank. Manifest order is authored primary-first, and
 *    only 9 of 114 lessons are affected.
 *
 * DOK levels outside 1-3 are counted separately and reported rather than folded
 * into a neighbouring column; a nonzero count means the tuple shape here has
 * gone stale against the bank.
 *
 * Run: node scripts/generate-bank-profiles.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const QUESTIONS = 'content/question-bank/.local/db-pull/questions.json';
const MANIFEST = 'curriculum/v3/v3-lesson-authoring-manifest.json';
const VOCAB = 'packages/contracts/src/vocab.ts';
const OUT = 'packages/policies/src/data/bank-profiles.generated.ts';

const FCS = Array.from({ length: 10 }, (_, i) => `FC${i + 1}`);
/** Reasoning and CARS: no FC-tagged lesson reaches them, so they ride as-is into fc-15. */
const OFF_FC = ['R1', 'R2', 'R3', 'CA1', 'CA2'];
const DOK_LEVELS = [1, 2, 3];

const questions = JSON.parse(readFileSync(QUESTIONS, 'utf8'));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

// Canonical cluster order, so cluster-15 keys match SKILL_CLUSTERS.
const clusterSource = readFileSync(VOCAB, 'utf8').split('export const SkillClusterSchema')[1] ?? '';
const clusters = [...(clusterSource.split(']);')[0] ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
if (clusters.length !== 15) throw new Error(`expected 15 skill clusters, found ${clusters.length}`);

const lessonFcs = new Map(
  manifest.curriculum.lessons.map((l) => [l.lesson_id, l.foundational_concepts ?? []]),
);
for (const [lessonId, fcs] of lessonFcs) {
  for (const fc of fcs) {
    if (!FCS.includes(fc)) throw new Error(`lesson ${lessonId} carries unknown concept ${fc}`);
  }
}

const emptyProfile = (ids) => new Map(ids.map((id) => [id, DOK_LEVELS.map(() => 0)]));
const profiles = {
  'cluster-15': emptyProfile(clusters),
  'fc-10': emptyProfile(FCS),
  'fc-15': emptyProfile([...FCS, ...OFF_FC]),
};

const add = (axis, bucketId, dokIndex) => {
  const row = profiles[axis].get(bucketId);
  if (row === undefined) throw new Error(`${axis} has no bucket ${bucketId}`);
  row[dokIndex] += 1;
};

let badDok = 0;
let fcUntagged = 0;
let fcMulti = 0;
let fcTieBroken = 0;
const fc15Assignments = new Map();

for (const q of questions) {
  const dokIndex = DOK_LEVELS.indexOf(q.dok_level);
  if (dokIndex === -1) {
    badDok += 1;
    continue;
  }

  add('cluster-15', q.cluster, dokIndex);

  const fcs = lessonFcs.get(q.lesson_id);
  if (fcs === undefined)
    throw new Error(`question ${q.question_id} has unknown lesson ${q.lesson_id}`);
  if (fcs.length === 0) fcUntagged += 1;
  if (fcs.length > 1) fcMulti += 1;
  if (fcs[0] !== undefined) add('fc-10', fcs[0], dokIndex);

  const composite = OFF_FC.includes(q.cluster) ? q.cluster : fcs[0];
  if (composite === undefined) {
    fc15Assignments.set(q.question_id, 0);
    continue;
  }
  if (!OFF_FC.includes(q.cluster) && fcs.length > 1) fcTieBroken += 1;
  add('fc-15', composite, dokIndex);
  fc15Assignments.set(q.question_id, (fc15Assignments.get(q.question_id) ?? 0) + 1);
}

const fc15Unassigned = [...fc15Assignments.values()].filter((n) => n === 0).length;
const fc15Double = [...fc15Assignments.values()].filter((n) => n > 1).length;
if (fc15Assignments.size !== questions.length - badDok) {
  throw new Error('duplicate question_id in the bank; fc-15 coverage cannot be verified');
}

const total = (axis) => [...profiles[axis].values()].reduce((s, r) => s + r[0] + r[1] + r[2], 0);

// The two FC axes bucket a question by the same rule, so their FC rows must be
// the same table. A drift here means an fc-10 sweep is drawing from a bank the
// production form could never assemble.
for (const fc of FCS) {
  const ten = profiles['fc-10'].get(fc).join(',');
  const fifteen = profiles['fc-15'].get(fc).join(',');
  if (ten !== fifteen) {
    throw new Error(`fc-10 ${fc} is [${ten}] but fc-15 ${fc} is [${fifteen}]`);
  }
}
const inScope = questions.length - badDok - fcUntagged;
if (total('fc-10') !== inScope) {
  throw new Error(`fc-10 totals ${total('fc-10')} for ${inScope} in-scope questions`);
}

for (const axis of Object.keys(profiles)) {
  console.log(`\n${axis} — ${total(axis)} items`);
  console.log('  bucket   dok1   dok2   dok3   total');
  for (const [id, row] of profiles[axis]) {
    const sum = row[0] + row[1] + row[2];
    console.log(
      `  ${id.padEnd(7)}${row.map((n) => String(n).padStart(6)).join(' ')}  ${String(sum).padStart(6)}`,
    );
  }
}
console.log(
  `\nquestions ${questions.length}; dok out of 1-3: ${badDok}; ` +
    `fc-untagged ${fcUntagged}; multi-fc ${fcMulti} (fc-15 tie-broken ${fcTieBroken}); ` +
    `fc-15 unassigned ${fc15Unassigned}, double-assigned ${fc15Double}`,
);

const table = (axis) =>
  [...profiles[axis]].map(([id, row]) => `    ${id}: [${row.join(', ')}],`).join('\n');

const dokNote =
  badDok === 0
    ? 'Every question carries a DOK of 1, 2 or 3; none were skipped.'
    : `${badDok} question(s) carry a DOK outside 1-3 and are in NO column below — the\n// tuple shape has gone stale against the bank and needs widening.`;

writeFileSync(
  OUT,
  `// GENERATED by scripts/generate-bank-profiles.mjs — do not edit by hand.
//
// Per-bucket, per-DOK item counts of the real question bank (${questions.length} questions),
// for each of the three axes the diagnostic simulation sweeps. Each entry is
// [dok1, dok2, dok3]. ${dokNote}
//
// The three axes count the same bank differently, so their totals differ on
// purpose:
//
//  - cluster-15 (${total('cluster-15')}) is a partition of the whole bank, straight off
//    \`question.cluster\`. PS1 is present with all-zero counts: the cluster exists
//    in the vocabulary but no question has been authored against it yet.
//  - fc-10 (${total('fc-10')}) routes lesson -> foundational_concepts, resolved to the
//    lesson's first listed concept — the rule production buckets by. It IS a
//    partition of the ${inScope} in-scope questions; the other ${fcUntagged} sit in FC-untagged
//    lessons, which this axis cannot measure at all. ${fcMulti} questions sit in
//    multi-FC lessons and are counted once, not once per concept.
//  - fc-15 (${total('fc-15')}) is the composite and IS a partition of the whole bank:
//    ${fc15Unassigned} questions unassigned, ${fc15Double} double-assigned. R1/R2/R3/CA1/CA2 come from
//    \`question.cluster\` and take precedence over any FC tag; everything else
//    goes to its lesson's first listed FC, exactly as fc-10 does. Its FC rows
//    are fc-10 bucket-for-bucket, and the generator fails if they ever differ.
//
// See the script header for what the tie-break rejected and why.

/** Item counts at DOK 1, 2 and 3 respectively. */
export type BankDokCounts = readonly [number, number, number];

export type BankProfileAxisId = 'cluster-15' | 'fc-10' | 'fc-15';

export const BANK_PROFILES: Readonly<
  Record<BankProfileAxisId, Readonly<Record<string, BankDokCounts>>>
> = {
  'cluster-15': {
${table('cluster-15')}
  },
  'fc-10': {
${table('fc-10')}
  },
  'fc-15': {
${table('fc-15')}
  },
};
`,
  'utf8',
);
console.log(`\nwrote ${OUT}`);
