-- MCAT Mastery — CARS Duel vetted topic pool (WS6). Forward-only.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: the CARS Duel selector needs a stable, queryable pool of vetted debate
-- propositions to stratify across (theme / argument structure / difficulty), apply
-- a novelty cooldown against, and pick a topic near the learner's band. The runtime
-- source of truth is the embedded @mcat/content pool, generated from the canonical
-- content/cars-duel/topics.json; THIS table is its persistence mirror, seeded from
-- the same source (services/persistence-postgres/src/cars-duel-topics-repository.ts).
--
-- The CARS Duel is FORMATIVE — nothing here mints mastery. The table holds only
-- debate propositions + structural metadata: no answer keys, no proprietary prose,
-- so it is safe to serve read-only to the selector.
--
-- CHECK constraints pin the vetted enum sets (10 themes, 7 argument structures,
-- 3 charge levels, difficulty 1–5) so a malformed seed row fails loudly at write
-- rather than silently skewing selection.

create table if not exists cars_duel_topics (
  topic_id text primary key,
  proposition text not null check (length(proposition) > 0),
  theme text not null check (
    theme in (
      'sociology', 'aesthetics', 'literature_popculture', 'history_religion',
      'anthro_ling_geo_health', 'ethics', 'political_law', 'psychology',
      'economics', 'philosophy'
    )
  ),
  argument_structure text not null check (
    argument_structure in (
      'policy_tradeoff', 'causal', 'definitional', 'normative',
      'evidence_eval', 'analogy', 'interpretive'
    )
  ),
  difficulty integer not null check (difficulty between 1 and 5),
  charge text not null check (charge in ('neutral', 'mild', 'high')),
  created_at timestamptz not null default clock_timestamp()
);

-- The selector filters/spreads on these axes, so index them.
create index if not exists cars_duel_topics_theme_idx on cars_duel_topics (theme);
create index if not exists cars_duel_topics_difficulty_idx on cars_duel_topics (difficulty);
create index if not exists cars_duel_topics_structure_idx on cars_duel_topics (argument_structure);
