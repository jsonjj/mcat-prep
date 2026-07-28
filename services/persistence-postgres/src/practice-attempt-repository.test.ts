import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { listPracticeAttempts, recordPracticeAttempt } from './practice-attempt-repository';
import { PostgresPracticeBankPort } from './practice-exposure-repository';

interface Captured {
  sql: string;
  params: unknown[] | undefined;
}

/** `attemptLog: false` simulates a database that has not had 0010 applied. */
function fakePool(rows: unknown[], { attemptLog = true } = {}): { pool: Pool; calls: Captured[] } {
  const calls: Captured[] = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
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
      if (sql.includes('chosen_choice_id') && sql.includes('information_schema.columns')) {
        return attemptLog ? { rows: [{ ok: 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }
      return { rows, rowCount: rows.length };
    },
  } as unknown as Pool;
  return { pool, calls };
}

const ATTEMPT = {
  learnerId: '11111111-1111-4111-8111-111111111111',
  questionId: 'v7-relabel-a538789a9daa94d4',
  kcId: 'V3-KC-1',
  skill: 'EXPLAIN',
  familyId: 'fam-1',
  cluster: 'BB1',
  chosenChoiceId: 'C',
  isCorrect: false,
  firstAttempt: true,
  activityType: 'practice',
  occurredAt: '2026-07-27T12:00:00.000Z',
};

describe('recordPracticeAttempt', () => {
  it('writes the chosen distractor into attempt_results', async () => {
    const { pool, calls } = fakePool([]);
    await recordPracticeAttempt(pool, '22222222-2222-4222-8222-222222222222', ATTEMPT);
    const { sql, params } = calls[0]!;
    expect(sql).toContain('insert into attempt_results');
    expect(sql).toContain('chosen_choice_id');
    // The whole point of the row: which wrong answer, bound as a parameter.
    expect(params).toContain('C');
    expect(params).toContain(ATTEMPT.questionId);
    expect(params).toContain(ATTEMPT.kcId);
  });

  it('is idempotent per learner and item so a resubmit cannot double-count', async () => {
    const { pool, calls } = fakePool([]);
    await recordPracticeAttempt(pool, '22222222-2222-4222-8222-222222222222', ATTEMPT);
    const { sql } = calls[0]!;
    expect(sql).toContain('on conflict (learner_id, question_id)');
    expect(sql).toContain("where activity_type = 'practice' and first_attempt");
    expect(sql).toContain('do nothing');
  });
});

describe('listPracticeAttempts', () => {
  it('reads only practice rows, newest first, and never an answer column', async () => {
    const { pool, calls } = fakePool([
      {
        question_id: 'q1',
        kc_id: 'V3-KC-1',
        skill: 'EXPLAIN',
        item_family_id: 'fam-1',
        cluster: 'BB1',
        chosen_choice_id: 'C',
        is_correct: false,
        first_attempt: true,
        activity_type: 'practice',
        occurred_at: new Date('2026-07-27T12:00:00.000Z'),
      },
    ]);
    const rows = await listPracticeAttempts(pool, ATTEMPT.learnerId, { limit: 50 });
    const { sql } = calls[0]!;
    expect(sql).toContain("activity_type = 'practice'");
    expect(sql).toContain('order by occurred_at desc');
    expect(sql).not.toContain('correct_answer');
    expect(sql).not.toContain('explanations');
    expect(rows[0]!.chosenChoiceId).toBe('C');
    expect(rows[0]!.occurredAt).toBe('2026-07-27T12:00:00.000Z');
  });
});

describe('PostgresPracticeBankPort attempt log', () => {
  it('round-trips a logged attempt through the port', async () => {
    const { pool } = fakePool([
      {
        question_id: 'q1',
        kc_id: 'V3-KC-1',
        skill: 'EXPLAIN',
        item_family_id: 'fam-1',
        cluster: 'BB1',
        chosen_choice_id: 'B',
        is_correct: false,
        first_attempt: true,
        activity_type: 'practice',
        occurred_at: '2026-07-27T12:00:00.000Z',
      },
    ]);
    const port = new PostgresPracticeBankPort(pool);
    const entries = await port.listPracticeAttempts(ATTEMPT.learnerId, { limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.chosenChoiceId).toBe('B');
    expect(entries[0]!.skill).toBe('EXPLAIN');
    expect(entries[0]!.cluster).toBe('BB1');
    expect(entries[0]!.correct).toBe(false);
  });

  it('degrades to an in-memory log when migration 0010 has not been applied', async () => {
    const { pool, calls } = fakePool([], { attemptLog: false });
    const port = new PostgresPracticeBankPort(pool);
    await port.recordPracticeAttempt(ATTEMPT.learnerId, {
      questionId: 'q1',
      kcId: 'V3-KC-1',
      skill: 'EXPLAIN',
      cluster: 'BB1',
      familyId: 'fam-1',
      chosenChoiceId: 'B',
      correct: false,
      firstAttempt: true,
      activityType: 'practice',
      occurredAt: '2026-07-27T12:00:00.000Z' as never,
    });
    // No insert was attempted, and the miss is still readable back.
    expect(calls.some((c) => c.sql.includes('insert into attempt_results'))).toBe(false);
    const entries = await port.listPracticeAttempts(ATTEMPT.learnerId, { limit: 10 });
    expect(entries.map((e) => e.chosenChoiceId)).toEqual(['B']);
  });
});
