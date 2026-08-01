import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PASSAGE_THEMES } from '../../packages/contracts/src/passage-of-the-day';
import { CARS_SKILLS } from '../../packages/contracts/src/vocab';

/**
 * Passage of the Day is CARS content, so the Postgres CHECK constraints in
 * migration 0019 must accept exactly the enum members the Zod contract accepts, or
 * a legitimate seed/ingest row would be rejected at the database while passing
 * validation (or vice-versa).
 *
 * Item difficulty is now carried by `dok` (1–3) alone, and the per-choice answer
 * key (correct / misconception / rationale) lives inside the `choices` JSONB — so
 * there are no `difficulty` or `correct_choice_id` columns to pin, and this test
 * asserts they stay gone.
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

describe('migration 0019 CHECK constraints match the contract enums', () => {
  it('theme', () => {
    expect(asSet(checkMembers('theme'))).toEqual(asSet(PASSAGE_THEMES));
  });

  it('cars_skill', () => {
    expect(asSet(checkMembers('cars_skill'))).toEqual(asSet(CARS_SKILLS));
  });

  it('bounds dok to 1..3, matching the contract', () => {
    expect(migration).toMatch(/dok integer not null check \(dok between 1 and 3\)/);
  });

  it('carries no difficulty or correct_choice_id column (the key rides in choices)', () => {
    expect(migration).not.toMatch(/difficulty text/);
    expect(migration).not.toMatch(/correct_choice_id/);
  });
});
