-- MCAT Mastery — placement-diagnostic sessions. Forward-only.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: the adaptive multistage placement diagnostic is event-sourced — a session's
-- served blocks, scored responses, route, and result are all pure functions of an
-- append-only response log plus a per-session seed. That log used to live only in
-- an in-memory Map on the dev/preview server; this table is its deployed backing
-- store so the diagnostic can be served by the learner-API Lambda and survive a
-- cold start / interrupted sitting (resume-in-place).
--
-- SERVER-ONLY: `responses` records which items were served and how they scored. It
-- carries NO answer key (that stays in question_protected) and the diagnostic never
-- echoes per-item correctness to the browser. Writing/reading here mints no mastery
-- — the diagnostic seeds mastery only through the separate mastery-seed hook.
--
-- INTEGRITY: a session is addressed by the SHA-256 HASH of its opaque token (the
-- token itself is never stored) and bound to the authenticated learner. Each served
-- block carries a one-use token whose hash lives inside `pending_block`; a commit is
-- accepted only against the outstanding hash and then cleared, so a committed block
-- cannot be replayed. `expires_at` gives every session a TTL; expired rows are
-- excluded by reads and reclaimed opportunistically.

create table if not exists diagnostic_sessions (
  -- SHA-256 hex of the opaque session token. The token is never persisted.
  token_hash text primary key,
  -- The authenticated learner this session belongs to; a token cannot be replayed
  -- as another learner.
  learner_id text not null,
  -- Per-session random seed for deterministic form assembly / stable resume.
  seed text not null,
  -- Append-only scored-response log: [{questionId, cluster, section, familyId,
  -- correct, elapsedMs, seq, dokLevel?}, ...].
  responses jsonb not null default '[]'::jsonb check (jsonb_typeof(responses) = 'array'),
  -- The block awaiting commit + its one-use token hash: {stageId, questionIds[],
  -- tokenHash}. NULL when no block is outstanding (e.g. once the form is done).
  pending_block jsonb,
  completed boolean not null default false,
  -- Cached diagnostic result once the form is done; NULL until then.
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

-- Reclaiming expired sessions (housekeeping) and the expiry filter reads walk this.
create index if not exists diagnostic_sessions_expires_at_idx on diagnostic_sessions (expires_at);
-- Occasional per-learner lookups (support / cleanup on reset).
create index if not exists diagnostic_sessions_learner_id_idx on diagnostic_sessions (learner_id);
