/**
 * Per-learner question attempt log (migrations 0010 and 0011).
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
 * Both displayed activity types live here. `practice` and `study` are genuine
 * question attempts and both reach the Mistakes tab; recall lapses and in-lesson
 * comprehension checks are never written at all, which is where §6.5's exclusion
 * is actually enforced.
 *
 * Sits alongside `practice-exposure-repository.ts` and takes the same structural
 * `Queryable`, so writes can join the authority transaction and reads can run
 * straight off the pool.
 */
import type { Queryable } from './mastery-repository';

/** Activity types the Mistakes surfaces display; see §6.5. */
export const DISPLAYED_ACTIVITY_TYPES = ['practice', 'study'] as const;

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
 * Whether the attempt log is queryable — 0010's `chosen_choice_id` column AND
 * 0011's widened arbiter index, which the insert below infers by name-equivalent
 * predicate. Both are probed because a database sitting at 0010 would accept the
 * column check and then reject the `on conflict` target; callers degrade to an
 * in-memory log when either is missing (a content-only dev database has
 * `questions` but no authority tables), so the dev server and tests never
 * require Postgres.
 */
export async function hasPracticeAttemptLog(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ has_column: boolean; has_index: boolean }>(
    `select
       exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'attempt_results'
            and column_name = 'chosen_choice_id'
       ) as has_column,
       exists (
         select 1 from pg_indexes
          where schemaname = 'public'
            and indexname = 'attempt_results_question_first_attempt_uidx'
       ) as has_index`,
  );
  const row = rows[0];
  return row !== undefined && row.has_column === true && row.has_index === true;
}

/**
 * Append one first-attempt row. Idempotent per learner × activity type × item via
 * the partial unique index, so a retried submit cannot double-count a miss. The
 * activity type is part of the key because practice and study draw QUESTION ids from
 * different corpora and a shared item-id space is not guaranteed forever.
 *
 * `kc_id` is not like that: both surfaces log from the one 422-KC set the lesson
 * graph and the corpus share, which is what lets a study miss and a practice miss on
 * a concept group into a single pattern.
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
     on conflict (learner_id, activity_type, question_id)
       where activity_type in ('practice', 'study') and first_attempt
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

/**
 * A learner's displayed question attempts, newest first.
 *
 * Practice AND study: both are genuine question attempts, so both belong on the
 * Mistakes tab (§6.5). Any other `activity_type` — a recall lapse or an in-lesson
 * check, were one ever recorded here — is filtered out rather than displayed.
 */
export async function listPracticeAttempts(
  q: Queryable,
  learnerId: string,
  { limit }: { limit: number },
): Promise<PracticeAttemptLogRow[]> {
  const { rows } = await q.query<RawAttemptRow>(
    `select question_id, kc_id, skill, item_family_id, cluster,
            chosen_choice_id, is_correct, first_attempt, activity_type, occurred_at
       from attempt_results
      where learner_id = $1 and activity_type = any($2) and occurred_at is not null
      order by occurred_at desc
      limit $3`,
    [learnerId, [...DISPLAYED_ACTIVITY_TYPES], Math.min(Math.max(limit, 1), 2000)],
  );
  return rows.map((raw) => toRow(learnerId, raw));
}
