-- MCAT Mastery — periodic half-length practice test: sittings + freshness + review gate (WS5, §6).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: the periodic test is a fixed-form, blueprint-valid exam scored at the end
-- (packages/policies/src/practice-test-assembler.ts, practice-test-scorer.ts). Two
-- of its guarantees are inherently DURABLE state and cannot live only in the
-- request:
--   1. FRESHNESS — an item scored on any prior sitting is never dealt again.
--   2. REVIEW GATE — the cadence blocks the NEXT test until the prior sitting's
--      review is complete (packages/policies/src/practice-test-cadence.ts).
-- The dev/preview server keeps these in memory (apps/learner-web/server/
-- practice-test-bank.ts), exactly as the diagnostic and the file practice bank
-- keep their per-learner state; this migration is the deployed Postgres shape.
--
-- No FK to `questions`: like `question_stats` (0007) and `attempt_results` (0010),
-- the test scores against corpus ids that are not content-pipeline ids and must
-- survive content re-releases, so `question_id` is loose text.

-- One row per sitting. `completed_at` is null until the form is finished and
-- scored; `reviewed_at` is null until the learner works the review, which is the
-- fact the cadence's block-until-reviewed rule reads.
create table practice_test_sitting (
  sitting_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  -- Per-sitting assembly seed, so the same fixed form replays across re-serves.
  form_seed text not null,
  phase text not null check (phase in ('baseline', 'monthly', 'biweekly', 'weekly')),
  items_total integer not null check (items_total > 0),
  started_at timestamptz not null,
  completed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null,
  -- A sitting cannot be reviewed before it is completed.
  constraint practice_test_sitting_review_after_complete check (
    reviewed_at is null or completed_at is not null
  )
);

-- The learner's most recent sittings, newest first (cadence + history reads).
create index practice_test_sitting_learner_idx
  on practice_test_sitting (learner_id, started_at desc);

-- At most one still-open (unreviewed) sitting per learner: the review gate means a
-- new test cannot start while the prior one is unreviewed, so two open sittings is
-- an illegal state rather than a race to tolerate.
create unique index practice_test_sitting_one_open_uidx
  on practice_test_sitting (learner_id)
  where reviewed_at is null;

-- Every item a learner has been SCORED on, across all sittings — the freshness
-- set the assembler excludes. The primary key is the whole guarantee: an item
-- already scored for a learner cannot be inserted again, so "never reuse a
-- previously-scored item" is enforced by the schema, not by a query that has to
-- remember to deduplicate.
create table practice_test_scored_item (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  question_id text not null,
  sitting_id uuid not null references practice_test_sitting (sitting_id) on delete cascade,
  scored_at timestamptz not null,
  primary key (learner_id, question_id)
);

-- Which sitting an item was scored on (audit + cascade cleanup).
create index practice_test_scored_item_sitting_idx
  on practice_test_scored_item (sitting_id);
