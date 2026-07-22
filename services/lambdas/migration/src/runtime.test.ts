import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPECTED_ACCOUNT,
  EXPECTED_REGION,
  MIGRATION_ADVISORY_LOCK_ID,
  createMigrationHandler,
  parseDatabaseSecret,
  parseMigrationEnvironment,
  type MigrationEvent,
  type MigrationLogger,
  type MigrationManifest,
  type RuntimePool,
  type RuntimePoolFactory,
  type SecretCommandClient,
} from './runtime';

const ADMIN_ARN =
  'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12';
const LEARNER_ARN =
  'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/learner-api-EfGh34';
const WORKER_ARN =
  'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/workers-IjKl56';
const ADMIN_PASSWORD = 'admin-password-that-is-at-least-32-characters';
const LEARNER_PASSWORD = "learner-password-'; create role owned; --safe";
const WORKER_PASSWORD = 'worker-password-that-is-at-least-32-characters';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function environment(migrationsDir: string): Record<string, string> {
  return {
    AWS_REGION: EXPECTED_REGION,
    AWS_ACCOUNT_ID: EXPECTED_ACCOUNT,
    ADMIN_DB_SECRET_ARN: ADMIN_ARN,
    LEARNER_API_DB_SECRET_ARN: LEARNER_ARN,
    WORKERS_DB_SECRET_ARN: WORKER_ARN,
    DB_PROXY_ENDPOINT: 'mcat-dev.proxy-abc123.us-east-1.rds.amazonaws.com',
    DB_NAME: 'mcat',
    MIGRATIONS_DIR: migrationsDir,
  };
}

async function fixtureMigration(
  sql = 'create table synthetic_security_fixture (id bigint primary key)',
) {
  const directory = await mkdtemp(join(tmpdir(), 'mcat-migration-runtime-'));
  temporaryDirectories.push(directory);
  const version = '0001_security_fixture.sql';
  await writeFile(join(directory, version), sql, 'utf8');
  const bytes = await readFile(join(directory, version));
  return { directory, version, sha256: createHash('sha256').update(bytes).digest('hex'), bytes };
}

function migrationEvent(fixture: {
  readonly version: string;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}): MigrationEvent {
  const migrations = [
    { version: fixture.version, sha256: fixture.sha256, bytes: fixture.bytes.byteLength },
  ];
  const body: Omit<MigrationManifest, 'sha256'> = {
    schemaVersion: 1 as const,
    stage: 'dev' as const,
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    gitCommit: 'a'.repeat(40),
    advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
    migrations,
  };
  return {
    operation: 'apply-forward',
    manifest: {
      ...body,
      sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    },
  };
}

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[];
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

class FakePool implements RuntimePool {
  readonly calls: QueryCall[] = [];
  readonly applied = new Map<string, string>();
  released = 0;
  ended = 0;

  constructor(
    readonly migrationSql: string,
    readonly failOn?: string,
  ) {}

  async connect() {
    return {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<{ rows: Row[] }> => {
        this.calls.push({ text, values });
        if (this.failOn !== undefined && text.includes(this.failOn)) {
          throw new Error(`unsafe-driver-detail:${LEARNER_PASSWORD}`);
        }
        const formatMatch = text.match(
          /^select format\('alter role (mcat_learner_api|mcat_workers) password %L', \$1::text\) as ddl$/,
        );
        if (formatMatch !== null) {
          const password = values[0];
          if (typeof password !== 'string') throw new Error('test expected password parameter');
          return {
            rows: [
              {
                ddl: `alter role ${formatMatch[1]} password ${quoteLiteral(password)}`,
              } as unknown as Row,
            ],
          };
        }
        const databaseFormatMatch = text.match(
          /^select format\('((?:revoke all privileges|grant connect) on database %I (?:from|to) (?:mcat_learner_api|mcat_workers))', current_database\(\)\) as ddl$/,
        );
        if (databaseFormatMatch !== null) {
          return {
            rows: [
              {
                ddl: databaseFormatMatch[1]!.replace('%I', 'mcat'),
              } as unknown as Row,
            ],
          };
        }
        if (
          text ===
          "select format('revoke create, temporary on database %I from public', current_database()) as ddl"
        ) {
          return {
            rows: [
              {
                ddl: 'revoke create, temporary on database mcat from public',
              } as unknown as Row,
            ],
          };
        }
        if (text.includes("to_regclass('public.authority_schema_migrations')")) {
          return {
            rows: [
              {
                relation_name: this.applied.size === 0 ? null : 'authority_schema_migrations',
              } as unknown as Row,
            ],
          };
        }
        if (text.startsWith('select version, checksum from authority_schema_migrations')) {
          return {
            rows: [...this.applied].map(
              ([version, checksum]) => ({ version, checksum }) as unknown as Row,
            ),
          };
        }
        if (text.startsWith('insert into authority_schema_migrations')) {
          this.applied.set(String(values[0]), String(values[1]));
        }
        return { rows: [] };
      },
      release: () => {
        this.released += 1;
      },
    };
  }

  async end(): Promise<void> {
    this.ended += 1;
  }
}

function secrets(overrides: Partial<Record<string, string>> = {}): SecretCommandClient {
  const values: Record<string, string> = {
    [ADMIN_ARN]: JSON.stringify({ username: 'mcat_admin', password: ADMIN_PASSWORD }),
    [LEARNER_ARN]: JSON.stringify({
      username: 'mcat_learner_api',
      password: LEARNER_PASSWORD,
    }),
    [WORKER_ARN]: JSON.stringify({ username: 'mcat_workers', password: WORKER_PASSWORD }),
    ...overrides,
  };
  return {
    async send(command) {
      const secretId = command.input.SecretId;
      const secretString = secretId === undefined ? undefined : values[secretId];
      return secretString === undefined ? {} : { SecretString: secretString };
    },
  };
}

describe('migration runtime security boundary', () => {
  it('rejects invalid region, account, secret ARN, proxy, and migrations path configuration', () => {
    const valid = environment('/var/task/database/migrations');
    expect(() => parseMigrationEnvironment({ ...valid, AWS_REGION: 'us-west-2' })).toThrow(
      'Migration environment is invalid',
    );
    expect(() => parseMigrationEnvironment({ ...valid, AWS_ACCOUNT_ID: '999999999999' })).toThrow(
      'Migration environment is invalid',
    );
    expect(() =>
      parseMigrationEnvironment({ ...valid, LEARNER_API_DB_SECRET_ARN: ADMIN_ARN }),
    ).toThrow('Migration environment is invalid');
    expect(() => parseMigrationEnvironment({ ...valid, DB_PROXY_ENDPOINT: 'localhost' })).toThrow(
      'Migration environment is invalid',
    );
    expect(() => parseMigrationEnvironment({ ...valid, MIGRATIONS_DIR: '../database' })).toThrow(
      'Migration environment is invalid',
    );
  });

  it('accepts only username/password secret JSON and pins each runtime username', () => {
    expect(
      parseDatabaseSecret(
        JSON.stringify({ username: 'mcat_learner_api', password: LEARNER_PASSWORD }),
        'mcat_learner_api',
      ),
    ).toEqual({ username: 'mcat_learner_api', password: LEARNER_PASSWORD });
    expect(() =>
      parseDatabaseSecret(
        JSON.stringify({
          username: 'mcat_learner_api',
          password: LEARNER_PASSWORD,
          host: 'attacker.invalid',
        }),
        'mcat_learner_api',
      ),
    ).toThrow('Database secret has an invalid shape');
    expect(() =>
      parseDatabaseSecret(
        JSON.stringify({ username: 'mcat_workers', password: LEARNER_PASSWORD }),
        'mcat_learner_api',
      ),
    ).toThrow('Database secret has an invalid shape');
  });

  it('accepts the exact Aurora-managed connection metadata attached to the admin secret', () => {
    expect(
      parseDatabaseSecret(
        JSON.stringify({
          username: 'mcat_admin',
          password: ADMIN_PASSWORD,
          engine: 'postgres',
          host: 'mcat-dev-aurora.cluster-example.us-east-1.rds.amazonaws.com',
          port: 5432,
          dbname: 'mcat',
          dbClusterIdentifier: 'mcat-dev-aurora',
        }),
        'mcat_admin',
      ),
    ).toEqual({ username: 'mcat_admin', password: ADMIN_PASSWORD });
  });

  it('uses server-side literal quoting for rotating fixed role passwords', async () => {
    const fixture = await fixtureMigration();
    const pool = new FakePool(String(fixture.bytes));
    let poolOptions: Parameters<RuntimePoolFactory>[0] | undefined;
    const result = await createMigrationHandler({
      environment: environment(fixture.directory),
      secrets: secrets(),
      poolFactory: (options) => {
        poolOptions = options;
        return pool;
      },
      logger: () => undefined,
    })(migrationEvent(fixture));

    const formatCall = pool.calls.find((call) =>
      call.text.includes("format('alter role mcat_learner_api password %L', $1::text)"),
    );
    expect(formatCall).toEqual(
      expect.objectContaining({
        values: [LEARNER_PASSWORD],
      }),
    );
    expect(formatCall?.text).not.toContain(LEARNER_PASSWORD);
    expect(pool.calls.map((call) => call.text)).toContain(
      `alter role mcat_learner_api password ${quoteLiteral(LEARNER_PASSWORD)}`,
    );
    expect(poolOptions).toMatchObject({
      ssl: { rejectUnauthorized: true },
      maxConnections: 1,
      applicationName: 'mcat-migration',
    });
    expect(poolOptions?.connectionString).toContain(encodeURIComponent(ADMIN_PASSWORD));
    expect(result).toMatchObject({
      ok: true,
      migrationCount: 1,
      appliedCount: 1,
      alreadyAppliedCount: 0,
    });
  });

  it('grants only the exact learner and worker data operations and denies DDL capabilities', async () => {
    const fixture = await fixtureMigration();
    const pool = new FakePool(String(fixture.bytes));
    await createMigrationHandler({
      environment: environment(fixture.directory),
      secrets: secrets(),
      poolFactory: () => pool,
      logger: () => undefined,
    })(migrationEvent(fixture));

    const sql = pool.calls.map((call) => call.text.toLowerCase());
    expect(sql).toContain('grant insert on table learners to mcat_learner_api');
    expect(sql).toContain(
      'grant select, insert, update on table guest_sessions, learner_streams, api_rate_limits to mcat_learner_api',
    );
    expect(sql).toContain('grant select, insert on table accepted_events to mcat_learner_api');
    expect(sql).toContain('grant insert on table outbox to mcat_learner_api');
    expect(sql).toContain('grant select, update on table outbox to mcat_workers');
    expect(sql).toContain('grant select, insert on table inbox_deduplication to mcat_workers');
    expect(sql).toContain('grant usage on schema public to mcat_learner_api');
    expect(sql).toContain('grant usage on schema public to mcat_workers');
    expect(sql).toContain('revoke create, temporary on database mcat from public');
    expect(sql).toContain('revoke create on schema public from public');
    expect(sql).toContain('revoke execute on all functions in schema public from public');
    expect(sql).toContain('alter default privileges revoke execute on functions from public');
    expect(sql).toContain(
      'alter role mcat_learner_api with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
    );
    expect(sql).toContain(
      'alter role mcat_workers with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
    );
    const grants = sql.filter((statement) => statement.startsWith('grant '));
    expect(grants.join('\n')).not.toMatch(/\bgrant\s+(?:all|create|alter|drop)\b/);
    expect(grants.join('\n')).not.toMatch(/\bdelete\b/);
    expect(grants.join('\n')).not.toMatch(/content_objects|content_releases|publication_runs/);
  });

  it('rolls back and emits only non-sensitive failure metadata when a migration fails', async () => {
    const fixture = await fixtureMigration('select migration_failure_sentinel()');
    const pool = new FakePool(String(fixture.bytes), 'migration_failure_sentinel');
    const logs: Parameters<MigrationLogger>[0][] = [];

    await expect(
      createMigrationHandler({
        environment: environment(fixture.directory),
        secrets: secrets(),
        poolFactory: () => pool,
        logger: (event) => logs.push(event),
      })(migrationEvent(fixture)),
    ).rejects.toThrow('Database migration failed');

    expect(pool.calls.map((call) => call.text.toLowerCase())).toContain('rollback');
    expect(pool.calls.some((call) => call.text.includes('pg_advisory_unlock'))).toBe(true);
    expect(pool.released).toBe(1);
    expect(pool.ended).toBe(1);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain(ADMIN_PASSWORD);
    expect(serializedLogs).not.toContain(LEARNER_PASSWORD);
    expect(serializedLogs).not.toContain(WORKER_PASSWORD);
    expect(serializedLogs).not.toContain('unsafe-driver-detail');
    expect(logs.at(-1)).toEqual({ event: 'migration.failed', code: 'migration_failed' });
  });
});
