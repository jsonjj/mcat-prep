import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PASSAGE_CHOICE_IDS,
  PASSAGE_DIFFICULTIES,
  PASSAGE_THEMES,
} from '../../packages/contracts/src/passage-of-the-day';
import { CARS_SKILLS } from '../../packages/contracts/src/vocab';
import { DIFFICULTY_TARGETS } from '../../packages/cars-generation/src/taxonomy';

/**
 * Passage of the Day is CARS content, so its contract enums must not drift from
 * two other authorities:
 *
 *   • The ordinal difficulty is REUSED from `@mcat/cars-generation` — contracts
 *     cannot depend on cars-generation (wrong layer direction), so the members are
 *     mirrored and pinned here.
 *   • The Postgres CHECK constraints in migration 0019 must accept exactly the
 *     members the Zod contract accepts, or a legitimate seed/ingest row would be
 *     rejected at the database while passing validation (or vice-versa).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migration = readFileSync(join(root, 'database/migrations/0019_passages.sql'), 'utf8');

/** Pull the quoted members of a `<column> in ('a', 'b', ...)` CHECK clause. */
function checkMembers(column: string): string[] {
  const match = new RegExp(`${column} in \\(([^)]*)\\)`).exec(migration);
  if (match === null) throw new Error(`no CHECK "in" clause found for column ${column}`);
  return [...match[1]!.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
}

const asSet = (values: readonly string[]): string[] => [...values].sort();

describe('passage-of-day difficulty reuses the CARS-generation ordinal', () => {
  it('is member-for-member identical to DIFFICULTY_TARGETS', () => {
    expect(asSet(PASSAGE_DIFFICULTIES)).toEqual(asSet(DIFFICULTY_TARGETS));
  });
});

describe('migration 0019 CHECK constraints match the contract enums', () => {
  it('theme', () => {
    expect(asSet(checkMembers('theme'))).toEqual(asSet(PASSAGE_THEMES));
  });

  it('cars_skill', () => {
    expect(asSet(checkMembers('cars_skill'))).toEqual(asSet(CARS_SKILLS));
  });

  it('difficulty', () => {
    expect(asSet(checkMembers('difficulty'))).toEqual(asSet(PASSAGE_DIFFICULTIES));
  });

  it('correct_choice_id', () => {
    expect(asSet(checkMembers('correct_choice_id'))).toEqual(asSet(PASSAGE_CHOICE_IDS));
  });

  it('bounds dok to 1..4, matching the contract', () => {
    expect(migration).toMatch(/dok integer not null check \(dok between 1 and 4\)/);
  });
});
