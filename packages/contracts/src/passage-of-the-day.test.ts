import { describe, expect, it } from 'vitest';
import {
  AuthoredPassageSchema,
  authoredPassageToEntry,
  parseAuthoredPassages,
  PassageOfTheDayEntrySchema,
  type AuthoredPassage,
} from './passage-of-the-day';

const CHOICE_IDS = ['A', 'B', 'C', 'D'] as const;

/** Four A–D choices in order, with one correct option carrying a null misconception. */
function authoredChoices(correctId: 'A' | 'B' | 'C' | 'D' = 'B'): Record<string, unknown>[] {
  return CHOICE_IDS.map((id) => ({
    id,
    text: `option ${id}`,
    correct: id === correctId,
    misconception: id === correctId ? null : `${id} misreads the passage`,
    rationale: id === correctId ? `${id} restates the thesis` : `${id} misses the point`,
  }));
}

/** A structurally valid authored question (snake_case authoring shape). */
function authoredQuestion(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    cars_skill: 'FOC',
    dok: 2,
    stem: 'What is the central claim of the passage?',
    choices: authoredChoices('B'),
    explanation: 'B restates the thesis in the closing sentence.',
    ...overrides,
  };
}

function authoredPassage(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    slug: 'the-uses-of-difficulty',
    title: 'The Uses of Difficulty',
    theme: 'humanities',
    body: ['Paragraph one.', 'Paragraph two.'],
    questions: [
      authoredQuestion({ cars_skill: 'FOC' }),
      authoredQuestion({ cars_skill: 'RWT' }),
      authoredQuestion({ cars_skill: 'FOC' }),
      authoredQuestion({ cars_skill: 'RWT' }),
      authoredQuestion({ cars_skill: 'RBT' }),
    ],
    ...overrides,
  };
}

describe('AuthoredPassageSchema (ingest validation)', () => {
  it('accepts a well-formed passage with five questions', () => {
    expect(AuthoredPassageSchema.safeParse(authoredPassage()).success).toBe(true);
  });

  it.each([
    ['an unknown theme', { theme: 'natural_science' }],
    ['a non-kebab slug', { slug: 'The Uses Of Difficulty' }],
    ['fewer than five questions', { questions: [authoredQuestion()] }],
    ['an unknown top-level key', { extra: true }],
    ['an empty body', { body: [] }],
  ])('rejects %s', (_label, override) => {
    expect(AuthoredPassageSchema.safeParse(authoredPassage(override)).success).toBe(false);
  });

  it.each([
    ['an unknown CARS skill', { cars_skill: 'RWX' }],
    ['a dok above 3', { dok: 4 }],
    ['a dok below 1', { dok: 0 }],
    ['fewer than four choices', { choices: authoredChoices('B').slice(0, 1) }],
    ['a missing explanation', { explanation: undefined }],
    ['a legacy difficulty field', { difficulty: 'accessible' }],
    ['a legacy correct_choice_id field', { correct_choice_id: 'B' }],
  ])('rejects a question with %s', (_label, override) => {
    const passage = authoredPassage({
      questions: [
        authoredQuestion(override),
        authoredQuestion({ cars_skill: 'RWT' }),
        authoredQuestion({ cars_skill: 'FOC' }),
        authoredQuestion({ cars_skill: 'RWT' }),
        authoredQuestion({ cars_skill: 'RBT' }),
      ],
    });
    expect(AuthoredPassageSchema.safeParse(passage).success).toBe(false);
  });

  function passageWithFirstChoices(choices: unknown): Record<string, unknown> {
    return authoredPassage({
      questions: [
        authoredQuestion({ choices }),
        authoredQuestion({ cars_skill: 'RWT' }),
        authoredQuestion({ cars_skill: 'FOC' }),
        authoredQuestion({ cars_skill: 'RWT' }),
        authoredQuestion({ cars_skill: 'RBT' }),
      ],
    });
  }

  it('rejects choices that are not exactly A, B, C, D in order', () => {
    const reordered = authoredChoices('B');
    [reordered[2], reordered[3]] = [reordered[3]!, reordered[2]!]; // …A, B, D, C
    expect(AuthoredPassageSchema.safeParse(passageWithFirstChoices(reordered)).success).toBe(false);
  });

  it('rejects a question with no correct choice', () => {
    const none = authoredChoices('B').map((choice) => ({
      ...choice,
      correct: false,
      misconception: 'still a trap',
    }));
    expect(AuthoredPassageSchema.safeParse(passageWithFirstChoices(none)).success).toBe(false);
  });

  it('rejects a question with more than one correct choice', () => {
    const two = authoredChoices('B').map((choice, index) =>
      index <= 1 ? { ...choice, correct: true, misconception: null } : choice,
    );
    expect(AuthoredPassageSchema.safeParse(passageWithFirstChoices(two)).success).toBe(false);
  });

  it('rejects an incorrect choice that is missing its misconception', () => {
    const badWrong = authoredChoices('B').map((choice) =>
      choice.correct ? choice : { ...choice, misconception: null },
    );
    expect(AuthoredPassageSchema.safeParse(passageWithFirstChoices(badWrong)).success).toBe(false);
  });

  it('rejects a correct choice that carries a misconception', () => {
    const badCorrect = authoredChoices('B').map((choice) =>
      choice.correct ? { ...choice, misconception: 'should be null' } : choice,
    );
    expect(AuthoredPassageSchema.safeParse(passageWithFirstChoices(badCorrect)).success).toBe(false);
  });
});

describe('authoredPassageToEntry (authoring → canonical mapping)', () => {
  it('derives id/slug, question ids, and defaults discipline from theme', () => {
    const entry = authoredPassageToEntry(AuthoredPassageSchema.parse(authoredPassage()));
    expect(entry.id).toBe('the-uses-of-difficulty');
    expect(entry.slug).toBe('the-uses-of-difficulty');
    expect(entry.discipline).toBe('Humanities');
    expect(entry.questions.map((q) => q.id)).toEqual([
      'the-uses-of-difficulty-q1',
      'the-uses-of-difficulty-q2',
      'the-uses-of-difficulty-q3',
      'the-uses-of-difficulty-q4',
      'the-uses-of-difficulty-q5',
    ]);
    // snake_case authoring maps to camelCase runtime; the answer key rides on the choice.
    const first = entry.questions[0]!;
    expect(first.explanation).toBe('B restates the thesis in the closing sentence.');
    expect(first.carsSkill).toBe('FOC');
    const correct = first.choices.find((c) => c.correct)!;
    expect(correct.id).toBe('B');
    expect(correct.misconception).toBeNull();
    expect(first.choices.find((c) => c.id === 'A')?.misconception).toBe('A misreads the passage');
    // The mapped entry satisfies the canonical contract.
    expect(PassageOfTheDayEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('keeps an explicit discipline', () => {
    const authored = AuthoredPassageSchema.parse(
      authoredPassage({ discipline: 'Aesthetics' }),
    ) as AuthoredPassage;
    const entry = authoredPassageToEntry(authored);
    expect(entry.discipline).toBe('Aesthetics');
  });
});

describe('parseAuthoredPassages (file shape)', () => {
  it('accepts a single passage object or an array of them', () => {
    expect(parseAuthoredPassages(authoredPassage())).toHaveLength(1);
    expect(
      parseAuthoredPassages([authoredPassage(), authoredPassage({ slug: 'a-second' })]),
    ).toHaveLength(2);
  });

  it('throws on the first malformed passage', () => {
    expect(() =>
      parseAuthoredPassages([authoredPassage(), authoredPassage({ theme: 'nope' })]),
    ).toThrow();
  });
});
