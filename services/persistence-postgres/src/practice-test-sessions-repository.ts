/**
 * Periodic practice-test in-flight session persistence (migration 0022).
 *
 * The `practice_test_sessions` table is the deployed backing store for the scored
 * practice test's block-by-block sittings: it holds the append-only response log,
 * the learner's picked options, the outstanding one-use block token (inside
 * `pending_block`), the length tier + sitting id, and — once the form is done —
 * the cached result view + the SCORED completion payload. A session is addressed
 * by the SHA-256 hash of its opaque token and bound to the authenticated learner.
 *
 * SERVER-ONLY: the response log + completion record which items were served and
 * how they scored. They never carry an answer key (that lives in
 * `question_protected`); the runner never echoes per-item correctness. The SCORED
 * sitting is persisted to the learner projection by the separate result write —
 * this table only holds the in-flight sitting.
 *
 * This module is thin CRUD over the same structural `Queryable` the other repos
 * use; the atomic one-use-block-token commit (SELECT … FOR UPDATE) is driven by
 * the caller inside a transaction (see the learner-API practice-test port).
 */
import type { Queryable } from './mastery-repository';

/** One `practice_test_sessions` row. JSONB columns arrive already parsed by `pg`. */
export interface PracticeTestSessionRow extends Record<string, unknown> {
  token_hash: string;
  learner_id: string;
  sitting_id: string;
  form_seed: string;
  length_tier: string;
  /** Append-only scored-response log (JSONB array). */
  responses: unknown;
  /** The learner's picked option per item so far (JSONB object). */
  answers: unknown;
  /** The block awaiting commit + its one-use token hash, or null (JSONB). */
  pending_block: unknown;
  completed: boolean;
  /** Cached learner-safe result view once done, or null (JSONB). */
  result_view: unknown;
  /** Cached scored completion payload once done, or null (JSONB). */
  completion: unknown;
  created_at: Date;
  expires_at: Date;
}

/** The fields a write supplies (created_at/expires_at as instants). */
export interface PracticeTestSessionWrite {
  tokenHash: string;
  learnerId: string;
  sittingId: string;
  formSeed: string;
  lengthTier: string;
  responses: unknown;
  answers: unknown;
  pendingBlock: unknown;
  completed: boolean;
  resultView: unknown;
  completion: unknown;
  createdAt: Date;
  expiresAt: Date;
}

const COLUMNS =
  'token_hash, learner_id, sitting_id, form_seed, length_tier, responses, answers, pending_block, completed, result_view, completion, created_at, expires_at';

/**
 * Whether the table exists (migration 0022 applied). Callers probe this so a
 * content-only dev database (no practice-test table) degrades cleanly rather
 * than throwing on every practice-test request.
 */
export async function hasPracticeTestSessions(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ present: boolean }>(
    `select exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'practice_test_sessions'
     ) as present`,
  );
  return rows[0]?.present === true;
}

/** Read one live session by token hash, or null when absent/expired. */
export async function getPracticeTestSession(
  q: Queryable,
  tokenHash: string,
): Promise<PracticeTestSessionRow | null> {
  const { rows } = await q.query<PracticeTestSessionRow>(
    `select ${COLUMNS} from practice_test_sessions
      where token_hash = $1 and expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/**
 * Read one live session FOR UPDATE — only valid inside a transaction. This row
 * lock is what makes the one-use block token safe under concurrency: two commits
 * for the same session serialize, so the second sees the token already consumed
 * and is refused.
 */
export async function getPracticeTestSessionForUpdate(
  q: Queryable,
  tokenHash: string,
): Promise<PracticeTestSessionRow | null> {
  const { rows } = await q.query<PracticeTestSessionRow>(
    `select ${COLUMNS} from practice_test_sessions
      where token_hash = $1 and expires_at > now()
      for update`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Insert or update a session (keyed by token hash). */
export async function upsertPracticeTestSession(
  q: Queryable,
  session: PracticeTestSessionWrite,
): Promise<void> {
  await q.query(
    `insert into practice_test_sessions
       (token_hash, learner_id, sitting_id, form_seed, length_tier, responses, answers,
        pending_block, completed, result_view, completion, created_at, expires_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11::jsonb, $12, $13)
     on conflict (token_hash) do update set
       responses = excluded.responses,
       answers = excluded.answers,
       pending_block = excluded.pending_block,
       completed = excluded.completed,
       result_view = excluded.result_view,
       completion = excluded.completion,
       expires_at = excluded.expires_at`,
    [
      session.tokenHash,
      session.learnerId,
      session.sittingId,
      session.formSeed,
      session.lengthTier,
      JSON.stringify(session.responses ?? []),
      JSON.stringify(session.answers ?? {}),
      session.pendingBlock === null || session.pendingBlock === undefined
        ? null
        : JSON.stringify(session.pendingBlock),
      session.completed,
      session.resultView === null || session.resultView === undefined
        ? null
        : JSON.stringify(session.resultView),
      session.completion === null || session.completion === undefined
        ? null
        : JSON.stringify(session.completion),
      session.createdAt,
      session.expiresAt,
    ],
  );
}

/**
 * Delete expired sessions. Best-effort housekeeping; the reads already exclude
 * expired rows, so this only reclaims space and is safe to call opportunistically.
 */
export async function deleteExpiredPracticeTestSessions(q: Queryable): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `with deleted as (delete from practice_test_sessions where expires_at <= now() returning 1)
     select count(*)::int as n from deleted`,
  );
  return Number(rows[0]?.n ?? 0);
}
