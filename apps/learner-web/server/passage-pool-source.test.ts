import type { PassageOfTheDayEntry } from '@mcat/contracts';
import { describe, expect, it, vi } from 'vitest';
import { resolvePassagePool } from './passage-pool-source';

function entry(id: string): PassageOfTheDayEntry {
  return {
    id,
    slug: id,
    title: id,
    discipline: 'Test',
    theme: 'humanities',
    body: ['body'],
    questions: [
      {
        id: `${id}-q1`,
        stem: 'stem',
        choices: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
          { id: 'C', text: 'c' },
          { id: 'D', text: 'd' },
        ],
        correctChoiceId: 'A',
        rationale: 'because',
        carsSkill: 'FOC',
        dok: 2,
        difficulty: 'accessible',
      },
    ],
  };
}

const silent = () => {};

describe('resolvePassagePool priority fallback', () => {
  it('uses postgres when DATABASE_URL is set and the table has rows', async () => {
    const result = await resolvePassagePool({
      databaseUrl: 'postgres://x',
      loadFromPostgres: async () => [entry('pg')],
      loadFromFileStore: () => [entry('file')],
      loadHardcoded: () => [entry('hard')],
      warn: silent,
    });
    expect(result.source).toBe('postgres');
    expect(result.entries.map((e) => e.id)).toEqual(['pg']);
  });

  it('falls back to the file store when postgres is set but empty', async () => {
    const warn = vi.fn();
    const result = await resolvePassagePool({
      databaseUrl: 'postgres://x',
      loadFromPostgres: async () => [],
      loadFromFileStore: () => [entry('file')],
      loadHardcoded: () => [entry('hard')],
      warn,
    });
    expect(result.source).toBe('file-store');
    expect(result.entries.map((e) => e.id)).toEqual(['file']);
    expect(warn).toHaveBeenCalled();
  });

  it('falls back past a postgres read error', async () => {
    const result = await resolvePassagePool({
      databaseUrl: 'postgres://x',
      loadFromPostgres: async () => {
        throw new Error('connection refused');
      },
      loadFromFileStore: () => [entry('file')],
      loadHardcoded: () => [entry('hard')],
      warn: silent,
    });
    expect(result.source).toBe('file-store');
  });

  it('uses the file store when there is no DATABASE_URL', async () => {
    const result = await resolvePassagePool({
      databaseUrl: undefined,
      loadFromFileStore: () => [entry('file')],
      loadHardcoded: () => [entry('hard')],
      warn: silent,
    });
    expect(result.source).toBe('file-store');
  });

  it('falls back to the hardcoded pool when neither postgres nor a store is present', async () => {
    const result = await resolvePassagePool({
      databaseUrl: undefined,
      loadFromFileStore: () => null,
      loadHardcoded: () => [entry('hard')],
      warn: silent,
    });
    expect(result.source).toBe('hardcoded');
    expect(result.entries.map((e) => e.id)).toEqual(['hard']);
  });
});
