import type { PassageChoice, PassageChoiceId, PassageOfTheDayEntry } from '@mcat/contracts';
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

/** Four A–D options in order; `correctId` gets the key + null misconception. */
function choices(correctId: PassageChoiceId): PassageChoice[] {
  return (['A', 'B', 'C', 'D'] as const).map((id) => ({
    id,
    text: id.toLowerCase(),
    correct: id === correctId,
    misconception: id === correctId ? null : `${id} is a trap`,
    rationale: `${id} rationale`,
  }));
}

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
        choices: choices('A'),
        explanation: 'because a',
        carsSkill: 'FOC',
        dok: 2,
      },
      {
        id: 'p-alpha-q2',
        stem: 'Stem two?',
        choices: choices('B'),
        explanation: 'because b',
        carsSkill: 'RWT',
        dok: 3,
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
    // Two questions × 8 columns (the answer key now rides inside `choices`).
    expect(questionsInsert!.params).toHaveLength(16);
    expect(questionsInsert!.params?.[0]).toBe('p-alpha-q1');
    expect(questionsInsert!.params?.[2]).toBe(1); // position, 1-based
    expect(questionsInsert!.params?.[3]).toBe('FOC'); // cars_skill
    expect(questionsInsert!.params?.[4]).toBe(2); // dok
    // choices serialized, carrying the per-choice key.
    expect(questionsInsert!.params?.[6]).toContain('"id":"A"');
    expect(questionsInsert!.params?.[6]).toContain('"correct":true');
    expect(questionsInsert!.params?.[7]).toBe('because a'); // explanation
    expect(questionsInsert!.params?.[8]).toBe('p-alpha-q2');
    expect(questionsInsert!.params?.[10]).toBe(2); // q2 position
    expect(questionsInsert!.params?.[15]).toBe('because b');
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
        stem: 'Stem one?',
        choices: choices('A'),
        explanation: 'because a',
      },
      {
        ...base,
        question_id: 'p-alpha-q2',
        position: 2,
        cars_skill: 'RWT',
        dok: 3,
        stem: 'Stem two?',
        choices: choices('B'),
        explanation: 'because b',
      },
    ]);

    const entries = await listPassages(q);
    expect(entries).toHaveLength(1);
    const only = entries[0]!;
    expect(only.id).toBe('p-alpha');
    expect(only.questions).toHaveLength(2);
    expect(only.questions[0]?.explanation).toBe('because a');
    // The per-choice key survives the round-trip through the contract.
    const key = only.questions[0]?.choices.find((c) => c.correct);
    expect(key?.id).toBe('A');
    expect(key?.misconception).toBeNull();
    expect(only.questions[0]?.choices.find((c) => c.id === 'B')?.misconception).toBe('B is a trap');
    expect(only.source).toBeUndefined();
  });
});
