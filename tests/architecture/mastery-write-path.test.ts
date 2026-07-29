import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BKT_OBSERVATION_SOURCES } from '../../packages/contracts/src/events';

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

const INTEGRATION_SUITE_PATH = 'tests/architecture/lesson-mastery-integration.test.ts';
const integrationSuite = readFileSync(join(root, INTEGRATION_SUITE_PATH), 'utf8');

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

/** The extent of one member: its declaration through to the next one's. */
function rangeOf(name: string): { start: number; end: number } {
  const index = members.findIndex((member) => member.name === name);
  if (index === -1) return { start: -1, end: -1 };
  return { start: members[index]!.start, end: members[index + 1]?.start ?? source.length };
}

/** The source of one member. */
function bodyOf(name: string): string {
  const { start, end } = rangeOf(name);
  return start === -1 ? '' : source.slice(start, end);
}

/**
 * Where the Authority class begins.
 *
 * `memberAt` is not usable for the assertions that scan for a token appearing
 * anywhere in the file, because `MEMBER_DECLARATION` also matches a few
 * two-space-indented lines inside file-scope arrow functions (`if (`,
 * `instant(`, `switch (`). Harmless for the caller scans, which look for
 * symbols only the class mentions; not harmless for a token that legitimately
 * appears at file scope too, so those assertions work in byte ranges instead.
 */
const CLASS_START = source.indexOf('export class Authority {');

/**
 * Whether a byte offset falls in a comment. Prose names these symbols — the
 * `boundDecayClock` docblock cites the skew tolerance — and a scan that counted
 * that would be asserting against a comment, which is the failure this whole
 * file exists to catch.
 */
function inComment(offset: number): boolean {
  const before = source.slice(source.lastIndexOf('\n', offset) + 1, offset);
  return /^\s*\*/.test(before) || before.includes('//');
}

/** Byte offsets of every match in the class body, comments excluded. */
function offsetsInClass(pattern: RegExp): number[] {
  return [...source.matchAll(pattern)]
    .map((match) => match.index!)
    .filter((offset) => offset > CLASS_START && !inComment(offset));
}

/** The grain map as it is spelled at a write site: property or bracket-string. */
const CAPABILITY_MAP = String.raw`(?:\.(?:kc|skill)\b|\[\s*['"](?:kc|skill)['"]\s*\])`;
const LESSON_MAP = String.raw`(?:\.lesson\b|\[\s*['"]lesson['"]\s*\])`;

/**
 * Every shape that STORES into a grain map, given a pattern naming the map.
 *
 * Shared by the capability scan and the lesson scan below, because they are one
 * question asked of two maps and keeping two hand-maintained copies is how they
 * came to differ: the lesson list grew whole-map replacement and the capability
 * list did not, so `m.kc = { ...m.kc, [id]: next }` passed the whole suite.
 *
 * The `!?` is load-bearing rather than defensive. On an OPTIONAL map — which
 * `MasteryEngineState.lesson` is, and which this file's own "keeps the legacy
 * field optional" assertion requires it to stay — the bare `m.lesson[id] = s`
 * that this pattern used to demand is TS18048 and cannot compile. The scan was
 * therefore matching only code no one could land, while `m.lesson![id] = s`,
 * the spelling a writer is forced into, went straight through.
 */
function writeSpellings(map: string): readonly string[] {
  return [
    // Indexed write, reached directly or through a non-null assertion.
    `${map}\\s*!?\\s*\\[[^\\]]*\\]\\s*(?:\\?\\?|\\|\\|)?=[^=]`,
    // Whole-map replacement: `m.kc = { ...m.kc, [id]: next }`. Stores exactly the
    // same competing grain without ever indexing the map, and it is how a
    // restored seeding loop gets written.
    `${map}\\s*(?:\\?\\?|\\|\\|)?=\\s*(?:[{[]|Object\\.)`,
    // Mutation through the standard library, which indexes nothing either. The
    // receiver may not cross a paren or comma, so a nested call is not a match.
    `Object\\.(?:assign|defineProperty)\\(\\s*[^,()]*${map}\\s*!?\\s*,`,
  ];
}

/**
 * A write to a capability grain map, in any spelling that reaches one.
 *
 * Deliberately loose in three directions the first version was tight in, each
 * of which is a bypass a reader would write without meaning to evade anything:
 * the receiver is not required to be named `m` (an extracted helper takes
 * `mastery` or `engine`), the map may be reached by bracket-string, and the
 * assignment operator may be compound — `??=` is the natural spelling of a
 * create-only write and assigns exactly as hard as `=`.
 *
 * Alias evasion (`const kc = m.kc; kc[id] = ...`) is NOT chased here. It is
 * covered from the other side instead, by the engine-symbol reachability
 * assertions below: a reimplementation still has to call the engine. The lesson
 * scan cannot lean on that — a lesson grain needs no engine symbol to store —
 * so it chases the alias itself.
 */
const GRAIN_WRITE = new RegExp(writeSpellings(CAPABILITY_MAP)[0]!, 'g');

/** The same write, with the assigned expression captured. */
const GRAIN_WRITE_RHS =
  /(?:\.(?:kc|skill)|\[\s*['"](?:kc|skill)['"]\s*\])\s*\[[^\]]*\]\s*(?:\?\?|\|\|)?=\s*([^;]+);/g;

/**
 * The BKT engine, by every symbol that moves `pL`.
 *
 * Mirrors `BKT_APPLY_PATH_SYMBOLS` in `lesson-mastery-integration.test.ts`,
 * which owns the repo-wide question of which FILES may call them; the mirror is
 * asserted below rather than trusted, because two lists of one fact that are
 * only kept in step by hand are one edit away from disagreeing.
 */
const BKT_ENGINE_SYMBOLS = [
  'applyMasteryAttempt',
  'bktUpdate',
  'stepMemory',
  'reinforcePrerequisite',
] as const;

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

  it('never reaches the finer-grained engine symbols at all', () => {
    // `applyMasteryAttempt` is the composition. Calling what it composes —
    // `stepMemory`, `bktUpdate`, `reinforcePrerequisite` — moves pL just as
    // effectively while leaving the one permitted caller above untouched, so
    // banning them outright is what makes that assertion mean anything.
    for (const symbol of BKT_ENGINE_SYMBOLS.filter((s) => s !== 'applyMasteryAttempt')) {
      expect(
        callersOf(symbol),
        `${AUTHORITY_PATH} calls ${symbol}. The Authority composes BKT through ` +
          'applyMasteryAttempt only; reaching inside it reimplements the step without the ' +
          'bounded decay clock or the prerequisite fan-out.',
      ).toEqual([]);
    }
  });

  it('imports exactly one engine symbol from @mcat/policies', () => {
    // The caller scan above is name-based, so `import { stepMemory as step }`
    // would defeat it. This closes that from the import side, where the
    // original name is still written down.
    const block = /import\s*\{([\s\S]*?)\}\s*from\s*'@mcat\/policies';/.exec(source);
    expect(
      block,
      `${AUTHORITY_PATH} no longer has a braced @mcat/policies import to scan.`,
    ).not.toBe(null);
    const imported = new Set(
      block![1]!
        .split(',')
        .map((entry) =>
          entry
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0]!
            .trim(),
        )
        .filter((name) => name.length > 0),
    );
    expect(imported.size).toBeGreaterThan(10);
    expect(
      BKT_ENGINE_SYMBOLS.filter((symbol) => imported.has(symbol)),
      'The Authority imports a BKT engine symbol other than applyMasteryAttempt. Even ' +
        'unused, it is the import a bypass reaches for, and an aliased one is invisible to ' +
        'the caller scan.',
    ).toEqual(['applyMasteryAttempt']);
  });

  /**
   * The decay-clock invariant is "bounded both directions": CLAMPED below the
   * tolerance, REFUSED above it. Only the clamp lived inside the door. The
   * refusal lived in `applyQualifiedBktObservation`, so practice and the study
   * path were safe purely because their reported time happened to be
   * server-generated — and a fourth path accepting a client time would have
   * routed correctly, silently clamped a year-2999 claim to `serverNow`, and
   * passed every other assertion in this file.
   *
   * Both halves are now inside the step, and these two assertions are what keeps
   * them there.
   */
  it('refuses a future claim inside the door, not in front of it', () => {
    const step = rangeOf('stepDirectGrains');
    const uses = offsetsInClass(/BKT_OBSERVATION_FUTURE_SKEW_TOLERANCE_MS/g);
    expect(uses.length).toBeGreaterThan(0);
    expect(
      uses.filter((offset) => offset < step.start || offset >= step.end).map(memberAt),
      'The future-skew tolerance is read outside stepDirectGrains. A pre-check in one ' +
        'caller leaves every other write path safe only by contingency — which is exactly ' +
        'what moving the clamp into the step was meant to end.',
    ).toEqual([]);
    expect(bodyOf('stepDirectGrains')).toContain('OBSERVATION_TIMESTAMP_IN_FUTURE');
  });

  it('lets only the lesson path hand the door a caller-reported time', () => {
    // `reportedAt` is a discriminated input, so a path that accepts a client
    // time has to say so to compile. Naming it is what applies the refusal;
    // this asserts which paths have named it.
    const lesson = rangeOf('applyQualifiedBktObservation');
    const callerTimes = offsetsInClass(/origin: 'caller'/g);
    expect(callerTimes.length).toBe(1);
    expect(
      callerTimes.filter((offset) => offset < lesson.start || offset >= lesson.end).map(memberAt),
      'A write path other than applyQualifiedBktObservation accepts a caller-reported ' +
        'time. That is allowed — the step refuses an implausible one — but it is a change ' +
        'of trust boundary and must be a deliberate edit here.',
    ).toEqual([]);
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
    // The assignment itself, so this covers a bypass that reimplements the
    // engine rather than calling it.
    const writes = [...source.matchAll(GRAIN_WRITE)].map((match) => memberAt(match.index!));
    expect(writes.length).toBeGreaterThan(2);
    expect(new Set(writes)).toEqual(new Set(['stepDirectGrains', 'applyMasterySeed']));
  });

  /**
   * The seed is the one grain writer that is not the step, and it is sound only
   * because of two properties nothing asserted: it writes `initialMemoryState(`,
   * which carries `lastPracticedAt: null` and therefore no decay clock to bound,
   * and it writes create-only, so it can never overwrite evidence. Change either
   * and the allowlist entry above silently becomes a second write path.
   */
  it('seeds only fresh, clockless grains, and only where none exists', () => {
    const body = bodyOf('applyMasterySeed');
    expect(body.length).toBeGreaterThan(200);

    const writes = [...body.matchAll(GRAIN_WRITE_RHS)];
    expect(writes.length).toBe(2);
    for (const write of writes) {
      expect(
        write[1]!.trim(),
        'applyMasterySeed assigns something other than initialMemoryState(...). Any other ' +
          'value can carry a lastPracticedAt, which is a decay clock written outside ' +
          'stepDirectGrains.',
      ).toMatch(/^initialMemoryState\(/);
    }

    const createOnly = body.match(/if \(!m\.(?:kc|skill)\[[^\]]*\]\)|\?\?=/g) ?? [];
    expect(
      createOnly.length,
      'A seed write is no longer gated on the grain being absent. A seed that overwrites ' +
        'a practiced grain replaces real evidence with a diagnostic prior.',
    ).toBe(writes.length);

    expect(
      body,
      'applyMasterySeed reads a clock. A seed has no occurrence time; it initializes a ' +
        'prior, and a timestamp on it is a decay baseline written outside the step.',
    ).not.toMatch(/this\.clock|lastPracticedAt/);
  });

  it('routes every mastery write through the shared step', () => {
    // `toContain` asserted only the path most recently fixed. Both other
    // callers survived a mutation replacing their `stepDirectGrains` call with
    // a bypass, in a file whose headline is "exactly one door".
    expect(
      new Set(callersOf('stepDirectGrains')),
      'A mastery write path no longer routes through stepDirectGrains, or a new one has ' +
        'appeared. Every path that moves P(L) goes through the single door; add it here ' +
        'only after it does.',
    ).toEqual(
      new Set(['updateMasteryForAttempt', 'applyQualifiedBktObservation', 'applyPracticeMastery']),
    );
  });

  /**
   * The ledger payload's cross-field guards are `superRefine`s, and `z.infer`
   * of a refined object drops them, so the compiler enforces none of them: a
   * record contradicting itself type-checks. They bite only where something
   * PARSES. That happens at exactly one call site, and this is what keeps it
   * there — deleting the parse breaks no test on its own, because nothing
   * contradicts itself today, which is precisely how it would go unnoticed.
   */
  it('parses the ledger record it appends, rather than merely typing it', () => {
    const body = bodyOf('recordBktObservationEvent');
    expect(body.length).toBeGreaterThan(200);
    expect(
      body,
      'recordBktObservationEvent no longer parses through BktObservationAppliedSchema. ' +
        'The payload guards are superRefines; without a parse they are documentation.',
    ).toMatch(/const event = BktObservationAppliedSchema\.parse\(\{/);
    expect(
      body,
      'The parsed record is not the one appended. Parsing and then recording the original ' +
        'literal makes the guard a no-op that looks live.',
    ).toMatch(/this\.recordEvent\(state, event\);/);
  });

  it('keeps one writer for the BKT audit ledger', () => {
    // A capability write with no ledger record leaves the clamp with no forensic
    // trail; that is how the practice path, and then the study path, came to
    // move P(L) with no record at all.
    expect(new Set(callersOf('recordBktObservationEvent'))).toEqual(
      new Set(['applyQualifiedBktObservation', 'applyPracticeMastery', 'updateMasteryForAttempt']),
    );
  });

  /**
   * `BKT_OBSERVATION_SOURCES` and the set of methods that may write the ledger
   * are two derivations of one fact — which surfaces reach the grains — so what
   * is worth asserting is that they AGREE. A source with no emitter is an
   * allowlist entry nothing can use; an emitter with no source cannot compile,
   * which is the direction that already holds.
   *
   * The scan reads the named constants rather than the emission sites, because
   * the source is now read TWICE per write path — once by the engine, to pick
   * how much the channel is believed, and once by the ledger, to record what
   * moved the grain. Counting emission sites would have expected three and
   * found six, and the obvious repair (loosen to a set) would have stopped
   * noticing a path that named one source for the engine and another for the
   * ledger. Naming each source exactly once makes that unrepresentable, and the
   * literal ban below is what keeps it that way.
   */
  it('names every declared observation source exactly once, and no other', () => {
    const declared = [...source.matchAll(/= '([a-z_]+)' as const satisfies BktObservationSource/g)];
    const named = declared.map((match) => match[1]!);
    expect(new Set(named)).toEqual(new Set(BKT_OBSERVATION_SOURCES));
    expect(named.length).toBe(BKT_OBSERVATION_SOURCES.length);
    expect(new Set(callersOf('recordBktObservationEvent')).size).toBe(
      BKT_OBSERVATION_SOURCES.length,
    );
  });

  it('never writes a bare source literal, so the engine and the ledger cannot diverge', () => {
    // A path that discounts as one source and audits as another is the exact
    // failure the shared constant exists to prevent, and both spellings would
    // be a valid BktObservationSource, so nothing else would notice.
    const literals = [...source.matchAll(/source: '([a-z_]+)'/g)].map((match) =>
      memberAt(match.index!),
    );
    expect(
      literals,
      'A write path names its observation source with a literal instead of the shared ' +
        'constant. The engine reads the source to decide how much to believe the ' +
        'observation and the ledger reads it to record what moved the grain; two literals ' +
        'let those disagree silently.',
    ).toEqual([]);
  });

  /**
   * This file's soundness DEFERS to the repo-wide allowlist next door: it asks
   * which method inside the Authority may call the engine, on the assumption
   * that only the Authority may call it at all. That assumption was recorded in
   * a comment, so widening the allowlist there would have left every assertion
   * here passing.
   */
  it('pins the repo-wide allowlist it defers to', () => {
    const allowlist = /const BKT_APPLY_PATH_ALLOWLIST = \[([\s\S]*?)\n\];/.exec(integrationSuite);
    expect(
      allowlist,
      `${INTEGRATION_SUITE_PATH} no longer declares BKT_APPLY_PATH_ALLOWLIST.`,
    ).not.toBe(null);
    const entries = allowlist![1]!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('//'));
    expect(
      entries,
      'The repo-wide BKT apply-path allowlist changed. A third permitted tree means a ' +
        'second component can move P(L), and every method-level assertion in this file ' +
        'would still pass.',
    ).toEqual([
      '/^packages\\/policies\\/src\\//,',
      '/^packages\\/authority-core\\/src\\/authority\\.ts$/,',
    ]);

    const symbols = /const BKT_APPLY_PATH_SYMBOLS = \[([\s\S]*?)\n\] as const;/.exec(
      integrationSuite,
    );
    expect(symbols).not.toBe(null);
    const mirrored = [...symbols![1]!.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]!);
    expect(
      new Set(mirrored),
      'The two files disagree about what the BKT engine IS. Keep BKT_ENGINE_SYMBOLS and ' +
        'BKT_APPLY_PATH_SYMBOLS in step, or one of them stops covering a symbol.',
    ).toEqual(new Set(BKT_ENGINE_SYMBOLS));
  });
});

// ---------------------------------------------------------------------------
// Lesson mastery is derived, never stored
// ---------------------------------------------------------------------------

/**
 * Trees that ship or run product code. `tests/` is the guard, not the subject.
 *
 * `scripts/` is in: `scripts/diagnostic-smoke.mjs` reasons about seed and
 * mastery shape against a live server, so a lesson grain reintroduced there is
 * the same defect in a file that runs.
 */
const PRODUCT_TREES = ['apps', 'database', 'infra', 'packages', 'scripts', 'services', 'tools'];
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

  /**
   * Every spelling that STORES a lesson-keyed grain. The two sites this replaces
   * were `applyMasterySeed` and `applyPracticeMastery`, both of which wrote
   * `m.lesson[id] = ...`, and matching only that literal shape is what made the
   * guard narrower than the claim above it.
   *
   * WHY THE FIELD IS STILL HERE TO GUARD. The stronger fix is to delete
   * `MasteryEngineState.lesson` outright — a field that cannot be written beats
   * a field guarded by a regex, and `e0aa670` already took that direction at the
   * Postgres layer by narrowing `MasteryGrain` to `'kc' | 'skill'`. It does not
   * carry here, because the field has a live consumer that the narrowing did
   * not: `dropLegacyLessonBkt` (`services/authority-kernel/src/views.ts:61`)
   * must keep DELETING `mastery.lesson` at runtime for as long as any
   * pre-seam projection exists on disk, and `delete` needs the property to be
   * declared. Removing the declaration does not remove the field from the data;
   * it only forces a cast at the one place that launders it — which is the
   * escape hatch a bypass would then reach for, in the file whose whole job is
   * to be the last reader. So the field stays declared, optional and unwritten,
   * and these patterns are what make "unwritten" true.
   */
  const LESSON_GRAIN_WRITES = writeSpellings(LESSON_MAP).map((spelling) => new RegExp(spelling));

  /**
   * The map bound to another name: `const g = m.lesson;`. Narrowing an optional
   * map is the ordinary way to write to it — `if (g) g[id] = s` compiles where
   * `m.lesson[id] = s` does not — so for this map the alias is not an evasion a
   * reader has to be trying for, it is the path of least resistance. The
   * capability scan can leave aliases to the engine-reachability assertions
   * because a capability bypass still has to call the engine; a lesson grain is
   * a plain `Record` write with no engine symbol in sight.
   */
  const LESSON_ALIAS_BINDING = new RegExp(
    String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*[^;=]*${LESSON_MAP}\s*!?\s*;`,
    'g',
  );

  function storesALessonGrain(text: string): boolean {
    if (LESSON_GRAIN_WRITES.some((pattern) => pattern.test(text))) return true;
    for (const binding of text.matchAll(LESSON_ALIAS_BINDING)) {
      // `$` is legal in an identifier and a metacharacter in a pattern.
      const alias = binding[1]!.replace(/\$/g, '\\$');
      const throughAlias = [
        new RegExp(`\\b${alias}\\s*\\[[^\\]]*\\]\\s*(?:\\?\\?|\\|\\|)?=[^=]`),
        new RegExp(`Object\\.(?:assign|defineProperty)\\(\\s*${alias}\\s*,`),
      ];
      if (throughAlias.some((pattern) => pattern.test(text))) return true;
    }
    return false;
  }

  /**
   * Every spelling that FALLS BACK to an empty lesson map.
   *
   * `?? {}` alone caught two of seven realistic forms. The one it most needed to
   * catch is `m.lesson ?? ({} as Record<string, MemoryState>)`: the field is
   * optional, so a TypeScript reader reaching for a typed empty map writes the
   * cast without a second thought, and the parenthesis defeated the old pattern.
   * Operator and emptiness are therefore matched separately and loosely — `||`
   * is an equivalent nullish fallback here, and `Object.create(null)` is an
   * empty map by another name.
   *
   * Known limit, recorded rather than papered over: a named constant
   * (`m.lesson ?? EMPTY_LESSON_MAP`) is not caught. Nothing textual can catch it
   * without banning the operator outright.
   */
  const EMPTY_LESSON_FALLBACKS = [
    /\.lesson\s*(?:\?\?=?|\|\|=?)\s*\(?\s*(?:\{\s*\}|Object\.create\()/,
    /\{[^{}]*\blesson\s*=\s*\{\s*\}/,
  ];

  /**
   * Anti-vacuity, and the only thing standing between a later narrowing and a
   * scan that silently matches nothing. Every entry is a spelling that compiles
   * against the real, OPTIONAL field — which is exactly what the previous
   * version of this scan could not say, since the one shape it matched was
   * TS18048.
   */
  it('recognizes every compilable spelling of a lesson-grain write', () => {
    const stores = [
      'm.lesson![id] = s;',
      'state.mastery.lesson![id] = s;',
      "m['lesson']![id] = s;",
      'm.lesson![id] ??= s;',
      'm.lesson = { ...m.lesson, [id]: s };',
      'm.lesson = Object.fromEntries(pairs);',
      'Object.assign(m.lesson!, { [id]: s });',
      'const g = m.lesson;\nif (g) g[id] = s;',
      'const g = state.mastery.lesson!;\nObject.assign(g, { [id]: s });',
    ];
    for (const store of stores) {
      expect(storesALessonGrain(store), `not recognized as a lesson-grain write: ${store}`).toBe(
        true,
      );
    }

    // ...and does not fire on reads, or on unrelated members that merely start
    // with the same letters, or on the rollup this file exists to protect.
    const innocent = [
      'const rollup = this.getLessonRollups(state);',
      'return Math.ceil(budgetMinutes / cfg.costs.lesson);',
      'if (m.lesson?.[id]) return m.lesson[id];',
      'view.lessonId = id;',
      'const lessons = byLesson[id] ?? [];',
    ];
    for (const read of innocent) {
      expect(storesALessonGrain(read), `false positive on: ${read}`).toBe(false);
    }
  });

  it('never assigns a lesson-keyed mastery grain', () => {
    const offenders = productionSources
      .filter((file) => storesALessonGrain(file.text))
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
      .filter((file) => EMPTY_LESSON_FALLBACKS.some((pattern) => pattern.test(file.text)))
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
