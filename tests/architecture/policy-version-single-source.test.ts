/**
 * A policy version is spelled in its manifest and nowhere else in production
 * code — and where a second spelling is unavoidable, it is at least true.
 *
 * `MASTERY_BKT_MANIFEST.version` sat at `provisional-v1` while `669fbcf`
 * changed what the engine did under that name, so every ledger record cited a
 * version that did not describe what ran. The citation is the whole value of
 * the record, and it is only worth something if it is true.
 *
 * The reason the lie was easy to miss is that the string had many copies —
 * eleven source comments named `mastery-bkt / provisional-v1` beside the
 * manifest, and six test fixtures wrote the pair out by hand. Bumping one copy
 * and not the others is the same defect in a new place, so the repair is not to
 * keep them in step but to leave one copy: the manifest states the version,
 * everything else names the policy by id, and `activePolicyVersions()` is the
 * only way a version reaches a record.
 *
 * WHY THIS FILE WAS REWRITTEN, WHICH IS THE PART WORTH READING. The first
 * version of this scan asked the manifest what version it publishes today and
 * then grepped production for that string. That catches a NEW copy appearing
 * and is blind to an OLD copy SURVIVING — and surviving is the direction the
 * drift actually took, on `authority.ts:1631` and on all twelve copies that
 * motivated writing the scan in the first place. It prevented the failure it
 * was written after, in the one direction that failure did not take: measured
 * green, 3/3, with `mastery-bkt / provisional-v1` sitting in production, and
 * red only when the same line was made to say `provisional-v2`.
 *
 * The repair is to stop scanning for a VALUE and start scanning for a SHAPE.
 * `citesTheVersionItsPolicyPublishes` reads every production line that names a
 * policy beside a version-shaped token and compares the token to what that
 * policy publishes now, so a copy left behind by a bump fails on the same run
 * as a copy added by one. It is also no longer specific to `mastery-bkt`: all
 * ten manifests are discovered from `ACTIVE_POLICY_MANIFESTS`, and each one's
 * declaring file is found by searching for its `policyId`, so a new policy is
 * covered the day it is added rather than the day someone remembers to list it.
 *
 * The stronger single-copy rule still applies to `mastery-bkt` alone, because
 * it is enforceable by value only for a version no other policy shares, and
 * eight of the ten publish `provisional-v1`. So: every policy must be in step,
 * and `mastery-bkt` must additionally have exactly one copy. The weaker rule is
 * the one that catches the drift; the stronger one is what stops the drift
 * becoming possible again.
 *
 * TEST FIXTURES ARE DELIBERATELY OUT OF SCOPE of the single-copy rule. A
 * fixture writes a `PolicyVersion` as test DATA, and forbidding a literal there
 * would ban writing down the value a test is about. They are covered by the
 * weaker but correct rule below instead: a fixture may not cite a version the
 * manifests do not publish, so a stale fixture fails without a fixture being
 * unable to name a version at all.
 *
 * ONE DELIBERATE EXCLUSION. Only `.ts`/`.tsx` under `packages/` and `services/`
 * is scanned. `database/migrations/0007_mastery.sql` describes the engine as of
 * that migration and is honest history, not a live second answer; a migration
 * is a record of what was, and holding it to the current manifest would be
 * asking history to change.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACTIVE_POLICY_MANIFESTS } from '../../packages/policies/src/index';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Source trees that ship behaviour. `apps/` and `infra/` name no policy. */
const SCANNED_ROOTS = ['packages', 'services'] as const;

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.turbo', 'generated']);

function typeScriptFilesUnder(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue;
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(path);
    }
  };
  walk(root);
  return found;
}

const PRODUCTION_FILES = SCANNED_ROOTS.flatMap((root) =>
  typeScriptFilesUnder(join(REPO_ROOT, root)),
).filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));

const TEST_FILES = SCANNED_ROOTS.flatMap((root) => typeScriptFilesUnder(join(REPO_ROOT, root)))
  .filter((path) => path.endsWith('.test.ts') || path.endsWith('.test.tsx'))
  .filter((path) => !path.includes(`${sep}tests${sep}architecture${sep}`));

/**
 * The shape every manifest version has today: a lowercase dotless slug ending
 * in `-v<n>`. `provisional-v1`, `provisional-v2`, `evidence-warrant-v2`.
 *
 * The shape is what makes the in-step rule possible at all — recognizing a
 * version without being told which one to look for is the whole difference
 * between catching a copy that arrived and catching a copy that stayed. It is
 * pinned below, so a manifest that adopts a different convention fails here
 * and forces this scan to be revisited rather than quietly narrowing it.
 */
const VERSION_TOKEN = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v\d+\b/g;

/** `provisional-v2` → `provisional`. The namespace, without the number. */
const stemOf = (version: string): string => version.replace(/-v\d+$/, '');

/**
 * The version namespaces the manifests actually use — `provisional` and
 * `evidence-warrant` today.
 *
 * Shape alone is too coarse: `packages/content/src/diagnostic/fixture-bank.data.ts`
 * opens with `(diagnostic-synthetic-v1)`, a content-corpus id on a line that
 * also says `diagnostic`, and reading that as a stale policy citation would be
 * wrong. Requiring the stem narrows the rule to the drift it is for, because a
 * copy left behind by a bump keeps the namespace and loses only the number.
 *
 * THE HONEST LIMIT: if every manifest abandoned a namespace at once, a copy
 * still spelling it would stop being recognized. That is a real hole and it is
 * left open deliberately — closing it means remembering retired namespaces
 * forever, and a scan that carries history is a second place for the version to
 * live. The convention pin below is what makes such a move loud.
 */
const PUBLISHED_STEMS = new Set(ACTIVE_POLICY_MANIFESTS.map((entry) => stemOf(entry.version)));

/** `policyId: 'x'` — how a manifest declares itself, and how we find its file. */
const declarationOf = (policyId: string): string => `policyId: '${policyId}'`;

/**
 * Where each policy's manifest lives, DISCOVERED rather than listed.
 *
 * A hardcoded map covers the policies whoever wrote it happened to think of;
 * this covers whatever `ACTIVE_POLICY_MANIFESTS` actually holds. A policy whose
 * declaration cannot be located, or that is declared twice, fails below rather
 * than silently exempting a file.
 */
const MANIFEST_FILES: ReadonlyMap<string, readonly string[]> = new Map(
  ACTIVE_POLICY_MANIFESTS.map((manifest) => [
    manifest.policyId,
    PRODUCTION_FILES.filter((path) =>
      readFileSync(path, 'utf8').includes(declarationOf(manifest.policyId)),
    ),
  ]),
);

interface Citation {
  readonly file: string;
  readonly line: number;
  readonly policyId: string;
  readonly cited: string;
  readonly published: string;
}

/**
 * Every production line that names a policy beside a token in a published
 * version namespace, outside that policy's own manifest file.
 *
 * Co-occurrence on one line is the whole test for "beside". It is deliberately
 * coarse: the spellings that rotted were prose comments (`mastery-bkt /
 * provisional-v1`), not structured data, and a rule that only understood one
 * punctuation choice would miss the next comment that picks another.
 */
function citations(): Citation[] {
  const found: Citation[] = [];
  for (const manifest of ACTIVE_POLICY_MANIFESTS) {
    const declaringFiles = new Set(MANIFEST_FILES.get(manifest.policyId) ?? []);
    const names = new RegExp(`(?<![\\w-])${manifest.policyId}(?![\\w-])`);
    for (const path of PRODUCTION_FILES) {
      if (declaringFiles.has(path)) continue;
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!names.test(line)) return;
        for (const [cited] of line.matchAll(VERSION_TOKEN)) {
          if (!PUBLISHED_STEMS.has(stemOf(cited))) continue;
          found.push({
            file: relative(REPO_ROOT, path),
            line: index + 1,
            policyId: manifest.policyId,
            cited,
            published: manifest.version,
          });
        }
      });
    }
  }
  return found;
}

describe('policy versions have one source', () => {
  it('scans a tree that actually contains the manifests', () => {
    // A scan that silently stopped finding files would pass every assertion
    // below. Anchored on every manifest the policy package publishes, not on a
    // couple of them, so a new policy cannot arrive unscanned.
    expect(PRODUCTION_FILES.length).toBeGreaterThan(120);
    expect(TEST_FILES.length).toBeGreaterThan(50);
    expect(ACTIVE_POLICY_MANIFESTS.length).toBeGreaterThanOrEqual(10);
    expect(PUBLISHED_STEMS.size).toBeGreaterThan(0);

    const undiscoverable = [...MANIFEST_FILES]
      .filter(([, files]) => files.length !== 1)
      .map(([policyId, files]) => `${policyId}: ${files.length} declaring files`);
    expect(
      undiscoverable,
      "each policy must be declared by `policyId: '…'` in exactly one production file, " +
        'because that file is the one place exempt from the rules below',
    ).toEqual([]);
  });

  it('pins the version spelling convention this scan recognizes', () => {
    // The in-step rule finds versions by SHAPE. A manifest that adopts a shape
    // the scan cannot see would be exempt from it without anyone deciding that,
    // which is the same silent narrowing this file exists to prevent.
    const unrecognized = ACTIVE_POLICY_MANIFESTS.filter(
      (manifest) => [...manifest.version.matchAll(VERSION_TOKEN)].join() !== manifest.version,
    ).map((manifest) => `${manifest.policyId}: ${manifest.version}`);

    expect(
      unrecognized,
      'a manifest version must be a lowercase slug ending in `-v<n>` for the in-step scan to ' +
        'recognize it; widen VERSION_TOKEN deliberately if the convention is changing',
    ).toEqual([]);
  });

  it('spells the mastery-bkt version only in its manifest', () => {
    const manifest = ACTIVE_POLICY_MANIFESTS.find((entry) => entry.policyId === 'mastery-bkt');
    expect(manifest).toBeDefined();
    const version = manifest?.version ?? '';

    // Guard the guard: a version that shares a spelling with another policy
    // would make this scan meaningless, since a hit could belong to either.
    const sharedWith = ACTIVE_POLICY_MANIFESTS.filter(
      (entry) => entry.version === version && entry.policyId !== 'mastery-bkt',
    );
    expect(
      sharedWith.map((entry) => entry.policyId),
      'the mastery-bkt version must be unique before this scan can attribute a hit to it',
    ).toEqual([]);

    const declaringFiles = new Set(MANIFEST_FILES.get('mastery-bkt') ?? []);
    const offenders = PRODUCTION_FILES.filter(
      (path) => !declaringFiles.has(path) && readFileSync(path, 'utf8').includes(version),
    ).map((path) => relative(REPO_ROOT, path));

    expect(
      offenders,
      `${version} may only be spelled in packages/policies/src/bkt.ts; every other reference ` +
        'must read it from MASTERY_BKT_MANIFEST or name the policy by id alone',
    ).toEqual([]);
  });

  it('lets no production line cite a version its policy does not publish', () => {
    // THE RULE THE OLD SCAN DID NOT HAVE, and the only one that fails in the
    // direction the drift went. Value-independent: it does not ask what version
    // is current and look for it, it asks what each line claims and checks the
    // claim. A copy left behind by a bump and a copy added by one fail alike.
    const stale = citations()
      .filter((citation) => citation.cited !== citation.published)
      .map(
        (citation) =>
          `${citation.file}:${citation.line}: ${citation.policyId} cited as ${citation.cited}, ` +
          `manifest publishes ${citation.published}`,
      );

    expect(
      stale,
      'a production line naming a policy beside a version must cite the version that policy ' +
        'publishes now; prefer naming the policy by id alone and letting the manifest hold ' +
        'the version',
    ).toEqual([]);
  });

  it('lets no fixture cite a policy version the manifests do not publish', () => {
    // A fixture may write a version down; it may not write down one that never
    // shipped. That is the exact failure this file exists for, arriving through
    // the one door left open to it.
    const published = new Set(ACTIVE_POLICY_MANIFESTS.map((entry) => entry.version));
    const cited = /policyId:\s*'([a-z-]+)',\s*version:\s*'([^']+)'/g;
    const stale: string[] = [];

    for (const path of TEST_FILES) {
      const source = readFileSync(path, 'utf8');
      for (const [, policyId, version] of source.matchAll(cited)) {
        const manifest = ACTIVE_POLICY_MANIFESTS.find((entry) => entry.policyId === policyId);
        // An unrecognized `policyId` is a fixture inventing a policy, which is
        // legitimate test data and not this scan's business.
        if (manifest === undefined) continue;
        if (manifest.version !== version) {
          stale.push(`${relative(REPO_ROOT, path)}: ${policyId} cited as ${version}`);
        }
      }
    }

    expect(published.size).toBeGreaterThan(0);
    expect(
      stale,
      'a fixture naming a real policy must cite the version that policy actually publishes',
    ).toEqual([]);
  });
});
