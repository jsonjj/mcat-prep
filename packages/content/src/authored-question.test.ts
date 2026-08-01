import { describe, expect, it } from 'vitest';
import {
  AuthoredQuestionSchema,
  authoredQuestionToBankRows,
  authoredQuestionToV7,
  parseAuthoredQuestions,
  type AuthoredQuestion,
} from './authored-question';
import { assertNoProtectedFields } from './compile';

/**
 * The authoring contract + its lowering onto the canonical v7 record. These pin
 * the field rules (CARS vs science), the choice→{correct_answer, explanations,
 * error_models} mapping, and that the compiled store rows keep answer material
 * server-only.
 */

// Real registry ids so the cluster/FC rollup resolves (BB3 / FC3).
const SCIENCE_KC = 'V3-KC-010372';
const SCIENCE_LESSON = 'V3-LES-006619';

const scienceQuestion = (over: Partial<AuthoredQuestion> = {}): AuthoredQuestion =>
  ({
    id: 'cp-test-0001',
    section: 'BB',
    kc_id: SCIENCE_KC,
    skill: 'EXPLAIN',
    dok: 2,
    lesson_id: SCIENCE_LESSON,
    family_id: 'FAM-test',
    passage: '',
    stem: 'Which option explains the observation without an unsupported assumption?',
    choices: [
      { id: 'A', text: 'A text', correct: false, misconception: 'A trap', rationale: 'why A is wrong' },
      { id: 'B', text: 'B text', correct: true, misconception: null, rationale: 'why B is right' },
      { id: 'C', text: 'C text', correct: false, misconception: 'C trap', rationale: 'why C is wrong' },
      { id: 'D', text: 'D text', correct: false, misconception: 'D trap', rationale: 'why D is wrong' },
    ],
    explanation: 'The overall worked explanation.',
    ...over,
  }) as AuthoredQuestion;

const carsQuestion = (over: Partial<AuthoredQuestion> = {}): AuthoredQuestion =>
  ({
    id: 'cars-test-0001',
    section: 'CARS',
    skill: 'FOC',
    dok: 2,
    passage_id: 'PAS-test-1',
    family_id: 'FAM-cars',
    passage: 'A shared CARS stimulus paragraph the item is anchored to.',
    stem: 'The passage most strongly supports which claim?',
    choices: [
      { id: 'A', text: 'A text', correct: true, misconception: null, rationale: 'why A is right' },
      { id: 'B', text: 'B text', correct: false, misconception: 'B trap', rationale: 'why B is wrong' },
      { id: 'C', text: 'C text', correct: false, misconception: 'C trap', rationale: 'why C is wrong' },
      { id: 'D', text: 'D text', correct: false, misconception: 'D trap', rationale: 'why D is wrong' },
    ],
    explanation: 'The overall worked explanation.',
    ...over,
  }) as AuthoredQuestion;

describe('AuthoredQuestionSchema — field rules', () => {
  it('accepts a well-formed science question and a well-formed CARS question', () => {
    expect(AuthoredQuestionSchema.safeParse(scienceQuestion()).success).toBe(true);
    expect(AuthoredQuestionSchema.safeParse(carsQuestion()).success).toBe(true);
  });

  it('requires kc_id, lesson_id, and a reasoning-op skill for science', () => {
    expect(AuthoredQuestionSchema.safeParse(scienceQuestion({ kc_id: null })).success).toBe(false);
    expect(AuthoredQuestionSchema.safeParse(scienceQuestion({ lesson_id: undefined })).success).toBe(
      false,
    );
    // FOC is a CARS skill, not one of the 7 reasoning operations.
    expect(AuthoredQuestionSchema.safeParse(scienceQuestion({ skill: 'FOC' })).success).toBe(false);
  });

  it('requires a passage/passage_id and disallows kc_id/lesson_id for CARS', () => {
    expect(
      AuthoredQuestionSchema.safeParse(carsQuestion({ passage: '', passage_id: undefined })).success,
    ).toBe(false);
    expect(AuthoredQuestionSchema.safeParse(carsQuestion({ kc_id: 'V3-KC-1' })).success).toBe(false);
    expect(AuthoredQuestionSchema.safeParse(carsQuestion({ lesson_id: 'V3-LES-1' })).success).toBe(
      false,
    );
    // QUANTIFY is a science op, not a CARS sub-skill.
    expect(AuthoredQuestionSchema.safeParse(carsQuestion({ skill: 'QUANTIFY' })).success).toBe(false);
  });

  it('accepts a CARS question with only a passage_id (no inline passage)', () => {
    expect(
      AuthoredQuestionSchema.safeParse(carsQuestion({ passage: '', passage_id: 'PAS-x' })).success,
    ).toBe(true);
  });

  it('enforces the choice rules (one correct, misconception null on key / set on wrong, A–D order)', () => {
    const twoCorrect = scienceQuestion();
    twoCorrect.choices[0]!.correct = true; // now A and B both correct
    expect(AuthoredQuestionSchema.safeParse(twoCorrect).success).toBe(false);

    const keyHasMisconception = scienceQuestion();
    keyHasMisconception.choices[1]!.misconception = 'should be null on the key';
    expect(AuthoredQuestionSchema.safeParse(keyHasMisconception).success).toBe(false);

    const wrongMissingMisconception = scienceQuestion();
    wrongMissingMisconception.choices[0]!.misconception = null;
    expect(AuthoredQuestionSchema.safeParse(wrongMissingMisconception).success).toBe(false);

    const outOfOrder = scienceQuestion();
    outOfOrder.choices[0]!.id = 'B';
    outOfOrder.choices[1]!.id = 'A';
    expect(AuthoredQuestionSchema.safeParse(outOfOrder).success).toBe(false);
  });

  it('rejects unknown keys (strict) and dok outside 1–3', () => {
    expect(
      AuthoredQuestionSchema.safeParse({ ...scienceQuestion(), surprise: 1 }).success,
    ).toBe(false);
    expect(AuthoredQuestionSchema.safeParse(scienceQuestion({ dok: 4 })).success).toBe(false);
    expect(AuthoredQuestionSchema.safeParse(scienceQuestion({ dok: 0 })).success).toBe(false);
  });

  it('parseAuthoredQuestions accepts a single object or an array', () => {
    expect(parseAuthoredQuestions(scienceQuestion())).toHaveLength(1);
    expect(parseAuthoredQuestions([scienceQuestion(), carsQuestion()])).toHaveLength(2);
  });
});

describe('authoredQuestionToV7 — the choice → v7 lowering', () => {
  it('maps the correct choice, explanations (folded), and error_models', () => {
    const v7 = authoredQuestionToV7(scienceQuestion());
    expect(v7.correct_answer).toBe('B');
    // explanations carry each rationale; the key entry folds in the overall explanation.
    expect(v7.explanations.A).toBe('why A is wrong');
    expect(v7.explanations.B).toContain('why B is right');
    expect(v7.explanations.B).toContain('The overall worked explanation.');
    // error_models: key tagged correct_model, wrong choices carry the misconception.
    expect(v7.error_models).toEqual({
      A: 'misconception: A trap',
      B: 'correct_model',
      C: 'misconception: C trap',
      D: 'misconception: D trap',
    });
  });

  it('maps science skill onto primary_skill + reasoning_operation and keeps the KC/lesson', () => {
    const v7 = authoredQuestionToV7(scienceQuestion({ skill: 'QUANTIFY' }));
    expect(v7.primary_skill).toBe('QUANTIFY');
    expect(v7.reasoning_operation).toBe('QUANTIFY');
    expect(v7.primary_kc_id).toBe(SCIENCE_KC);
    expect(v7.lesson_id).toBe(SCIENCE_LESSON);
    expect(v7.dok_level).toBe(2);
  });

  it('maps CARS skill onto CARS_<skill> and carries no reasoning_operation/KC', () => {
    const v7 = authoredQuestionToV7(carsQuestion({ skill: 'RBT' }));
    expect(v7.primary_skill).toBe('CARS_RBT');
    expect(v7.reasoning_operation).toBeUndefined();
    expect(v7.primary_kc_id).toBeUndefined();
    expect(v7.lesson_id).toBeUndefined();
  });
});

describe('authoredQuestionToBankRows — store rows keep answer material server-only', () => {
  it('resolves the cluster + reasoning_operation for a science item', () => {
    const { safe } = authoredQuestionToBankRows(scienceQuestion({ skill: 'EXPLAIN' }));
    expect(safe.section).toBe('bb');
    expect(safe.cluster).toBe('BB3'); // V3-KC-010372 → V3-LES-006619 → BB3
    expect(safe.reasoning_operation).toBe('EXPLAIN');
    expect(safe.status).toBe('production_candidate');
  });

  it('resolves the CARS cluster and leaves reasoning_operation null', () => {
    const { safe } = authoredQuestionToBankRows(carsQuestion({ skill: 'FOC' }));
    expect(safe.section).toBe('cars');
    expect(safe.cluster).toBe('CA1'); // CARS_FOC → CA1
    expect(safe.reasoning_operation).toBeNull();
  });

  it('keeps the safe row free of key/misconception/rationale material', () => {
    const { safe, protected: prot } = authoredQuestionToBankRows(scienceQuestion());
    const safeJson = JSON.stringify(safe);
    expect(safeJson).not.toContain('correct_answer');
    expect(safeJson).not.toContain('error_models');
    expect(safeJson).not.toContain('misconception');
    expect(safeJson).not.toContain('why B is right');
    expect(() => assertNoProtectedFields(safe)).not.toThrow();
    // The protected row carries the server-only material.
    expect(prot.correct_answer).toBe('B');
    expect(prot.error_models).not.toBeNull();
    expect(prot.error_models!.B).toBe('correct_model');
  });
});
