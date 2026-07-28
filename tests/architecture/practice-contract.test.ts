import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source contract for adaptive Practice:
 *  - the queue/attempt endpoints exist and are namespaced away from the existing
 *    single-item Passage-of-the-Day practice attempt,
 *  - the queue DTOs are declared strict and carry no answer-key/rationale field,
 *  - the learner-web Practice UI stays behind the HTTP authority client (no
 *    server authority / full content / persistence import).
 *
 * (Runtime payload-safety is additionally proven by the @mcat/contracts and
 * @mcat/authority-core unit suites.)
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string => (existsSync(path) ? readFileSync(join(root, path), 'utf8') : '');

describe('adaptive practice endpoints', () => {
  it('declares namespaced queue + adaptive attempt endpoints in the HTTP contract', () => {
    const http = read('packages/contracts/src/http.ts');
    expect(http).toContain("path: '/v1/practice/queue'");
    expect(http).toContain("path: '/v1/practice/attempts/adaptive'");
  });

  it('routes the adaptive attempt without shadowing Passage-of-the-Day', () => {
    const routes = read('services/lambdas/learner-api/src/routes.ts');
    // The original single-item attempt route is untouched…
    expect(routes).toContain("path: '/v1/practice/attempts'");
    // …and the adaptive attempt + queue are added as distinct routes.
    expect(routes).toContain("path: '/v1/practice/attempts/adaptive'");
    expect(routes).toMatch(/id:\s*'practiceQueue'/);
    expect(routes).toMatch(/id:\s*'practiceAdaptiveAttempt'/);
  });
});

describe('practice queue payload safety', () => {
  const practice = read('packages/contracts/src/practice.ts');

  it('declares the queue DTOs strict', () => {
    // Both the question and the queue item are strict objects (no extra fields).
    expect(practice).toMatch(/PracticeQuestionSchema[\s\S]*?\.strict\(\)/);
    expect(practice).toMatch(/PracticeQueueItemSchema[\s\S]*?\.strict\(\)/);
    expect(practice).toMatch(/PracticeQueueViewSchema[\s\S]*?\.strict\(\)/);
  });

  it('never names an answer-key or rationale field on the queue DTOs', () => {
    const queueBlock = practice.slice(
      practice.indexOf('PracticeQuestionSchema'),
      practice.indexOf('PracticeAttemptCommandSchema'),
    );
    expect(queueBlock).not.toBe('');
    for (const forbidden of [
      'correct_answer',
      'correct_choice_id',
      'correctChoiceId',
      'rationale',
      'rationales',
      'explanations',
    ]) {
      expect(queueBlock, `queue DTOs must not name ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('learner-web practice UI stays behind the HTTP authority', () => {
  const files = [
    'apps/learner-web/src/screens/practice/PracticeHome.tsx',
    'apps/learner-web/src/screens/practice/PracticeSession.tsx',
    'apps/learner-web/src/app/practice-queries.ts',
  ];

  it('never imports the server authority, full content, or persistence', () => {
    for (const file of files) {
      const src = read(file);
      expect(src, `${file} missing`).not.toBe('');
      expect(src, `${file} must not import server authority/content/persistence`).not.toMatch(
        /@mcat\/(?:authority-core|content|persistence-postgres)/,
      );
    }
  });

  it('drives the session through the practice-queries seam', () => {
    const session = read('apps/learner-web/src/screens/practice/PracticeSession.tsx');
    expect(session).toMatch(/usePracticeQueue/);
    expect(session).toMatch(/useSubmitPracticeAttempt/);
    const queries = read('apps/learner-web/src/app/practice-queries.ts');
    expect(queries).toMatch(/authority\.getPracticeQueue/);
    expect(queries).toMatch(/authority\.submitPracticeAttempt/);
  });
});
