-- MCAT Mastery — carry per-choice authored misconceptions into the protected
-- table (forward-only). PostgreSQL 17 / Aurora PostgreSQL compatible.
--
-- WHY: `error_models` is the authored per-distractor misconception map — each
-- choice names the misconception behind picking it, and the correct choice is
-- tagged `correct_model`. It is ANSWER-REVEALING, so it belongs beside the answer
-- key + explanations in `question_protected` (0006) and must NEVER be selected
-- into a learner-safe surface. The Mistakes surface joins it on the PICKED option
-- only, post-answer (docs/master-build-spec.md WS2/WS3). It was authored on ~100%
-- of the corpus but dropped at compile, so this is plumbing, not new content.
--
-- WHY NULLABLE, DEFAULT NULL: additive capture. A row loaded before the error-
-- model re-publish, or by a seed that omits it, is honestly "no error models"
-- (NULL) rather than an empty object. The read path (getQuestionAnswer) already
-- reads the column column-agnostically via to_jsonb, so a database that has not
-- yet applied this migration degrades to the same NULL rather than erroring.
--
-- No new table, no data migration: `question_protected` already holds the answer
-- material (0006); this only widens it. Server-only throughout.

alter table question_protected
  -- letter -> misconception text (the correct choice tagged `correct_model`).
  add column error_models jsonb;

alter table question_protected
  add constraint question_protected_error_models_object check (
    error_models is null or jsonb_typeof(error_models) = 'object'
  );
