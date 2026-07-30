import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CarsDuelThemeSchema, CarsDuelTopicSchema } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';
import { CARS_DUEL_TOPICS, CARS_DUEL_TOPICS_BY_ID } from './topics';

/**
 * The embedded pool is generated from the canonical `content/cars-duel/topics.json`
 * (scripts/generate-cars-duel-topics.mjs). This asserts the embed has not drifted
 * from its source and that every row is contract-valid — the same pool the
 * `cars_duel_topics` seed loads.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const canonical = JSON.parse(
  readFileSync(join(repoRoot, 'content/cars-duel/topics.json'), 'utf8'),
) as ReadonlyArray<Record<string, unknown>>;

describe('CARS Duel topic pool', () => {
  it('embeds every vetted topic without drift from the canonical source', () => {
    expect(CARS_DUEL_TOPICS).toHaveLength(canonical.length);
    const byId = new Map(canonical.map((t) => [t.id as string, t]));
    for (const topic of CARS_DUEL_TOPICS) {
      const source = byId.get(topic.id);
      expect(source).toBeDefined();
      expect(topic.proposition).toBe(source!.proposition);
      expect(topic.theme).toBe(source!.theme);
      // snake_case source maps to camelCase runtime shape
      expect(topic.argumentStructure).toBe(source!.argument_structure);
      expect(topic.difficulty).toBe(source!.difficulty);
      expect(topic.charge).toBe(source!.charge);
    }
  });

  it('has unique ids and is contract-valid', () => {
    expect(CARS_DUEL_TOPICS_BY_ID.size).toBe(CARS_DUEL_TOPICS.length);
    for (const topic of CARS_DUEL_TOPICS) {
      expect(() => CarsDuelTopicSchema.parse(topic)).not.toThrow();
    }
  });

  it('covers every contract theme + structure + the full difficulty span the selector relies on', () => {
    const themes = new Set(CARS_DUEL_TOPICS.map((t) => t.theme));
    const structures = new Set(CARS_DUEL_TOPICS.map((t) => t.argumentStructure));
    const difficulties = new Set(CARS_DUEL_TOPICS.map((t) => t.difficulty));
    // Per-theme presence (not just a count ≥ 8): every theme the selector spreads across
    // must exist, so it can re-admit a band-missing theme at its nearest difficulty.
    expect(themes).toEqual(new Set(CarsDuelThemeSchema.options));
    expect(structures.size).toBeGreaterThanOrEqual(6);
    expect(difficulties).toEqual(new Set([1, 2, 3, 4, 5]));
    // NOTE: coverage across (theme × difficulty) is deliberately UNEVEN — e.g. philosophy
    // is authored only at difficulty 3 & 5, ethics has none at difficulty 1 — so this
    // global difficulty-span check does NOT imply every theme is reachable at every ability
    // band. That per-ability reachability guarantee lives in the selector and is covered by
    // the theme-reachability tests in @mcat/policies (cars-duel.test.ts).
  });
});
