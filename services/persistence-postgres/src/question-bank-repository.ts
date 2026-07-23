import type { Pool } from 'pg';

/**
 * Administrative inventory reads for the imported v7 rows from migration 0006.
 *
 * These rows exclude answer material, but they include routing, family, skill,
 * DOK, status, and source-adjacent metadata. They are NOT learner DTOs and are
 * NOT a production selector. Production presentation must go through
 * `authorizeQuestionPresentation` in `question-serving-repository.ts`.
 */

/** Administrative allowlist. Deliberately excludes protected answer material. */
export const ADMINISTRATIVE_QUESTION_COLUMNS = [
  'question_id',
  'content_release',
  'section',
  'cluster',
  'kc_id',
  'lesson_id',
  'family_id',
  'subject',
  'primary_skill',
  'dok_level',
  'stem',
  'passage',
  'choices',
  'assets',
  'status',
  'created_at',
] as const;

const ADMINISTRATIVE_SELECT = `select ${ADMINISTRATIVE_QUESTION_COLUMNS.join(', ')} from questions`;

export interface AdministrativeQuestionRow {
  question_id: string;
  content_release: string;
  section: string;
  cluster: string | null;
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
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

export async function getAdministrativeQuestion(
  pool: Pool,
  questionId: string,
): Promise<AdministrativeQuestionRow | null> {
  const { rows } = await pool.query(`${ADMINISTRATIVE_SELECT} where question_id = $1`, [
    questionId,
  ]);
  return (rows[0] as AdministrativeQuestionRow | undefined) ?? null;
}

export async function listAdministrativeQuestions(
  pool: Pool,
  filter: QuestionListFilter = {},
): Promise<AdministrativeQuestionRow[]> {
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
    `${ADMINISTRATIVE_SELECT}${where} order by question_id limit $${values.length}`,
    values,
  );
  return rows as AdministrativeQuestionRow[];
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
 * @deprecated Administrative alias retained for compatibility. This is not a
 * production learner DTO; use `getAdministrativeQuestion`.
 */
export const getLearnerSafeQuestion = getAdministrativeQuestion;

/**
 * @deprecated Administrative alias retained for compatibility. This is not a
 * production selector or learner DTO; use `listAdministrativeQuestions`.
 */
export const listLearnerSafeQuestions = listAdministrativeQuestions;

/** @deprecated Use `ADMINISTRATIVE_QUESTION_COLUMNS`. */
export const LEARNER_SAFE_COLUMNS = ADMINISTRATIVE_QUESTION_COLUMNS;
/** @deprecated Use `AdministrativeQuestionRow`. */
export type LearnerSafeQuestion = AdministrativeQuestionRow;
