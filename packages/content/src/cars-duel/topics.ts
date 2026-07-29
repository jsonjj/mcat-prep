import { CarsDuelTopicSchema, type CarsDuelTopic } from '@mcat/contracts';
import { CARS_DUEL_TOPICS_DATA } from './topics.data';

/**
 * The vetted CARS Duel topic pool (WS6), validated against its contract at module
 * load so a malformed embed fails loudly rather than reaching the selector. This
 * is the runtime source of truth the selector reads; the `cars_duel_topics` table
 * is the persistence mirror seeded from the same canonical `topics.json`.
 */
export const CARS_DUEL_TOPICS: readonly CarsDuelTopic[] = CARS_DUEL_TOPICS_DATA.map((topic) =>
  CarsDuelTopicSchema.parse(topic),
);

/** Index the pool by id for O(1) lookup when resolving a selection's topic. */
export const CARS_DUEL_TOPICS_BY_ID: ReadonlyMap<string, CarsDuelTopic> = new Map(
  CARS_DUEL_TOPICS.map((topic) => [topic.id, topic]),
);
