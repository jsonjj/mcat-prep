import { describe, expect, it } from 'vitest';
import {
  AuthoredPassageSchema,
  authoredPassageToEntry,
  parseAuthoredPassages,
  PassageOfTheDayEntrySchema,
  type AuthoredPassage,
} from './passage-of-the-day';

/** A structurally valid authored question (snake_case authoring shape). */
function authoredQuestion(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    cars_skill: 'FOC',
    dok: 2,
    difficulty: 'accessible',
    stem: 'What is the central claim of the passage?',
    choices: [
      { id: 'A', text: 'first' },
      { id: 'B', text: 'second' },
      { id: 'C', text: 'third' },
      { id: 'D', text: 'fourth' },
    ],
    correct_choice_id: 'B',
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
    ['a dok above 4', { dok: 5 }],
    ['a dok below 1', { dok: 0 }],
    ['an unknown difficulty', { difficulty: 'hard' }],
    ['fewer than four choices', { choices: [{ id: 'A', text: 'x' }] }],
    ['a missing explanation', { explanation: undefined }],
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

  it('rejects choices that are not exactly A, B, C, D in order', () => {
    const passage = authoredPassage({
      questions: [
        authoredQuestion({
          choices: [
            { id: 'A', text: 'a' },
            { id: 'B', text: 'b' },
            { id: 'D', text: 'd' },
            { id: 'C', text: 'c' },
          ],
        }),
        authoredQuestion({ cars_skill: 'RWT' }),
        authoredQuestion({ cars_skill: 'FOC' }),
        authoredQuestion({ cars_skill: 'RWT' }),
        authoredQuestion({ cars_skill: 'RBT' }),
      ],
    });
    expect(AuthoredPassageSchema.safeParse(passage).success).toBe(false);
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
    // snake_case authoring maps to camelCase runtime, and explanation → rationale.
    expect(entry.questions[0]?.correctChoiceId).toBe('B');
    expect(entry.questions[0]?.rationale).toBe('B restates the thesis in the closing sentence.');
    expect(entry.questions[0]?.carsSkill).toBe('FOC');
    // The mapped entry satisfies the canonical contract.
    expect(PassageOfTheDayEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('keeps an explicit discipline and optional choice_rationales', () => {
    const authored = AuthoredPassageSchema.parse(
      authoredPassage({
        discipline: 'Aesthetics',
        questions: [
          authoredQuestion({
            choice_rationales: { A: 'why A', B: 'why B', C: 'why C', D: 'why D' },
          }),
          authoredQuestion({ cars_skill: 'RWT' }),
          authoredQuestion({ cars_skill: 'FOC' }),
          authoredQuestion({ cars_skill: 'RWT' }),
          authoredQuestion({ cars_skill: 'RBT' }),
        ],
      }),
    ) as AuthoredPassage;
    const entry = authoredPassageToEntry(authored);
    expect(entry.discipline).toBe('Aesthetics');
    expect(entry.questions[0]?.choiceRationales).toEqual({
      A: 'why A',
      B: 'why B',
      C: 'why C',
      D: 'why D',
    });
    expect(entry.questions[1]?.choiceRationales).toBeUndefined();
  });
});

describe('parseAuthoredPassages (file shape)', () => {
  it('accepts a single passage object or an array of them', () => {
    expect(parseAuthoredPassages(authoredPassage())).toHaveLength(1);
    expect(parseAuthoredPassages([authoredPassage(), authoredPassage({ slug: 'a-second' })])).toHaveLength(2);
  });

  it('throws on the first malformed passage', () => {
    expect(() => parseAuthoredPassages([authoredPassage(), authoredPassage({ theme: 'nope' })])).toThrow();
  });
});
