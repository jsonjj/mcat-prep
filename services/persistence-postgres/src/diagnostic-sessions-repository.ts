/**
 * Placement-diagnostic session persistence (migration 0021).
 *
 * The `diagnostic_sessions` table is the deployed backing store for the block
 * diagnostic's event-sourced sessions: it holds the append-only response log,
 * the outstanding one-use block token (inside `pending_block`), and the cached
 * result. A session is addressed by the SHA-256 hash of its opaque token and
 * bound to the authenticated learner.
 *
 * SERVER-ONLY: the response log records which items were served and how they
 * were scored. It never carries an answer key (that lives in `question_protected`);
 * the diagnostic never echoes per-item correctness to the browser. Reads/writes
 * here mint no mastery — the diagnostic seeds mastery only via the separate
 * mastery-seed hook.
 *
 * This module is thin CRUD over the same structural `Queryable` the other repos
 * use; the atomic one-use-block-token commit (SELECT … FOR UPDATE) is driven by
 * the caller inside a transaction (see the learner-API diagnostic port).
 */
import type { Queryable } from './mastery-repository';

/** One `diagnostic_sessions` row. JSONB columns arrive already parsed by `pg`. */
export interface DiagnosticSessionRow extends Record<string, unknown> {
  token_hash: string;
  learner_id: string;
  seed: string;
  /** Append-only scored-response log (JSONB array). */
  responses: unknown;
  /** The block awaiting commit + its one-use token hash, or null (JSONB). */
  pending_block: unknown;
  completed: boolean;
  /** Cached diagnostic result once the form is done, or null (JSONB). */
  result: unknown;
  created_at: Date;
  expires_at: Date;
}

/** The fields a write supplies (created_at/expires_at as instants). */
export interface DiagnosticSessionWrite {
  tokenHash: string;
  learnerId: string;
  seed: string;
  responses: unknown;
  pendingBlock: unknown;
  completed: boolean;
  result: unknown;
  createdAt: Date;
  expiresAt: Date;
}

const COLUMNS =
  'token_hash, learner_id, seed, responses, pending_block, completed, result, created_at, expires_at';

/**
 * Whether the table exists (migration 0021 applied). Callers probe this so a
 * content-only dev database (no diagnostic table) degrades cleanly rather than
 * throwing on every diagnostic request.
 */
export async function hasDiagnosticSessions(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ present: boolean }>(
    `select exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'diagnostic_sessions'
     ) as present`,
  );
  return rows[0]?.present === true;
}

/** Read one live session by token hash, or null when absent/expired. */
export async function getDiagnosticSession(
  q: Queryable,
  tokenHash: string,
): Promise<DiagnosticSessionRow | null> {
  const { rows } = await q.query<DiagnosticSessionRow>(
    `select ${COLUMNS} from diagnostic_sessions
      where token_hash = $1 and expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/**
 * Read one live session FOR UPDATE — only valid inside a transaction. This row
 * lock is what makes the one-use block token safe under concurrency: two
 * commits for the same session serialize, so the second sees the token already
 * consumed and is refused.
 */
export async function getDiagnosticSessionForUpdate(
  q: Queryable,
  tokenHash: string,
): Promise<DiagnosticSessionRow | null> {
  const { rows } = await q.query<DiagnosticSessionRow>(
    `select ${COLUMNS} from diagnostic_sessions
      where token_hash = $1 and expires_at > now()
      for update`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Insert or update a session (keyed by token hash). */
export async function upsertDiagnosticSession(
  q: Queryable,
  session: DiagnosticSessionWrite,
): Promise<void> {
  await q.query(
    `insert into diagnostic_sessions
       (token_hash, learner_id, seed, responses, pending_block, completed, result, created_at, expires_at)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8, $9)
     on conflict (token_hash) do update set
       responses = excluded.responses,
       pending_block = excluded.pending_block,
       completed = excluded.completed,
       result = excluded.result,
       expires_at = excluded.expires_at`,
    [
      session.tokenHash,
      session.learnerId,
      session.seed,
      JSON.stringify(session.responses ?? []),
      session.pendingBlock === null || session.pendingBlock === undefined
        ? null
        : JSON.stringify(session.pendingBlock),
      session.completed,
      session.result === null || session.result === undefined
        ? null
        : JSON.stringify(session.result),
      session.createdAt,
      session.expiresAt,
    ],
  );
}

/**
 * Delete expired sessions. Best-effort housekeeping; the reads already exclude
 * expired rows, so this only reclaims space and is safe to call opportunistically.
 */
export async function deleteExpiredDiagnosticSessions(q: Queryable): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `with deleted as (delete from diagnostic_sessions where expires_at <= now() returning 1)
     select count(*)::int as n from deleted`,
  );
  return Number(rows[0]?.n ?? 0);
}
