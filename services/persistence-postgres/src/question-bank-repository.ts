import type { Pool } from 'pg';

/**
 * Read seam for the v7 question bank (see database/migrations/0006_question_bank.sql).
 *
 * Two strictly separated paths:
 *  - LEARNER-SAFE reads select an explicit column ALLOWLIST from `questions`.
 *    The answer key + explanations are physically in a different table
 *    (`question_protected`) and are never named here — a learner-safe read
 *    cannot return them even by mistake.
 *  - The SERVER-ONLY answer accessor reads `question_protected` and must only be
 *    used by the scoring authority — never returned to a learner surface.
 */

/** Learner-safe columns. Deliberately excludes correct_answer + explanations. */
export const LEARNER_SAFE_COLUMNS = [
  'question_id',
  'content_release',
  'section',
  'cluster',
  'kc_id',
  'lesson_id',
  'family_id',
  'subject',
  'primary_skill',
  'reasoning_operation',
  'dok_level',
  'stem',
  'passage',
  'choices',
  'assets',
  'status',
  'created_at',
] as const;

const SAFE_SELECT = `select ${LEARNER_SAFE_COLUMNS.join(', ')} from questions`;

export interface LearnerSafeQuestion {
  question_id: string;
  content_release: string;
  section: string;
  cluster: string | null;
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
  reasoning_operation: string | null;
  dok_level: number | null;
  stem: string;
  passage: string;
  choices: Record<string, string>;
  assets: unknown[];
  status: string | null;
  created_at: Date;
}

export interface QuestionListFilter {
  section?: string;
  cluster?: string;
  limit?: number;
}

export async function getLearnerSafeQuestion(
  pool: Pool,
  questionId: string,
): Promise<LearnerSafeQuestion | null> {
  const { rows } = await pool.query(`${SAFE_SELECT} where question_id = $1`, [questionId]);
  return (rows[0] as LearnerSafeQuestion | undefined) ?? null;
}

export async function listLearnerSafeQuestions(
  pool: Pool,
  filter: QuestionListFilter = {},
): Promise<LearnerSafeQuestion[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter.section !== undefined) {
    values.push(filter.section);
    conditions.push(`section = $${values.length}`);
  }
  if (filter.cluster !== undefined) {
    values.push(filter.cluster);
    conditions.push(`cluster = $${values.length}`);
  }
  const where = conditions.length > 0 ? ` where ${conditions.join(' and ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  values.push(limit);
  const { rows } = await pool.query(
    `${SAFE_SELECT}${where} order by question_id limit $${values.length}`,
    values,
  );
  return rows as LearnerSafeQuestion[];
}

export async function countQuestions(pool: Pool): Promise<number> {
  const { rows } = await pool.query('select count(*)::int as n from questions');
  return Number((rows[0] as { n: number } | undefined)?.n ?? 0);
}

export async function countQuestionsBySection(pool: Pool): Promise<Record<string, number>> {
  const { rows } = await pool.query(
    'select section, count(*)::int as n from questions group by section order by section',
  );
  const out: Record<string, number> = {};
  for (const row of rows as { section: string; n: number }[]) out[row.section] = Number(row.n);
  return out;
}

/**
 * SERVER-ONLY. The answer key + per-choice explanations for scoring. NEVER call
 * this on a learner-safe surface and NEVER return the result to the browser.
 */
export interface QuestionAnswer {
  question_id: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanations: Record<string, string>;
}

export async function getQuestionAnswer(pool: Pool, questionId: string): Promise<QuestionAnswer | null> {
  const { rows } = await pool.query(
    'select question_id, correct_answer, explanations from question_protected where question_id = $1',
    [questionId],
  );
  return (rows[0] as QuestionAnswer | undefined) ?? null;
}
