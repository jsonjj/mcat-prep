-- Activate the build-a wave-01 content release: flip the candidate seeded by 0025 to
-- 'active' so the deployed learner API's cold-start attach (loadLessonRevisionProvider,
-- environment='dev') resolves its 111 lessons. This IS the release gate.
--
-- Idempotent: the WHERE lifecycle='candidate' guard makes a re-run a no-op once active.
-- Forward-only. To roll back, add a follow-on migration setting lifecycle back to
-- 'candidate'; the composite provider then serves only the file-based pilots on the
-- next API cold start (best-effort attach), so the site never breaks.
update content_releases
   set lifecycle = 'active'
 where release_id = 'build-a-wave-01'
   and environment = 'dev'
   and lifecycle = 'candidate';
