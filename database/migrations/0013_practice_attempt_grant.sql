-- MCAT Mastery — server-issued adaptive-practice attempt grants (forward-only).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- One row per learner × item the practice queue actually served. It is the
-- server's own record that it handed the item over, and it is what
-- `Authority.submitPracticeAttempt` checks before it will score an answer.
--
-- WHY IT IS NOT A COLUMN ON practice_exposure. That table answers two different
-- questions already — `last_seen_at` drives queue rotation and `seen_count`
-- derives `firstAttempt` — and both are written when the learner ANSWERS. A
-- grant is written when the server SERVES, which is a different moment with a
-- different lifetime; folding it in would make a serve increment the count that
-- decides whether a response is a first attempt, and no practice answer would
-- ever move P(L) again.
--
-- Not foreign-keyed to `learners`, for the same reason as 0007/0009: the dev
-- in-process authority scores against learner ids that live only in its
-- in-memory projection.

create table practice_attempt_grant (
  learner_id uuid not null,
  question_id text not null,
  -- The selection decision that produced the serve. Re-checked at submission,
  -- so a forged spec is refused rather than recorded.
  spec_id text not null,
  -- An answer to an item served under a superseded release is refused rather
  -- than scored against the current one.
  content_release text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  -- When the grant's ONE capability use was spent. A later answer to the same
  -- item is still admitted, but can only ever be a repeat.
  consumed_at timestamptz,
  primary key (learner_id, question_id)
);

-- Reclaiming expired grants; also the shape a sweep job would read.
create index practice_attempt_grant_expiry_idx
  on practice_attempt_grant (expires_at);
