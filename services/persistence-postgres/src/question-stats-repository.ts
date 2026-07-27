/**
 * Population item statistics for IRT difficulty `b` (see
 * database/migrations/0007_mastery.sql). Aggregate across all learners; not
 * per-user and not learner-safe-sensitive (counts only, no answer content).
 */
import type { Queryable } from './mastery-repository';

export interface QuestionStat {
  attempts: number;
  correct: number;
}

interface RawStatRow extends Record<string, unknown> {
  attempts: number;
  correct: number;
}

/**
 * Record one scored attempt on a question and return the running totals. Upsert
 * so the first attempt creates the row. `correctDelta` is 1 for a correct answer,
 * 0 otherwise.
 */
export async function recordQuestionAttempt(
  q: Queryable,
  questionId: string,
  correct: boolean,
  updatedAt: string,
): Promise<QuestionStat> {
  const { rows } = await q.query<RawStatRow>(
    `insert into question_stats (question_id, attempts, correct, updated_at)
     values ($1, 1, $2, $3)
     on conflict (question_id) do update set
       attempts = question_stats.attempts + 1,
       correct = question_stats.correct + excluded.correct,
       updated_at = excluded.updated_at
     returning attempts, correct`,
    [questionId, correct ? 1 : 0, updatedAt],
  );
  const row = rows[0];
  return { attempts: Number(row?.attempts ?? 0), correct: Number(row?.correct ?? 0) };
}

export async function getQuestionStat(q: Queryable, questionId: string): Promise<QuestionStat | null> {
  const { rows } = await q.query<RawStatRow>(
    'select attempts, correct from question_stats where question_id = $1',
    [questionId],
  );
  const row = rows[0];
  return row ? { attempts: Number(row.attempts), correct: Number(row.correct) } : null;
}
