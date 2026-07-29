import type { CarsDuelTopic } from '@mcat/contracts';
import { CARS_DUEL_TOPICS } from '@mcat/content';
import { describe, expect, it } from 'vitest';
import type { Queryable } from './mastery-repository';
import {
  hasCarsDuelTopics,
  listCarsDuelTopics,
  seedCarsDuelTopics,
} from './cars-duel-topics-repository';

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

const SAMPLE: CarsDuelTopic[] = [
  {
    id: 'cars-topic-001',
    proposition: 'Schools should replace letter grades with written feedback.',
    theme: 'sociology',
    argumentStructure: 'policy_tradeoff',
    difficulty: 2,
    charge: 'neutral',
  },
  {
    id: 'cars-topic-006',
    proposition: 'A society is best judged by how it treats its least-advantaged members.',
    theme: 'ethics',
    argumentStructure: 'evidence_eval',
    difficulty: 4,
    charge: 'neutral',
  },
];

describe('seedCarsDuelTopics', () => {
  it('upserts the whole pool in one unnest statement', async () => {
    const { q, calls } = fakeQueryable();
    const count = await seedCarsDuelTopics(q, SAMPLE);
    expect(count).toBe(2);
    const { sql, params } = calls[0]!;
    expect(sql).toContain('insert into cars_duel_topics');
    expect(sql).toContain('unnest(');
    expect(sql).toContain('on conflict (topic_id) do update set');
    // Six columnar arrays, id-first, in column order.
    expect(params?.[0]).toEqual(['cars-topic-001', 'cars-topic-006']);
    expect(params?.[2]).toEqual(['sociology', 'ethics']);
    expect(params?.[3]).toEqual(['policy_tradeoff', 'evidence_eval']);
    expect(params?.[4]).toEqual([2, 4]);
  });

  it('defaults to the canonical @mcat/content pool (topics.json parity)', async () => {
    const { q, calls } = fakeQueryable();
    const count = await seedCarsDuelTopics(q);
    expect(count).toBe(CARS_DUEL_TOPICS.length);
    expect(count).toBe(150);
    const { params } = calls[0]!;
    expect((params?.[0] as string[]).length).toBe(150);
  });

  it('is a no-op on an empty pool', async () => {
    const { q, calls } = fakeQueryable();
    const count = await seedCarsDuelTopics(q, []);
    expect(count).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe('hasCarsDuelTopics / listCarsDuelTopics', () => {
  it('reports table presence', async () => {
    const present = fakeQueryable([], { present: true });
    expect(await hasCarsDuelTopics(present.q)).toBe(true);
    const absent = fakeQueryable([], { present: false });
    expect(await hasCarsDuelTopics(absent.q)).toBe(false);
  });

  it('reads rows back through the contract, snake_case → camelCase', async () => {
    const { q } = fakeQueryable([
      {
        topic_id: 'cars-topic-001',
        proposition: 'Schools should replace letter grades with written feedback.',
        theme: 'sociology',
        argument_structure: 'policy_tradeoff',
        difficulty: 2,
        charge: 'neutral',
      },
    ]);
    const topics = await listCarsDuelTopics(q);
    expect(topics).toHaveLength(1);
    expect(topics[0]!.id).toBe('cars-topic-001');
    expect(topics[0]!.argumentStructure).toBe('policy_tradeoff');
    expect(topics[0]!.difficulty).toBe(2);
  });
});
