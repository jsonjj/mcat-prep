-- MCAT Mastery — make the Study loop's `kc_id` mean the same thing Practice's does
-- (forward-only). PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are
-- UTC instants.
--
-- WHY: 0010 added `kc_id` as "the mastery grain the attempt routes to" and 0011
-- widened the KC index to cover study rows so that "the grain is a property of the
-- content, not of the surface that served it" (docs/design/error-handling-design.md
-- §6.5). The WRITE never honoured that. Adaptive Practice filled the column from the
-- v7 corpus (`questions.kc_id`, e.g. `V3-KC-525816`); the Study path filled it from
-- `internal_skill_ids[0]`, a node in the INTERNAL SKILL GRAPH (e.g.
-- `bb1-enzyme-inhibition`). Those two values can never compare equal, so a study miss
-- and a practice miss on one concept formed two patterns with half the evidence each
-- — on the one surface whose entire job is to say "this keeps happening".
--
-- THE ID SPACES ARE NOT DISJOINT, AND THERE IS NO CROSSWALK HERE. The lesson graph
-- (`curriculum/v3/v3-lesson-authoring-manifest.json`) and the question corpus
-- (`questions.kc_id`) carry the SAME 422 knowledge components: 422 distinct ids in
-- each source, all 422 present in both, none unique to either side. The fix was
-- therefore a field selection in the writer — log the KC the item already carries —
-- and NOT a mapping table, an alias set, or an id-translation layer. Do not add one.
-- (0011's own header describes practice and study as "two id spaces"; that sentence
-- is true of `question_id` and must not be read as applying to `kc_id`. 0011 is
-- already applied and checksum-locked by `database/src/migrate.ts`, so the
-- clarification is recorded here rather than by editing it.)
--
-- WHY NO DATA MIGRATION, and why this file changes no schema:
--
--   1. There is no production data to migrate. `attempt_results` had zero inserts
--      repo-wide until 0010, and 0010/0011 both landed on 2026-07-28 and are
--      unreleased. A study row with the old value can only exist in a local
--      development database.
--   2. Translating such a row would mean hardcoding `bb1-enzyme-inhibition` ->
--      `V3-KC-525816` in SQL, which is exactly the crosswalk this change exists to
--      avoid. It would also be a lie in general: the equivalence holds only for one
--      synthetic dev fixture, not as a property of the two id spaces.
--   3. Leaving such a row is already safe and is covered by tests. A `kc_id` the
--      grouping does not recognise cannot corrupt a correct pattern — it can only
--      fail to join one, and it still needs two misses under that key to surface at
--      all. Rows with no usable KC fall back to cluster grain, and a row with
--      neither KC nor cluster still appears in the question history even though it
--      cannot honestly be called a pattern.
--
-- So the only thing owed is that a stale value stops claiming to be a KC. The
-- statement below is a SHAPE check, not a mapping: it clears `kc_id` on study rows
-- whose value cannot be a v3 KC id, letting them degrade to cluster grain (honest:
-- the KC for that row is unknown) instead of anchoring a phantom KC pattern. It is
-- idempotent, matches nothing written by current code, and touches no other surface.

update attempt_results
   set kc_id = null
 where activity_type = 'study'
   and kc_id is not null
   and kc_id !~ '^V3-KC-[0-9]+$';
