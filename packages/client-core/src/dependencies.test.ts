import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('client-core browser dependency boundary', () => {
  it('depends at runtime only on learner-safe contracts', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(manifest.dependencies).toEqual({ '@mcat/contracts': 'workspace:*' });
  });

  it('does not import authority, domain, or full content packages', () => {
    const files = ['port.ts', 'http.ts', 'index.ts'];
    const source = files
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/@mcat\/(?:authority-core|domain|content)/);
  });
});
