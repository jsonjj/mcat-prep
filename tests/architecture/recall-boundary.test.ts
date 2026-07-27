import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Recall is the user-owned flashcards feature: it is FACT-ONLY and must never
 * touch the BKT mastery pipeline (docs/recall-mastery-boundary.md, mirroring
 * packages/recall-core/src/mastery-boundary.ts). This source contract keeps the
 * Recall UI/adapters from importing mastery/authority code or writing mastery,
 * complementing the package-level checks in boundaries.test.ts /
 * browser-boundaries.test.ts. It is a stable acceptance contract, not a runtime
 * test.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const learnerRoot = join(root, 'apps/learner-web');

const read = (path: string): string => readFileSync(join(root, path), 'utf8');

/** Contents of every Recall-owned learner-web source file. */
function recallSources(): string[] {
  const subtrees = ['src/recall', 'src/screens/recall'];
  const files: string[] = [];
  for (const subtree of subtrees) {
    const abs = join(learnerRoot, subtree);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { recursive: true })) {
      const name = String(entry);
      if (/\.(?:ts|tsx)$/.test(name)) files.push(readFileSync(join(abs, name), 'utf8'));
    }
  }
  // The React Query bindings live under src/app but are Recall-only.
  files.push(read('apps/learner-web/src/app/recall-queries.ts'));
  return files;
}

describe('Recall stays fact-only (mastery boundary)', () => {
  const combined = recallSources().join('\n');

  it('ships the Recall feature files this contract guards', () => {
    // Guard against silently passing if the tree moves out from under the scan.
    expect(existsSync(join(learnerRoot, 'src/recall/recall-service.ts'))).toBe(true);
    expect(existsSync(join(learnerRoot, 'src/screens/recall/CardEditor.tsx'))).toBe(true);
    expect(combined.length).toBeGreaterThan(0);
  });

  it('never imports mastery or server-authority code from the Recall UI/adapters', () => {
    expect(combined).not.toMatch(/@mcat\/authority-core/);
    expect(combined).not.toMatch(/@mcat\/policies/);
    expect(combined).not.toMatch(/@mcat\/content/);
  });

  it('never writes mastery from Recall', () => {
    expect(combined).not.toContain('applyMasteryAttempt');
    expect(combined).not.toMatch(/\bmastery_[a-z]/i);
  });

  it('pins the core boundary marker to fact-only', () => {
    const boundary = read('packages/recall-core/src/mastery-boundary.ts');
    expect(boundary).toContain('RECALL_WRITES_MASTERY = false');
    expect(boundary).toMatch(/writesMastery:\s*false/);
    expect(boundary).toMatch(/readsMastery:\s*false/);
  });
});
