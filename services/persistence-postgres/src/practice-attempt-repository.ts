/**
 * Per-learner practice attempt log (see database/migrations/0010_practice_attempt_log.sql).
 *
 * This is the read path for the chosen distractor. Before 0010 the practice
 * engine knew which wrong answer a learner picked and stored it only inside an
 * `accepted_events` JSONB payload that nothing read, so the Mistakes tab could
 * not see a single adaptive-practice miss.
 *
 * Rows are written for BOTH correct and incorrect first attempts: the pattern
 * section needs the denominator ("4 of 6 items in this KC"), and a bare count of
 * misses cannot produce one (docs/design/error-handling-design.md §6.5).
 *
 * Sits alongside `practice-exposure-repository.ts` and takes the same structural
 * `Queryable`, so writes can join the authority transaction and reads can run
 * straight off the pool.
 */
import type { Queryable } from './mastery-repository';

/** One first-attempt row. `activityType` is the recording scope, not the display scope. */
export interface PracticeAttemptLogRow {
  readonly learnerId: string;
  readonly questionId: string;
  readonly kcId: string | null;
  readonly skill: string | null;
  readonly familyId: string | null;
  readonly cluster: string | null;
  readonly chosenChoiceId: string | null;
  readonly isCorrect: boolean;
  readonly firstAttempt: boolean;
  readonly activityType: string;
  readonly occurredAt: string;
}

interface RawAttemptRow extends Record<string, unknown> {
  question_id: string;
  kc_id: string | null;
  skill: string | null;
  item_family_id: string | null;
  cluster: string | null;
  chosen_choice_id: string | null;
  is_correct: boolean;
  first_attempt: boolean | null;
  activity_type: string | null;
  occurred_at: string | Date;
}

const iso = (value: string | Date): string =>
  typeof value === 'string' ? value : value.toISOString();

const toRow = (learnerId: string, raw: RawAttemptRow): PracticeAttemptLogRow => ({
  learnerId,
  questionId: raw.question_id,
  kcId: raw.kc_id,
  skill: raw.skill,
  familyId: raw.item_family_id,
  cluster: raw.cluster,
  chosenChoiceId: raw.chosen_choice_id,
  isCorrect: raw.is_correct,
  firstAttempt: raw.first_attempt ?? true,
  activityType: raw.activity_type ?? 'practice',
  occurredAt: iso(raw.occurred_at),
});

/**
 * Whether migration 0010 has been applied. Callers degrade to an in-memory log
 * when it has not (a content-only dev database has `questions` but no authority
 * tables), so the dev server and tests never require Postgres.
 */
export async function hasPracticeAttemptLog(q: Queryable): Promise<boolean> {
  const { rows } = await q.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'attempt_results'
        and column_name = 'chosen_choice_id' limit 1`,
  );
  return rows.length > 0;
}

/**
 * Append one first-attempt row. Idempotent per learner × item via the partial
 * unique index, so a retried submit cannot double-count a miss.
 */
export async function recordPracticeAttempt(
  q: Queryable,
  attemptResultId: string,
  row: PracticeAttemptLogRow,
): Promise<void> {
  await q.query(
    `insert into attempt_results (
       attempt_result_id, learner_id, question_id, kc_id, skill, item_family_id,
       cluster, chosen_choice_id, is_correct, first_attempt,
       activity_type, assistance_level, eligible_for_mastery, occurred_at, recorded_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'A0', $10, $12, $12)
     on conflict (learner_id, question_id)
       where activity_type = 'practice' and first_attempt
       do nothing`,
    [
      attemptResultId,
      row.learnerId,
      row.questionId,
      row.kcId,
      row.skill,
      row.familyId,
      row.cluster,
      row.chosenChoiceId,
      row.isCorrect,
      row.firstAttempt,
      row.activityType,
      row.occurredAt,
    ],
  );
}

/** A learner's practice attempts, newest first. */
export async function listPracticeAttempts(
  q: Queryable,
  learnerId: string,
  { limit }: { limit: number },
): Promise<PracticeAttemptLogRow[]> {
  const { rows } = await q.query<RawAttemptRow>(
    `select question_id, kc_id, skill, item_family_id, cluster,
            chosen_choice_id, is_correct, first_attempt, activity_type, occurred_at
       from attempt_results
      where learner_id = $1 and activity_type = 'practice' and occurred_at is not null
      order by occurred_at desc
      limit $2`,
    [learnerId, Math.min(Math.max(limit, 1), 2000)],
  );
  return rows.map((raw) => toRow(learnerId, raw));
}
