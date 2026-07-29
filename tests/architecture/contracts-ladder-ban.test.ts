import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as contracts from '../../packages/contracts/src/index';
import { EVIDENCE_QUALITY_TIERS } from '../../packages/domain/src/mastery';

/**
 * No evidence ladder anywhere in `packages/*`, except the packages that
 * legitimately own or consume the warrant tier.
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
const PACKAGES_ROOT = 'packages';
const CONTRACTS_ROOT = 'packages/contracts';

/**
 * Packages allowed to name the evidence-ladder vocabulary, and the evidence for
 * each. This is the allowlist; everything else under `packages/` — present or
 * future — is banned by default. Checked against the code, not assumed:
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
const ALLOWED_LADDER_PACKAGES: ReadonlySet<string> = new Set([
  'domain',
  'authority-core',
  'policies',
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
 * declaration outside the allowed packages reaches today is one.
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
 * Every non-hidden directory directly under `packages/` that looks like a real
 * package (has a `package.json`). Discovered, not hand-maintained, so a new
 * package is banned by default the moment it exists — it has to earn a place in
 * `ALLOWED_LADDER_PACKAGES` rather than being missed by an unmaintained list.
 */
function allPackageNames(): readonly string[] {
  return readdirSync(join(root, PACKAGES_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        readFileSync(join(root, PACKAGES_ROOT, name, 'package.json'), 'utf8');
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Distinct ladder members appearing in `code`, as EITHER a quoted string
 * (`'not_assessed'`) OR a bare identifier (an object key like
 * `not_assessed: cssVar(...)`, or a bare enum/type reference). `stateColor` in
 * `packages/design-tokens` used bare object keys, not quoted strings, and a
 * quote-only scan is blind to exactly that shape — so this does not require
 * quotes, only a word boundary, which still leaves ordinary reuse of a single
 * member name (see `LADDER_QUORUM`) harmless.
 */
function ladderMembersIn(code: string): readonly string[] {
  return LADDER_MEMBERS.filter((member) => new RegExp(`\\b${member}\\b`).test(code));
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

describe('no evidence ladder hiding in a package nobody thought to check', () => {
  it('the allowlist names only packages that actually exist and actually use the vocabulary', () => {
    const names = allPackageNames();
    expect(names.length, 'no packages discovered under packages/').toBeGreaterThan(5);
    for (const allowed of ALLOWED_LADDER_PACKAGES) {
      expect(names, `${allowed} is allowlisted but packages/${allowed} does not exist`).toContain(
        allowed,
      );
      const hits = packageSources(`${PACKAGES_ROOT}/${allowed}`).flatMap((file) =>
        ladderMembersIn(file.code).length > 0 ? [file.path] : [],
      );
      expect(
        hits.length,
        `packages/${allowed} is allowlisted but names none of the ladder vocabulary — ` +
          'the allowlist should only contain packages that actually need the exemption',
      ).toBeGreaterThan(0);
    }
    // `contracts` is handled by its own, stricter suite above (banned on sight,
    // not just at quorum) and must never also sit on the general allowlist.
    expect(ALLOWED_LADDER_PACKAGES.has('contracts')).toBe(false);
  });

  it('no package outside the allowlist declares the evidence ladder', () => {
    const offenders = allPackageNames()
      .filter((name) => !ALLOWED_LADDER_PACKAGES.has(name))
      .flatMap((name) => packageOffenders(`${PACKAGES_ROOT}/${name}`));

    expect(
      offenders,
      [
        'A package outside the ladder allowlist declares the evidence ladder.',
        '',
        'This is the failure that shipped twice: `MasteryStateSchema` in',
        '`packages/contracts` (deleted) and `stateColor` in `packages/design-tokens`',
        '(deleted) were both the six-tier vocabulary plus `exam_ready_now`, dormant,',
        'zero consumers, one import away from a component rendering a rank as a color',
        'or a badge. A third package is not a special case; it is what this check',
        'exists to catch, unconditionally, until the package is deliberately added to',
        '`ALLOWED_LADDER_PACKAGES` above with a stated reason.',
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
    const offenders = [...ALLOWED_LADDER_PACKAGES].flatMap((name) =>
      packageSources(`${PACKAGES_ROOT}/${name}`)
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
