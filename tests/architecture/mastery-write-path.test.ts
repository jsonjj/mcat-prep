import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The capability write path has exactly one door, asserted STRUCTURALLY.
 *
 * `Authority.stepDirectGrains` is the only place that may step a BKT grain,
 * because it is where `boundDecayClock` turns a caller-reported time into a
 * server-bounded, monotonic decay clock (docs/lesson-evidence-mastery-contract.md
 * §7.4, design invariants 2 and 3). Every property that matters about a mastery
 * write — the clamp, the prerequisite fan-out, the shared grain set — is a
 * property of that method rather than of the callers, so a caller that reaches
 * `applyMasteryAttempt` directly still SUCCEEDS. It just stops decaying, silently.
 * `applyPracticeMastery` did exactly that, and no test failed for it.
 *
 * These assertions are therefore about reachability, not behaviour: a future
 * bypass has to fail the build, because by construction it will not fail the
 * semantics. Two spellings of the bypass are covered — calling the engine
 * directly, and calling the clamp inline "to get the same effect", which
 * duplicates the invariant instead of enforcing it.
 *
 * Deliberately NOT duplicated here: `lesson-mastery-integration.test.ts` owns the
 * repo-wide allowlist of files permitted to import the BKT engine at all. This
 * file is the finer-grained question of which METHOD inside the Authority may
 * call it.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTHORITY_PATH = 'packages/authority-core/src/authority.ts';
const source = readFileSync(join(root, AUTHORITY_PATH), 'utf8');

/**
 * Class members, by the line that declares them: two-space indentation plus a
 * name followed by `(` or `<`. Bodies are indented further and doc comments
 * start with `/**` or `*`, so neither is mistaken for a declaration.
 *
 * Brace counting was the obvious alternative and is worse: a brace inside a
 * comment or a template literal desynchronizes the count silently, which is the
 * failure mode this whole file exists to avoid.
 */
const MEMBER_DECLARATION =
  /^ {2}(?:private |protected |public )?(?:static )?(?:async )?(?:get |set )?([A-Za-z_$][\w$]*)\s*[(<]/gm;

interface Member {
  readonly name: string;
  readonly start: number;
}

const members: readonly Member[] = [...source.matchAll(MEMBER_DECLARATION)].map((match) => ({
  name: match[1]!,
  start: match.index!,
}));

/** The member a byte offset falls inside: the last one declared at or before it. */
function memberAt(offset: number): string {
  let found = '<file scope>';
  for (const member of members) {
    if (member.start > offset) break;
    found = member.name;
  }
  return found;
}

/**
 * Which members call `name`, counted with multiplicity.
 *
 * The token requires an open paren so a mention in prose does not register — the
 * `boundDecayClock` docblock names `applyMasteryAttempt`, and a scan that
 * counted that would be asserting against a comment. The declaration site is
 * excluded by construction: a declaration is `name(` inside the member `name`.
 */
function callersOf(name: string): string[] {
  const callers: string[] = [];
  const call = new RegExp(`\\b${name}\\s*\\(`, 'g');
  for (const match of source.matchAll(call)) {
    const caller = memberAt(match.index!);
    if (caller === name) continue;
    callers.push(caller);
  }
  return callers;
}

/** Members named here must exist, or a rename has quietly emptied the scan. */
const ANCHOR_MEMBERS = [
  'stepDirectGrains',
  'boundDecayClock',
  'applyPracticeMastery',
  'applyQualifiedBktObservation',
  'applyMasterySeed',
  'updateMasteryForAttempt',
  'recordBktObservationEvent',
];

describe('the capability write path has exactly one door', () => {
  it('scans the Authority and resolves its members', () => {
    // Anti-vacuity for every assertion below: an empty member list would make
    // all of them pass while checking nothing.
    expect(source.length).toBeGreaterThan(50_000);
    expect(members.length).toBeGreaterThan(40);
    const names = new Set(members.map((member) => member.name));
    for (const anchor of ANCHOR_MEMBERS) {
      expect(
        names.has(anchor),
        `${AUTHORITY_PATH} no longer declares ${anchor}. If it was renamed, update ` +
          'ANCHOR_MEMBERS; do not delete the anchor.',
      ).toBe(true);
    }
  });

  it('reaches the BKT engine only from stepDirectGrains', () => {
    expect(
      callersOf('applyMasteryAttempt'),
      'applyMasteryAttempt must be unreachable except through stepDirectGrains, which is ' +
        'where boundDecayClock bounds the decay clock. A direct call writes P(L) ' +
        'successfully and silently stops decaying.',
    ).toEqual(['stepDirectGrains']);
  });

  it('bounds the decay clock only from stepDirectGrains', () => {
    // The tempting-but-wrong fix for a bypass is to call the clamp inline in the
    // bypassing method. That produces the right numbers today and a second
    // definition of the invariant forever.
    expect(
      callersOf('boundDecayClock'),
      'boundDecayClock must have exactly one caller. A second caller duplicates the ' +
        'invariant rather than enforcing it.',
    ).toEqual(['stepDirectGrains']);
  });

  it('writes a capability grain only from the step and the seed', () => {
    // `m.kc[...] =` / `m.skill[...] =` is the assignment itself, so this covers a
    // bypass that reimplements the engine rather than calling it.
    const writes = [...source.matchAll(/\bm\.(?:kc|skill)\[[^\]]*\]\s*=[^=]/g)].map((match) =>
      memberAt(match.index!),
    );
    expect(writes.length).toBeGreaterThan(2);
    expect(new Set(writes)).toEqual(new Set(['stepDirectGrains', 'applyMasterySeed']));
  });

  it('routes adaptive practice through the shared step', () => {
    expect(callersOf('stepDirectGrains')).toContain('applyPracticeMastery');
  });

  it('keeps one writer for the BKT audit ledger', () => {
    // A capability write with no ledger record leaves the clamp with no forensic
    // trail; two writers is how one path came to have no record at all.
    expect(new Set(callersOf('recordBktObservationEvent'))).toEqual(
      new Set(['applyQualifiedBktObservation', 'applyPracticeMastery']),
    );
  });
});

// ---------------------------------------------------------------------------
// Lesson mastery is derived, never stored
// ---------------------------------------------------------------------------

/** Trees that ship or run product code. `tests/` is the guard, not the subject. */
const PRODUCT_TREES = ['apps', 'database', 'infra', 'packages', 'services', 'tools'];
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.next',
  'cdk.out',
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

const productionSources: readonly { path: string; text: string }[] = PRODUCT_TREES.flatMap(
  (tree) => {
    const files: string[] = [];
    walk(join(root, tree), files);
    return files
      .filter((absolute) => !TEST_FILE.test(absolute))
      .map((absolute) => ({
        path: relative(root, absolute).split(sep).join('/'),
        text: readFileSync(absolute, 'utf8'),
      }));
  },
);

/**
 * Lesson mastery is a DERIVED ROLLUP over the lesson's required member KCs, never
 * a stored grain (docs/lesson-evidence-mastery-contract.md §8.2, §9). A stored
 * `mastery.lesson` competes with the rollup as a source of truth, with no arbiter
 * between them — so the type keeps the field only so pre-seam projections
 * deserialize, and the kernel drops it on read.
 *
 * That promise is written in a comment on `MasteryEngineState.lesson`, and a
 * documented guard is not a guard: four comments in this codebase asserted a
 * guard that did not exist. These assertions are the guard.
 */
describe('lesson mastery is derived, never stored', () => {
  const types = readFileSync(join(root, 'packages/authority-core/src/types.ts'), 'utf8');
  const kernelViews = readFileSync(join(root, 'services/authority-kernel/src/views.ts'), 'utf8');

  it('scans the product trees', () => {
    expect(productionSources.length).toBeGreaterThan(200);
    const scanned = new Set(productionSources.map((file) => file.path));
    expect(scanned.has(AUTHORITY_PATH)).toBe(true);
    expect(scanned.has('services/authority-kernel/src/views.ts')).toBe(true);
  });

  it('never assigns a lesson-keyed mastery grain', () => {
    // `m.lesson[id] = ...` in either spelling. The two sites this replaces were
    // `applyMasterySeed` and `applyPracticeMastery`.
    const offenders = productionSources
      .filter((file) =>
        /\b(?:m|mastery|state\.mastery)\??\.lesson\s*\[[^\]]*\]\s*=[^=]/.test(file.text),
      )
      .map((file) => file.path);
    expect(
      offenders,
      'A stored lesson grain competes with the rollup as a source of truth. Roll the ' +
        'lesson up from its required member KCs instead (Authority.getLessonRollups).',
    ).toEqual([]);
  });

  it('never falls back to an empty lesson map', () => {
    // THE most dangerous line available here: with the writes removed, `?? {}` is
    // permanently `{}`, so the planner's mastery signal becomes a constant, every
    // lesson looks identically un-mastered, and NOTHING goes red — it compiles,
    // and it passes both the authority suite and this suite's other assertions.
    const offenders = productionSources
      .filter((file) => /\.lesson\s*\?\?\s*\{\s*\}/.test(file.text))
      .map((file) => file.path);
    expect(
      offenders,
      'A `?? {}` fallback on the lesson-mastery path silently turns the mastery signal ' +
        'into a constant. There is no stored lesson grain to fall back FROM; read the rollup.',
    ).toEqual([]);
  });

  it('keeps the legacy field optional, deprecated and unwritten', () => {
    // If it ever became required, something would have to write it.
    const declaration = types.indexOf('lesson?: Record<string, MemoryState>;');
    expect(declaration).toBeGreaterThan(-1);
    const doc = types.slice(0, declaration);
    expect(doc.slice(doc.lastIndexOf('/**'))).toContain('@deprecated');
    expect(types).not.toMatch(/^\s*lesson: Record<string, MemoryState>;/m);
  });

  /**
   * The BEHAVIOUR is owned by `services/authority-kernel/src/kernel.test.ts`
   * ("loads a legacy projection but drops its per-lesson BKT chain"). What is
   * checked here is that the drop is still WIRED into the loader, because a guard
   * the caller no longer reaches is the failure mode this file exists to catch —
   * and both patterns are line-anchored, since a version that matched inside a
   * comment would pass against the mutation that comments the statement out.
   */
  it('still drops the legacy field on read, as the type comment promises', () => {
    expect(kernelViews).toMatch(/^\s*delete state\.mastery\.lesson;\s*$/m);
    expect(kernelViews).toMatch(/^\s*dropLegacyLessonBkt\(state\);\s*$/m);
    expect(types).toContain('learnerStateFromProjection');
  });
});
