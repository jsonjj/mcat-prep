-- MCAT Mastery — periodic test mastery re-measure: per-unit observation history (WS5, §6).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: a practice test re-measures capability by DECAY-WEIGHTED AVERAGING across
-- every sitting that touched a unit — recent retrieval weighted far above stale
-- (packages/policies/src/practice-test-scorer.ts `remeasureMastery`). That read is
-- a function of `now`, so it cannot be materialised once; what must persist is the
-- HISTORY it averages over: each sitting's per-unit correct/total, dated. Readers
-- reconstruct the current read by applying `2^(-ageDays/halfLife)` at query time,
-- exactly as `currentPL` re-derives BKT decay lazily (0007 / docs/mastery-pipeline.md).
--
-- This is a READ, not a mastery write. It never competes with the BKT grains in
-- 0007: those are moved only by the single-door capability write path
-- (tests/architecture/mastery-write-path.test.ts). The periodic test's re-measure
-- is a separate assessment signal surfaced in the result envelope and the review UI.
--
-- The dev/preview server keeps this history in memory
-- (apps/learner-web/server/practice-test-bank.ts `unitHistory`); this is the
-- deployed Postgres shape.

create table practice_test_unit_observation (
  sitting_id uuid not null references practice_test_sitting (sitting_id) on delete cascade,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  -- Grain the observation is tracked at. `cluster` is what the shipped scorer
  -- emits; the others are carried so a finer or coarser re-measure can be added
  -- without a schema change.
  grain text not null check (grain in ('kc', 'skill', 'cars', 'cluster', 'section')),
  unit_id text not null,
  correct integer not null check (correct >= 0 and correct <= total),
  total integer not null check (total > 0),
  observed_at timestamptz not null,
  primary key (sitting_id, grain, unit_id)
);

-- The decay-weighted re-measure reads a learner's whole history for a unit,
-- newest first.
create index practice_test_unit_observation_learner_idx
  on practice_test_unit_observation (learner_id, grain, unit_id, observed_at desc);
