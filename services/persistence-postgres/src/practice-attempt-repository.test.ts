import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { listPracticeAttempts, recordPracticeAttempt } from './practice-attempt-repository';
import { PostgresPracticeBankPort } from './practice-exposure-repository';

interface Captured {
  sql: string;
  params: unknown[] | undefined;
}

/**
 * `attemptLog: 'none'` simulates a database with neither migration; `'column-only'`
 * simulates one sitting at 0010, which has the column the insert writes but not
 * the widened index the insert names as its conflict arbiter.
 */
function fakePool(
  rows: unknown[],
  { attemptLog = 'both' }: { attemptLog?: 'both' | 'column-only' | 'none' } = {},
): { pool: Pool; calls: Captured[] } {
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
      if (sql.includes('chosen_choice_id') && sql.includes('pg_indexes')) {
        return {
          rows: [
            {
              has_column: attemptLog !== 'none',
              has_index: attemptLog === 'both',
              // 0014's timing columns land with the full attempt-log schema.
              has_timing: attemptLog === 'both',
            },
          ],
          rowCount: 1,
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

  /**
   * Widened from `(learner_id, question_id)`: study attempts now share this table,
   * and the two corpora do not share a QUESTION-id space, so the activity type has to
   * be part of the key or one surface's row would suppress the other's. Their KC ids
   * are shared (one 422-KC set) and deliberately group across surfaces.
   */
  it('is idempotent per learner, activity type and item so a resubmit cannot double-count', async () => {
    const { pool, calls } = fakePool([]);
    await recordPracticeAttempt(pool, '22222222-2222-4222-8222-222222222222', ATTEMPT);
    const { sql } = calls[0]!;
    expect(sql).toContain('on conflict (learner_id, activity_type, question_id)');
    expect(sql).toContain("where activity_type in ('practice', 'study') and first_attempt");
    expect(sql).toContain('do nothing');
  });

  it('writes a study attempt through the same statement, tagged as study', async () => {
    const { pool, calls } = fakePool([]);
    await recordPracticeAttempt(pool, '22222222-2222-4222-8222-222222222222', {
      ...ATTEMPT,
      questionId: 'q-enz-indep-competitive',
      activityType: 'study',
    });
    const { sql, params } = calls[0]!;
    expect(sql).toContain('insert into attempt_results');
    expect(params).toContain('study');
    // Same shape as practice: no separate table, no separate column set.
    expect(sql).not.toContain('study_');
  });

  it('binds the captured diagnose-before-reveal timing (WS0)', async () => {
    const { pool, calls } = fakePool([]);
    await recordPracticeAttempt(pool, '22222222-2222-4222-8222-222222222222', {
      ...ATTEMPT,
      elapsedMs: 8_400,
      answerChanges: 2,
    });
    const { sql, params } = calls[0]!;
    expect(sql).toContain('elapsed_ms');
    expect(sql).toContain('answer_changes');
    expect(params).toContain(8_400);
    expect(params).toContain(2);
  });

  it('stores absent timing as NULL rather than a false zero', async () => {
    const { pool, calls } = fakePool([]);
    // ATTEMPT carries no timing — a surface that did not measure it.
    await recordPracticeAttempt(pool, '22222222-2222-4222-8222-222222222222', ATTEMPT);
    const { params } = calls[0]!;
    // The last two bound params are elapsed_ms, answer_changes: both NULL, not 0.
    expect(params?.slice(-2)).toEqual([null, null]);
  });
});

describe('listPracticeAttempts', () => {
  it('reads practice and study rows, newest first, and never an answer column', async () => {
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
        elapsed_ms: 12_000,
        answer_changes: 1,
      },
    ]);
    const rows = await listPracticeAttempts(pool, ATTEMPT.learnerId, { limit: 50 });
    const { sql, params } = calls[0]!;
    // Both question surfaces are displayed; anything else (a recall lapse, an
    // in-lesson check) is excluded by the filter rather than by hoping nothing
    // else is ever written here.
    expect(sql).toContain('activity_type = any($2)');
    expect(params?.[1]).toEqual(['practice', 'study']);
    expect(sql).toContain('order by occurred_at desc');
    expect(sql).toContain('elapsed_ms');
    expect(sql).toContain('answer_changes');
    expect(sql).not.toContain('correct_answer');
    expect(sql).not.toContain('explanations');
    expect(rows[0]!.chosenChoiceId).toBe('C');
    expect(rows[0]!.occurredAt).toBe('2026-07-27T12:00:00.000Z');
    expect(rows[0]!.elapsedMs).toBe(12_000);
    expect(rows[0]!.answerChanges).toBe(1);
  });

  it('reads a legacy row with no timing columns as NULL timing', async () => {
    const { pool } = fakePool([
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
        occurred_at: '2026-07-27T12:00:00.000Z',
        elapsed_ms: null,
        answer_changes: null,
      },
    ]);
    const rows = await listPracticeAttempts(pool, ATTEMPT.learnerId, { limit: 50 });
    expect(rows[0]!.elapsedMs).toBeNull();
    expect(rows[0]!.answerChanges).toBeNull();
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

  it('carries the activity type back out instead of defaulting it to practice', async () => {
    const { pool } = fakePool([
      {
        question_id: 'q-enz-indep-competitive',
        kc_id: 'bb1-enzyme-inhibition',
        skill: 'EXPLAIN',
        item_family_id: null,
        cluster: 'BB1',
        chosen_choice_id: 'B',
        is_correct: false,
        first_attempt: true,
        activity_type: 'study',
        occurred_at: '2026-07-27T12:00:00.000Z',
      },
    ]);
    const port = new PostgresPracticeBankPort(pool);
    const entries = await port.listPracticeAttempts(ATTEMPT.learnerId, { limit: 10 });
    // The reader dispatches hydration on this field: a study row's content lives
    // in the authored lesson bank, not in the deployed practice corpus, so
    // mislabelling it would leave the entry unrenderable.
    expect(entries[0]!.activityType).toBe('study');
  });

  it('degrades to an in-memory log when the attempt-log migrations are absent', async () => {
    const { pool, calls } = fakePool([], { attemptLog: 'none' });
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

  /**
   * The dangerous middle state: 0010's column exists, so a column-only probe would
   * say yes, and then every insert would fail on an ON CONFLICT target Postgres
   * cannot infer. Degrading is the safe read of a half-migrated database.
   */
  it('degrades on a database sitting at 0010, whose conflict arbiter does not exist yet', async () => {
    const { pool, calls } = fakePool([], { attemptLog: 'column-only' });
    const port = new PostgresPracticeBankPort(pool);
    await port.recordPracticeAttempt(ATTEMPT.learnerId, {
      questionId: 'q-enz-indep-competitive',
      kcId: 'bb1-enzyme-inhibition',
      skill: 'EXPLAIN',
      cluster: 'BB1',
      familyId: null,
      chosenChoiceId: 'B',
      correct: false,
      firstAttempt: true,
      activityType: 'study',
      occurredAt: '2026-07-27T12:00:00.000Z' as never,
    });
    expect(calls.some((c) => c.sql.includes('insert into attempt_results'))).toBe(false);
    const entries = await port.listPracticeAttempts(ATTEMPT.learnerId, { limit: 10 });
    expect(entries.map((e) => e.activityType)).toEqual(['study']);
  });

  it('keeps the in-memory fallback keyed by activity type, not by item alone', async () => {
    const { pool } = fakePool([], { attemptLog: 'none' });
    const port = new PostgresPracticeBankPort(pool);
    const base = {
      questionId: 'shared-id',
      kcId: 'bb1-enzyme-inhibition',
      skill: 'EXPLAIN' as const,
      cluster: 'BB1' as const,
      familyId: null,
      chosenChoiceId: 'B' as const,
      correct: false,
      firstAttempt: true,
      occurredAt: '2026-07-27T12:00:00.000Z' as never,
    };
    await port.recordPracticeAttempt(ATTEMPT.learnerId, { ...base, activityType: 'study' });
    await port.recordPracticeAttempt(ATTEMPT.learnerId, { ...base, activityType: 'practice' });
    await port.recordPracticeAttempt(ATTEMPT.learnerId, { ...base, activityType: 'study' });
    const entries = await port.listPracticeAttempts(ATTEMPT.learnerId, { limit: 10 });
    // Two distinct misses; the third call is the duplicate.
    expect(entries.map((e) => e.activityType).sort()).toEqual(['practice', 'study']);
  });
});
