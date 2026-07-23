import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('v7 question serving architecture boundaries', () => {
  it('does not export protected scoring through shared package entrypoints', () => {
    const contractsIndex = read('packages/contracts/src/index.ts');
    const persistenceIndex = read('services/persistence-postgres/src/index.ts');
    const persistenceManifest = JSON.parse(read('services/persistence-postgres/package.json')) as {
      exports: Record<string, string>;
    };

    expect(contractsIndex).not.toContain('question-serving-protected');
    expect(persistenceIndex).not.toContain('question-scoring-repository');
    expect(persistenceManifest.exports['./server/question-scoring']).toBe(
      './src/question-scoring-repository.ts',
    );
  });

  it('keeps answer-bearing SQL in the isolated server-only scoring module', () => {
    const sourceDirectory = join(root, 'services/persistence-postgres/src');
    const productionSources = readdirSync(sourceDirectory)
      .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
      .filter((entry) => entry !== 'question-scoring-repository.ts');

    for (const file of productionSources) {
      const source = readFileSync(join(sourceDirectory, file), 'utf8');
      expect(source, `${file} must not project protected aliases`).not.toMatch(
        /\bcorrect_answer\b|\bexplanations\b|\bcorrect_choice_id\b|\brationales\b/,
      );
    }
    const scoring = read('services/persistence-postgres/src/question-scoring-repository.ts');
    expect(scoring).toContain('join question_protected_versions');
    expect(scoring).toContain('a.item_version = p.item_version');
  });

  it('prevents browser packages from importing persistence or server-only contracts', () => {
    for (const manifestPath of [
      'apps/learner-web/package.json',
      'packages/client-core/package.json',
      'packages/platform-web/package.json',
    ]) {
      const manifest = JSON.parse(read(manifestPath)) as {
        dependencies?: Record<string, string>;
      };
      expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@mcat/persistence-postgres');
    }

    for (const rootPath of [
      'apps/learner-web/src',
      'packages/client-core/src',
      'packages/platform-web/src',
    ]) {
      const source = readdirSync(join(root, rootPath), { recursive: true })
        .filter((entry) => /\.(?:ts|tsx)$/.test(String(entry)))
        .map((entry) => readFileSync(join(root, rootPath, String(entry)), 'utf8'))
        .join('\n');
      expect(source).not.toContain('@mcat/persistence-postgres');
      expect(source).not.toContain('/server/question-scoring');
      expect(source).not.toContain('/server/question-serving-protected');
    }
  });

  it('keeps the production learner projection free of routing and review cues', () => {
    const contracts = read('packages/contracts/src/question-serving.ts');
    const learnerSchema = contracts.slice(
      contracts.indexOf('export const MinimalCueSafeLearnerQuestionWireSchema'),
      contracts.indexOf('const ReceiptSelectionSchema'),
    );
    expect(learnerSchema).not.toMatch(
      /family_id|kc_id|lesson_id|skill|dok|routing|certification|reviewer|source_ledger|content_hash/,
    );
  });
});
