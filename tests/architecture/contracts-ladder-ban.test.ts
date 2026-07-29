import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as contracts from '../../packages/contracts/src/index';
import { EVIDENCE_QUALITY_TIERS } from '../../packages/domain/src/mastery';

/**
 * No evidence ladder in `@mcat/contracts`, anywhere in the package.
 *
 * The ordinal evidence ladder is a WARRANT rank — how independent, diverse and
 * fresh the supporting evidence is. Capability is BKT's `pL` / `mastered` / the
 * 0.95 cut and nothing else. The tier is legitimate behind the private
 * `Authority.skillWarrants`, where the planner may compare ranks; it is
 * illegitimate on the contract surface, because a published ordinal is read as
 * attainment by the next consumer to arrive, and then two systems are answering
 * "is this learner mastered?".
 *
 * WHY THIS FILE EXISTS AS A SEPARATE GUARD. `MasteryStateSchema`, the seven-step
 * ladder, sat exported from `contracts/src/vocab.ts` and re-exported from the
 * package index long after the badge that rendered it was deleted. Nothing
 * caught it, and the reason is structural rather than bad luck: the view scan in
 * `lesson-mastery-integration.test.ts` inspects `contracts/src/mastery.ts` and
 * `contracts/src/learner-views.ts` only, and classifies object schemas by their
 * FIELD names — so a bare `z.enum` in a third file is invisible to it twice
 * over. The symbol was reviewed at least once and kept on the reasoning that it
 * had no consumers. Consumer-free is not safe when the guards that would catch
 * the first consumer cannot see the file.
 *
 * So the unit of enforcement here is the PACKAGE, not a file list, and the two
 * checks below approach it from opposite directions:
 *
 * 1. the exported runtime surface, walked from the package index, so a ladder is
 *    caught wherever in the package it is declared; and
 * 2. the package's source text with comments stripped, so a module-private or
 *    type-only ladder — neither of which the runtime walk can see — is caught
 *    too.
 *
 * The banned member vocabulary is DERIVED from `EVIDENCE_QUALITY_TIERS` rather
 * than copied, so renaming a tier in domain moves this ban with it instead of
 * silently emptying it.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACTS_ROOT = 'packages/contracts';

/**
 * The ladder vocabulary: the live warrant tiers plus `exam_ready_now`, the
 * seventh step the deleted contracts copy carried and domain never had. A
 * reintroduction is far more likely to be a copy of the old seven-member list
 * than a fresh invention.
 */
const LADDER_MEMBERS: readonly string[] = [...EVIDENCE_QUALITY_TIERS, 'exam_ready_now'];

/**
 * How many distinct ladder members in one place make it a ladder rather than a
 * coincidence. Individual words are legitimately reused: `independent` is an
 * `EvidenceKind` and a `StudyPhase`, and `learning` is ordinary English. Three
 * distinct members together are not a coincidence — the highest any innocent
 * declaration in this package reaches today is one.
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

/**
 * EVERY source file in the package, tests included. A test is where a deleted
 * export is most cheaply resurrected as a fixture, and a fixture is a consumer.
 */
function contractsSources(): readonly SourceFile[] {
  const absolute: string[] = [];
  walk(join(root, CONTRACTS_ROOT), absolute);
  return absolute
    .map((file) => relative(root, file).split(sep).join(posix.sep))
    .sort()
    .map((path) => ({ path, code: stripComments(readFileSync(join(root, path), 'utf8')) }));
}

/** Distinct ladder members appearing as quoted string literals in `code`. */
function ladderMembersIn(code: string): readonly string[] {
  return LADDER_MEMBERS.filter((member) => new RegExp(`(['"])${member}\\1`).test(code));
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

const WHY = [
  'The evidence ladder is an ORDINAL WARRANT RANK. It ranks how good the supporting',
  'evidence is — independence, family diversity, transfer, delay, freshness — and it',
  'is not a capability scale. Capability is BKT alone: `pL`, decay, review-due, the',
  'learner-facing percentage and the 0.95 cut.',
  '',
  'A rank published on the contract surface gets read as attainment. That is exactly',
  'what happened to the ordinal `base` tier and to `masteryState` before it, and it',
  'ends with two systems answering "is this learner mastered?" and contradicting',
  'each other.',
  '',
  'The tier is legitimate ONLY behind the private `Authority.skillWarrants`, as',
  '`EVIDENCE_QUALITY_TIERS` in packages/domain. What crosses the wire is',
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
    const sources = contractsSources();
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

  it('declares no ladder in any file of the package, exported or not', () => {
    const offenders = contractsSources()
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
        'literals in one file, comments excluded. If a file trips this without holding a',
        'rank, the members are the problem — rename them, do not raise the quorum.',
      ].join('\n'),
    ).toEqual([]);
  });

  it('names no ladder symbol in the package, even an empty one', () => {
    const offenders: string[] = [];
    for (const file of contractsSources()) {
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
