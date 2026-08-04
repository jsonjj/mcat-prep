import type { Pool } from 'pg';
import type { AuthoredQuestionBankRows } from '@mcat/content';
import type { Queryable } from './mastery-repository';

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

/** Status values that mark an item held out from delivery (never served). */
const HELD_OUT_STATUSES = ['held_out', 'holdout', 'retired', 'archived', 'draft', 'rejected'];

/** DOK → cold-start difficulty `b`, mirroring @mcat/policies `coldStartB` in SQL. */
const DOK_COLD_START_SQL = `case q.dok_level
    when 1 then -1.0 when 2 then -0.3 when 3 then 0.4 when 4 then 1.0
    when 5 then 1.4 when 6 then 1.4 else 0 end`;

export interface PracticeItemFilter {
  /** Science KC id (matched against `kc_id`). */
  kcId?: string | null;
  /** Science 7-op reasoning axis (matched against `reasoning_operation`). */
  reasoningOp?: string | null;
  /** CARS sub-skill (matched against `primary_skill` = CARS_FOC / CARS_RWT / CARS_RBT). */
  primarySkill?: string | null;
  section?: string | null;
  /** Target difficulty band [lo, hi] in IRT `b`; items are ranked by |b − centre|. */
  bBand: readonly [number, number];
  excludeIds?: readonly string[];
  limit: number;
  /**
   * Whether the `questions.reasoning_operation` column exists. When false (e.g. a
   * content-only DB where migration 0008 hasn't been applied) the column is neither
   * selected nor filtered, and the caller derives the operation from `primary_skill`.
   * Defaults to true (the deployed/full schema).
   */
  hasReasoningOp?: boolean;
  /**
   * Whether the `question_stats` table exists. When false, difficulty is the DOK
   * cold-start only (no calibration join). Defaults to true.
   */
  hasQuestionStats?: boolean;
}

export interface PracticePoolItem extends LearnerSafeQuestion {
  attempts: number;
  correct: number;
  /** Calibrated IRT `b` once the item clears the attempts floor, else DOK cold-start. */
  b: number;
}

/**
 * Learner-safe candidate items for one practice spec. Difficulty `b` is joined
 * from `question_stats` (calibrated once an item clears 20 attempts) and falls
 * back to the DOK cold-start otherwise; held-out items (by `status`) are never
 * returned. Ranked by proximity to the band centre, then least battle-tested,
 * then id for determinism. Answer columns are never selected (learner-safe).
 */
export async function findPracticeItems(
  pool: Pool,
  filter: PracticeItemFilter,
): Promise<PracticePoolItem[]> {
  const hasOp = filter.hasReasoningOp !== false;
  const hasStats = filter.hasQuestionStats !== false;
  const target = (filter.bBand[0] + filter.bBand[1]) / 2;
  const columns = (
    hasOp ? LEARNER_SAFE_COLUMNS : LEARNER_SAFE_COLUMNS.filter((c) => c !== 'reasoning_operation')
  )
    .map((c) => `q.${c}`)
    .join(', ');
  const conditions: string[] = [
    `(q.status is null or q.status not in (${HELD_OUT_STATUSES.map((_, i) => `$${i + 1}`).join(', ')}))`,
  ];
  const values: unknown[] = [...HELD_OUT_STATUSES];
  const add = (clause: (placeholder: string) => string, value: unknown): void => {
    values.push(value);
    conditions.push(clause(`$${values.length}`));
  };
  const present = (value: string | null | undefined): value is string =>
    value !== null && value !== undefined;
  if (present(filter.kcId)) add((p) => `q.kc_id = ${p}`, filter.kcId);
  // Only filter on the reasoning-operation column when it exists; otherwise the
  // caller derives (and, if needed, post-filters) the operation from primary_skill.
  if (hasOp && present(filter.reasoningOp)) {
    add((p) => `q.reasoning_operation = ${p}`, filter.reasoningOp);
  }
  if (present(filter.primarySkill)) add((p) => `q.primary_skill = ${p}`, filter.primarySkill);
  if (present(filter.section)) add((p) => `q.section = ${p}`, filter.section);
  add((p) => `not (q.question_id = any(${p}::text[]))`, [...(filter.excludeIds ?? [])]);

  const targetIndex = values.push(target);
  const limitIndex = values.push(Math.min(Math.max(filter.limit, 1), 50));

  const statsSelect = hasStats
    ? `coalesce(qs.attempts, 0)::int as attempts, coalesce(qs.correct, 0)::int as correct,`
    : `0::int as attempts, 0::int as correct,`;
  const bExpr = hasStats
    ? `case
         when coalesce(qs.attempts, 0) > 20 and qs.correct > 0 and qs.correct < qs.attempts
           then ln((qs.attempts - qs.correct)::float8 / qs.correct::float8)
         else ${DOK_COLD_START_SQL}
       end`
    : DOK_COLD_START_SQL;
  const join = hasStats ? `left join question_stats qs on qs.question_id = q.question_id` : '';

  const { rows } = await pool.query(
    `select * from (
       select ${columns},
         ${statsSelect}
         ${bExpr} as b
       from questions q
       ${join}
       where ${conditions.join(' and ')}
     ) t
     order by abs(t.b - $${targetIndex}) asc, t.attempts asc, t.question_id asc
     limit $${limitIndex}`,
    values,
  );
  return rows as PracticePoolItem[];
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
 * One diagnostic-eligible question, learner-safe fields plus its SERVER-ONLY key.
 *
 * The row the placement diagnostic's bank is built from. Structurally the same
 * shape `@mcat/corpus-pull` produces for the local pull, so the diagnostic
 * runner maps both through the SAME `diagnosticItemsFromRows`. The key +
 * explanations are selected here for SERVER-SIDE scoring only and must never be
 * returned to a learner surface.
 */
export interface DiagnosticBankRow {
  question_id: string;
  section: string;
  cluster: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
  dok_level: number | null;
  stem: string;
  passage: string | null;
  choices: { A?: string; B?: string; C?: string; D?: string } | null;
  status: string | null;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanations: Record<string, string>;
}

/**
 * SERVER-ONLY. Every diagnostic-eligible question (production_candidate /
 * published) joined to its answer key, for building the diagnostic bank at
 * cold start. INNER JOIN on `question_protected`, so an item with no key is
 * never returned (it could not be scored). NEVER return these rows to the
 * browser — only the runner's learner-safe projection may cross that boundary.
 */
export async function listDiagnosticBankRows(pool: Pool): Promise<DiagnosticBankRow[]> {
  const { rows } = await pool.query(
    `select
       q.question_id, q.section, q.cluster, q.lesson_id, q.family_id, q.subject,
       q.primary_skill, q.dok_level, q.stem, q.passage, q.choices, q.status,
       p.correct_answer, p.explanations
     from questions q
     join question_protected p on p.question_id = q.question_id
     where q.status in ('production_candidate', 'published')
     order by q.question_id`,
  );
  return rows as DiagnosticBankRow[];
}

/**
 * One practice-test-eligible question, learner-safe fields plus its SERVER-ONLY
 * key. The practice-test sibling of {@link DiagnosticBankRow}, with the one
 * addition the practice-test scorer needs over the diagnostic: `kc_id`, the
 * science mastery grain a miss is routed to for the repair queue. Structurally
 * matches `@mcat/practice-test-runner`'s `PracticeTestBankSourceRow`.
 */
export interface PracticeTestBankRow {
  question_id: string;
  section: string;
  cluster: string | null;
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
  dok_level: number | null;
  stem: string;
  passage: string | null;
  choices: Record<string, string> | null;
  status: string | null;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanations: Record<string, string>;
}

/**
 * SERVER-ONLY. Every practice-test-eligible question (production_candidate /
 * published) joined to its answer key, for building the practice-test bank at
 * cold start. Unlike the diagnostic — which reaches concepts through lessons and
 * so drops CARS — the practice test is a blueprint exam that INCLUDES CARS, so
 * this selects every section. INNER JOIN on `question_protected`, so an item with
 * no key is never returned (it could not be scored). NEVER return these rows to
 * the browser — only the runner's learner-safe projection may cross that boundary.
 */
export async function listPracticeTestBankRows(pool: Pool): Promise<PracticeTestBankRow[]> {
  const { rows } = await pool.query(
    `select
       q.question_id, q.section, q.cluster, q.kc_id, q.lesson_id, q.family_id, q.subject,
       q.primary_skill, q.dok_level, q.stem, q.passage, q.choices, q.status,
       p.correct_answer, p.explanations
     from questions q
     join question_protected p on p.question_id = q.question_id
     where q.status in ('production_candidate', 'published')
     order by q.question_id`,
  );
  return rows as PracticeTestBankRow[];
}

/**
 * SERVER-ONLY. The answer key + per-choice explanations for scoring. NEVER call
 * this on a learner-safe surface and NEVER return the result to the browser.
 */
export interface QuestionAnswer {
  question_id: string;
  correct_answer: 'A' | 'B' | 'C' | 'D';
  explanations: Record<string, string>;
  /**
   * Per-choice authored misconceptions (WS2). SERVER-ONLY, in the same protected
   * table as `explanations`. Nullable: the column (migration 0015) starts NULL
   * for rows loaded before the error-model re-publish, and older databases that
   * predate the column report it absent — both read as "no error models".
   */
  error_models: Record<string, string> | null;
}

export async function getQuestionAnswer(
  pool: Pool,
  questionId: string,
): Promise<QuestionAnswer | null> {
  const { rows } = await pool.query(
    // `error_models` is read column-agnostically. On a database that predates
    // migration 0015 the column does not exist, and naming it directly would make
    // this query throw for every scored attempt; `to_jsonb(question_protected) ->
    // 'error_models'` yields NULL when the key is absent and the authored map when
    // it is present, so getAnswer degrades to "no error models" instead of failing.
    `select question_id, correct_answer, explanations,
            to_jsonb(question_protected) -> 'error_models' as error_models
       from question_protected where question_id = $1`,
    [questionId],
  );
  const row = rows[0] as
    | {
        question_id: string;
        correct_answer: 'A' | 'B' | 'C' | 'D';
        explanations: Record<string, string>;
        error_models?: Record<string, string> | null;
      }
    | undefined;
  if (row === undefined) return null;
  return {
    question_id: row.question_id,
    correct_answer: row.correct_answer,
    explanations: row.explanations,
    error_models: row.error_models ?? null,
  };
}

// ---- Write seam (authored-question ingest) --------------------------------

/** `($1, $2, …)` value tuples, one per row, with optional per-column casts. */
function valueTuples(rowCount: number, columnsPerRow: number, casts: readonly string[]): string {
  const tuples: string[] = [];
  let n = 0;
  for (let r = 0; r < rowCount; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c < columnsPerRow; c += 1) {
      n += 1;
      cells.push(`$${n}${casts[c] ?? ''}`);
    }
    tuples.push(`(${cells.join(', ')})`);
  }
  return tuples.join(', ');
}

/**
 * Idempotently upsert authored questions into the split store, mirroring the
 * compiler's learner-safe / protected split:
 *   • `questions`          — learner-safe row (+ derived cluster/section, the
 *                            reasoning-operation axis from migration 0008).
 *   • `question_protected` — SERVER-ONLY key + explanations + `error_models`
 *                            (migration 0015).
 *
 * ADDITIVE: on conflict (question_id) each row is updated in place; questions not
 * named are untouched. `content_release` and `assets` keep their table defaults on
 * insert and are left untouched on update. Runs two statements — pass a
 * transaction client as `q` for atomicity (the ingest tool does). Returns the
 * number of questions written.
 *
 * NOTE: naming `error_models` requires migration 0015 to have been applied (as the
 * `content-cli db-seed` seed also assumes). Answer material is written ONLY to
 * `question_protected` and is never selected onto a learner-safe surface.
 */
export async function upsertQuestions(
  q: Queryable,
  rows: readonly AuthoredQuestionBankRows[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const questionParams: unknown[] = [];
  for (const { safe } of rows) {
    questionParams.push(
      safe.question_id,
      safe.section,
      safe.cluster,
      safe.kc_id,
      safe.lesson_id,
      safe.family_id,
      safe.subject,
      safe.primary_skill,
      safe.reasoning_operation,
      safe.dok_level,
      safe.stem,
      safe.passage,
      JSON.stringify(safe.choices),
      safe.status,
    );
  }
  await q.query(
    `insert into questions
       (question_id, section, cluster, kc_id, lesson_id, family_id, subject,
        primary_skill, reasoning_operation, dok_level, stem, passage, choices, status)
     values ${valueTuples(rows.length, 14, ['', '', '', '', '', '', '', '', '', '', '', '', '::jsonb', ''])}
     on conflict (question_id) do update set
       section = excluded.section,
       cluster = excluded.cluster,
       kc_id = excluded.kc_id,
       lesson_id = excluded.lesson_id,
       family_id = excluded.family_id,
       subject = excluded.subject,
       primary_skill = excluded.primary_skill,
       reasoning_operation = excluded.reasoning_operation,
       dok_level = excluded.dok_level,
       stem = excluded.stem,
       passage = excluded.passage,
       choices = excluded.choices,
       status = excluded.status`,
    questionParams,
  );

  const protectedParams: unknown[] = [];
  for (const { protected: prot } of rows) {
    protectedParams.push(
      prot.question_id,
      prot.correct_answer,
      JSON.stringify(prot.explanations),
      prot.error_models === null ? null : JSON.stringify(prot.error_models),
    );
  }
  await q.query(
    `insert into question_protected (question_id, correct_answer, explanations, error_models)
     values ${valueTuples(rows.length, 4, ['', '', '::jsonb', '::jsonb'])}
     on conflict (question_id) do update set
       correct_answer = excluded.correct_answer,
       explanations = excluded.explanations,
       error_models = excluded.error_models`,
    protectedParams,
  );

  return rows.length;
}
