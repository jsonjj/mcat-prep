import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerRoot = join(root, 'apps/learner-web');

const read = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('learner browser authority boundary', () => {
  it('has no server authority or full content dependency', () => {
    const manifest = JSON.parse(read('apps/learner-web/package.json')) as {
      dependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(manifest.dependencies ?? {});

    expect(dependencies).not.toContain('@mcat/authority-core');
    expect(dependencies).not.toContain('@mcat/content');
  });

  it('contains no browser import of server authority or full content', () => {
    const source = readdirSync(join(learnerRoot, 'src'), { recursive: true })
      .filter((entry) => /\.(?:ts|tsx)$/.test(String(entry)))
      .map((entry) => readFileSync(join(learnerRoot, 'src', String(entry)), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/@mcat\/(?:authority-core|content)/);
    expect(source).not.toContain('InProcessAuthorityClient');
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

    expect(styles).toMatch(
      /\.mc-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
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
