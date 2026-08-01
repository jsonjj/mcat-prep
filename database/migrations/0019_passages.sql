-- MCAT Mastery — Passage of the Day content pool. Forward-only.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: "Passage of the Day" serves one vetted CARS-style passage per learner-local
-- day, deterministically rotated and scored server-side. Its content used to be a
-- hardcoded TS array; this pair of tables is the persistence source of truth, seeded
-- from that same pool and extended by the passage ingest (user-authored CARS passages
-- are ADDED, never replacing the seed).
--
-- FORMATIVE: the feature writes no mastery and logs no attempt. These tables carry the
-- passage prose, the answer key, and per-choice rationales, so — like question_protected
-- and the diagnostic bank — they are SERVER-ONLY: the selector projects a learner-safe
-- view (no key, no rationale) before anything reaches the browser.
--
-- Split into two tables so a passage owns an ordered set of 1..7 questions with a foreign
-- key + cascade. CHECK constraints pin the vetted enum sets (2 themes, the 3 AAMC CARS
-- skills, dok 1-4, ordinal difficulty) so a malformed seed/ingest row fails loudly at
-- write rather than silently skewing selection. The enums mirror @mcat/contracts
-- (PassageThemeSchema / CarsSkillSchema / PassageDifficultySchema); cross-package parity
-- is asserted in tests/architecture/passage-of-day-contract.test.ts.

create table if not exists passages (
  passage_id text primary key,
  slug text not null unique,
  title text not null check (length(title) > 0),
  -- Free-text eyebrow shown to the learner (e.g. "Aesthetics"); display only.
  discipline text not null default '' ,
  theme text not null check (theme in ('humanities', 'social_science')),
  -- Paragraphs as a JSON array of strings, one entry per paragraph.
  body jsonb not null check (jsonb_typeof(body) = 'array'),
  -- Optional provenance / attribution, both nullable.
  source text,
  attribution text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists passages_theme_idx on passages (theme);

create table if not exists passage_questions (
  question_id text primary key,
  passage_id text not null references passages (passage_id) on delete cascade,
  -- 1-based position within the passage; unique per passage.
  position integer not null check (position between 1 and 7),
  -- The 3 AAMC CARS skills, matching @mcat/contracts CarsSkillSchema.
  cars_skill text not null check (cars_skill in ('FOC', 'RWT', 'RBT')),
  dok integer not null check (dok between 1 and 4),
  difficulty text not null check (difficulty in ('accessible', 'moderate', 'demanding')),
  stem text not null check (length(stem) > 0),
  -- JSON array of {id, text}, exactly the four options A-D in order.
  choices jsonb not null check (jsonb_typeof(choices) = 'array'),
  correct_choice_id text not null check (correct_choice_id in ('A', 'B', 'C', 'D')),
  -- Why the correct answer is correct (SERVER-ONLY).
  explanation text not null check (length(explanation) > 0),
  -- Optional per-choice "why it misses" map keyed A-D (SERVER-ONLY); null when absent.
  choice_rationales jsonb check (choice_rationales is null or jsonb_typeof(choice_rationales) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (passage_id, position)
);

create index if not exists passage_questions_passage_id_idx on passage_questions (passage_id);
create index if not exists passage_questions_cars_skill_idx on passage_questions (cars_skill);
