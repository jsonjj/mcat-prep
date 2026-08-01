import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertNoProtectedFields,
  compileQuestion,
  compileV7Question,
  EngineQuestionSchema,
  loadSyntheticBank,
  QuestionSchema,
} from '@mcat/content';

/**
 * `error_models` is the authored per-choice misconception map (WS2). It is
 * ANSWER-REVEALING — the correct choice is tagged `correct_model` — so it is
 * SERVER-ONLY: it lives in the protected payload, and only the PICKED option's
 * misconception is ever surfaced (post-answer, one string), never the whole map.
 *
 * This guard pins both directions: error_models is carried into every PROTECTED
 * shape, and absent from every LEARNER-SAFE payload (contract DTOs, the compiled
 * safe view, and the Postgres learner-safe column allowlist). The runtime leak
 * guard (`assertNoProtectedFields`) is extended to name it, so a future safe
 * payload that carries it fails at the boundary and here.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string =>
  existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '';
/** Source with block/line comments stripped — the docblocks legitimately name it. */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** A canonical v7 item that carries error models, parsed to fill defaults. */
const itemWithErrorModels = QuestionSchema.parse({
  id: 'q-em-guard-1',
  section: 'BB',
  stem: 'Which option applies the principle without an unsupported assumption?',
  choices: { A: 'A text', B: 'B text', C: 'C text', D: 'D text' },
  correct_answer: 'B',
  explanations: { A: 'why A', B: 'why B', C: 'why C', D: 'why D' },
  error_models: {
    A: 'misconception: applies a related but nonresponsive principle',
    B: 'correct_model: applies the relevant principle',
    C: 'misconception: reverses the relationship',
    D: 'misconception: over-generalizes the rule',
  },
});

describe('error_models is carried into the protected payload', () => {
  it('splits error_models onto protected and never onto the safe view', () => {
    const { safe, protected: prot } = compileV7Question(itemWithErrorModels);
    expect(prot.error_models).toEqual(itemWithErrorModels.error_models);
    // The safe view cannot represent it, in any spelling or value.
    const safeJson = JSON.stringify(safe);
    expect(safeJson).not.toContain('error_models');
    expect(safeJson).not.toContain('errorModels');
    expect(safeJson).not.toContain('misconception');
    expect(safeJson).not.toContain('correct_model');
  });

  it('omits error_models on the protected payload when the item authored none', () => {
    const without = QuestionSchema.parse({
      id: 'q-em-guard-2',
      section: 'CP',
      stem: 'A discrete item with no authored error models.',
      choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
      correct_answer: 'A',
      explanations: { A: 'a', B: 'b', C: 'c', D: 'd' },
    });
    const { protected: prot } = compileV7Question(without);
    expect(prot.error_models).toBeUndefined();
  });
});

describe('the engine projection no longer drops error_models', () => {
  /** A valid engine question (reuse a synthetic fixture) that authors error models. */
  const engineWithErrorModels = EngineQuestionSchema.parse({
    ...loadSyntheticBank().questions[0]!,
    error_models: {
      A: 'correct_model',
      B: 'misconception: applies a related but nonresponsive principle',
      C: 'misconception: reverses the relationship',
      D: 'misconception: over-generalizes the rule',
    },
  });

  it('carries error_models into the engine protected payload, never onto the safe view', () => {
    const { safe, protected: prot } = compileQuestion(engineWithErrorModels);
    expect(prot.error_models).toEqual(engineWithErrorModels.error_models);
    const safeJson = JSON.stringify(safe);
    expect(safeJson).not.toContain('error_models');
    expect(safeJson).not.toContain('misconception');
    expect(safeJson).not.toContain('correct_model');
    expect(() => assertNoProtectedFields(safe)).not.toThrow();
  });

  it('omits error_models on the engine payload when the item (synthetic fixture) authored none', () => {
    for (const q of loadSyntheticBank().questions) {
      expect(compileQuestion(q).protected.error_models).toBeUndefined();
    }
  });
});

describe('the runtime leak guard names error_models a protected field', () => {
  it('throws when a learner-safe payload carries error_models (either spelling)', () => {
    expect(() => assertNoProtectedFields({ error_models: { A: 'x' } })).toThrow(/error_models/);
    expect(() => assertNoProtectedFields({ errorModels: { A: 'x' } })).toThrow(/errorModels/);
    // Nested is caught too — the map could ride inside a queue item.
    expect(() =>
      assertNoProtectedFields({ question: { id: 'q', error_models: { A: 'x' } } }),
    ).toThrow(/error_models/);
  });

  it('does not trip on a genuinely safe compiled view', () => {
    const { safe } = compileV7Question(itemWithErrorModels);
    expect(() => assertNoProtectedFields(safe)).not.toThrow();
  });
});

describe('no learner-safe payload names error_models', () => {
  it('keeps it off the learner-safe v7 compile view', () => {
    const compile = code('packages/content/src/compile.ts');
    const safeInterface = compile.slice(
      compile.indexOf('interface LearnerSafeV7Question'),
      compile.indexOf('interface ProtectedV7Payload'),
    );
    expect(safeInterface).not.toBe('');
    expect(safeInterface).not.toMatch(/error_?models/i);
  });

  it('keeps it off the learner-safe question + practice-queue DTOs', () => {
    const views = code('packages/contracts/src/learner-views.ts');
    const safeQuestion = views.slice(
      views.indexOf('LearnerSafeQuestionSchema'),
      views.indexOf('StimulusViewSchema'),
    );
    expect(safeQuestion).not.toBe('');
    expect(safeQuestion).not.toMatch(/error_?models/i);

    const practice = code('packages/contracts/src/practice.ts');
    const queueBlock = practice.slice(
      practice.indexOf('PracticeQuestionSchema'),
      practice.indexOf('PracticeAttemptCommandSchema'),
    );
    expect(queueBlock).not.toBe('');
    expect(queueBlock).not.toMatch(/error_?models/i);
  });

  it('keeps it out of the Postgres learner-safe column allowlist', () => {
    const repo = code('services/persistence-postgres/src/question-bank-repository.ts');
    const allowlist = repo.slice(
      repo.indexOf('LEARNER_SAFE_COLUMNS'),
      repo.indexOf('SAFE_SELECT'),
    );
    expect(allowlist).not.toBe('');
    expect(allowlist).not.toMatch(/error_?models/i);
  });
});
