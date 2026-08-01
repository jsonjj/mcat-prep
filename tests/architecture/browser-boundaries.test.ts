import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerRoot = join(root, 'apps/learner-web');

const read = (path: string): string => readFileSync(join(root, path), 'utf8');

// Matches the module specifier as written in real import/export/require syntax
// (always quote-terminated), not a bare mention of the package name in prose —
// so a rationale comment explaining an exemption can name the package without
// itself satisfying the "still references it" check below.
const SERVER_ONLY_REFERENCE = /@mcat\/(?:authority-core|content)["']|InProcessAuthorityClient/;

/**
 * This boundary protects the SHIPPED BROWSER BUNDLE, not the source tree at
 * large: the commit that introduced it (89a771e, "enforce remote authority
 * boundary") replaced an in-process authority/full-content dependency in the
 * browser client with a remote HTTP call, and
 * docs/governance/authority-boundaries.md's protected-content rule is scoped
 * to "learner client bundles or source maps". A `*.test.ts` file under `src`
 * is never reachable from `src/main.tsx` — vitest is not even a dependency of
 * this app — so it is never part of what `vite build` emits (verified by
 * building apps/learner-web and confirming `dist/` contains none of these
 * markers).
 *
 * Each entry below is therefore a deliberately named, individually justified
 * exception for a non-bundled test file with a real reason to reach a server
 * package (see its own file for that reason) — not a blanket pass for
 * `*.test.ts`. Any file NOT listed here, test or not, still fails the check
 * below on a match. Both directions are enforced: an entry must still (a)
 * exist as a test file — so it can never quietly become bundled — and (b)
 * still actually contain a server-only reference, so a resolved exemption
 * cannot linger as cover for the next real leak.
 */
const ALLOWED_SERVER_PACKAGE_REFERENCES: readonly string[] = [
  'app/lesson-mastery-id-parity.test.ts',
];

describe('learner browser authority boundary', () => {
  it('has no server authority or full content dependency', () => {
    const manifest = JSON.parse(read('apps/learner-web/package.json')) as {
      dependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(manifest.dependencies ?? {});

    expect(dependencies).not.toContain('@mcat/authority-core');
    expect(dependencies).not.toContain('@mcat/content');
  });

  it('contains no bundle-reachable import of server authority or full content', () => {
    const entries = readdirSync(join(learnerRoot, 'src'), { recursive: true })
      .map(String)
      .filter((entry) => /\.(?:ts|tsx)$/.test(entry));

    const offenders = entries.filter((entry) => {
      const contents = readFileSync(join(learnerRoot, 'src', entry), 'utf8');
      return (
        SERVER_ONLY_REFERENCE.test(contents) && !ALLOWED_SERVER_PACKAGE_REFERENCES.includes(entry)
      );
    });

    expect(
      offenders,
      [
        `${offenders.join(', ')} reference(s) a server-only package or InProcessAuthorityClient`,
        'from a file the browser bundle can reach. Either remove the reference, or — only if the',
        'file is a non-bundled test with a real reason to cross this boundary — add it by name to',
        'ALLOWED_SERVER_PACKAGE_REFERENCES with that reason recorded in the file itself.',
      ].join('\n'),
    ).toEqual([]);

    for (const allowed of ALLOWED_SERVER_PACKAGE_REFERENCES) {
      const abs = join(learnerRoot, 'src', allowed);
      expect(
        existsSync(abs) && /\.test\.tsx?$/.test(allowed),
        `ALLOWED_SERVER_PACKAGE_REFERENCES exempts "${allowed}", which is no longer a test file ` +
          'at that path. A non-test file is bundle-reachable, so this exemption no longer holds ' +
          '— delete the entry and fix the underlying reference instead.',
      ).toBe(true);

      const contents = readFileSync(abs, 'utf8');
      expect(
        SERVER_ONLY_REFERENCE.test(contents),
        `ALLOWED_SERVER_PACKAGE_REFERENCES exempts "${allowed}", which no longer references a ` +
          'server-only package. Delete the entry.',
      ).toBe(true);
    }
  });

  it('never reaches protected answer material or the server-only answer-key provider', () => {
    // The Phase 5 LessonContentProvider keeps correct answers behind
    // `getAnswerKey` (server-only). Its module, L1's in-code answer authority,
    // and the on-disk protected-items.json are all things the browser bundle
    // must never import — a leak here re-opens the exact hole the remote
    // authority boundary closed, via a different door than @mcat/content.
    const ANSWER_KEY_REFERENCE =
      /protected-items\.json|vector-lesson-protected|lesson-content-provider|ServerAnswerKey|getAnswerKey/;
    const entries = readdirSync(join(learnerRoot, 'src'), { recursive: true })
      .map(String)
      .filter((entry) => /\.(?:ts|tsx)$/.test(entry));

    const offenders = entries.filter((entry) =>
      ANSWER_KEY_REFERENCE.test(readFileSync(join(learnerRoot, 'src', entry), 'utf8')),
    );

    expect(
      offenders,
      `${offenders.join(', ')} reference(s) server-only answer material from a bundle-reachable file. ` +
        'Correct answers must be resolved on the server via LessonContentProvider.getAnswerKey and never bundled.',
    ).toEqual([]);
  });

  it('requires the configured HTTP authority and has no learner question preview', () => {
    const authority = read('apps/learner-web/src/app/authority.ts');
    const router = read('apps/learner-web/src/app/router.tsx');
    const profile = read('apps/learner-web/src/screens/Profile.tsx');

    expect(authority).toContain('HttpAuthorityClient');
    expect(authority).toContain('VITE_AUTHORITY_BASE_URL');
    expect(authority).toContain('VITE_AUTHORITY_BASE_URL is required');
    expect(router).not.toContain('QuestionPreview');
    expect(router).not.toContain("path: 'preview'");
    expect(profile).not.toContain('/app/preview');
    expect(existsSync(join(learnerRoot, 'src/screens/QuestionPreview.tsx'))).toBe(false);
  });

  it('renders the interactive Evidence Atlas on Home', () => {
    const home = read('apps/learner-web/src/screens/Home.tsx');

    // The "skills glowing" count is a capability claim, so it reads BKT and never
    // an evidence-ladder rank.
    expect(home).toContain('useMasterySkills()');
    expect(home).toContain("import { EvidenceAtlas } from '../components/EvidenceAtlas'");
    expect(home).toContain('<EvidenceAtlas variant="home" />');
  });

  it('ships the real GLB model expected by the Home Evidence Atlas', () => {
    const modelPath = join(learnerRoot, 'public/models/brain.glb');

    expect(existsSync(modelPath)).toBe(true);

    const model = readFileSync(modelPath);
    expect(model.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(model.readUInt32LE(4)).toBe(2);
    expect(model.readUInt32LE(8)).toBe(model.byteLength);
    expect(model.byteLength).toBeLessThan(8 * 1024 * 1024);
    expect(existsSync(join(learnerRoot, 'public/models/ATTRIBUTION.md'))).toBe(true);
  });

  it('lets the learner shell and atlas shrink to narrow mobile viewports', () => {
    const styles = read('apps/learner-web/src/styles/app.css');

    expect(styles).toMatch(/\.mc-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(styles).toMatch(/\.mc-shell__main\s*\{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(
      /@media \(min-width: 840px\)[\s\S]*?\.mc-shell\s*\{[^}]*grid-template-columns:\s*248px minmax\(0,\s*1fr\)/,
    );
  });
});

describe('service-worker cache boundary', () => {
  const source = read('apps/learner-web/public/sw.js');

  it('sends API and auth requests directly to the network', () => {
    expect(source).toContain("url.pathname.startsWith('/v1')");
    expect(source).toContain("url.pathname.startsWith('/auth')");
    expect(source).toMatch(/event\.respondWith\(fetch\(req\)\);\s*return;/);
  });

  it('uses a closed allowlist for shell and hashed static assets', () => {
    expect(source).toContain('STATIC_SHELL_PATHS');
    expect(source).toContain('HASHED_STATIC_ASSET');
    expect(source).toContain('isCacheableStaticRequest');
    expect(source).toContain("url.search === ''");
    expect(source).not.toContain('url.origin !== self.location.origin) return;');
  });

  it('never stores authenticated, private, or no-store responses', () => {
    expect(source).toContain("req.headers.has('authorization')");
    expect(source).toContain("cacheControl.includes('no-store')");
    expect(source).toContain("cacheControl.includes('private')");
    expect(source).toContain("vary.includes('cookie')");
    expect(source).toContain("vary.includes('authorization')");
    expect(source).toContain('!res.redirected');
  });
});
