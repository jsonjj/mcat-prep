import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoProtectedFields, compileQuestion, loadSyntheticBank } from '@mcat/content';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function deps(pkgRelPath: string): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(root, pkgRelPath, 'package.json'), 'utf8'));
  return { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
}

/** Pure layers must not depend on UI, browser, or app packages. */
const PURE_LAYERS = [
  'packages/contracts',
  'packages/domain',
  'packages/policies',
  'packages/content',
  'packages/authority-core',
];

const FORBIDDEN_IN_PURE = ['react', 'react-dom', '@mcat/ui-web', '@mcat/platform-web', '@mcat/scene-web'];

describe('architecture boundaries', () => {
  for (const layer of PURE_LAYERS) {
    it(`${layer} has no UI/browser/app dependencies`, () => {
      const d = Object.keys(deps(layer));
      for (const forbidden of FORBIDDEN_IN_PURE) {
        expect(d, `${layer} must not depend on ${forbidden}`).not.toContain(forbidden);
      }
      // Pure layers never depend on an app.
      expect(d.some((x) => x.startsWith('@mcat/learner-web') || x.startsWith('@mcat/admin-web'))).toBe(false);
    });
  }

  it('ui-web does not depend on the router or an app', () => {
    const d = Object.keys(deps('packages/ui-web'));
    expect(d).not.toContain('react-router-dom');
    expect(d.some((x) => x.startsWith('@mcat/learner-web'))).toBe(false);
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
