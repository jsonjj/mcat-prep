import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoProtectedFields, compileQuestion, loadSyntheticBank } from '@mcat/content';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function deps(pkgRelPath: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(root, pkgRelPath, 'package.json'), 'utf8'));
  return { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
}

function sourceFiles(relPath: string): string[] {
  return readdirSync(join(root, relPath), { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(relPath, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:ts|tsx|js|jsx|css)$/.test(entry.name) ? [entryPath] : [];
  });
}

/** Pure layers must not depend on UI, browser, or app packages. */
const PURE_LAYERS = [
  'packages/contracts',
  'packages/domain',
  'packages/policies',
  'packages/content',
  'packages/authority-core',
];

const FORBIDDEN_IN_PURE = [
  'react',
  'react-dom',
  '@mcat/ui-web',
  '@mcat/platform-web',
  '@mcat/scene-web',
];

describe('architecture boundaries', () => {
  for (const layer of PURE_LAYERS) {
    it(`${layer} has no UI/browser/app dependencies`, () => {
      const d = Object.keys(deps(layer));
      for (const forbidden of FORBIDDEN_IN_PURE) {
        expect(d, `${layer} must not depend on ${forbidden}`).not.toContain(forbidden);
      }
      // Pure layers never depend on an app.
      expect(
        d.some((x) => x.startsWith('@mcat/learner-web') || x.startsWith('@mcat/admin-web')),
      ).toBe(false);
    });
  }

  it('ui-web does not depend on the router or an app', () => {
    const d = Object.keys(deps('packages/ui-web'));
    expect(d).not.toContain('react-router-dom');
    expect(d.some((x) => x.startsWith('@mcat/learner-web'))).toBe(false);
  });

  it('landing-web remains disconnected from product runtime and apps', () => {
    const d = Object.keys(deps('apps/landing-web'));
    expect(d.sort()).toEqual(
      [
        '@fontsource-variable/fraunces',
        '@fontsource/atkinson-hyperlegible',
        '@fontsource/ibm-plex-mono',
        '@mcat/design-tokens',
        'react',
        'react-dom',
      ].sort(),
    );

    const forbiddenDependencies = [
      '@mcat/authority-core',
      '@mcat/client-core',
      '@mcat/contracts',
      '@mcat/content',
      '@mcat/domain',
      '@mcat/policies',
      '@mcat/ai-gateway',
      '@mcat/platform-web',
      '@mcat/ui-web',
      '@mcat/learner-web',
      '@mcat/admin-web',
      'react-router-dom',
      '@tanstack/react-query',
      '@react-three/fiber',
      'three',
    ];
    for (const forbidden of forbiddenDependencies) {
      expect(d, `landing-web must not depend on ${forbidden}`).not.toContain(forbidden);
    }

    const forbiddenImports = [
      ...forbiddenDependencies.filter((name) => name !== 'three'),
      'apps/learner-web',
    ];
    const landingInputs = [
      'apps/landing-web/index.html',
      'apps/landing-web/vite.config.ts',
      ...sourceFiles('apps/landing-web/src'),
      ...sourceFiles('apps/landing-web/server'),
    ];
    const forbiddenNetworkCalls = [
      'XMLHttpRequest',
      'new WebSocket(',
      'navigator.sendBeacon(',
      'new EventSource(',
    ];

    for (const file of landingInputs) {
      const source = readFileSync(join(root, file), 'utf8');
      for (const forbidden of forbiddenImports) {
        expect(source, `${file} must not import ${forbidden}`).not.toContain(forbidden);
      }
      for (const forbidden of forbiddenNetworkCalls) {
        expect(source, `${file} must not make network calls with ${forbidden}`).not.toContain(
          forbidden,
        );
      }
      const fetchCalls = source.match(/\bfetch\s*\([^)]*/g) ?? [];
      if (fetchCalls.length > 0 && !file.endsWith('.test.ts')) {
        expect(fetchCalls).toHaveLength(1);
        if (file === 'apps/landing-web/src/diagnostic/SnapshotExperience.tsx') {
          expect(source).toContain('fetch(path, init)');
        } else {
          expect(file).toBe('apps/landing-web/src/components/BetaUpdatesDialog.tsx');
          expect(source).toContain("fetch('/api/beta-updates'");
        }
      }
    }

    const learnerSources = sourceFiles('apps/landing-web/src');
    for (const file of learnerSources) {
      const source = readFileSync(join(root, file), 'utf8');
      for (const protectedToken of [
        'correctChoices',
        'itemRules',
        'option_rationales',
        'protected rationale',
        'sourceCandidateId',
        'fast-5each-',
        'fast-cars-',
        '/server/snapshot-score',
      ]) {
        expect(
          source,
          `${file} must not contain protected scoring token ${protectedToken}`,
        ).not.toContain(protectedToken);
      }
    }

    const snapshotClient = readFileSync(
      join(root, 'apps/landing-web/src/diagnostic/SnapshotExperience.tsx'),
      'utf8',
    );
    expect(snapshotClient).toContain("postJson('/api/snapshot/attempt')");
    expect(snapshotClient).toContain("postJson('/api/snapshot/score'");
  });

  it('domain/policies do not depend on content or authority (dependency direction)', () => {
    expect(Object.keys(deps('packages/domain'))).not.toContain('@mcat/content');
    expect(Object.keys(deps('packages/policies'))).not.toContain('@mcat/content');
    expect(Object.keys(deps('packages/policies'))).not.toContain('@mcat/authority-core');
  });

  it('every compiled learner-safe question is free of answer keys and rationales', () => {
    const bank = loadSyntheticBank();
    for (const q of bank.questions) {
      const { safe } = compileQuestion(q);
      expect(() => assertNoProtectedFields(safe)).not.toThrow();
      const json = JSON.stringify(safe);
      expect(json).not.toContain('correct_choice_id');
      expect(json).not.toContain('rationales');
    }
  });
});
