import { describe, expect, it } from 'vitest';
import {
  HTTP_API,
  PracticeAttemptCommandSchema,
  PracticeAttemptResultSchema,
  PracticeAttemptSchema,
  PracticeFocusSchema,
  PracticeQueueItemSchema,
  PracticeQueueViewSchema,
  PracticeQuestionSchema,
} from './index';

const question = {
  id: 'v7-relabel-a538789a9daa94d4',
  section: 'bb',
  cluster: 'BB1',
  passage: 'A secreted enzyme depends on two disulfide bonds…',
  stem: 'Which explanation best accounts for the drop in activity?',
  choices: [
    { id: 'A', text: 'Option A' },
    { id: 'B', text: 'Option B' },
    { id: 'C', text: 'Option C' },
    { id: 'D', text: 'Option D' },
  ],
};

const item = {
  specId: 'sci:kc-1:EXPLAIN:d2:train',
  domain: 'science',
  purpose: 'train',
  kcId: 'kc-1',
  skill: 'EXPLAIN',
  carsSkill: null,
  dok: 2,
  question,
};

describe('practice queue DTOs', () => {
  it('accepts a well-formed learner-safe question and queue item', () => {
    expect(PracticeQuestionSchema.parse(question)).toEqual(question);
    expect(PracticeQueueItemSchema.parse(item)).toEqual(item);
  });

  it('cannot represent an answer key or rationale on the question', () => {
    expect(PracticeQuestionSchema.safeParse({ ...question, correct_answer: 'B' }).success).toBe(
      false,
    );
    expect(
      PracticeQuestionSchema.safeParse({
        ...question,
        choices: question.choices.map((c, i) => (i === 0 ? { ...c, rationale: 'x' } : c)),
      }).success,
    ).toBe(false);
    // The queue item itself rejects any stray protected field, too.
    expect(PracticeQueueItemSchema.safeParse({ ...item, correctChoiceId: 'B' }).success).toBe(false);
    expect(JSON.stringify(PracticeQueueViewSchema.parse({ requested: 1, focus: null, items: [item] })))
      .not.toMatch(/correct|rationale/i);
  });

  it('requires exactly four choices', () => {
    expect(
      PracticeQuestionSchema.safeParse({ ...question, choices: question.choices.slice(0, 3) })
        .success,
    ).toBe(false);
  });

  it('validates focus tokens', () => {
    expect(PracticeFocusSchema.safeParse('bb1').success).toBe(true);
    expect(PracticeFocusSchema.safeParse('explain').success).toBe(true);
    expect(PracticeFocusSchema.safeParse('CARS').success).toBe(false); // must be lowercase
    expect(PracticeFocusSchema.safeParse('a b').success).toBe(false);
  });
});

describe('practice attempt DTOs', () => {
  it('accepts a strict adaptive attempt command', () => {
    const cmd = {
      questionId: 'v7-relabel-a538789a9daa94d4',
      specId: 'sci:kc-1:EXPLAIN:d2:train',
      chosenChoiceId: 'B',
      firstAttempt: true,
    };
    expect(PracticeAttemptCommandSchema.parse(cmd)).toEqual(cmd);
    expect(PracticeAttemptCommandSchema.safeParse({ ...cmd, extra: 1 }).success).toBe(false);
    expect(
      PracticeAttemptCommandSchema.safeParse({ ...cmd, chosenChoiceId: null }).success,
    ).toBe(true);
  });

  /**
   * `firstAttempt` is a claim about state only the server holds, and it was a
   * browser boolean hardcoded `true`. The wire still carries it because the
   * deployed route's exact-key body check requires the key; what the authority
   * consumes does not, so nothing on the server can re-trust it.
   */
  it('keeps the client firstAttempt claim off the schema the authority consumes', () => {
    expect(Object.keys(PracticeAttemptCommandSchema.shape)).toContain('firstAttempt');
    expect(Object.keys(PracticeAttemptSchema.shape)).not.toContain('firstAttempt');
    // Omitted from the wire schema rather than restated, so the two cannot
    // drift into disagreeing about what else a practice answer carries.
    expect(Object.keys(PracticeAttemptSchema.shape).sort()).toEqual(
      Object.keys(PracticeAttemptCommandSchema.shape)
        .filter((key) => key !== 'firstAttempt')
        .sort(),
    );
    // Strict on both sides: the claim cannot ride along as an unknown key.
    expect(
      PracticeAttemptSchema.safeParse({
        questionId: 'v7-relabel-a538789a9daa94d4',
        specId: 'sci:kc-1:EXPLAIN:d2:train',
        chosenChoiceId: 'B',
        firstAttempt: true,
      }).success,
    ).toBe(false);
  });

  it('carries answer material only in the result', () => {
    const result = {
      correct: false,
      correctChoiceId: 'B',
      rationale: 'B braces the fold via covalent cross-links.',
      choiceRationales: { A: 'no', B: 'yes', C: 'no', D: 'no' },
    };
    expect(PracticeAttemptResultSchema.parse(result)).toEqual(result);
  });
});

describe('practice endpoint metadata', () => {
  it('exposes namespaced adaptive endpoints distinct from Passage-of-the-Day', () => {
    expect(HTTP_API.practiceQueue).toMatchObject({ method: 'GET', path: '/v1/practice/queue' });
    expect(HTTP_API.practiceAdaptiveAttempt).toMatchObject({
      method: 'POST',
      path: '/v1/practice/attempts/adaptive',
    });
    // Must not shadow the existing single-item practice attempt route.
    expect(HTTP_API.practiceAdaptiveAttempt.path).not.toBe('/v1/practice/attempts');
  });
});
