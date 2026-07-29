-- MCAT Mastery — let the Study loop's misses reach the Mistakes tab (forward-only).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: 0010 gave the chosen distractor a read path, but scoped every index and
-- constraint on it to `activity_type = 'practice'`. The older Study loop at
-- /app/learn answers real questions from the authored lesson sequence and had its
-- own contradictory error flow (a self-reported cause picker, and the key withheld
-- until after it). Removing that picker leaves Study with nowhere to put a miss,
-- so its misses silently stopped appearing anywhere at all.
--
-- A Study question is a genuine question attempt, so it belongs on the tab
-- (docs/design/error-handling-design.md §6.5). What stays off the tab is
-- unchanged and is enforced at the WRITE, not here: recall lapses are the
-- scheduler hitting its target retention, and in-lesson comprehension checks
-- happen during acquisition where errorful generation is the mechanism doing the
-- work. Neither is ever written to this table.
--
-- 0010 already permits `activity_type = 'study'` via
-- `attempt_results_activity_type_valid`, so this migration only widens the
-- indexes and the shape check that were written for one activity type.

-- One first-attempt row per learner × ACTIVITY TYPE × item. Activity type joins
-- the key because practice draws from the v7 corpus and study from the authored
-- lesson bank: two id spaces that do not collide today and are not guaranteed to
-- stay disjoint. `recordPracticeAttempt` infers this index as its ON CONFLICT
-- arbiter, so the predicate here and the one in that statement must match.
drop index if exists attempt_results_practice_first_attempt_uidx;

create unique index attempt_results_question_first_attempt_uidx
  on attempt_results (learner_id, activity_type, question_id)
  where activity_type in ('practice', 'study') and first_attempt;

-- Pattern grouping counts DISTINCT items per KC across both surfaces (§6.5 rule
-- 1): the grain is a property of the content, not of the surface that served it.
drop index if exists attempt_results_learner_kc_idx;

create index attempt_results_learner_kc_idx
  on attempt_results (learner_id, kc_id, occurred_at desc)
  where activity_type in ('practice', 'study') and kc_id is not null;

-- A displayed row must carry enough to render and to order. Same guarantee 0010
-- made for practice, now owed by study too.
alter table attempt_results
  drop constraint if exists attempt_results_practice_shape,
  add constraint attempt_results_question_attempt_shape check (
    activity_type is null
    or activity_type not in ('practice', 'study')
    or (question_id is not null and first_attempt is not null and occurred_at is not null)
  );
