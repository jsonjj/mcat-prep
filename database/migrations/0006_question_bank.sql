-- MCAT Mastery question bank (v7 canonical corpus).
-- PostgreSQL 17 / Aurora PostgreSQL compatible.
--
-- Split storage, mirroring the compiler's allowlist split:
--   * questions          — learner-safe record (stem, passage, choices, assets,
--                          plus derived section/cluster + KC/lesson routing).
--   * question_protected — SERVER-ONLY answer key + per-choice explanations.
--                          Never selected into a learner-safe payload; only the
--                          scoring authority reads it.
--
-- The 15-cluster + 4-section values are a presentation rollup DERIVED from the
-- question's V3 KC (see packages/content/src/v7-cluster-map.ts). CROSS_SECTION is
-- stored as its own reasoning strand.

create table questions (
  question_id text primary key,
  content_release text not null default 'v7-local',
  section text not null check (section in ('bb', 'cp', 'ps', 'cars', 'cross_section')),
  cluster text check (
    cluster in (
      'R1', 'R2', 'R3',
      'CP1', 'CP2', 'CP3',
      'BB1', 'BB2', 'BB3', 'BB4',
      'PS1', 'PS2', 'PS3',
      'CA1', 'CA2'
    )
  ),
  kc_id text,
  lesson_id text,
  family_id text,
  subject text,
  primary_skill text,
  dok_level integer check (dok_level is null or dok_level between 1 and 6),
  stem text not null check (length(stem) > 0),
  passage text not null default '',
  choices jsonb not null check (jsonb_typeof(choices) = 'object'),
  assets jsonb not null default '[]'::jsonb check (jsonb_typeof(assets) = 'array'),
  status text,
  created_at timestamptz not null default clock_timestamp()
);

create index questions_section_idx on questions (section);
create index questions_cluster_idx on questions (cluster);
create index questions_kc_id_idx on questions (kc_id);
create index questions_lesson_id_idx on questions (lesson_id);
create index questions_family_id_idx on questions (family_id);

-- SERVER-ONLY. Answer key + per-choice explanations. This table must never be
-- read into a learner-safe surface; only the scoring authority may access it.
create table question_protected (
  question_id text primary key references questions (question_id) on delete cascade,
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanations jsonb not null check (jsonb_typeof(explanations) = 'object')
);
