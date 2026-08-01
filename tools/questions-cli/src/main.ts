import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AuthoredQuestionSchema,
  authoredQuestionToBankRows,
  parseAuthoredQuestions,
  type AuthoredQuestionBankRows,
} from '@mcat/content';
import { createDatabasePoolFromEnv, upsertQuestions } from '@mcat/persistence-postgres';

/**
 * Practice-bank question ingest/seed CLI. Mirrors the Passage-of-the-Day CLI
 * (tools/passage-cli): validate a user-authored file against the AUTHORING schema,
 * lower it onto the canonical v7 record, compile the learner-safe / protected
 * split (with per-choice `error_models`), and ADD the results (upsert by id) to the
 * practice bank.
 *
 *   ingest <file>   Validate a JSON or JSONL file of authored questions (single
 *                   object, JSON array, or one object per line) and add them.
 *
 * Target is chosen from the environment, mirroring the runtime bank selection:
 *   • DATABASE_URL set  → upsert into Postgres (`questions` + `question_protected`).
 *   • otherwise         → write the gitignored local dev pull the file-backed
 *                         practice bank reads (content/question-bank/.local/db-pull),
 *                         so a developer with no database still gets the new items.
 *
 * Questions are ADDED (upsert by question_id), never a wholesale replacement of the
 * bank. The local pull is gitignored and must never be committed.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Must match apps/learner-web/server/db-pull.ts `dbPullDir()`. Kept in sync by
// hand so neither the app server nor this tool has to depend on the other.
const STORE_DIR = join(REPO_ROOT, 'content', 'question-bank', '.local', 'db-pull');
const STORE_QUESTIONS = join(STORE_DIR, 'questions.json');
const STORE_PROTECTED = join(STORE_DIR, 'protected.json');

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
 * failure. Three on-disk shapes are accepted (as the passage ingest and
 * packages/content/src/load-v7.ts): a single object, a JSON array, or JSONL — one
 * authored question per line. The whole file is tried as JSON first; if that fails
 * it is parsed line-by-line so a malformed record is reported with its line number.
 * Returns the compiled { safe, protected } bank rows.
 */
function readAuthoredFile(file: string): AuthoredQuestionBankRows[] {
  // `pnpm --filter` runs in the package dir, so resolve a relative path against
  // the directory the command was invoked from (pnpm sets INIT_CWD).
  const resolved = isAbsolute(file) ? file : join(process.env.INIT_CWD ?? process.cwd(), file);
  let text: string;
  try {
    text = readFileSync(resolved, 'utf8');
  } catch (error) {
    console.error(
      `Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  if (text.trim() === '') {
    console.error(`No questions found in ${file} (the file is empty).`);
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
      return parseAuthoredQuestions(whole).map(authoredQuestionToBankRows);
    } catch (error) {
      if (error instanceof z.ZodError) fail(zodIssueLines('  ', error));
      throw error;
    }
  }

  // JSONL: one authored question per non-empty line, validated independently so a
  // single bad line is rejected with a precise, per-record message.
  const rows: AuthoredQuestionBankRows[] = [];
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
      rows.push(authoredQuestionToBankRows(AuthoredQuestionSchema.parse(raw)));
    } catch (error) {
      if (error instanceof z.ZodError) problems.push(...zodIssueLines(where, error));
      else problems.push(`${where}${error instanceof Error ? error.message : String(error)}`);
    }
  });

  if (problems.length > 0) fail(problems);
  if (rows.length === 0) {
    console.error(`No questions found in ${file}.`);
    process.exit(1);
  }
  return rows;
}

/** A stored row identified by `question_id` (the corpus pull's own shape). */
interface StoreRow {
  question_id: string;
  [key: string]: unknown;
}

/**
 * Read an existing store array, or [] when the file is absent (fresh clone / no
 * pull). REFUSES (exits) when the file exists but is not a JSON array of rows, so a
 * malformed store — or the real multi-thousand-item corpus pull — is never
 * clobbered by a partial rewrite.
 */
function readExistingStore(path: string): StoreRow[] {
  if (!existsSync(path)) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(
      `The existing store at ${path} is not valid JSON; refusing to overwrite it. ` +
        `Fix or delete it, then re-run. (${error instanceof Error ? error.message : String(error)})`,
    );
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    console.error(`The existing store at ${path} is not a JSON array; refusing to overwrite it.`);
    process.exit(1);
  }
  return raw as StoreRow[];
}

/** Merge incoming rows onto a base, replacing by question_id and appending new ones (order-stable). */
function mergeById(base: readonly StoreRow[], incoming: readonly StoreRow[]): StoreRow[] {
  const byId = new Map(base.map((row) => [row.question_id, row] as const));
  const order = base.map((row) => row.question_id);
  for (const row of incoming) {
    if (!byId.has(row.question_id)) order.push(row.question_id);
    byId.set(row.question_id, row);
  }
  return order.map((id) => byId.get(id) as StoreRow);
}

function writeToStore(rows: readonly AuthoredQuestionBankRows[]): void {
  const safeIncoming = rows.map((row) => row.safe as unknown as StoreRow);
  const protectedIncoming = rows.map((row) => row.protected as unknown as StoreRow);

  const mergedQuestions = mergeById(readExistingStore(STORE_QUESTIONS), safeIncoming);
  const mergedProtected = mergeById(readExistingStore(STORE_PROTECTED), protectedIncoming);

  mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_QUESTIONS, `${JSON.stringify(mergedQuestions, null, 2)}\n`);
  writeFileSync(STORE_PROTECTED, `${JSON.stringify(mergedProtected, null, 2)}\n`);
  console.log(
    `Wrote ${mergedQuestions.length} question(s) to the local dev pull: ${STORE_DIR}` +
      ` (+${rows.length} upserted).`,
  );
  console.log('(No DATABASE_URL — the file-backed practice bank serves these with no database.)');
  console.log('This pull is gitignored: do NOT commit it.');
}

async function writeToPostgres(rows: readonly AuthoredQuestionBankRows[]): Promise<void> {
  const pool = createDatabasePoolFromEnv();
  try {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const count = await upsertQuestions(client, rows);
      await client.query('commit');
      console.log(`Upserted ${count} question(s) into Postgres (questions + question_protected).`);
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

async function apply(rows: readonly AuthoredQuestionBankRows[]): Promise<void> {
  if (databaseUrl() !== undefined) await writeToPostgres(rows);
  else writeToStore(rows);
}

function summarize(rows: readonly AuthoredQuestionBankRows[]): void {
  const bySection: Record<string, number> = {};
  let withErrorModels = 0;
  for (const { safe, protected: prot } of rows) {
    bySection[safe.section] = (bySection[safe.section] ?? 0) + 1;
    if (prot.error_models !== null) withErrorModels += 1;
  }
  console.log(`  by section: ${Object.entries(bySection).map(([s, n]) => `${s}:${n}`).join(' ')}`);
  console.log(`  with per-choice error models: ${withErrorModels}/${rows.length}`);
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
    const rows = readAuthoredFile(file);
    console.log(`Validated ${rows.length} question(s) from ${file}.`);
    summarize(rows);
    await apply(rows);
    return;
  }

  console.log(
    'MCAT practice-bank questions CLI\n\nCommands:\n' +
      '  ingest <file>   Validate a JSON/JSONL file of authored questions and ADD them\n' +
      '                  (single object, JSON array, or one object per line). Postgres if\n' +
      '                  DATABASE_URL is set, else the gitignored local dev pull.\n',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
