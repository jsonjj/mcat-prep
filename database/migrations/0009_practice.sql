-- MCAT Mastery — adaptive Practice per-learner bookkeeping (forward-only).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- Practice pulls FRESH items from the v7 `questions` bank and writes the P(L)
-- mastery signal through the existing mastery tables (0007). These two tables add
-- only the auxiliary bookkeeping the engine needs on top of that:
--   * practice_exposure — which items a learner has recently seen, so the queue
--                         can keep serving unseen items (freshness / anti-repeat).
--   * practice_repair   — a KC×skill flagged by a recent unassisted miss, so the
--                         next queue can offer a FRESH repair rep of that KC×skill.
--
-- Like `question_stats` (0007), these are intentionally NOT foreign-keyed to
-- `learners`: the dev in-process authority scores against learner ids that live
-- only in its in-memory projection (it reads just the bank from Postgres), and
-- these rows must survive learner-projection resets and content re-releases.

-- What each learner has recently been served (drives queue freshness).
create table practice_exposure (
  learner_id uuid not null,
  question_id text not null,
  last_seen_at timestamptz not null,
  seen_count integer not null default 1 check (seen_count >= 0),
  primary key (learner_id, question_id)
);

-- Newest-first lookups of a learner's recently-seen items.
create index practice_exposure_recent_idx
  on practice_exposure (learner_id, last_seen_at desc);

-- KC×skill flagged for a fresh repair rep after a recent unassisted miss.
create table practice_repair (
  repair_id bigint generated always as identity primary key,
  learner_id uuid not null,
  kc_id text not null,
  skill text check (
    skill is null
    or skill in ('IDENTIFY', 'PREDICT', 'EXPLAIN', 'RELATE', 'QUANTIFY', 'DESIGN', 'EVIDENCE')
  ),
  created_at timestamptz not null,
  resolved_at timestamptz
);

-- Open repairs for a learner, newest-first (resolved rows fall out of the index).
create index practice_repair_open_idx
  on practice_repair (learner_id, created_at desc)
  where resolved_at is null;
