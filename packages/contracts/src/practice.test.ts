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
    expect(PracticeQueueItemSchema.safeParse({ ...item, correctChoiceId: 'B' }).success).toBe(
      false,
    );
    expect(
      JSON.stringify(
        PracticeQueueViewSchema.parse({
          requested: 1,
          focus: null,
          items: [item],
          shortfall: 0,
          taughtGap: false,
        }),
      ),
    ).not.toMatch(/correct|rationale/i);
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
    };
    expect(PracticeAttemptCommandSchema.parse(cmd)).toEqual(cmd);
    expect(PracticeAttemptCommandSchema.safeParse({ ...cmd, extra: 1 }).success).toBe(false);
    expect(PracticeAttemptCommandSchema.safeParse({ ...cmd, chosenChoiceId: null }).success).toBe(
      true,
    );
  });

  /**
   * `firstAttempt` used to be a claim about state only the server holds — a
   * browser boolean hardcoded `true` — carried on the wire schema alone so the
   * deployed route's exact-key body check would accept it, while the schema
   * the authority actually consumed never had the field. That was a
   * coordination hazard, not a fix: an unread field can be re-trusted by a
   * future author, where a field that does not exist cannot. It has been
   * removed from both schemas entirely, and the route no longer requires it
   * (`services/lambdas/learner-api/src/routes.ts`).
   */
  it('has no firstAttempt field on either the wire schema or the schema the authority consumes', () => {
    expect(Object.keys(PracticeAttemptCommandSchema.shape)).not.toContain('firstAttempt');
    expect(Object.keys(PracticeAttemptSchema.shape)).not.toContain('firstAttempt');
    // The two shapes now agree exactly — nothing was ever restated between them.
    expect(Object.keys(PracticeAttemptSchema.shape).sort()).toEqual(
      Object.keys(PracticeAttemptCommandSchema.shape).sort(),
    );
    // Strict on both sides: a resurrected claim cannot ride along as an unknown key.
    for (const schema of [PracticeAttemptCommandSchema, PracticeAttemptSchema]) {
      expect(
        schema.safeParse({
          questionId: 'v7-relabel-a538789a9daa94d4',
          specId: 'sci:kc-1:EXPLAIN:d2:train',
          chosenChoiceId: 'B',
          firstAttempt: true,
        }).success,
      ).toBe(false);
    }
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
