-- MCAT Mastery — BKT/IRT mastery engine per-user state + population item stats.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- The mastery engine (mastery-bkt / provisional-v1) tracks a probability P(L) per
-- unit at three grains (KC / 7-skill / lesson) plus an IRT ability V per CARS
-- sub-skill. P(L) is the value as-of last_practiced_at; readers apply lazy decay.
-- See docs/mastery-pipeline.md.

-- Population difficulty source for IRT `b`. Intentionally NOT foreign-keyed to
-- `questions`: the current study loop scores against an in-memory synthetic bank
-- whose ids are not in that table, and stats must survive content re-releases.
create table question_stats (
  question_id text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0 and correct <= attempts),
  updated_at timestamptz not null
);

-- Per-KC mastery (stored, never displayed; used for question selection).
create table mastery_kc (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  kc_id text not null,
  p_l double precision not null check (p_l >= 0 and p_l <= 1),
  half_life_days double precision not null check (half_life_days > 0),
  last_practiced_at timestamptz,
  last_due_review_at timestamptz,
  updated_at timestamptz not null,
  primary key (learner_id, kc_id)
);

-- Per-reasoning-operation mastery (the 7 displayed skills).
create table mastery_skill (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  operation text not null check (
    operation in ('IDENTIFY', 'PREDICT', 'EXPLAIN', 'RELATE', 'QUANTIFY', 'DESIGN', 'EVIDENCE')
  ),
  p_l double precision not null check (p_l >= 0 and p_l <= 1),
  half_life_days double precision not null check (half_life_days > 0),
  last_practiced_at timestamptz,
  last_due_review_at timestamptz,
  updated_at timestamptz not null,
  primary key (learner_id, operation)
);

-- Per-lesson mastery (drives the Evidence Atlas brain nodes on Progress).
create table mastery_lesson (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  lesson_id text not null,
  p_l double precision not null check (p_l >= 0 and p_l <= 1),
  half_life_days double precision not null check (half_life_days > 0),
  last_practiced_at timestamptz,
  last_due_review_at timestamptz,
  updated_at timestamptz not null,
  primary key (learner_id, lesson_id)
);

-- Per-CARS-sub-skill IRT ability (no BKT, no forgetting). V may be negative.
create table cars_ability (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  cars_skill text not null check (cars_skill in ('FOC', 'RWT', 'RBT')),
  v double precision not null,
  updated_at timestamptz not null,
  primary key (learner_id, cars_skill)
);
