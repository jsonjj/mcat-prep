/**
 * A policy version is spelled in its manifest and nowhere else in production
 * code.
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
 * This scan is what makes that stick. It fails when a second production
 * spelling appears, which is the moment the drift becomes possible again rather
 * than the moment it is noticed.
 *
 * TEST FIXTURES ARE DELIBERATELY OUT OF SCOPE. A fixture writes a
 * `PolicyVersion` as test DATA, and forbidding a literal there would ban
 * writing down the value a test is about. They are covered by the weaker but
 * correct rule below instead: a fixture may not cite a version the manifests do
 * not publish, so a stale fixture fails without a fixture being unable to name
 * a version at all.
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

/** The file each manifest is declared in — the one place allowed to say it. */
const MANIFEST_FILES: Readonly<Record<string, string>> = {
  'mastery-bkt': join(REPO_ROOT, 'packages', 'policies', 'src', 'bkt.ts'),
  'evidence-warrant': join(REPO_ROOT, 'packages', 'policies', 'src', 'mastery-policy.ts'),
};

describe('policy versions have one source', () => {
  it('scans a tree that actually contains the manifests', () => {
    // A scan that silently stopped finding files would pass every assertion
    // below. Anchored on the two files the version rule is enforced for.
    expect(PRODUCTION_FILES.length).toBeGreaterThan(120);
    expect(TEST_FILES.length).toBeGreaterThan(50);
    for (const manifestFile of Object.values(MANIFEST_FILES)) {
      expect(PRODUCTION_FILES).toContain(manifestFile);
    }
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

    const offenders = PRODUCTION_FILES.filter(
      (path) =>
        path !== MANIFEST_FILES['mastery-bkt'] && readFileSync(path, 'utf8').includes(version),
    ).map((path) => relative(REPO_ROOT, path));

    expect(
      offenders,
      `${version} may only be spelled in packages/policies/src/bkt.ts; every other reference ` +
        'must read it from MASTERY_BKT_MANIFEST or name the policy by id alone',
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
