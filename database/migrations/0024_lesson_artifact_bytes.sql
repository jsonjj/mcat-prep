-- Store the serve-time artifact bytes for DB-backed lessons directly in Postgres so
-- the deployed learner API renders + scores a lesson without any object-store
-- round-trip. Only the three artifacts the normalizer + answer-key resolver read
-- carry bytes (lesson-script.json, learner-safe-items.json, protected-items.json);
-- every other (provenance) artifact keeps bytes NULL. Forward-only.
--
-- protected-items.json bytes are SERVER-ONLY answer authority: they ride the same
-- content_objects protection_class = 'protected' rows and are only ever read by the
-- server scoring path via getAnswerKey; the learner-safe provider path reads only
-- lesson-script + learner-safe-items. mcat_learner_api keeps SELECT-only here.
alter table lesson_revision_objects
  add column if not exists bytes text;
