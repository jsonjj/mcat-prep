import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AuthoredPassageSchema,
  PassageOfTheDayEntrySchema,
  authoredPassageToEntry,
  parseAuthoredPassages,
  type PassageOfTheDayEntry,
} from '@mcat/contracts';
import { createDatabasePoolFromEnv, upsertPassages } from '@mcat/persistence-postgres';
import { hardcodedPassagePool } from '../../../content/passage-of-the-day/pool';

/**
 * Passage of the Day ingest/seed CLI.
 *
 *   ingest <file>   Validate a JSON or JSONL file of user-authored CARS passages
 *                   (the AUTHORING FORMAT) with the Zod schema and ADD them to the
 *                   pool. Accepts a single object, a JSON array, or JSONL (one
 *                   passage object per line).
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

function zodIssueLines(prefix: string, error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${prefix}/${issue.path.join('/')} [${issue.code}] ${issue.message}`,
  );
}

/**
 * Read + validate an authoring file, exiting with clear per-record errors on
 * failure. Three on-disk shapes are accepted:
 *   • a single authored-passage JSON object,
 *   • a JSON array of authored passages, or
 *   • JSONL — one authored-passage object per line (the corpus convention used by
 *     packages/content/src/load-v7.ts).
 * The whole file is tried as JSON (object/array) first; if that fails it is parsed
 * line-by-line as JSONL, so a malformed record is reported with its line number.
 */
function readAuthoredFile(file: string): PassageOfTheDayEntry[] {
  // `pnpm --filter` runs in the package dir, so resolve a relative path against
  // the directory the command was invoked from (pnpm sets INIT_CWD).
  const resolved = isAbsolute(file) ? file : join(process.env.INIT_CWD ?? process.cwd(), file);
  let text: string;
  try {
    text = readFileSync(resolved, 'utf8');
  } catch (error) {
    console.error(`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  if (text.trim() === '') {
    console.error(`No passages found in ${file} (the file is empty).`);
    process.exit(1);
  }

  const fail = (problems: readonly string[]): never => {
    console.error(`Validation failed for ${file}:`);
    for (const problem of problems) console.error(problem);
    process.exit(1);
  };

  // Prefer a whole-file JSON parse (single object or array); JSONL is the fallback.
  let whole: unknown;
  let wholeIsJson = true;
  try {
    whole = JSON.parse(text);
  } catch {
    wholeIsJson = false;
  }
  if (wholeIsJson) {
    try {
      return parseAuthoredPassages(whole);
    } catch (error) {
      if (error instanceof z.ZodError) fail(zodIssueLines('  ', error));
      throw error;
    }
  }

  // JSONL: one authored passage per non-empty line, validated independently so a
  // single bad line is rejected with a precise, per-record message.
  const entries: PassageOfTheDayEntry[] = [];
  const problems: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    const where = `  line ${index + 1} `;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch (error) {
      problems.push(
        `${where}invalid JSON — ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    try {
      entries.push(authoredPassageToEntry(AuthoredPassageSchema.parse(raw)));
    } catch (error) {
      if (error instanceof z.ZodError) problems.push(...zodIssueLines(where, error));
      else problems.push(`${where}${error instanceof Error ? error.message : String(error)}`);
    }
  });

  if (problems.length > 0) fail(problems);
  if (entries.length === 0) {
    console.error(`No passages found in ${file}.`);
    process.exit(1);
  }
  return entries;
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
      console.error('Usage: ingest <path-to-json-or-jsonl>');
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
      '  ingest <file>   Validate a JSON/JSONL file of authored CARS passages and ADD\n' +
      '                  them (single object, JSON array, or one object per line).\n' +
      '                  Postgres if DATABASE_URL is set, else the local dev store\n' +
      '  seed            Seed/refresh the canonical 12-passage pool into the same target\n',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
