-- MCAT Mastery — capture per-attempt response time + answer-changes (forward-only).
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: the diagnose-before-reveal moment carries a behavioural proxy for
-- confidence — how long the learner deliberated and how many times they changed
-- their selection before committing. The event/command DTOs have carried
-- `elapsedMs`/`answerChanges` all along (packages/contracts/src/events.ts,
-- commands.ts), but the in-process write path hardcoded `elapsedMs = 0`, adaptive
-- practice emitted no attempt event at all, and `attempt_results` had nowhere to
-- store either. That timing is the prerequisite WS1 calibration reads to rank a
-- confidently-wrong miss above a shaky win (docs/master-build-spec.md WS0).
--
-- WHY THESE COLUMNS, NULLABLE, DEFAULT NULL: this is CAPTURE ONLY. A row written
-- by a surface that did not measure timing — a synthetic test, an older client,
-- the diagnostic/PotD paths that are out of WS0 scope — must be honestly
-- "unknown" rather than a false `0`. NULL is "not captured"; a real `0` would
-- claim an instantaneous answer, and WS1's "fast" band must be able to tell the
-- two apart. Both are additive and read-only downstream: this changes no scoring,
-- no mastery, no evidence, and no existing reader — the Mistakes read simply
-- carries two more columns.
--
-- `attempt_results` already carries the attempt log (0010–0012); this only widens
-- it. No new table, no data migration (the columns start NULL for every existing
-- row, which is exactly their meaning).

alter table attempt_results
  -- Deliberation time from item presentation to submit, in whole milliseconds.
  add column elapsed_ms integer,
  -- How many times the learner changed their selection before committing.
  add column answer_changes integer;

alter table attempt_results
  add constraint attempt_results_elapsed_ms_valid check (
    elapsed_ms is null or elapsed_ms >= 0
  ),
  add constraint attempt_results_answer_changes_valid check (
    answer_changes is null or answer_changes >= 0
  );
