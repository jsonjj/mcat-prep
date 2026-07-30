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
--
-- `length_tier` is the variable-length TIER the form was dealt at
-- (packages/policies/src/practice-test-assembler.ts): a short early checkpoint, a
-- standard half-length, or a long full-length. `items_correct` + the per-section
-- child table + `scaled_score` are the SCORED result the dashboard summary reads
-- (trends / readiness / estimated range); the estimate is a conservative
-- midpoint (472–528), never a claimed concordance.
create table practice_test_sitting (
  sitting_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  -- Per-sitting assembly seed, so the same fixed form replays across re-serves.
  form_seed text not null,
  length_tier text not null check (length_tier in ('short', 'standard', 'long')),
  items_total integer not null check (items_total > 0),
  items_correct integer not null default 0 check (items_correct >= 0 and items_correct <= items_total),
  -- Conservative estimated scaled-score midpoint (472–528); null until scored.
  scaled_score integer check (scaled_score between 472 and 528),
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

-- Per-section %-correct for one scored sitting — the dashboard's trend points.
-- The improvement-over-time chart is exactly this series read across the
-- learner's ordered sittings; there is no separate trend payload to fall out of
-- sync with it (contracts/src/practice-test.ts).
create table practice_test_section_score (
  sitting_id uuid not null references practice_test_sitting (sitting_id) on delete cascade,
  section text not null check (section in ('cp', 'cars', 'bb', 'ps')),
  pct_correct numeric(5, 2) not null check (pct_correct between 0 and 100),
  primary key (sitting_id, section)
);

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
