-- MCAT Mastery — give the chosen distractor a queryable read path (forward-only).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: adaptive Practice already knew WHICH wrong answer a learner picked, and
-- then threw it away — `chosen_choice_id` only ever reached the `accepted_events`
-- JSONB payload, which nothing in the repo reads. The diagnostic content of a
-- wrong answer IS which wrong answer it was (a claim about belief), so it needs a
-- row, not a payload (docs/design/error-handling-design.md §1, §5).
--
-- WHY THIS TABLE: `attempt_results` was created in 0001 and has zero inserts
-- repo-wide, so there is no data to migrate and no reader to break. It already
-- carries `is_correct` and `assistance_level`. What it did NOT allow was a row
-- that is not derived from an `accepted_events` envelope, which is exactly the
-- shape adaptive Practice writes: the dev in-process authority scores against
-- learner ids that live only in its in-memory projection, and the deployed path
-- writes the attempt inside the same transaction that appends the event, so the
-- event FK would order the two writes for no benefit. The FKs are therefore
-- dropped and the envelope-only columns made nullable — the same trade 0009
-- documents for `practice_exposure` / `practice_repair`.
--
-- Recording scope is every activity type; DISPLAY scope is practice only
-- (§6.4) — that filter lives in the read, not here.

alter table attempt_results
  drop constraint if exists attempt_results_event_id_fkey,
  drop constraint if exists attempt_results_learner_id_fkey,
  alter column event_id drop not null,
  alter column task_instance_id drop not null,
  alter column content_version_id drop not null,
  alter column item_family_id drop not null,
  -- The v7 corpus item. Loose text: corpus ids are not content-pipeline ids.
  add column question_id text,
  -- Mastery grain the attempt routes to (0007/0009 vocabulary).
  add column kc_id text,
  add column skill text,
  -- 15-cluster rollup, for the coarser pattern grain and the re-attempt focus.
  add column cluster text,
  -- THE point of this migration: which wrong answer, not merely that it was wrong.
  add column chosen_choice_id text,
  -- Only a first, unassisted attempt is independent evidence.
  add column first_attempt boolean,
  add column activity_type text,
  -- When the learner answered. `recorded_at` stays the write instant; the two
  -- coincide live and diverge under replay/backfill.
  add column occurred_at timestamptz;

alter table attempt_results
  add constraint attempt_results_skill_valid check (
    skill is null
    or skill in ('IDENTIFY', 'PREDICT', 'EXPLAIN', 'RELATE', 'QUANTIFY', 'DESIGN', 'EVIDENCE')
  ),
  add constraint attempt_results_chosen_choice_valid check (
    chosen_choice_id is null or chosen_choice_id in ('A', 'B', 'C', 'D')
  ),
  add constraint attempt_results_activity_type_valid check (
    activity_type is null
    or activity_type in ('practice', 'study', 'diagnostic', 'cars', 'lesson')
  ),
  -- A row is anchored either to an accepted event or to a corpus item.
  add constraint attempt_results_anchored check (
    event_id is not null or question_id is not null
  ),
  add constraint attempt_results_practice_shape check (
    activity_type is distinct from 'practice'
    or (question_id is not null and first_attempt is not null and occurred_at is not null)
  );

-- The Mistakes tab read: a learner's practice attempts, newest first.
create index attempt_results_learner_occurred_idx
  on attempt_results (learner_id, occurred_at desc)
  where activity_type is not null;

-- Pattern grouping at KC grain counts DISTINCT items per KC (§6.5 rule 1).
create index attempt_results_learner_kc_idx
  on attempt_results (learner_id, kc_id, occurred_at desc)
  where activity_type = 'practice' and kc_id is not null;

-- One first-attempt row per learner × item, so a resubmitted answer is
-- idempotent and "distinct items" is enforced by the schema rather than by a
-- query that has to remember to deduplicate.
create unique index attempt_results_practice_first_attempt_uidx
  on attempt_results (learner_id, question_id)
  where activity_type = 'practice' and first_attempt;
