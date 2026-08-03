import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  AuthoredQuestionSchema,
  authoredQuestionToBankRows,
  formatCurriculumRefViolation,
  parseAuthoredQuestions,
  validateCurriculumRefs,
  type AuthoredQuestionBankRows,
  type CurriculumRefRow,
} from '@mcat/content';
import { createDatabasePoolFromEnv, upsertQuestions } from '@mcat/persistence-postgres';
import { zipCorpusRows, type RawProtectedRow, type RawSafeRow } from './corpus';

/**
 * Practice-bank question ingest/seed CLI. Mirrors the Passage-of-the-Day CLI
 * (tools/passage-cli): validate a user-authored file against the AUTHORING schema,
 * lower it onto the canonical v7 record, compile the learner-safe / protected
 * split (with per-choice `error_models`), and ADD the results (upsert by id) to the
 * practice bank.
 *
 *   ingest <file>   Validate a JSON or JSONL file of authored questions (single
 *                   object, JSON array, or one object per line) and add them.
 *   seed [dir]      Load an already-compiled corpus pull (questions.json +
 *                   protected.json) into Postgres — the idempotent prod seed.
 *   scan [dir]      Scan an existing corpus/pull for referential-integrity
 *                   violations WITHOUT writing anything (CI-runnable gate).
 *
 * Every ingested question is additionally checked against the in-repo V3 curriculum
 * (the REFERENTIAL-INTEGRITY GUARD, @mcat/content `validateCurriculumRefs`): its
 * kc_id must be one of the 422 canonical KCs, its lesson_id must resolve, the KC must
 * actually belong to that lesson, and the derived cluster must not be null. A
 * violation is a HARD, per-row reject — a silently-mislinked question never reaches
 * the bank.
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

// Must match `dbPullDir()` in packages/corpus-pull. Kept in sync by hand so
// neither the reader package nor this tool has to depend on the other.
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

// ---- Seed (load an already-compiled corpus pull into Postgres) --------------

function readJsonArray<T>(path: string, label: string): T[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(
      `Could not read the ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    console.error(`The ${label} at ${path} is not a JSON array.`);
    process.exit(1);
  }
  return raw as T[];
}

/**
 * Resolve the corpus directory the seed reads from. An explicit argument wins,
 * then $MCAT_QUESTION_CORPUS_DIR (the repo-controlled, env-overridable path), then
 * the gitignored local pull. Keeping this env-driven is what lets the same command
 * run in prod (corpus vendored/generated at a configured path) and locally.
 */
function resolveCorpusDir(dirArg: string | undefined): string {
  if (dirArg !== undefined) {
    return isAbsolute(dirArg) ? dirArg : join(process.env.INIT_CWD ?? process.cwd(), dirArg);
  }
  return process.env.MCAT_QUESTION_CORPUS_DIR ?? STORE_DIR;
}

/**
 * Zip a `questions.json` + `protected.json` pull into the { safe, protected } bank
 * rows `upsertQuestions` consumes. The pull is the compiled projection the dev
 * file-bank already reads, so the seed and the dev bank agree byte-for-byte. Refuses
 * (exits) if the two files disagree on the id set — a half-written pull must never be
 * seeded.
 */
function readCorpusRows(dir: string): AuthoredQuestionBankRows[] {
  const questionsPath = join(dir, 'questions.json');
  const protectedPath = join(dir, 'protected.json');
  if (!existsSync(questionsPath) || !existsSync(protectedPath)) {
    console.error(
      `No compiled corpus at ${dir} (need both questions.json and protected.json).\n` +
        'Set $MCAT_QUESTION_CORPUS_DIR to the corpus location, or pass the directory as an argument.\n' +
        'See content/question-bank/corpus-source.md for how to produce/vendor the corpus.',
    );
    process.exit(1);
  }

  const safeRows = readJsonArray<RawSafeRow>(questionsPath, 'questions.json');
  const protectedRows = readJsonArray<RawProtectedRow>(protectedPath, 'protected.json');
  const { rows, problems } = zipCorpusRows(safeRows, protectedRows);

  if (problems.length > 0) {
    console.error(`Refusing to seed: ${problems.length} malformed/misaligned row(s):`);
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  if (rows.length === 0) {
    console.error(`No questions found in ${questionsPath}.`);
    process.exit(1);
  }
  return rows;
}

/**
 * IDEMPOTENT PROD SEED (questions). Reads the compiled corpus pull, re-runs the
 * referential-integrity guard as defense-in-depth (a mislinked item never lands in
 * Postgres, even if it somehow bypassed ingest), then upserts via `upsertQuestions`.
 * Requires DATABASE_URL: this command exists to load the DEPLOYED database. Re-running
 * it is safe — every row is an upsert by question_id.
 */
async function cmdSeed(dirArg: string | undefined): Promise<void> {
  const dir = resolveCorpusDir(dirArg);
  const rows = readCorpusRows(dir);
  console.log(`Read ${rows.length} question(s) from ${dir}.`);
  summarize(rows);
  assertCurriculumRefs(rows);

  if (databaseUrl() === undefined) {
    console.error(
      'DATABASE_URL is not set. The seed loads the deployed Postgres — set DATABASE_URL ' +
        '(e.g. the Session pooler / RDS Proxy URL) and re-run. NOTE: the dev server does NOT ' +
        'auto-load a root .env, so export it in the same shell.',
    );
    process.exit(1);
  }
  await writeToPostgres(rows);
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

/**
 * REFERENTIAL-INTEGRITY GUARD (ingest). Runs the shared @mcat/content check over the
 * compiled learner-safe rows and, on any violation, prints every offending row and
 * EXITS non-zero before anything is written. This is what stops a silently-mislinked
 * question (unknown/mismatched kc_id·lesson_id, or an unresolved cluster) from ever
 * reaching Postgres or the local pull.
 */
function assertCurriculumRefs(rows: readonly AuthoredQuestionBankRows[]): void {
  const violations = validateCurriculumRefs(rows.map((row) => row.safe));
  if (violations.length === 0) {
    console.log(`  curriculum integrity: OK (${rows.length} question(s) resolve against the V3 curriculum).`);
    return;
  }
  console.error(
    `Referential-integrity check FAILED: ${violations.length} violation(s) across ` +
      `${new Set(violations.map((v) => v.question_id)).size} question(s). Nothing was written.`,
  );
  for (const violation of violations) console.error(formatCurriculumRefViolation(violation));
  process.exit(1);
}

/**
 * REFERENTIAL-INTEGRITY GUARD (corpus scan) — the CI-runnable half of the guard.
 * Reads the learner-safe `questions.json` from a corpus directory (an argument, else
 * $MCAT_QUESTION_CORPUS_DIR, else the gitignored local pull) and runs the same
 * @mcat/content check. Exits non-zero on any violation; when the corpus is absent
 * (fresh clone / CI without a pull) it degrades to a clean skip so it never turns CI
 * red on its own — the packages/content unit test still exercises the guard there.
 */
function scanCorpus(dirArg: string | undefined): void {
  const dir =
    dirArg !== undefined
      ? isAbsolute(dirArg)
        ? dirArg
        : join(process.env.INIT_CWD ?? process.cwd(), dirArg)
      : (process.env.MCAT_QUESTION_CORPUS_DIR ?? STORE_DIR);
  const questionsPath = join(dir, 'questions.json');

  if (!existsSync(questionsPath)) {
    console.log(`No corpus found at ${questionsPath} — skipping the referential-integrity scan.`);
    console.log('(This is expected on a fresh clone / CI without a local pull.)');
    return;
  }

  let rows: CurriculumRefRow[];
  try {
    const raw: unknown = JSON.parse(readFileSync(questionsPath, 'utf8'));
    if (!Array.isArray(raw)) {
      console.error(`The corpus at ${questionsPath} is not a JSON array of questions.`);
      process.exit(1);
    }
    rows = raw as CurriculumRefRow[];
  } catch (error) {
    console.error(
      `Could not read the corpus at ${questionsPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  const violations = validateCurriculumRefs(rows);
  if (violations.length === 0) {
    console.log(
      `Referential-integrity scan OK: ${rows.length} question(s) in ${questionsPath} resolve against the V3 curriculum.`,
    );
    return;
  }
  console.error(
    `Referential-integrity scan FAILED: ${violations.length} violation(s) across ` +
      `${new Set(violations.map((v) => v.question_id)).size} question(s) in ${questionsPath}.`,
  );
  for (const violation of violations) console.error(formatCurriculumRefViolation(violation));
  process.exit(1);
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
    assertCurriculumRefs(rows);
    await apply(rows);
    return;
  }

  if (command === 'seed') {
    await cmdSeed(args[1]);
    return;
  }

  if (command === 'scan') {
    scanCorpus(args[1]);
    return;
  }

  console.log(
    'MCAT practice-bank questions CLI\n\nCommands:\n' +
      '  ingest <file>   Validate a JSON/JSONL file of authored questions and ADD them\n' +
      '                  (single object, JSON array, or one object per line). Postgres if\n' +
      '                  DATABASE_URL is set, else the gitignored local dev pull.\n' +
      '  seed [dir]      Upsert an already-compiled corpus pull (questions.json +\n' +
      '                  protected.json) into Postgres (idempotent; requires DATABASE_URL).\n' +
      '                  Defaults to $MCAT_QUESTION_CORPUS_DIR or the local db-pull.\n' +
      '  scan [dir]      Referential-integrity scan of an existing corpus/pull (no writes).\n' +
      '                  Defaults to $MCAT_QUESTION_CORPUS_DIR or the local db-pull; exits\n' +
      '                  non-zero on any violation, and cleanly (skip) when absent.\n',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
