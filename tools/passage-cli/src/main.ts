import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  PassageOfTheDayEntrySchema,
  parseAuthoredPassages,
  type PassageOfTheDayEntry,
} from '@mcat/contracts';
import { createDatabasePoolFromEnv, upsertPassages } from '@mcat/persistence-postgres';
import { hardcodedPassagePool } from '../../../content/passage-of-the-day/pool';

/**
 * Passage of the Day ingest/seed CLI.
 *
 *   ingest <file>   Validate a JSON file of user-authored CARS passages (the
 *                   AUTHORING FORMAT) with the Zod schema and ADD them to the pool.
 *   seed            Load/refresh the canonical hardcoded 12-passage pool.
 *
 * Target is chosen from the environment, mirroring the runtime loader:
 *   • DATABASE_URL set  → upsert into Postgres (`passages` + `passage_questions`).
 *   • otherwise         → write the gitignored local dev store, so a developer
 *                         with no database still sees the new passages served.
 *
 * Passages are ADDED (upsert by slug), never a wholesale replacement of the pool.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Must match apps/learner-web/server/passage-store-file.ts. Kept in sync by hand
// so neither the app server nor this tool has to depend on the other.
const STORE_PATH = join(REPO_ROOT, 'content', 'passage-of-the-day', '.local', 'passages.json');

function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  return url !== undefined && url.trim() !== '' ? url : undefined;
}

/** Read + validate an authoring file, exiting with clear per-field errors on failure. */
function readAuthoredFile(file: string): PassageOfTheDayEntry[] {
  // `pnpm --filter` runs in the package dir, so resolve a relative path against
  // the directory the command was invoked from (pnpm sets INIT_CWD).
  const resolved = isAbsolute(file) ? file : join(process.env.INIT_CWD ?? process.cwd(), file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    console.error(
      `Could not read/parse JSON at ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  try {
    return parseAuthoredPassages(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(`Validation failed for ${file}:`);
      for (const issue of error.issues) {
        console.error(`  /${issue.path.join('/')} [${issue.code}] ${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
}

function loadExistingStore(): PassageOfTheDayEntry[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return null;
  }
  const parsed = PassageOfTheDayEntrySchema.array().safeParse(raw);
  if (!parsed.success) {
    console.error(
      `The existing local store at ${STORE_PATH} is malformed; refusing to overwrite it. ` +
        'Fix or delete it, then re-run.',
    );
    process.exit(1);
  }
  return parsed.data;
}

/** Merge incoming entries onto a base, replacing by id and appending new ones (order-stable). */
function mergeById(
  base: readonly PassageOfTheDayEntry[],
  incoming: readonly PassageOfTheDayEntry[],
): PassageOfTheDayEntry[] {
  const byId = new Map(base.map((entry) => [entry.id, entry] as const));
  const order = base.map((entry) => entry.id);
  for (const entry of incoming) {
    if (!byId.has(entry.id)) order.push(entry.id);
    byId.set(entry.id, entry);
  }
  return order.map((id) => byId.get(id) as PassageOfTheDayEntry);
}

async function writeToPostgres(entries: readonly PassageOfTheDayEntry[]): Promise<void> {
  const pool = createDatabasePoolFromEnv();
  try {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const count = await upsertPassages(client, entries);
      await client.query('commit');
      console.log(`Upserted ${count} passage(s) into Postgres.`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

function writeToStore(entries: readonly PassageOfTheDayEntry[]): void {
  // Base on the existing store, or seed from the hardcoded pool so additions sit
  // ON TOP of the vetted 12 rather than replacing them.
  const base = loadExistingStore() ?? [...hardcodedPassagePool()];
  const merged = PassageOfTheDayEntrySchema.array().parse(mergeById(base, entries));
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Wrote ${merged.length} passage(s) to the local dev store: ${STORE_PATH}`);
  console.log('(No DATABASE_URL — the app serves these with no database.)');
}

async function apply(entries: readonly PassageOfTheDayEntry[]): Promise<void> {
  if (databaseUrl() !== undefined) await writeToPostgres(entries);
  else writeToStore(entries);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const command = args[0];

  if (command === 'ingest') {
    const file = args[1];
    if (file === undefined) {
      console.error('Usage: ingest <path-to-json>');
      process.exit(1);
    }
    const entries = readAuthoredFile(file);
    console.log(`Validated ${entries.length} passage(s) from ${file}.`);
    await apply(entries);
    return;
  }

  if (command === 'seed') {
    const entries = [...hardcodedPassagePool()];
    console.log(`Seeding the canonical pool: ${entries.length} passages.`);
    await apply(entries);
    return;
  }

  console.log(
    'MCAT Passage-of-the-Day CLI\n\nCommands:\n' +
      '  ingest <file>   Validate a JSON file of authored CARS passages and ADD them\n' +
      '                  (Postgres if DATABASE_URL is set, else the local dev store)\n' +
      '  seed            Seed/refresh the canonical 12-passage pool into the same target\n',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
