-- Add the 7-op reasoning-operation mastery axis to the learner-safe question row.
-- Derived from primary_skill + construct.reasoning_operation_id at seed time
-- (see @mcat/content resolveReasoningOperation). This is learner-safe
-- classification metadata; the deployed mastery path reads it to update the
-- per-skill P(L). See docs/mastery-pipeline.md §6.
alter table questions
  add column reasoning_operation text
  check (
    reasoning_operation is null
    or reasoning_operation in
       ('IDENTIFY', 'PREDICT', 'EXPLAIN', 'RELATE', 'QUANTIFY', 'DESIGN', 'EVIDENCE')
  );

create index questions_reasoning_operation_idx on questions (reasoning_operation);
