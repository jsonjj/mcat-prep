import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  MIGRATION_ADVISORY_LOCK_ID,
  runMigrations,
  type MigrationClient,
  type MigrationPool,
  type MigrationQueryResult,
} from '@mcat/database';

export const EXPECTED_REGION = 'us-east-1';
export const EXPECTED_ACCOUNT = '056956104102';
export { MIGRATION_ADVISORY_LOCK_ID };

const RUNTIME_ADVISORY_LOCK_ID = 72_004_003;
const MIGRATION_FILE = /^\d+_[a-z0-9][a-z0-9_-]*\.sql$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const SECRET_SUFFIX = '[A-Za-z0-9]{6}';

const ADMIN_ROLE = 'mcat_admin';
const LEARNER_ROLE = 'mcat_learner_api';
const WORKER_ROLE = 'mcat_workers';
const REVOKE_PUBLIC_DATABASE_DDL =
  "select format('revoke create, temporary on database %I from public', current_database()) as ddl";
const REVOKE_PUBLIC_SCHEMA_DDL = 'revoke create on schema public from public';
const REVOKE_PUBLIC_FUNCTION_EXECUTE_DDL =
  'revoke execute on all functions in schema public from public';
const REVOKE_PUBLIC_DEFAULT_FUNCTION_EXECUTE_DDL =
  'alter default privileges revoke execute on functions from public';

export interface MigrationEnvironment {
  readonly region: typeof EXPECTED_REGION;
  readonly account: typeof EXPECTED_ACCOUNT;
  readonly adminSecretArn: string;
  readonly learnerSecretArn: string;
  readonly workerSecretArn: string;
  readonly endpoint: string;
  readonly database: 'mcat';
  readonly migrationsDir: string;
}

export interface DatabaseSecret {
  readonly username: string;
  readonly password: string;
}

export interface SecretCommandClient {
  send(command: GetSecretValueCommand): Promise<{ readonly SecretString?: string }>;
}

export interface RuntimePoolOptions {
  readonly connectionString: string;
  readonly ssl: { readonly rejectUnauthorized: true };
  readonly applicationName: 'mcat-migration';
  readonly maxConnections: 1;
}

export interface RuntimePool extends MigrationPool {
  end(): Promise<void>;
}

export type RuntimePoolFactory = (options: RuntimePoolOptions) => RuntimePool;

export type MigrationLogEvent =
  | { readonly event: 'migration.started'; readonly migrationCount: number }
  | {
      readonly event: 'migration.completed';
      readonly migrationCount: number;
      readonly appliedCount: number;
      readonly alreadyAppliedCount: number;
    }
  | {
      readonly event: 'migration.failed';
      readonly code: 'migration_failed';
      readonly stage: MigrationFailureStage;
    };

export type MigrationFailureStage =
  | 'request_validation'
  | 'secret_loading'
  | 'database_connect'
  | 'database_lock'
  | 'migrations'
  | 'role_grants'
  | 'verification';

export type MigrationLogger = (event: MigrationLogEvent) => void;

export interface MigrationManifestEntry {
  readonly version: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface MigrationManifest {
  readonly schemaVersion: 1;
  readonly stage: 'dev';
  readonly account: typeof EXPECTED_ACCOUNT;
  readonly region: typeof EXPECTED_REGION;
  readonly gitCommit: string;
  readonly advisoryLockId: typeof MIGRATION_ADVISORY_LOCK_ID;
  readonly migrations: readonly MigrationManifestEntry[];
  readonly sha256: string;
}

export interface MigrationEvent {
  readonly operation: 'apply-forward';
  readonly manifest: MigrationManifest;
}

export interface MigrationResultEntry {
  readonly version: string;
  readonly sha256: string;
  readonly status: 'applied' | 'already_applied';
}

export interface MigrationResult {
  readonly ok: true;
  readonly advisoryLockId: typeof MIGRATION_ADVISORY_LOCK_ID;
  readonly manifestSha256: string;
  readonly migrationCount: number;
  readonly appliedCount: number;
  readonly alreadyAppliedCount: number;
  readonly migrations: readonly MigrationResultEntry[];
}

export interface MigrationHandlerDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly secrets: SecretCommandClient;
  readonly poolFactory: RuntimePoolFactory;
  readonly logger: MigrationLogger;
}

export class MigrationRuntimeError extends Error {
  readonly code = 'migration_failed';

  constructor() {
    super('Database migration failed.');
    this.name = 'MigrationRuntimeError';
  }
}

interface AppliedMigrationRow extends Record<string, unknown> {
  version: string;
  checksum: string;
}

interface RelationRow extends Record<string, unknown> {
  relation_name: string | null;
}

interface DdlRow extends Record<string, unknown> {
  ddl: string;
}

interface RoleSpec {
  readonly createSql: string;
  readonly hardenSql: string;
  readonly passwordFormatSql: string;
  readonly revokeDatabaseFormatSql: string;
  readonly grantConnectFormatSql: string;
  readonly revokeSchemaSql: string;
  readonly revokeTablesSql: string;
  readonly revokeSequencesSql: string;
  readonly revokeFunctionsSql: string;
  readonly grantSchemaSql: string;
  readonly dataGrantSql: readonly string[];
}

const ROLE_SPECS: readonly RoleSpec[] = [
  {
    createSql: `do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'mcat_learner_api') then
    execute 'create role mcat_learner_api login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  end if;
end
$role$`,
    hardenSql:
      'alter role mcat_learner_api with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
    passwordFormatSql: "select format('alter role mcat_learner_api password %L', $1::text) as ddl",
    revokeDatabaseFormatSql:
      "select format('revoke all privileges on database %I from mcat_learner_api', current_database()) as ddl",
    grantConnectFormatSql:
      "select format('grant connect on database %I to mcat_learner_api', current_database()) as ddl",
    revokeSchemaSql: 'revoke all privileges on schema public from mcat_learner_api',
    revokeTablesSql: 'revoke all privileges on all tables in schema public from mcat_learner_api',
    revokeSequencesSql:
      'revoke all privileges on all sequences in schema public from mcat_learner_api',
    revokeFunctionsSql:
      'revoke all privileges on all functions in schema public from mcat_learner_api',
    grantSchemaSql: 'grant usage on schema public to mcat_learner_api',
    dataGrantSql: [
      'grant insert on table learners to mcat_learner_api',
      'grant select, insert, update on table guest_sessions, learner_streams, api_rate_limits to mcat_learner_api',
      'grant select, insert on table accepted_events to mcat_learner_api',
      'grant insert on table outbox to mcat_learner_api',
    ],
  },
  {
    createSql: `do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'mcat_workers') then
    execute 'create role mcat_workers login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  end if;
end
$role$`,
    hardenSql:
      'alter role mcat_workers with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
    passwordFormatSql: "select format('alter role mcat_workers password %L', $1::text) as ddl",
    revokeDatabaseFormatSql:
      "select format('revoke all privileges on database %I from mcat_workers', current_database()) as ddl",
    grantConnectFormatSql:
      "select format('grant connect on database %I to mcat_workers', current_database()) as ddl",
    revokeSchemaSql: 'revoke all privileges on schema public from mcat_workers',
    revokeTablesSql: 'revoke all privileges on all tables in schema public from mcat_workers',
    revokeSequencesSql: 'revoke all privileges on all sequences in schema public from mcat_workers',
    revokeFunctionsSql: 'revoke all privileges on all functions in schema public from mcat_workers',
    grantSchemaSql: 'grant usage on schema public to mcat_workers',
    dataGrantSql: [
      'grant select, update on table outbox to mcat_workers',
      'grant select, insert on table inbox_deduplication to mcat_workers',
    ],
  },
] as const;

function secretArn(account: string, name: string): RegExp {
  return new RegExp(
    `^arn:aws:secretsmanager:${EXPECTED_REGION}:${account}:secret:/mcat/dev/database/${name}-${SECRET_SUFFIX}$`,
  );
}

export function parseMigrationEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): MigrationEnvironment {
  const region = environment.AWS_REGION;
  const account = environment.AWS_ACCOUNT_ID;
  const adminSecretArn = environment.ADMIN_DB_SECRET_ARN;
  const learnerSecretArn = environment.LEARNER_API_DB_SECRET_ARN;
  const workerSecretArn = environment.WORKERS_DB_SECRET_ARN;
  const endpoint = environment.DB_PROXY_ENDPOINT;
  const database = environment.DB_NAME;
  const migrationsDir = environment.MIGRATIONS_DIR;
  const resolvedMigrationsDir = migrationsDir === undefined ? '' : resolve(migrationsDir);

  if (
    region !== EXPECTED_REGION ||
    account !== EXPECTED_ACCOUNT ||
    adminSecretArn === undefined ||
    !secretArn(account, 'admin').test(adminSecretArn) ||
    learnerSecretArn === undefined ||
    !secretArn(account, 'learner-api').test(learnerSecretArn) ||
    workerSecretArn === undefined ||
    !secretArn(account, 'workers').test(workerSecretArn) ||
    new Set([adminSecretArn, learnerSecretArn, workerSecretArn]).size !== 3 ||
    endpoint === undefined ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.rds\.amazonaws\.com$/i.test(endpoint) ||
    database !== 'mcat' ||
    migrationsDir === undefined ||
    migrationsDir.length > 1024 ||
    !isAbsolute(migrationsDir) ||
    resolvedMigrationsDir !== migrationsDir
  ) {
    throw new Error('Migration environment is invalid.');
  }

  return {
    region,
    account,
    adminSecretArn,
    learnerSecretArn,
    workerSecretArn,
    endpoint,
    database,
    migrationsDir,
  };
}

export function parseDatabaseSecret(
  secretString: string,
  expectedUsername: string,
): DatabaseSecret {
  let value: unknown;
  try {
    value = JSON.parse(secretString);
  } catch {
    throw new Error('Database secret has an invalid shape.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Database secret has an invalid shape.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(',');
  const credentialOnly = keys === 'password,username';
  const attachedAuroraAdmin =
    expectedUsername === ADMIN_ROLE &&
    keys === 'dbClusterIdentifier,dbname,engine,host,password,port,username' &&
    record.engine === 'postgres' &&
    typeof record.host === 'string' &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.rds\.amazonaws\.com$/i.test(record.host) &&
    record.port === 5432 &&
    record.dbname === 'mcat' &&
    record.dbClusterIdentifier === 'mcat-dev-aurora';
  if (
    (!credentialOnly && !attachedAuroraAdmin) ||
    record.username !== expectedUsername ||
    typeof record.password !== 'string' ||
    record.password.length < 16 ||
    record.password.length > 1024 ||
    record.password.includes('\0')
  ) {
    throw new Error('Database secret has an invalid shape.');
  }
  return { username: expectedUsername, password: record.password };
}

async function loadSecret(
  client: SecretCommandClient,
  arn: string,
  expectedUsername: string,
): Promise<DatabaseSecret> {
  const output = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (output.SecretString === undefined) {
    throw new Error('Database secret has an invalid shape.');
  }
  return parseDatabaseSecret(output.SecretString, expectedUsername);
}

function digest(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function localMigrations(directory: string): Promise<readonly MigrationManifestEntry[]> {
  const filenames = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (filenames.length === 0) throw new Error('Migration request is invalid.');
  return Promise.all(
    filenames.map(async (version) => {
      const bytes = await readFile(join(directory, version));
      return { version, sha256: digest(bytes), bytes: bytes.byteLength };
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function parseEvent(value: unknown): MigrationEvent {
  if (!isRecord(value) || !hasExactKeys(value, ['operation', 'manifest'])) {
    throw new Error('Migration request is invalid.');
  }
  const manifest = value.manifest;
  if (
    value.operation !== 'apply-forward' ||
    !isRecord(manifest) ||
    !hasExactKeys(manifest, [
      'schemaVersion',
      'stage',
      'account',
      'region',
      'gitCommit',
      'advisoryLockId',
      'migrations',
      'sha256',
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.stage !== 'dev' ||
    manifest.account !== EXPECTED_ACCOUNT ||
    manifest.region !== EXPECTED_REGION ||
    typeof manifest.gitCommit !== 'string' ||
    !GIT_COMMIT.test(manifest.gitCommit) ||
    manifest.advisoryLockId !== MIGRATION_ADVISORY_LOCK_ID ||
    !Array.isArray(manifest.migrations) ||
    manifest.migrations.length === 0 ||
    typeof manifest.sha256 !== 'string' ||
    !SHA256.test(manifest.sha256)
  ) {
    throw new Error('Migration request is invalid.');
  }

  const migrations: MigrationManifestEntry[] = [];
  for (const entry of manifest.migrations) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ['version', 'sha256', 'bytes']) ||
      typeof entry.version !== 'string' ||
      !MIGRATION_FILE.test(entry.version) ||
      typeof entry.sha256 !== 'string' ||
      !SHA256.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      (entry.bytes as number) < 1
    ) {
      throw new Error('Migration request is invalid.');
    }
    migrations.push({
      version: entry.version,
      sha256: entry.sha256,
      bytes: entry.bytes as number,
    });
  }
  if (
    migrations.some((entry, index) => index > 0 && migrations[index - 1]!.version >= entry.version)
  ) {
    throw new Error('Migration request is invalid.');
  }
  const body = JSON.stringify({
    schemaVersion: 1,
    stage: 'dev',
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    gitCommit: manifest.gitCommit,
    advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
    migrations,
  });
  if (digest(body) !== manifest.sha256) throw new Error('Migration request is invalid.');

  return {
    operation: 'apply-forward',
    manifest: {
      schemaVersion: 1,
      stage: 'dev',
      account: EXPECTED_ACCOUNT,
      region: EXPECTED_REGION,
      gitCommit: manifest.gitCommit,
      advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
      migrations,
      sha256: manifest.sha256,
    },
  };
}

function assertManifestMatches(
  request: readonly MigrationManifestEntry[],
  local: readonly MigrationManifestEntry[],
): void {
  if (
    request.length !== local.length ||
    request.some((entry, index) => {
      const localEntry = local[index];
      return (
        localEntry === undefined ||
        entry.version !== localEntry.version ||
        entry.sha256 !== localEntry.sha256 ||
        entry.bytes !== localEntry.bytes
      );
    })
  ) {
    throw new Error('Migration request is invalid.');
  }
}

function databaseUrl(environment: MigrationEnvironment, secret: DatabaseSecret): string {
  return `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${environment.endpoint}:5432/${environment.database}`;
}

async function query<Row extends Record<string, unknown> = Record<string, unknown>>(
  client: MigrationClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<MigrationQueryResult<Row>> {
  return client.query<Row>(text, values);
}

async function appliedMigrations(client: MigrationClient): Promise<Map<string, string>> {
  const relation = await query<RelationRow>(
    client,
    "select to_regclass('public.authority_schema_migrations')::text as relation_name",
  );
  if (relation.rows[0]?.relation_name === null || relation.rows[0] === undefined) return new Map();
  const result = await query<AppliedMigrationRow>(
    client,
    'select version, checksum from authority_schema_migrations order by version',
  );
  const applied = new Map<string, string>();
  for (const row of result.rows) {
    if (!MIGRATION_FILE.test(row.version) || !SHA256.test(row.checksum)) {
      throw new Error('Migration history is invalid.');
    }
    applied.set(row.version, row.checksum);
  }
  return applied;
}

async function executeFormattedDdl(
  client: MigrationClient,
  formatSql: string,
  values: readonly unknown[] = [],
): Promise<void> {
  const result = await query<DdlRow>(client, formatSql, values);
  const ddl = result.rows[0]?.ddl;
  if (typeof ddl !== 'string' || ddl.length === 0 || ddl.length > 4096) {
    throw new Error('Database DDL formatting failed.');
  }
  await query(client, ddl);
}

async function configureRole(
  client: MigrationClient,
  spec: RoleSpec,
  password: string,
): Promise<void> {
  await query(client, spec.createSql);
  await query(client, spec.hardenSql);
  await executeFormattedDdl(client, spec.passwordFormatSql, [password]);
  await executeFormattedDdl(client, spec.revokeDatabaseFormatSql);
  await query(client, spec.revokeSchemaSql);
  await query(client, spec.revokeTablesSql);
  await query(client, spec.revokeSequencesSql);
  await query(client, spec.revokeFunctionsSql);
  await executeFormattedDdl(client, spec.grantConnectFormatSql);
  await query(client, spec.grantSchemaSql);
  for (const grant of spec.dataGrantSql) await query(client, grant);
}

async function transaction(client: MigrationClient, operation: () => Promise<void>): Promise<void> {
  await query(client, 'begin');
  try {
    await operation();
    await query(client, 'commit');
  } catch (error) {
    try {
      await query(client, 'rollback');
    } catch {
      // Preserve the original safe failure path.
    }
    throw error;
  }
}

function singleClientPool(client: MigrationClient): MigrationPool {
  return {
    connect: async () => ({
      query: <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ) => client.query<Row>(text, values),
      release: () => undefined,
    }),
  };
}

function validateApplied(
  local: readonly MigrationManifestEntry[],
  applied: ReadonlyMap<string, string>,
): void {
  if (
    applied.size !== local.length ||
    local.some((entry) => applied.get(entry.version) !== entry.sha256)
  ) {
    throw new Error('Migration history is invalid.');
  }
}

function safeLog(logger: MigrationLogger, event: MigrationLogEvent): void {
  try {
    logger(event);
  } catch {
    // Logging must never alter the migration transaction outcome.
  }
}

export function createMigrationHandler(
  dependencies: MigrationHandlerDependencies,
): (event: unknown) => Promise<MigrationResult> {
  return async (rawEvent) => {
    let pool: RuntimePool | undefined;
    let client: MigrationClient | undefined;
    let fullLockHeld = false;
    let failureStage: MigrationFailureStage = 'request_validation';
    try {
      const environment = parseMigrationEnvironment(dependencies.environment);
      const event = parseEvent(rawEvent);
      const local = await localMigrations(environment.migrationsDir);
      assertManifestMatches(event.manifest.migrations, local);
      safeLog(dependencies.logger, {
        event: 'migration.started',
        migrationCount: local.length,
      });

      failureStage = 'secret_loading';
      const [adminSecret, learnerSecret, workerSecret] = await Promise.all([
        loadSecret(dependencies.secrets, environment.adminSecretArn, 'mcat_admin'),
        loadSecret(dependencies.secrets, environment.learnerSecretArn, LEARNER_ROLE),
        loadSecret(dependencies.secrets, environment.workerSecretArn, WORKER_ROLE),
      ]);
      pool = dependencies.poolFactory({
        connectionString: databaseUrl(environment, adminSecret),
        ssl: { rejectUnauthorized: true },
        applicationName: 'mcat-migration',
        maxConnections: 1,
      });
      failureStage = 'database_connect';
      client = await pool.connect();
      failureStage = 'database_lock';
      await query(client, 'select pg_advisory_lock($1)', [RUNTIME_ADVISORY_LOCK_ID]);
      fullLockHeld = true;

      failureStage = 'migrations';
      const before = await appliedMigrations(client);
      await runMigrations(singleClientPool(client), environment.migrationsDir);
      failureStage = 'role_grants';
      await transaction(client, async () => {
        await executeFormattedDdl(client!, REVOKE_PUBLIC_DATABASE_DDL);
        await query(client!, REVOKE_PUBLIC_SCHEMA_DDL);
        await query(client!, REVOKE_PUBLIC_FUNCTION_EXECUTE_DDL);
        await query(client!, REVOKE_PUBLIC_DEFAULT_FUNCTION_EXECUTE_DDL);
        await configureRole(client!, ROLE_SPECS[0]!, learnerSecret.password);
        await configureRole(client!, ROLE_SPECS[1]!, workerSecret.password);
      });
      failureStage = 'verification';
      const after = await appliedMigrations(client);
      validateApplied(local, after);

      const migrations = local.map<MigrationResultEntry>((entry) => ({
        version: entry.version,
        sha256: entry.sha256,
        status: before.has(entry.version) ? 'already_applied' : 'applied',
      }));
      const appliedCount = migrations.filter((entry) => entry.status === 'applied').length;
      const result: MigrationResult = {
        ok: true,
        advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
        manifestSha256: event.manifest.sha256,
        migrationCount: migrations.length,
        appliedCount,
        alreadyAppliedCount: migrations.length - appliedCount,
        migrations,
      };
      safeLog(dependencies.logger, {
        event: 'migration.completed',
        migrationCount: result.migrationCount,
        appliedCount: result.appliedCount,
        alreadyAppliedCount: result.alreadyAppliedCount,
      });
      return result;
    } catch {
      safeLog(dependencies.logger, {
        event: 'migration.failed',
        code: 'migration_failed',
        stage: failureStage,
      });
      throw new MigrationRuntimeError();
    } finally {
      try {
        if (client !== undefined && fullLockHeld) {
          await query(client, 'select pg_advisory_unlock($1)', [RUNTIME_ADVISORY_LOCK_ID]);
        }
      } catch {
        // The caller still receives only the allowlisted failure above.
      } finally {
        client?.release();
        if (pool !== undefined) await pool.end().catch(() => undefined);
      }
    }
  };
}
