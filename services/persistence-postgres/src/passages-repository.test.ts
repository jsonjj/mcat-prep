import type { PassageOfTheDayEntry } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import type { Queryable } from './mastery-repository';
import { hasPassages, listPassages, seedPassages, upsertPassages } from './passages-repository';

interface Captured {
  sql: string;
  params: readonly unknown[] | undefined;
}

function fakeQueryable(
  rows: Record<string, unknown>[] = [],
  { present = true }: { present?: boolean } = {},
): { q: Queryable; calls: Captured[] } {
  const calls: Captured[] = [];
  const q: Queryable = {
    async query<R extends Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      calls.push({ sql, params });
      if (sql.includes('information_schema.tables')) {
        return { rows: [{ present }] as unknown as R[] };
      }
      return { rows: rows as unknown as R[] };
    },
  };
  return { q, calls };
}

const CHOICES = [
  { id: 'A', text: 'a' },
  { id: 'B', text: 'b' },
  { id: 'C', text: 'c' },
  { id: 'D', text: 'd' },
];

function entry(overrides: Partial<PassageOfTheDayEntry> = {}): PassageOfTheDayEntry {
  return {
    id: 'p-alpha',
    slug: 'p-alpha',
    title: 'Alpha',
    discipline: 'Aesthetics',
    theme: 'humanities',
    body: ['Para one.', 'Para two.'],
    questions: [
      {
        id: 'p-alpha-q1',
        stem: 'Stem one?',
        choices: CHOICES,
        correctChoiceId: 'A',
        rationale: 'because a',
        choiceRationales: { A: 'a', B: 'b', C: 'c', D: 'd' },
        carsSkill: 'FOC',
        dok: 2,
        difficulty: 'accessible',
      },
      {
        id: 'p-alpha-q2',
        stem: 'Stem two?',
        choices: CHOICES,
        correctChoiceId: 'B',
        rationale: 'because b',
        carsSkill: 'RWT',
        dok: 3,
        difficulty: 'moderate',
      },
    ],
    ...overrides,
  };
}

describe('upsertPassages / seedPassages', () => {
  it('upserts passages, replaces their questions, and returns the passage count', async () => {
    const { q, calls } = fakeQueryable();
    const count = await upsertPassages(q, [entry()]);
    expect(count).toBe(1);
    expect(calls).toHaveLength(3);

    const [passagesInsert, questionsDelete, questionsInsert] = calls;
    expect(passagesInsert!.sql).toContain('insert into passages');
    expect(passagesInsert!.sql).toContain('on conflict (passage_id) do update set');
    // One passage → 8 params, id first, body serialized to JSON.
    expect(passagesInsert!.params).toHaveLength(8);
    expect(passagesInsert!.params?.[0]).toBe('p-alpha');
    expect(passagesInsert!.params?.[4]).toBe('humanities');
    expect(passagesInsert!.params?.[5]).toBe(JSON.stringify(['Para one.', 'Para two.']));

    expect(questionsDelete!.sql).toContain('delete from passage_questions');
    expect(questionsDelete!.params?.[0]).toEqual(['p-alpha']);

    expect(questionsInsert!.sql).toContain('insert into passage_questions');
    expect(questionsInsert!.sql).toContain('on conflict (question_id) do update set');
    // Two questions × 11 columns.
    expect(questionsInsert!.params).toHaveLength(22);
    expect(questionsInsert!.params?.[0]).toBe('p-alpha-q1');
    expect(questionsInsert!.params?.[2]).toBe(1); // position, 1-based
    expect(questionsInsert!.params?.[7]).toContain('"id":"A"'); // choices serialized
    // q1 has per-choice rationales (serialized); q2 has none (null).
    expect(typeof questionsInsert!.params?.[10]).toBe('string');
    expect(questionsInsert!.params?.[11]).toBe('p-alpha-q2');
    expect(questionsInsert!.params?.[21]).toBeNull();
  });

  it('is a no-op on an empty set', async () => {
    const { q, calls } = fakeQueryable();
    expect(await upsertPassages(q, [])).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed entry before writing anything', async () => {
    const { q, calls } = fakeQueryable();
    const bad = entry({ theme: 'natural_science' as PassageOfTheDayEntry['theme'] });
    await expect(upsertPassages(q, [bad])).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('seedPassages delegates to the same upsert', async () => {
    const { q, calls } = fakeQueryable();
    const count = await seedPassages(q, [entry()]);
    expect(count).toBe(1);
    expect(calls[0]!.sql).toContain('insert into passages');
  });
});

describe('hasPassages / listPassages', () => {
  it('reports table presence', async () => {
    expect(await hasPassages(fakeQueryable([], { present: true }).q)).toBe(true);
    expect(await hasPassages(fakeQueryable([], { present: false }).q)).toBe(false);
  });

  it('groups question rows under their passage and validates through the contract', async () => {
    const base = {
      passage_id: 'p-alpha',
      slug: 'p-alpha',
      title: 'Alpha',
      discipline: 'Aesthetics',
      theme: 'humanities',
      body: ['Para one.', 'Para two.'],
      source: null,
      attribution: null,
    };
    const { q } = fakeQueryable([
      {
        ...base,
        question_id: 'p-alpha-q1',
        position: 1,
        cars_skill: 'FOC',
        dok: 2,
        difficulty: 'accessible',
        stem: 'Stem one?',
        choices: CHOICES,
        correct_choice_id: 'A',
        explanation: 'because a',
        choice_rationales: { A: 'a', B: 'b', C: 'c', D: 'd' },
      },
      {
        ...base,
        question_id: 'p-alpha-q2',
        position: 2,
        cars_skill: 'RWT',
        dok: 3,
        difficulty: 'moderate',
        stem: 'Stem two?',
        choices: CHOICES,
        correct_choice_id: 'B',
        explanation: 'because b',
        choice_rationales: null,
      },
    ]);

    const entries = await listPassages(q);
    expect(entries).toHaveLength(1);
    const only = entries[0]!;
    expect(only.id).toBe('p-alpha');
    expect(only.questions).toHaveLength(2);
    expect(only.questions[0]?.rationale).toBe('because a'); // explanation → rationale
    expect(only.questions[0]?.choiceRationales).toEqual({ A: 'a', B: 'b', C: 'c', D: 'd' });
    // A null per-choice map is omitted, not carried as null.
    expect(only.questions[1]?.choiceRationales).toBeUndefined();
    expect(only.source).toBeUndefined();
  });
});
