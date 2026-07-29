import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { findPracticeItems } from './question-bank-repository';
import { PostgresPracticeBankPort } from './practice-exposure-repository';

interface Captured {
  sql: string;
  params: unknown[] | undefined;
}

function fakePool(rows: unknown[]): { pool: Pool; calls: Captured[] } {
  const calls: Captured[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      // Answer the port's one-time schema probe as a FULL schema so the tests
      // exercise the rich column/table path.
      if (sql.includes('information_schema.tables')) {
        return {
          rows: [
            { table_name: 'question_stats' },
            { table_name: 'practice_exposure' },
            { table_name: 'practice_repair' },
          ],
          rowCount: 3,
        };
      }
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      return { rows, rowCount: rows.length };
    },
  } as unknown as Pool;
  return { pool, calls };
}

const row = {
  question_id: 'v7-relabel-a538789a9daa94d4',
  content_release: 'v7-local',
  section: 'bb',
  cluster: 'BB1',
  kc_id: 'V3-KC-1',
  lesson_id: 'V3-LES-1',
  family_id: 'fam-1',
  subject: 'biochemistry',
  primary_skill: 'SIRS2',
  reasoning_operation: 'EXPLAIN',
  dok_level: 2,
  stem: 'Which explanation best accounts for the drop in activity?',
  passage: 'A secreted enzyme…',
  choices: { A: 'a', B: 'b', C: 'c', D: 'd' },
  assets: [],
  status: 'active',
  created_at: new Date(),
  attempts: 0,
  correct: 0,
  b: -0.3,
};

describe('findPracticeItems', () => {
  it('never selects answer columns and excludes held-out items', async () => {
    const { pool, calls } = fakePool([]);
    await findPracticeItems(pool, {
      kcId: 'V3-KC-1',
      reasoningOp: 'EXPLAIN',
      bBand: [-0.8, 0.2],
      excludeIds: ['seen-1'],
      limit: 8,
    });
    const { sql, params } = calls[0]!;
    expect(sql).not.toContain('correct_answer');
    expect(sql).not.toContain('explanations');
    expect(sql).not.toContain('question_protected');
    expect(sql).toContain('left join question_stats');
    expect(sql).toContain('q.kc_id =');
    expect(sql).toContain('q.reasoning_operation =');
    expect(sql).toContain('not in');
    // Target passed is the band centre, and the seen id is bound.
    const centre = (-0.8 + 0.2) / 2;
    expect((params ?? []).some((p) => typeof p === 'number' && Math.abs(p - centre) < 1e-9)).toBe(
      true,
    );
    expect(params).toContainEqual(['seen-1']);
  });
});

describe('PostgresPracticeBankPort', () => {
  it('maps a pool row into a learner-safe bank item with no answer material', async () => {
    const { pool } = fakePool([row]);
    const port = new PostgresPracticeBankPort(pool);
    const items = await port.findItems(
      { domain: 'science', kcId: 'V3-KC-1', skill: 'EXPLAIN', targetB: -0.3 },
      { excludeIds: [], limit: 8 },
    );
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.question.id).toBe('v7-relabel-a538789a9daa94d4');
    expect(item.question.choices).toHaveLength(4);
    expect(item.skill).toBe('EXPLAIN');
    expect(item.domain).toBe('science');
    // Uncalibrated (attempts <= 20) → b reported as null.
    expect(item.b).toBeNull();
    // The question DTO exposes only learner-safe keys — no answer-key fields.
    expect(Object.keys(item.question).sort()).toEqual(
      ['choices', 'cluster', 'id', 'passage', 'section', 'stem'].sort(),
    );
  });

  it('routes a CARS query to the cars section and CARS_* primary skill', async () => {
    const { pool, calls } = fakePool([]);
    const port = new PostgresPracticeBankPort(pool);
    await port.findItems(
      { domain: 'cars', carsSkill: 'FOC', targetB: 0 },
      { excludeIds: [], limit: 4 },
    );
    // The port probes the schema first; find the actual item query.
    const { sql, params } = calls.find((c) => c.sql.includes('q.section ='))!;
    expect(sql).toContain('q.section =');
    expect(sql).toContain('q.primary_skill =');
    expect(params).toContain('cars');
    expect(params).toContain('CARS_FOC');
  });

  it('reads the server-only answer table for feedback only', async () => {
    const { pool, calls } = fakePool([
      { question_id: 'q1', correct_answer: 'B', explanations: { A: 'no', B: 'yes', C: 'no', D: 'no' } },
    ]);
    const port = new PostgresPracticeBankPort(pool);
    const answer = await port.getAnswer('q1');
    expect(answer?.correctChoiceId).toBe('B');
    expect(answer?.rationale).toBe('yes');
    expect(calls[0]!.sql).toContain('from question_protected');
  });
});
