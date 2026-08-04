-- MCAT Mastery — periodic practice-test in-flight sessions. Forward-only.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: the scored practice test is served block-by-block and is event-sourced —
-- a sitting's served form, scored responses, and result are pure functions of an
-- append-only response log plus a per-sitting seed. That state used to live only
-- in the dev/preview server's in-memory session store (the diagnostic store it
-- reuses + WeakMaps for tier/sittingId/answers); this table is its deployed
-- backing store so the runner can be served by the horizontally-scaled, ephemeral
-- learner-API Lambda and survive a cold start / interrupted sitting
-- (resume-in-place). It is the practice-test sibling of `diagnostic_sessions`
-- (0021), with the extra columns a scored test needs: the length tier, the
-- end-to-end sitting id, the picked options (for the Mistakes attempt log), and
-- the cached scored result + completion payload.
--
-- SERVER-ONLY: `responses`/`answers`/`completion` record which items were served,
-- what the learner picked, and how it scored. They carry NO answer key (that
-- stays in `question_protected`) and the runner never echoes per-item correctness
-- to the browser. The SCORED sitting is persisted to the learner projection
-- (`state_json.practiceTests`) by the separate `/v1/practice-test/result` write,
-- which reads `completion` here; this table only holds the in-flight sitting.
--
-- INTEGRITY: a session is addressed by the SHA-256 HASH of its opaque token (the
-- token itself is never stored) and bound to the authenticated learner. Each
-- served block carries a one-use token whose hash lives inside `pending_block`; a
-- commit is accepted only against the outstanding hash, then cleared, so a
-- committed block cannot be replayed. `expires_at` gives every session a TTL;
-- expired rows are excluded by reads and reclaimed opportunistically.

create table if not exists practice_test_sessions (
  -- SHA-256 hex of the opaque session token. The token is never persisted.
  token_hash text primary key,
  -- The authenticated learner this session belongs to; a token cannot be replayed
  -- as another learner.
  learner_id text not null,
  -- The end-to-end sitting id (minted at START, reused at completion), so the
  -- persisted sitting carries the same id the dashboard summary reads.
  sitting_id text not null,
  -- Per-sitting random seed for deterministic form assembly / stable resume.
  form_seed text not null,
  -- The variable length tier this sitting was dealt at, so every re-serve deals
  -- the same blueprint.
  length_tier text not null check (length_tier in ('short', 'standard', 'long')),
  -- Append-only scored-response log: [{questionId, cluster, section, familyId,
  -- correct, elapsedMs, seq, dokLevel?}, ...].
  responses jsonb not null default '[]'::jsonb check (jsonb_typeof(responses) = 'array'),
  -- The learner's picked option per item so far ({questionId: 'A'|'B'|'C'|'D'|null}),
  -- carried into the completion's attempt log (the "you picked B" Mistakes row).
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  -- The block awaiting commit + its one-use token hash: {stageId, questionIds[],
  -- tokenHash}. NULL when no block is outstanding (e.g. once the form is done).
  pending_block jsonb,
  completed boolean not null default false,
  -- Cached learner-safe result view once the form is done (so a re-serve of a
  -- finished sitting is byte-stable and never re-assembles); NULL until then.
  result_view jsonb,
  -- Cached SCORED completion payload once the form is done — what the durable
  -- `/v1/practice-test/result` write reads to persist the sitting to the learner
  -- projection. Server-only; NULL until then.
  completion jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

-- Reclaiming expired sessions (housekeeping) and the expiry filter reads walk this.
create index if not exists practice_test_sessions_expires_at_idx on practice_test_sessions (expires_at);
-- Occasional per-learner lookups (support / cleanup on reset).
create index if not exists practice_test_sessions_learner_id_idx on practice_test_sessions (learner_id);
