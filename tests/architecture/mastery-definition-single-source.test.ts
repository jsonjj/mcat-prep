import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * There is exactly ONE definition of `mastered`, and exactly one place the
 * capability cut is compared.
 *
 * "Mastered" is a CLAIM about a learner, and a claim needs both halves: the
 * capability estimate from BKT and the warrant from the evidence system. BKT
 * owns `P(L)`; the evidence system owns whether that estimate is warranted. A
 * `mastered` computed from `P(L)` alone is a second, more permissive answer to a
 * question that already had one — and because it is more permissive, it is
 * always the one the learner sees.
 *
 * THIS HAS RECURRED TWICE, WHICH IS WHY THE GUARD IS STRUCTURAL RATHER THAN
 * BEHAVIOURAL.
 *
 * 1. `669fbcf` gated the lesson rollup's `mastered` on an `independent`-tier
 *    warrant. `Authority.getMasterySkills` kept a parallel
 *    `mastered: pL >= MASTERY_THRESHOLD`, and that field fed the Progress rings,
 *    Home's glowing count and Wrapped. Probed live: `pL = 0.9622478606`,
 *    `mastered: true`, evidence count `0`. The most visible mastery claim in the
 *    product was the one that skipped the gate.
 * 2. The debug KC and reasoning-operation views carried the same bare
 *    comparison, so the local inspection endpoint contradicted the lesson
 *    rollup one field away.
 *
 * Neither failed a test, and neither could have: nothing asserted that the two
 * derivations AGREE, and asserting each one's output separately never does. The
 * fix in both cases was to delete the rival derivation rather than reconcile it
 * — the capability half is published under a name that says what it is
 * (`atCapabilityCut`) and the word `mastered` belongs to the composed claim.
 *
 * WHAT THIS FILE ASSERTS, and why each assertion exists rather than the obvious
 * simpler one:
 *
 * - The cut is COMPARED in one file. Banning the constant outright is wrong —
 *   the debug endpoint legitimately publishes it so a reader can interpret a
 *   `pL` — so what is banned is the comparison, which is the thing that makes a
 *   verdict.
 * - `mastered` is PRODUCED in one file, and every other site is a pass-through
 *   named here. A count would not do: two producers in one file look exactly
 *   like the member/view pair that legitimately exists in the definition.
 * - `mastered` is DECLARED only on types that publish the composed claim. This
 *   is the assertion that catches instance 1 coming back, because reintroducing
 *   `SkillMasteryView.mastered` is a declaration first and a producer second.
 *
 * The three tables below are self-rotting in both directions: an entry that
 * disappears fails just as loudly as one that appears, so a resolved exemption
 * cannot linger as cover for the next one.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Trees that ship or run product code. `tests/` is the guard, not the subject. */
const PRODUCT_TREES = ['apps', 'database', 'infra', 'packages', 'scripts', 'services', 'tools'];
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  'cdk.out',
  // Gitignored, local-only dev tooling (never committed or shipped), e.g. the
  // mastery-sim overlay under `apps/learner-web/.local`. Not product source.
  '.local',
]);
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function walk(absolute: string, out: string[]): void {
  if (!existsSync(absolute)) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(child, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.test(entry.name)) out.push(child);
  }
}

interface SourceFile {
  readonly path: string;
  readonly lines: readonly string[];
}

const productionSources: readonly SourceFile[] = PRODUCT_TREES.flatMap((tree) => {
  const files: string[] = [];
  walk(join(root, tree), files);
  return files
    .filter((absolute) => !TEST_FILE.test(absolute))
    .map((absolute) => ({
      path: relative(root, absolute).split(sep).join('/'),
      lines: readFileSync(absolute, 'utf8').split('\n'),
    }));
});

/**
 * Whether a line is comment or prose rather than code.
 *
 * Prose names these symbols on purpose — half this file's rationale is written
 * into the docblocks it protects — and a scan that counted a comment would be
 * asserting against documentation, which is the failure mode the repository has
 * already hit four times.
 */
const isComment = (line: string): boolean => /^\s*(?:\/\/|\/\*|\*)/.test(line);

/** Every non-comment line of production code, tagged with where it came from. */
const codeLines: readonly { path: string; line: string; number: number }[] =
  productionSources.flatMap((file) =>
    file.lines
      .map((line, index) => ({ path: file.path, line, number: index + 1 }))
      .filter(({ line }) => !isComment(line)),
  );

// ---------------------------------------------------------------------------
// 1. The capability cut is compared in exactly one place
// ---------------------------------------------------------------------------

/**
 * A comparison against the mastery threshold, in either operand order.
 *
 * Both spellings of the threshold are covered: the exported `MASTERY_THRESHOLD`
 * and the `masteryThreshold` field of a `BktConfig`, which is how a caller
 * reaches the same number through an injected config. `>= 0.95` written as a
 * bare literal is NOT caught, and cannot be textually — the anti-vacuity check
 * below is what keeps this scan honest instead.
 */
const CUT_COMPARISONS = [
  /(?:MASTERY_THRESHOLD|masteryThreshold)\s*(?:<=?|>=?|===|!==)/,
  /(?:<=?|>=?|===|!==)\s*[\w.?![\]]*(?:MASTERY_THRESHOLD|masteryThreshold)/,
];

/**
 * The one file allowed to compare the cut. `isAtCapabilityCut` lives here and
 * is the only comparison in the repository; every consumer calls it.
 */
const CUT_COMPARISON_FILE = 'packages/policies/src/bkt.ts';

describe('the capability cut is compared in exactly one place', () => {
  it('scans the product trees', () => {
    expect(productionSources.length).toBeGreaterThan(200);
    const scanned = new Set(productionSources.map((file) => file.path));
    expect(scanned.has(CUT_COMPARISON_FILE)).toBe(true);
    expect(scanned.has('packages/policies/src/lesson-rollup.ts')).toBe(true);
    expect(scanned.has('packages/authority-core/src/authority.ts')).toBe(true);
    expect(scanned.has('services/local-authority/src/debug-state.ts')).toBe(true);
    expect(codeLines.length).toBeGreaterThan(20_000);
  });

  it('finds the one comparison, so the scan is not vacuous', () => {
    // Without this, deleting `isAtCapabilityCut` entirely would make the
    // assertion below pass by finding nothing anywhere.
    const inTheOneFile = codeLines.filter(
      ({ path, line }) =>
        path === CUT_COMPARISON_FILE && CUT_COMPARISONS.some((pattern) => pattern.test(line)),
    );
    expect(
      inTheOneFile.length,
      `${CUT_COMPARISON_FILE} no longer compares the mastery threshold. If isAtCapabilityCut ` +
        'moved, point CUT_COMPARISON_FILE at its new home; do not delete this check.',
    ).toBeGreaterThan(0);
  });

  it('compares it nowhere else', () => {
    const offenders = codeLines
      .filter(({ path }) => path !== CUT_COMPARISON_FILE)
      .filter(({ line }) => CUT_COMPARISONS.some((pattern) => pattern.test(line)))
      .map(({ path, number, line }) => `${path}:${number} ${line.trim()}`);
    expect(
      offenders,
      'A capability verdict is being computed outside isAtCapabilityCut. That is how ' +
        '`mastered: pL >= MASTERY_THRESHOLD` came to exist twice, in parallel with the ' +
        'composed claim and disagreeing with it. Call isAtCapabilityCut(pL) instead; if the ' +
        'caller needs the CLAIM rather than the capability half, it needs a warrant too.',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. `mastered` is produced in exactly one place
// ---------------------------------------------------------------------------

/**
 * A site that assigns a value to something called `mastered`: an object-literal
 * property, a variable, or a JSX prop. `\b` after the name is what keeps
 * `masteredCount`, `masteredLessonIds` and `masteredLessonCount` out — all three
 * are legitimate local aggregates, and none of them publishes a claim.
 *
 * Type declarations (`mastered: boolean`, `mastered: z.boolean()`) match this
 * too and are filtered out below, because they are the subject of section 3.
 */
const MASTERED_ASSIGNMENT = /\bmastered\b\s*(?:\?)?\s*[:=]\s*(.*)$/g;
const TYPE_DECLARATION = /^(?:boolean|z\.boolean\(\))/;

/**
 * The assigned expression, to the end of the line, minus a trailing separator.
 *
 * Stopping at the first comma would have been simpler and wrong: it truncates
 * `isAtCapabilityCut(pL, cfg.bkt) && evidenceSufficient` to
 * `isAtCapabilityCut(pL`, which is exactly the half of the definition this file
 * has to be able to read.
 */
const assignedExpression = (raw: string): string => raw.trim().replace(/[,;]$/, '').trim();

const masteredProducers: readonly { path: string; rhs: string }[] = codeLines
  .flatMap(({ path, line }) =>
    [...line.matchAll(MASTERED_ASSIGNMENT)].map((match) => ({
      path,
      rhs: assignedExpression(match[1]!),
    })),
  )
  .filter(({ rhs }) => rhs.length > 0 && !TYPE_DECLARATION.test(rhs));

/** The only file permitted to COMPUTE the claim. */
const MASTERY_DEFINITION_FILE = 'packages/policies/src/lesson-rollup.ts';

/**
 * Every producer of `mastered` outside the definition, with the exact expression
 * it assigns. All of them must be pass-throughs of the definition's own value.
 *
 * Recorded as expressions rather than counted, because "is this a pass-through?"
 * is the whole question and no count can answer it: `mastered: view.mastered`
 * and `mastered: pL >= cut` are one line each.
 */
const EXPECTED_PASS_THROUGHS: readonly { path: string; rhs: string }[] = [
  // The planner snapshot: the rollup's claim for a candidate lesson. Delivery is
  // a separate field (`delivered`) after having been OR'd into this one.
  { path: 'packages/authority-core/src/authority.ts', rhs: 'masteredLessonIds.has(l.lessonId)' },
  // `getMasteryLessons` projecting the rollup view onto the wire.
  { path: 'packages/authority-core/src/authority.ts', rhs: 'view.mastered' },
  // The debug projection, which re-runs the same rollup rather than re-deciding.
  { path: 'services/local-authority/src/debug-state.ts', rhs: 'view.mastered' },
  { path: 'services/local-authority/src/debug-state.ts', rhs: 'member.mastered' },
  // Practice hub: reads `LessonMasteryView.mastered` to hide finished lessons.
  {
    path: 'apps/learner-web/src/screens/practice/PracticeHome.tsx',
    rhs: 'entry?.mastered ?? false',
  },
  // NOT a claim about a learner. `mastery-seed-value.ts` is an offline value
  // model that writes no mastery anywhere: this `mastered` is the SIMULATED
  // GROUND TRUTH of a two-state synthetic learner, the thing BKT's decision is
  // scored against. Recorded per-expression rather than by exempting the file,
  // so a real producer appearing there still fails.
  {
    path: 'packages/policies/src/mastery-seed-value.ts',
    rhs: 'rng() < 1 / (1 + Math.exp(-practice.latentSlope * (theta - practice.latentCut)))',
  },
  { path: 'packages/policies/src/mastery-seed-value.ts', rhs: 'true' },
];

const sortPairs = (pairs: readonly { path: string; rhs: string }[]) =>
  [...pairs].sort((a, b) => a.path.localeCompare(b.path) || a.rhs.localeCompare(b.rhs));

describe('`mastered` is produced in exactly one place', () => {
  it('computes the claim only in the rollup, and there only from both halves', () => {
    const definitions = masteredProducers.filter(({ path }) => path === MASTERY_DEFINITION_FILE);
    expect(
      definitions.map(({ rhs }) => rhs),
      `${MASTERY_DEFINITION_FILE} is the sole definition of mastered: one per member (the cut ` +
        'AND a sufficient warrant) and one per lesson (every member). If this changed, the ' +
        'claim itself changed and that is a contract edit, not a refactor.',
    ).toEqual([
      'isAtCapabilityCut(pL, cfg.bkt) && evidenceSufficient',
      'members.every((m) => m.mastered)',
    ]);
  });

  it('passes it through everywhere else, and nothing else', () => {
    const elsewhere = masteredProducers.filter(({ path }) => path !== MASTERY_DEFINITION_FILE);
    expect(
      sortPairs(elsewhere),
      'A production site produces `mastered` from something other than the rollup. Every ' +
        'entry here must be a plain read of a value the rollup computed; a comparison, a ' +
        'threshold, or an OR with a delivery fact is a SECOND definition of the claim, which ' +
        'is the defect this file exists to prevent. Add a genuinely new pass-through here ' +
        'deliberately, with the expression written out.',
    ).toEqual(sortPairs(EXPECTED_PASS_THROUGHS));
  });
});

// ---------------------------------------------------------------------------
// 3. `mastered` is declared only where the composed claim is published
// ---------------------------------------------------------------------------

/** A field or schema key typed as a boolean and named `mastered`. */
const MASTERED_DECLARATION = /\bmastered\b\s*(?:\?)?\s*:\s*(boolean|z\.boolean\(\))/;

const masteredDeclarations: readonly string[] = codeLines
  .filter(({ line }) => MASTERED_DECLARATION.test(line))
  .map(({ path }) => path);

/**
 * The types allowed to carry a field called `mastered`, with how many each
 * declares. Every one of them publishes the rollup's composed claim.
 *
 * `SkillMasteryView` is deliberately ABSENT and this table is where that is
 * enforced. It carried `mastered` as a bare `pL >= 0.95`, and the reason it is
 * not simply gated on a warrant instead is measured rather than assumed:
 * `EvidenceRecord.skillId` is a KC id and never a reasoning operation, so
 * `Authority.skillWarrants` yields no grain at that grain for any learner on any
 * path. Conjoining a warrant with no producer would make the claim the constant
 * `false`, which is not a gate. It publishes `atCapabilityCut` instead.
 */
const EXPECTED_DECLARATIONS: Readonly<Record<string, number>> = {
  // LessonKcMemberView.mastered and LessonRollupView.mastered.
  'packages/policies/src/lesson-rollup.ts': 2,
  // LessonMasteryView, the wire projection of the rollup.
  'packages/contracts/src/mastery.ts': 1,
  // The planner's candidate lesson, fed from LessonMasteryView.
  'packages/policies/src/todays-path.ts': 1,
  // DebugLessonMemberView and DebugLessonView, both from the same rollup.
  'services/local-authority/src/debug-state.ts': 2,
};

describe('`mastered` is declared only on types that publish the composed claim', () => {
  it('declares it exactly where the claim is published', () => {
    const counted: Record<string, number> = {};
    for (const path of masteredDeclarations) counted[path] = (counted[path] ?? 0) + 1;
    expect(
      counted,
      'A type gained or lost a `mastered` field. A NEW one is the defect: a view that holds ' +
        'P(L) but no evidence warrant cannot name a field `mastered` without claiming ' +
        'something it has not established — publish the capability half as `atCapabilityCut` ' +
        'instead. A MISSING one means a claim stopped being published and this table is now ' +
        'describing code that does not exist.',
    ).toEqual(EXPECTED_DECLARATIONS);
  });
});
