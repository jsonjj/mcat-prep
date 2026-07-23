import {
  VersionBoundProtectedAnswerWireSchema,
  type VersionBoundProtectedAnswerWire,
} from '@mcat/contracts/server/question-serving-protected';
import type { Pool } from 'pg';

/**
 * SERVER-ONLY. This query is deliberately isolated from administrative and
 * learner-serving modules. It binds the authorized presentation to both parts
 * of the immutable (question_id, item_version) key and fails closed after any
 * invalidation/quarantine record.
 */
export const VERSION_BOUND_PROTECTED_ANSWER_SQL = `
select
  p.presentation_id,
  p.learner_id,
  p.question_id,
  p.item_version,
  a.answer_version,
  a.answer_hash,
  a.correct_answer,
  a.explanations,
  p.exposure_mode,
  p.authorized_at
from question_presentations p
join question_protected_versions a
  on a.question_id = p.question_id
 and a.item_version = p.item_version
where p.presentation_id = $1::uuid
  and p.learner_id = $2::uuid
  and not exists (
    select 1
    from question_version_invalidations i
    where i.question_id = p.question_id
      and i.item_version = p.item_version
  )`;

interface VersionBoundAnswerRow {
  readonly presentation_id: string;
  readonly learner_id: string;
  readonly question_id: string;
  readonly item_version: number;
  readonly answer_version: number;
  readonly answer_hash: string;
  readonly correct_answer: string;
  readonly explanations: unknown;
  readonly exposure_mode: string;
  readonly authorized_at: Date | string;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export async function getVersionBoundProtectedAnswer(
  pool: Pool,
  presentationId: string,
  learnerId: string,
): Promise<VersionBoundProtectedAnswerWire | null> {
  const result = await pool.query<VersionBoundAnswerRow>(VERSION_BOUND_PROTECTED_ANSWER_SQL, [
    presentationId,
    learnerId,
  ]);
  const row = result.rows[0];
  if (row === undefined) return null;
  return VersionBoundProtectedAnswerWireSchema.parse({
    ...row,
    authorized_at: iso(row.authorized_at),
  });
}

/**
 * SERVER-ONLY LEGACY ADMINISTRATIVE ACCESSOR.
 *
 * This unversioned migration-0006 primitive is retained only for corpus
 * inspection/backfill tooling. It is prohibited for production scoring.
 */
export interface LegacyAdministrativeQuestionAnswer {
  readonly question_id: string;
  readonly correct_answer: 'A' | 'B' | 'C' | 'D';
  readonly explanations: Record<string, string>;
}

export async function getLegacyAdministrativeQuestionAnswer(
  pool: Pool,
  questionId: string,
): Promise<LegacyAdministrativeQuestionAnswer | null> {
  const result = await pool.query<LegacyAdministrativeQuestionAnswer>(
    `select question_id, correct_answer, explanations
     from question_protected
     where question_id = $1`,
    [questionId],
  );
  return result.rows[0] ?? null;
}

/** @deprecated Backfill/inspection only; never use for scoring. */
export const getQuestionAnswer = getLegacyAdministrativeQuestionAnswer;
