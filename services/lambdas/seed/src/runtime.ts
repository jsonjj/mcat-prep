import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { AuthoredQuestionBankRows, PracticeBankProtectedRow, PracticeBankSafeRow } from '@mcat/content';
import type { PassageOfTheDayEntry } from '@mcat/contracts';
import { upsertPassages, upsertQuestions } from '@mcat/persistence-postgres';

/**
 * One-shot IN-VPC content seeder runtime.
 *
 * The deployed Aurora cluster lives in isolated subnets reachable only through the
 * RDS Proxy from inside the VPC, so the GitHub/dev runner cannot open a Postgres
 * connection to it. This Lambda mirrors the migration Lambda
 * (services/lambdas/migration): it runs inside those subnets, loads the Aurora
 * ADMIN credentials from Secrets Manager, connects through the proxy, and UPSERTS
 * the bundled corpus (learner-safe questions + protected answer keys, and the
 * Passage-of-the-Day pool) using the exact same reviewed repo write seams
 * (`upsertQuestions` / `upsertPassages`) the local/CI `content:seed` uses.
 *
 * It is idempotent: every row is an upsert by id, so re-invoking is safe. The
 * corpus is bundled with the function (see infra/cdk/lib/seed-stack.ts), so the
 * runner needs no database reachability and no DATABASE_URL.
 */

export const EXPECTED_REGION = 'us-east-1';
export const EXPECTED_ACCOUNT = '056956104102';

// Postgres caps a single statement at 65535 bind parameters. `upsertQuestions`
// binds 14 params per row for the `questions` insert, so a batch of 500 rows uses
// 7000 — comfortably under the cap even with the paired protected insert.
const QUESTION_UPSERT_BATCH = 500;

const SECRET_ARN =
  /^arn:aws:secretsmanager:us-east-1:\d{12}:secret:\/mcat\/dev\/database\/admin-[A-Za-z0-9]{6}$/;
const PROXY_ENDPOINT = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.rds\.amazonaws\.com$/i;

export interface SeedEnvironment {
  readonly region: typeof EXPECTED_REGION;
  readonly account: typeof EXPECTED_ACCOUNT;
  readonly adminSecretId: string;
  readonly endpoint: string;
  readonly database: 'mcat';
  readonly corpusDir: string;
}

export interface DatabaseSecret {
  readonly username: string;
  readonly password: string;
}

export interface SecretCommandClient {
  send(command: GetSecretValueCommand): Promise<{ readonly SecretString?: string }>;
}

/** Minimal structural client — a pg `PoolClient` satisfies this. */
export interface SeedClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
  release(): void;
}

export interface SeedPool {
  connect(): Promise<SeedClient>;
  end(): Promise<void>;
}

export interface SeedPoolOptions {
  readonly connectionString: string;
  readonly ssl: { readonly rejectUnauthorized: true };
  readonly applicationName: 'mcat-content-seed';
  readonly maxConnections: 1;
}

export type SeedPoolFactory = (options: SeedPoolOptions) => SeedPool;

export type SeedLogger = (event: Record<string, unknown>) => void;

export interface SeedHandlerDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly secrets: SecretCommandClient;
  readonly poolFactory: SeedPoolFactory;
  readonly logger: SeedLogger;
}

export interface ContentCounts {
  readonly questions: number;
  readonly question_protected: number;
  readonly passages: number;
  readonly passage_questions: number;
  readonly question_stats: number;
}

export interface SeedResult {
  readonly ok: true;
  readonly operation: 'seed' | 'counts';
  readonly seeded: { readonly questions: number; readonly passages: number } | null;
  readonly counts: ContentCounts;
}

export class SeedRuntimeError extends Error {
  readonly code = 'seed_failed';

  constructor(message: string) {
    super(message);
    this.name = 'SeedRuntimeError';
  }
}

/** Learner-safe corpus row (packages/corpus-pull `PulledQuestion`). */
interface RawSafeRow {
  question_id: string;
  section: string;
  cluster: string | null;
  kc_id: string | null;
  lesson_id: string | null;
  family_id: string | null;
  subject: string | null;
  primary_skill: string | null;
  reasoning_operation?: string | null;
  dok_level: number | null;
  stem: string;
  passage: string | null;
  choices: Record<string, string> | null;
  status: string | null;
}

/** Server-only corpus row (`PulledProtected`). */
interface RawProtectedRow {
  question_id: string;
  correct_answer: PracticeBankProtectedRow['correct_answer'];
  explanations: Record<string, string>;
  error_models?: Record<string, string> | null;
}

export function parseSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): SeedEnvironment {
  const region = environment.AWS_REGION;
  const account = environment.AWS_ACCOUNT_ID;
  const adminSecretId = environment.ADMIN_DB_SECRET_ID ?? environment.ADMIN_DB_SECRET_ARN;
  const endpoint = environment.DB_PROXY_ENDPOINT;
  const database = environment.DB_NAME;
  const corpusDir = environment.CORPUS_DIR;

  if (
    region !== EXPECTED_REGION ||
    account !== EXPECTED_ACCOUNT ||
    adminSecretId === undefined ||
    !SECRET_ARN.test(adminSecretId) ||
    endpoint === undefined ||
    !PROXY_ENDPOINT.test(endpoint) ||
    database !== 'mcat' ||
    corpusDir === undefined ||
    corpusDir.length === 0 ||
    !isAbsolute(corpusDir)
  ) {
    throw new SeedRuntimeError('Seed environment is invalid.');
  }

  return { region, account, adminSecretId, endpoint, database, corpusDir };
}

export function parseDatabaseSecret(secretString: string): DatabaseSecret {
  let value: unknown;
  try {
    value = JSON.parse(secretString);
  } catch {
    throw new SeedRuntimeError('Database secret has an invalid shape.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SeedRuntimeError('Database secret has an invalid shape.');
  }
  const record = value as Record<string, unknown>;
  if (
    record.username !== 'mcat_admin' ||
    typeof record.password !== 'string' ||
    record.password.length < 16 ||
    record.password.includes('\0')
  ) {
    throw new SeedRuntimeError('Database secret has an invalid shape.');
  }
  return { username: 'mcat_admin', password: record.password };
}

function databaseUrl(environment: SeedEnvironment, secret: DatabaseSecret): string {
  return `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(
    secret.password,
  )}@${environment.endpoint}:5432/${environment.database}`;
}

async function readJsonArray<T>(corpusDir: string, file: string): Promise<T[]> {
  const path = join(corpusDir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new SeedRuntimeError(
      `Could not read bundled corpus file ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(raw)) throw new SeedRuntimeError(`Bundled corpus file ${file} is not an array.`);
  return raw as T[];
}

/**
 * Zip learner-safe rows with their protected pair by `question_id`, mirroring
 * tools/questions-cli/src/corpus.ts `zipCorpusRows`. A safe row with no protected
 * pair, or missing any of A–D, is a hard failure — a half-written corpus is never
 * partially seeded.
 */
function zipCorpusRows(
  safeRows: readonly RawSafeRow[],
  protectedRows: readonly RawProtectedRow[],
): AuthoredQuestionBankRows[] {
  const protectedById = new Map(protectedRows.map((row) => [row.question_id, row] as const));
  const rows: AuthoredQuestionBankRows[] = [];
  const problems: string[] = [];

  for (const raw of safeRows) {
    const prot = protectedById.get(raw.question_id);
    if (prot === undefined) {
      problems.push(`${raw.question_id}: present in questions.json but missing from protected.json`);
      continue;
    }
    const choices = raw.choices;
    if (
      choices === null ||
      typeof choices.A !== 'string' ||
      typeof choices.B !== 'string' ||
      typeof choices.C !== 'string' ||
      typeof choices.D !== 'string'
    ) {
      problems.push(`${raw.question_id}: choices are missing one of A–D`);
      continue;
    }
    const safe: PracticeBankSafeRow = {
      question_id: raw.question_id,
      section: raw.section,
      cluster: raw.cluster,
      kc_id: raw.kc_id,
      lesson_id: raw.lesson_id,
      family_id: raw.family_id,
      subject: raw.subject,
      primary_skill: raw.primary_skill,
      reasoning_operation: raw.reasoning_operation ?? null,
      dok_level: raw.dok_level,
      stem: raw.stem,
      passage: raw.passage ?? '',
      choices: { A: choices.A, B: choices.B, C: choices.C, D: choices.D },
      status: raw.status ?? 'production_candidate',
    };
    const protectedRow: PracticeBankProtectedRow = {
      question_id: prot.question_id,
      correct_answer: prot.correct_answer,
      explanations: prot.explanations as PracticeBankProtectedRow['explanations'],
      error_models: (prot.error_models ?? null) as PracticeBankProtectedRow['error_models'],
    };
    rows.push({ safe, protected: protectedRow });
  }

  if (problems.length > 0) {
    throw new SeedRuntimeError(
      `Refusing to seed: ${problems.length} malformed/misaligned corpus row(s). First: ${problems[0]}`,
    );
  }
  return rows;
}

async function readCounts(client: SeedClient): Promise<ContentCounts> {
  const { rows } = await client.query<{
    questions: string;
    question_protected: string;
    passages: string;
    passage_questions: string;
    question_stats: string;
  }>(
    `select
       (select count(*) from questions) as questions,
       (select count(*) from question_protected) as question_protected,
       (select count(*) from passages) as passages,
       (select count(*) from passage_questions) as passage_questions,
       (select count(*) from question_stats) as question_stats`,
  );
  const row = rows[0];
  const n = (v: string | undefined): number => Number(v ?? 0);
  return {
    questions: n(row?.questions),
    question_protected: n(row?.question_protected),
    passages: n(row?.passages),
    passage_questions: n(row?.passage_questions),
    question_stats: n(row?.question_stats),
  };
}

async function configureSession(client: SeedClient): Promise<void> {
  await client.query(
    `select
       set_config('application_name', 'mcat-content-seed', false),
       set_config('statement_timeout', '120000', false),
       set_config('lock_timeout', '10000', false),
       set_config('idle_in_transaction_session_timeout', '120000', false)`,
  );
}

export function createSeedHandler(
  dependencies: SeedHandlerDependencies,
): (event: unknown) => Promise<SeedResult> {
  return async (rawEvent) => {
    const operation = parseOperation(rawEvent);
    let pool: SeedPool | undefined;
    let client: SeedClient | undefined;
    try {
      const environment = parseSeedEnvironment(dependencies.environment);
      const secretOutput = await dependencies.secrets.send(
        new GetSecretValueCommand({ SecretId: environment.adminSecretId }),
      );
      if (secretOutput.SecretString === undefined) {
        throw new SeedRuntimeError('Database secret has an invalid shape.');
      }
      const secret = parseDatabaseSecret(secretOutput.SecretString);

      pool = dependencies.poolFactory({
        connectionString: databaseUrl(environment, secret),
        ssl: { rejectUnauthorized: true },
        applicationName: 'mcat-content-seed',
        maxConnections: 1,
      });
      client = await pool.connect();
      await configureSession(client);

      let seeded: SeedResult['seeded'] = null;
      if (operation === 'seed') {
        const safeRows = await readJsonArray<RawSafeRow>(environment.corpusDir, 'questions.json');
        const protectedRows = await readJsonArray<RawProtectedRow>(
          environment.corpusDir,
          'protected.json',
        );
        const passages = await readJsonArray<PassageOfTheDayEntry>(
          environment.corpusDir,
          'passages.json',
        );
        const rows = zipCorpusRows(safeRows, protectedRows);
        dependencies.logger({
          event: 'seed.started',
          questions: rows.length,
          passages: passages.length,
        });

        await client.query('begin');
        try {
          let seededQuestions = 0;
          for (let i = 0; i < rows.length; i += QUESTION_UPSERT_BATCH) {
            seededQuestions += await upsertQuestions(client, rows.slice(i, i + QUESTION_UPSERT_BATCH));
          }
          const seededPassages = await upsertPassages(client, passages);
          await client.query('commit');
          seeded = { questions: seededQuestions, passages: seededPassages };
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      }

      const counts = await readCounts(client);
      const result: SeedResult = { ok: true, operation, seeded, counts };
      dependencies.logger({ event: 'seed.completed', operation, seeded, counts });
      return result;
    } catch (error) {
      dependencies.logger({
        event: 'seed.failed',
        message: error instanceof Error ? error.message : String(error),
      });
      throw error instanceof SeedRuntimeError
        ? error
        : new SeedRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      client?.release();
      if (pool !== undefined) await pool.end().catch(() => undefined);
    }
  };
}

function parseOperation(rawEvent: unknown): 'seed' | 'counts' {
  if (rawEvent === undefined || rawEvent === null) return 'seed';
  if (typeof rawEvent === 'object' && !Array.isArray(rawEvent)) {
    const operation = (rawEvent as Record<string, unknown>).operation;
    if (operation === undefined || operation === 'seed') return 'seed';
    if (operation === 'counts') return 'counts';
  }
  throw new SeedRuntimeError('Seed request is invalid (operation must be "seed" or "counts").');
}
