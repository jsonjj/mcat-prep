import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  ADMINISTRATIVE_QUESTION_COLUMNS,
  getAdministrativeQuestion,
  listAdministrativeQuestions,
} from './question-bank-repository';
import { getLegacyAdministrativeQuestionAnswer } from './question-scoring-repository';

interface Captured {
  sql: string;
  params: unknown[] | undefined;
}

/** A fake pool that records the SQL/params and returns canned rows (no DB). */
function fakePool(rows: unknown[]): { pool: Pool; calls: Captured[] } {
  const calls: Captured[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return { rows };
    },
  } as unknown as Pool;
  return { pool, calls };
}

describe('question-bank administrative reads', () => {
  it('the allowlist never contains answer columns', () => {
    expect(ADMINISTRATIVE_QUESTION_COLUMNS as readonly string[]).not.toContain('correct_answer');
    expect(ADMINISTRATIVE_QUESTION_COLUMNS as readonly string[]).not.toContain('explanations');
  });

  it('getAdministrativeQuestion selects only allowlisted columns from `questions`', async () => {
    const { pool, calls } = fakePool([
      { question_id: 'q1', section: 'bb', stem: 's', choices: { A: 'a' } },
    ]);
    const row = await getAdministrativeQuestion(pool, 'q1');
    expect(row?.question_id).toBe('q1');
    const sql = calls[0]!.sql;
    expect(sql).toContain('from questions');
    expect(sql).not.toContain('correct_answer');
    expect(sql).not.toContain('explanations');
    expect(sql).not.toContain('question_protected');
    expect(calls[0]!.params).toEqual(['q1']);
  });

  it('listAdministrativeQuestions filters, clamps the limit, and stays answer-free', async () => {
    const { pool, calls } = fakePool([]);
    await listAdministrativeQuestions(pool, { section: 'cp', cluster: 'CP2', limit: 9999 });
    const { sql, params } = calls[0]!;
    expect(sql).toContain('section = $1');
    expect(sql).toContain('cluster = $2');
    expect(params).toEqual(['cp', 'CP2', 500]); // clamped to 500
    expect(sql).not.toContain('correct_answer');
    expect(sql).not.toContain('explanations');
  });

  it('isolates the legacy answer accessor in the server-only scoring module', async () => {
    const { pool, calls } = fakePool([
      { question_id: 'q1', correct_answer: 'B', explanations: { B: 'x' } },
    ]);
    const ans = await getLegacyAdministrativeQuestionAnswer(pool, 'q1');
    expect(ans?.correct_answer).toBe('B');
    expect(calls[0]!.sql).toContain('from question_protected');
  });
});
