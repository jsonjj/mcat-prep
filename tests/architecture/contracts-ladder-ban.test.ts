import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as contracts from '../../packages/contracts/src/index';
import { EVIDENCE_QUALITY_TIERS } from '../../packages/domain/src/mastery';

/**
 * No evidence ladder in any workspace unit under `packages/`, `apps/` or
 * `services/`, except the packages that legitimately own or consume the tier.
 *
 * The ordinal evidence ladder is a WARRANT rank — how independent, diverse and
 * fresh the supporting evidence is. Capability is BKT's `pL` / `mastered` / the
 * 0.95 cut and nothing else. The tier is legitimate behind the private
 * `Authority.skillWarrants`, where the planner may compare ranks; it is
 * illegitimate everywhere else, because a published ordinal is read as
 * attainment by the next consumer to arrive, and then two systems are answering
 * "is this learner mastered?".
 *
 * WHY THIS FILE STARTED, AND WHY IT WIDENED. `MasteryStateSchema`, the seven-step
 * ladder, sat exported from `contracts/src/vocab.ts` and re-exported from the
 * package index long after the badge that rendered it was deleted. Nothing
 * caught it, and the reason was structural rather than bad luck: the view scan
 * in `lesson-mastery-integration.test.ts` inspects `contracts/src/mastery.ts` and
 * `contracts/src/learner-views.ts` only, and no guard looked at `packages/contracts`
 * as a whole. This file was written to close that: it banned the ladder from the
 * entire `contracts` package, symbol and members alike.
 *
 * That ban was still too narrow. `packages/design-tokens/src/index.ts` carried
 * `stateColor`, a map keyed by all seven ladder members — the same dormant,
 * consumer-free shape as `MasteryStateSchema`, sitting one package over and
 * outside this file's reach, because it only ever walked `packages/contracts`.
 * Two instances of the identical failure in two different packages means the
 * blind spot is "any package nobody thought to check," not "contracts
 * specifically." So the unit of enforcement widened again: every package under
 * `packages/`, not just one, with an ALLOWLIST (not a denylist) of the packages
 * permitted to name the vocabulary. A new package gets no special exemption by
 * default — it has to be added here, deliberately, with a stated reason.
 *
 * AND IT WAS STILL TOO NARROW, for the third time, in the same shape. The walk
 * read `packages/` only, so the exact `stateColor` map — six tiers plus
 * `exam_ready_now` as bare object keys — was caught in `packages/ui-web` and
 * `packages/contracts` and passed the full suite in
 * `apps/learner-web/src/components/`. That is where `EvidenceAtlas.tsx`,
 * `BrainScene.tsx` and `MasteryRing` actually live, which is to say it is the
 * one place a rendered ladder rank would appear: the ban stopped at the
 * boundary of the tree the defect was heading for. The scan unit is now every
 * WORKSPACE unit under `packages/`, `apps/`, `services/` and
 * `services/lambdas/` — discovered by the presence of a `package.json`, so a
 * new app or lambda is banned the moment it exists.
 *
 * SCOPE LIMITS, measured rather than assumed. Two trees are deliberately out:
 *
 * - `tests/` is the guard, not the subject. It has to name the vocabulary to
 *   ban it, and every file here would be its own top offender.
 * - `tools/lesson-viewer` cannot pass this scan today and the reason is not a
 *   ladder. Five of its `src/lessons/*.tsx` files reach quorum on lesson PROSE
 *   rendered as JSX text — "a strong argument", "retained information",
 *   "the independent variable" — which is bare source text, not a string
 *   literal, so the member-detection sharpening below cannot see it is English.
 *   It is a dev-only viewer that ships nothing. Recorded here rather than
 *   allowlisted, because an allowlist entry would read as "this holds a ladder"
 *   and it does not; closing it needs JSX-text awareness, not an exemption.
 *
 * `infra/`, `database/` and `tools/*` beyond the viewer are also unscanned, and
 * that is a gap rather than a judgement — the database-layer ladder remnants are
 * already tracked as roadmap work in `key-docs/roadmap-todo.md`, and no
 * TypeScript scan reaches a CHECK constraint anyway.
 *
 * Two checks approach each in-scope package from opposite directions:
 *
 * 1. the exported runtime surface of `packages/contracts` specifically, walked
 *    from its package index (the one package whose export surface is a public
 *    contract worth importing and inspecting live); and
 * 2. every banned package's source text, comments stripped, scanned for the
 *    ladder vocabulary as either a quoted string OR a bare object/enum key —
 *    `not_assessed: cssVar(...)` is exactly how `stateColor` hid from a
 *    quoted-string-only scan, so member detection is no longer quote-sensitive.
 *
 * The banned member vocabulary is DERIVED from `EVIDENCE_QUALITY_TIERS` rather
 * than copied, so renaming a tier in domain moves this ban with it instead of
 * silently emptying it.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACTS_ROOT = 'packages/contracts';

/**
 * Trees whose workspace units are in scope, mirroring `pnpm-workspace.yaml`
 * minus the two recorded exclusions in the header. `services/lambdas` is listed
 * separately because it is a container rather than a unit — it holds no
 * `package.json` of its own, and a `services/*` walk alone would have missed
 * `learner-api`, which is the lambda that actually serves learner-facing views.
 */
const SCANNED_TREES: readonly string[] = [
  'packages',
  'apps',
  'services',
  'services/lambdas',
] as const;

/**
 * Units allowed to name the evidence-ladder vocabulary, and the evidence for
 * each. This is the allowlist; every other unit in `SCANNED_TREES` — present or
 * future — is banned by default. Keyed by full unit path rather than bare name
 * so that `services/authority-kernel` cannot inherit `authority-core`'s
 * exemption by looking a bit like it. Checked against the code, not assumed:
 *
 * - `domain` DECLARES the vocabulary: `EVIDENCE_QUALITY_TIERS`,
 *   `EvidenceQualityTier` and `evidenceQualityRank` all live in
 *   `packages/domain/src/mastery.ts`. There is nowhere else for the tier to be
 *   defined.
 * - `authority-core` READS `evidence.evidenceQuality` behind the private
 *   `Authority.skillWarrants` (`packages/authority-core/src/authority.ts`,
 *   e.g. `evidence.evidenceQuality !== 'not_assessed'`). Its own comments there
 *   say the ordinal is deliberately not projected onto the public surface —
 *   exactly the boundary this file exists to hold.
 * - `policies` COMPUTES the tier: `evaluateEvidence` in
 *   `packages/policies/src/mastery-policy.ts` assigns `evidenceQuality` from
 *   recipe-slot satisfaction and literally is the warrant policy. Banning the
 *   vocabulary here would ban the evidence system's own implementation.
 *
 * `packages/contracts` is deliberately NOT on this list — it is the public
 * contract surface the original ban protected, and it gets its own additional,
 * stricter checks below (banned on sight, not just at quorum).
 */
const ALLOWED_LADDER_UNITS: ReadonlySet<string> = new Set([
  'packages/domain',
  'packages/authority-core',
  'packages/policies',
]);

/**
 * The ladder vocabulary: the live warrant tiers plus `exam_ready_now`, the
 * seventh step the deleted contracts copy carried and domain never had. A
 * reintroduction is far more likely to be a copy of the old seven-member list
 * than a fresh invention. `stateColor` (packages/design-tokens) was exactly
 * this: the six live tiers plus `exam_ready_now`, nothing else.
 */
const LADDER_MEMBERS: readonly string[] = [...EVIDENCE_QUALITY_TIERS, 'exam_ready_now'];

/**
 * How many distinct ladder members in one place make it a ladder rather than a
 * coincidence. Individual words are legitimately reused: `independent` is an
 * `EvidenceKind` and a `StudyPhase`, and `learning` is ordinary English. Three
 * distinct members together are not a coincidence — the highest any innocent
 * declaration in any scanned unit outside the allowed ones reaches today is one,
 * and it is `independent` as a `StudyPhase` key in a lesson script.
 */
const LADDER_QUORUM = 3;

/**
 * Names that ARE the concept, banned in `packages/contracts` on sight so that a
 * hollow reintroduction — the symbol back first, its members later — still trips
 * this guard before it can grow a consumer.
 */
const BANNED_LADDER_IDENTIFIERS: readonly string[] = [
  'MasteryState',
  'MasteryTier',
  'MasteryLevelSchema',
  'EvidenceQualityTier',
  'EVIDENCE_QUALITY_TIERS',
  'evidenceQualityRank',
];

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.turbo',
  // Build output of the app trees, which came into scope with the widening.
  '.next',
  '.react-router',
  'cdk.out',
]);

const SOURCE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

interface SourceFile {
  /** Repo-relative, POSIX-separated, so failures read the same on every platform. */
  readonly path: string;
  /** File text with comments removed — see `stripComments`. */
  readonly code: string;
}

function walk(absolute: string, out: string[]): void {
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(child, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.test(entry.name)) out.push(child);
  }
}

/**
 * Comments are stripped before scanning so that documenting the ban — naming the
 * deleted symbol and the members it carried, which `vocab.ts` and this file both
 * do — is not itself a violation. The prose explaining why a rule exists must
 * never be the thing that breaks it.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** EVERY source file under `pkgRelPath` (a `packages/<name>` path), tests included. */
function packageSources(pkgRelPath: string): readonly SourceFile[] {
  const absolute: string[] = [];
  walk(join(root, pkgRelPath), absolute);
  return absolute
    .map((file) => relative(root, file).split(sep).join(posix.sep))
    .sort()
    .map((path) => ({ path, code: stripComments(readFileSync(join(root, path), 'utf8')) }));
}

/**
 * Every workspace unit in a scanned tree, by repo-relative path. Discovered from
 * the presence of a `package.json`, not hand-maintained, so a new package, app
 * or lambda is banned by default the moment it exists — it has to earn a place
 * in `ALLOWED_LADDER_UNITS` rather than being missed by an unmaintained list.
 */
function scanUnits(): readonly string[] {
  return SCANNED_TREES.flatMap((tree) => {
    const absolute = join(root, tree);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${tree}/${entry.name}`)
      .filter((unit) => existsSync(join(root, unit, 'package.json')));
  }).sort();
}

/** A string literal, single- or double-quoted or a template, escapes honoured. */
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/**
 * Distinct ladder members appearing in `code` as a DECLARATION of that member:
 * either a whole quoted string (`'not_assessed'`) or a bare identifier outside
 * every string literal (an object key like `not_assessed: cssVar(...)`, or a
 * bare enum/type reference).
 *
 * Both halves are load-bearing, for opposite reasons.
 *
 * The bare-identifier half is why `stateColor` is catchable at all: it keyed the
 * tiers as bare object keys, and the original quote-only scan was blind to
 * exactly that shape.
 *
 * The whole-string half is what let the ban leave `packages/`. Matching a member
 * anywhere a word boundary allows also matches it inside PROSE, and the app tree
 * is full of prose: `apps/learner-web/src/app-native/*.script.ts` carries
 * sentences like "a strong response to the novel event" and "three distinct
 * learning relations", which reached quorum on English alone. Requiring the
 * literal to BE the member drops that without dropping anything a declaration
 * needs — a tier is never declared as one word inside a sentence. Measured, not
 * assumed: with this narrowing every file that genuinely holds the vocabulary
 * still reports 4-6 members, while the two prose files fall to one.
 *
 * Known limit, recorded rather than papered over: JSX text is bare source, not a
 * string literal, so prose rendered as markup still counts. That is the whole of
 * why `tools/lesson-viewer` is out of scope — see the header.
 */
function ladderMembersIn(code: string): readonly string[] {
  const wholeLiterals = new Set(
    [...code.matchAll(STRING_LITERAL)].map((match) => match[0].slice(1, -1).trim()),
  );
  const outsideLiterals = code.replace(STRING_LITERAL, ' ');
  return LADDER_MEMBERS.filter(
    (member) => wholeLiterals.has(member) || new RegExp(`\\b${member}\\b`).test(outsideLiterals),
  );
}

/** Every exported value that behaves like a Zod enum, with the members it accepts. */
function exportedEnumOptions(): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const [name, value] of Object.entries(contracts as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const options = (value as { options?: unknown }).options;
    if (!Array.isArray(options)) continue;
    if (!options.every((option) => typeof option === 'string')) continue;
    found.set(name, options as readonly string[]);
  }
  return found;
}

/** Every exported array or readonly tuple of strings — a ladder need not be a Zod enum. */
function exportedStringLists(): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const [name, value] of Object.entries(contracts as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    if (!value.every((entry) => typeof entry === 'string')) continue;
    found.set(name, value as readonly string[]);
  }
  return found;
}

/** Ladder-quorum or banned-identifier offenders in one package, as report lines. */
function packageOffenders(pkgRelPath: string): readonly string[] {
  const offenders: string[] = [];
  for (const file of packageSources(pkgRelPath)) {
    const hits = ladderMembersIn(file.code);
    if (hits.length >= LADDER_QUORUM) offenders.push(`${file.path} (${hits.join(', ')})`);
    for (const identifier of BANNED_LADDER_IDENTIFIERS) {
      if (new RegExp(`\\b${identifier}\\b`).test(file.code)) {
        offenders.push(`${file.path} (names ${identifier})`);
      }
    }
  }
  return offenders;
}

const WHY = [
  'The evidence ladder is an ORDINAL WARRANT RANK. It ranks how good the supporting',
  'evidence is — independence, family diversity, transfer, delay, freshness — and it',
  'is not a capability scale. Capability is BKT alone: `pL`, decay, review-due, the',
  'learner-facing percentage and the 0.95 cut.',
  '',
  'A rank published outside its owner gets read as attainment. That is exactly what',
  'happened to the ordinal `base` tier and to `masteryState` before it, and it ends',
  'with two systems answering "is this learner mastered?" and contradicting each',
  'other.',
  '',
  'The tier is legitimate ONLY in `packages/domain` (where it is defined),',
  '`packages/authority-core` (behind the private `Authority.skillWarrants`) and',
  '`packages/policies` (which computes it). What crosses those boundaries is',
  '`EVIDENCE_REASON_CODES` — named, unordered facts about the warrant — and the BKT',
  'capability estimate. Publish those, not a rank.',
].join('\n');

describe('no evidence ladder anywhere in @mcat/contracts', () => {
  it('reads a real package and a real ladder vocabulary, so the bans below mean something', () => {
    // Every assertion here is a "nothing matched" shape, so all of them pass
    // vacuously if the walk finds no files, the index exports nothing, or the
    // ladder vocabulary comes back empty. This is the calibration that stops the
    // guard from silently becoming a no-op — the failure mode that let the
    // previous ladder survive a review.
    const sources = packageSources(CONTRACTS_ROOT);
    expect(sources.length, `no source files found under ${CONTRACTS_ROOT}`).toBeGreaterThan(10);
    expect(sources.map((file) => file.path)).toContain(`${CONTRACTS_ROOT}/src/vocab.ts`);
    expect(sources.map((file) => file.path)).toContain(`${CONTRACTS_ROOT}/src/index.ts`);

    expect(LADDER_MEMBERS.length, 'the ladder vocabulary is empty').toBeGreaterThanOrEqual(6);
    expect(LADDER_MEMBERS.length).toBeGreaterThan(LADDER_QUORUM);
    expect(new Set(LADDER_MEMBERS).size).toBe(LADDER_MEMBERS.length);

    expect(exportedEnumOptions().size, 'the package index exported no enums').toBeGreaterThan(5);

    // The scan can see a ladder when one is there: the real vocabulary, written
    // the way a z.enum writes it, reaches quorum.
    const specimen = LADDER_MEMBERS.map((member) => `'${member}'`).join(', ');
    expect(ladderMembersIn(specimen).length).toBe(LADDER_MEMBERS.length);
    // ...and comment stripping does not blind it to real code on the same line.
    expect(ladderMembersIn(stripComments(`${specimen} // '${LADDER_MEMBERS[0]}'`)).length).toBe(
      LADDER_MEMBERS.length,
    );
    // ...and bare object/enum keys are caught too, not only quoted strings — the
    // exact shape `stateColor` used to hide from the original, quote-only scan.
    const bareSpecimen = LADDER_MEMBERS.map((member) => `${member}: 1`).join(', ');
    expect(ladderMembersIn(bareSpecimen).length).toBe(LADDER_MEMBERS.length);
    // ...and the real `stateColor` shape, verbatim, since that is the instance
    // the widened walk exists to catch in a tree it could not previously see.
    const stateColor = `const stateColor = { ${LADDER_MEMBERS.map(
      (member) => `${member}: cssVar('--x')`,
    ).join(', ')} };`;
    expect(ladderMembersIn(stateColor).length).toBe(LADDER_MEMBERS.length);

    // ...and PROSE does not count, which is what lets the ban leave `packages/`.
    // A member is a declaration when the literal IS the member, not when the
    // word appears inside a sentence. These are real lines from
    // `apps/learner-web/src/app-native/*.script.ts`, the files that reached
    // quorum on English before this narrowing.
    const prose = [
      "'Three distinct learning relations with directional arrows',",
      "'A novel light then produces a strong response, but the tone is never presented again.',",
      "'The independent variable is what the comparison varies.',",
      "'Extinction is new learning that the CS no longer predicts the US.',",
    ].join('\n');
    expect(ladderMembersIn(prose), 'lesson prose is being read as a ladder declaration').toEqual(
      [],
    );
    // ...but a single legitimate reuse still counts, so the quorum is doing the
    // discriminating rather than the matcher silently dropping real members.
    expect(ladderMembersIn('const q = { independent: question() };')).toEqual(['independent']);
  });

  it('exports no enum whose members are the evidence ladder', () => {
    const offenders = [...exportedEnumOptions()]
      .map(([name, options]) => ({
        name,
        hits: ladderMembersIn(options.map((o) => `'${o}'`).join(' ')),
      }))
      .filter((candidate) => candidate.hits.length >= LADDER_QUORUM)
      .map((candidate) => `${candidate.name} (${candidate.hits.join(', ')})`);

    expect(
      offenders,
      ['The @mcat/contracts public surface exports an evidence-ladder enum.', '', WHY].join('\n'),
    ).toEqual([]);
  });

  it('exports no member list that is the evidence ladder', () => {
    const offenders = [...exportedStringLists()]
      .map(([name, entries]) => ({
        name,
        hits: ladderMembersIn(entries.map((e) => `'${e}'`).join(' ')),
      }))
      .filter((candidate) => candidate.hits.length >= LADDER_QUORUM)
      .map((candidate) => `${candidate.name} (${candidate.hits.join(', ')})`);

    expect(
      offenders,
      [
        'The @mcat/contracts public surface exports an evidence ladder as a plain member list.',
        'Dropping `z.enum` does not make an ordinal something else.',
        '',
        WHY,
      ].join('\n'),
    ).toEqual([]);
  });

  it('declares no ladder in any file of @mcat/contracts, exported or not', () => {
    const offenders = packageSources(CONTRACTS_ROOT)
      .map((file) => ({ path: file.path, hits: ladderMembersIn(file.code) }))
      .filter((file) => file.hits.length >= LADDER_QUORUM)
      .map((file) => `${file.path} (${file.hits.join(', ')})`);

    expect(
      offenders,
      [
        'A file in @mcat/contracts declares the evidence ladder.',
        '',
        'This check is deliberately not limited to exports. A module-private ladder, or a',
        'bare `type` union with no runtime value, is one `export` keyword away from the',
        'public surface and no other guard in the repo looks at this package as a whole.',
        '',
        WHY,
        '',
        `Detection: ${LADDER_QUORUM} or more of ${LADDER_MEMBERS.join('/')} as quoted string`,
        'literals or bare object/enum keys in one file, comments excluded. If a file trips',
        'this without holding a rank, the members are the problem — rename them, do not',
        'raise the quorum.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('names no ladder symbol in @mcat/contracts, even an empty one', () => {
    const offenders: string[] = [];
    for (const file of packageSources(CONTRACTS_ROOT)) {
      for (const identifier of BANNED_LADDER_IDENTIFIERS) {
        if (new RegExp(`\\b${identifier}\\b`).test(file.code)) {
          offenders.push(`${file.path} (${identifier})`);
        }
      }
    }

    expect(
      offenders,
      [
        'A file in @mcat/contracts names an evidence-ladder symbol.',
        '',
        'The member check above can be evaded by landing the symbol first and its members',
        'later — which is close to how the last one survived: an enum nobody read, waiting',
        'for a consumer. The name is banned on sight so there is nothing to grow into.',
        '',
        WHY,
      ].join('\n'),
    ).toEqual([]);
  });
});

describe('no evidence ladder hiding in a unit nobody thought to check', () => {
  it('the allowlist names only units that actually exist and actually use the vocabulary', () => {
    const units = scanUnits();
    expect(units.length, 'no workspace units discovered').toBeGreaterThan(15);

    // The widening is the point, so assert the trees are actually reached rather
    // than trusting the glob: a `services/*` walk alone would have missed the
    // lambdas, and the whole finding was a tree left out of the walk.
    for (const reached of [
      'packages/contracts',
      'apps/learner-web',
      'services/authority-kernel',
      'services/lambdas/learner-api',
    ]) {
      expect(units, `${reached} is not in the scan`).toContain(reached);
    }

    for (const allowed of ALLOWED_LADDER_UNITS) {
      expect(units, `${allowed} is allowlisted but does not exist`).toContain(allowed);
      const hits = packageSources(allowed).flatMap((file) =>
        ladderMembersIn(file.code).length > 0 ? [file.path] : [],
      );
      expect(
        hits.length,
        `${allowed} is allowlisted but names none of the ladder vocabulary — the ` +
          'allowlist should only contain units that actually need the exemption',
      ).toBeGreaterThan(0);
    }
    // `contracts` is handled by its own, stricter suite above (banned on sight,
    // not just at quorum) and must never also sit on the general allowlist.
    expect(ALLOWED_LADDER_UNITS.has(CONTRACTS_ROOT)).toBe(false);
  });

  it('no unit outside the allowlist declares the evidence ladder', () => {
    const offenders = scanUnits()
      .filter((unit) => !ALLOWED_LADDER_UNITS.has(unit))
      .flatMap((unit) => packageOffenders(unit));

    expect(
      offenders,
      [
        'A workspace unit outside the ladder allowlist declares the evidence ladder.',
        '',
        'This is the failure that shipped twice: `MasteryStateSchema` in',
        '`packages/contracts` (deleted) and `stateColor` in `packages/design-tokens`',
        '(deleted) were both the six-tier vocabulary plus `exam_ready_now`, dormant,',
        'zero consumers, one import away from a component rendering a rank as a color',
        'or a badge. A third unit is not a special case; it is what this check',
        'exists to catch, unconditionally, until the unit is deliberately added to',
        '`ALLOWED_LADDER_UNITS` above with a stated reason.',
        '',
        WHY,
        '',
        `Detection: ${LADDER_QUORUM} or more of ${LADDER_MEMBERS.join('/')} as quoted string`,
        'literals or bare object/enum keys in one file, or a banned ladder symbol name,',
        'comments excluded.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('even the allowed packages never resurrect `exam_ready_now`, the dead seventh rung', () => {
    // `exam_ready_now` is not a real tier — `EVIDENCE_QUALITY_TIERS` has six
    // members, and no allowed package's actual logic needs a seventh. It was
    // the deleted schema's addition and `stateColor`'s addition; a legitimate
    // holder of the real six tiers has no more reason to need it than a
    // banned one does.
    const offenders = [...ALLOWED_LADDER_UNITS].flatMap((unit) =>
      packageSources(unit)
        .filter((file) => new RegExp(`\\bexam_ready_now\\b`).test(file.code))
        .map((file) => file.path),
    );

    expect(
      offenders,
      'A package allowed to hold the evidence ladder names `exam_ready_now`, which is ' +
        'not one of the six real `EVIDENCE_QUALITY_TIERS` — it is the dead rung the ' +
        'deleted `MasteryStateSchema` and `stateColor` both carried.',
    ).toEqual([]);
  });
});
