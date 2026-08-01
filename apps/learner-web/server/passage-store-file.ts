import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassageOfTheDayEntrySchema, type PassageOfTheDayEntry } from '@mcat/contracts';

/**
 * The gitignored local Passage-of-the-Day store
 * (`content/passage-of-the-day/.local/passages.json`), as it sits on disk.
 *
 * This is the dev/no-Postgres tier of the passage loader (see
 * `passage-pool-source.ts`): it lets a developer INGEST user-authored CARS
 * passages without a database and have them served immediately. The store holds
 * the FULL canonical entries — passage prose, answer key, and rationales — so it
 * is Node-only and lives under `.local/` (never committed), exactly like the
 * question-bank corpus pull.
 *
 * The passage ingest tool (`tools/passage-cli`) is the writer; this is the one
 * reader. Both spell the same path independently so neither package depends on
 * the other.
 */

/** Where the local store lives, relative to this module (apps/learner-web/server). */
export function passageStoreDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/learner-web/server → repo root
  return join(here, '..', '..', '..', 'content', 'passage-of-the-day', '.local');
}

export function passageStorePath(): string {
  return join(passageStoreDir(), 'passages.json');
}

/**
 * Read + validate the local store, or return null when it is absent, empty, or
 * malformed — the normal case on a fresh clone, where the loader falls back to
 * the hardcoded pool. A malformed store returns null rather than throwing so a
 * bad hand-edit degrades to the seed pool rather than taking the feature down.
 */
export function loadPassageStore(path: string = passageStorePath()): PassageOfTheDayEntry[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsed = PassageOfTheDayEntrySchema.array().safeParse(raw);
  return parsed.success ? parsed.data : null;
}
