-- MCAT Mastery — remove the learner projection's private copy of the account
-- state (forward-only, data only). PostgreSQL 17 / Aurora PostgreSQL compatible.
--
-- WHY: `learner_streams.state_json` carried an `accountState` key, seeded from
-- `Authority.createGuest()` when the learner row was first inserted. Both entry
-- points in `PostgresGuestSessionService.insertLearner` used that same guest seed
-- — including `createLinkedLearner`, which writes `learners.account_state =
-- 'linked'` in the very same transaction — and no later write ever revisited the
-- key. Every learner who has ever signed in therefore had `"guest"` recorded next
-- to their progress while the authoritative column said `linked`.
--
-- Nothing read the stale copy: authorization derives the principal from
-- `learners.account_state`, and the bootstrap response is filled from
-- `principal.kind`. That is exactly why it went unnoticed, and exactly why it was
-- dangerous — a future reader that trusted the projection would have concluded a
-- signed-in learner was a guest.
--
-- The fix is removal, not synchronization. The field is gone from `LearnerState`,
-- so nothing writes it again, and `learnerStateFromProjection` deletes it from any
-- blob loaded before this migration ran (an in-flight request that read a row
-- ahead of this statement must not write the key back on save). This statement
-- clears what is already persisted. It is idempotent, and it touches only that one
-- key: `-` on a jsonb object removes the member and leaves the rest byte-identical.
--
-- No column, constraint, or index changes. `learners.account_state` — the single
-- source of truth — is untouched.

update learner_streams
   set state_json = state_json - 'accountState'
 where state_json ? 'accountState';
