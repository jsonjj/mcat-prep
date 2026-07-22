import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  EXPECTED_ACCOUNT,
  EXPECTED_REGION,
  MIGRATION_ADVISORY_LOCK_ID,
  createMigrationHandler,
  type MigrationEvent,
  type MigrationManifest,
  type RuntimePool,
  type SecretCommandClient,
} from './runtime';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;
const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../../database/migrations');
const ADMIN_ARN =
  'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/admin-AbCd12';
const LEARNER_ARN =
  'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/learner-api-EfGh34';
const WORKER_ARN =
  'arn:aws:secretsmanager:us-east-1:056956104102:secret:/mcat/dev/database/workers-IjKl56';

async function event(): Promise<MigrationEvent> {
  const filenames = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+_[a-z0-9][a-z0-9_-]*\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const migrations = await Promise.all(
    filenames.map(async (version) => {
      const bytes = await readFile(join(MIGRATIONS_DIR, version));
      return {
        version,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength,
      };
    }),
  );
  const manifestBody: Omit<MigrationManifest, 'sha256'> = {
    schemaVersion: 1,
    stage: 'dev',
    account: EXPECTED_ACCOUNT,
    region: EXPECTED_REGION,
    gitCommit: 'b'.repeat(40),
    advisoryLockId: MIGRATION_ADVISORY_LOCK_ID,
    migrations,
  };
  return {
    operation: 'apply-forward',
    manifest: {
      ...manifestBody,
      sha256: createHash('sha256').update(JSON.stringify(manifestBody)).digest('hex'),
    },
  };
}

const secrets: SecretCommandClient = {
  async send(command) {
    switch (command.input.SecretId) {
      case ADMIN_ARN:
        return {
          SecretString: JSON.stringify({
            username: 'mcat_admin',
            password: 'admin-integration-password-with-32-characters',
          }),
        };
      case LEARNER_ARN:
        return {
          SecretString: JSON.stringify({
            username: 'mcat_learner_api',
            password: "learner-'; create role injected; --integration",
          }),
        };
      case WORKER_ARN:
        return {
          SecretString: JSON.stringify({
            username: 'mcat_workers',
            password: 'worker-integration-password-with-32-characters',
          }),
        };
      default:
        return {};
    }
  },
};

describeWithPostgres('migration PostgreSQL principals', () => {
  it('enforces the exact runtime table privileges with no inherited DDL capability', async () => {
    let failedStatement: string | undefined;
    let failedCode: string | undefined;
    const databasePool = new Pool({ connectionString: DATABASE_URL!, ssl: false, max: 1 });
    const trackingPool: RuntimePool = {
      async connect() {
        const client = await databasePool.connect();
        return {
          async query<Row extends Record<string, unknown> = Record<string, unknown>>(
            text: string,
            values?: readonly unknown[],
          ) {
            try {
              return await client.query<Row>(text, values === undefined ? [] : [...values]);
            } catch (error) {
              failedStatement = /^alter role .* password /i.test(text)
                ? 'alter role <fixed> password <redacted>'
                : text;
              failedCode =
                typeof error === 'object' && error !== null && 'code' in error
                  ? String((error as { readonly code: unknown }).code)
                  : 'unknown';
              throw error;
            }
          },
          release: () => client.release(),
        };
      },
      end: () => databasePool.end(),
    };
    const handler = createMigrationHandler({
      environment: {
        AWS_REGION: EXPECTED_REGION,
        AWS_ACCOUNT_ID: EXPECTED_ACCOUNT,
        ADMIN_DB_SECRET_ARN: ADMIN_ARN,
        LEARNER_API_DB_SECRET_ARN: LEARNER_ARN,
        WORKERS_DB_SECRET_ARN: WORKER_ARN,
        DB_PROXY_ENDPOINT: 'mcat-dev.proxy-abc123.us-east-1.rds.amazonaws.com',
        DB_NAME: 'mcat',
        MIGRATIONS_DIR,
      },
      secrets,
      poolFactory: () => trackingPool,
      logger: () => undefined,
    });

    let result;
    try {
      result = await handler(await event());
    } catch {
      throw new Error(
        `migration failed at ${failedStatement ?? 'unknown'} (${failedCode ?? 'none'})`,
      );
    }
    expect(result.migrationCount).toBeGreaterThan(0);

    const verifier = new Pool({ connectionString: DATABASE_URL!, ssl: false, max: 1 });
    try {
      const roles = await verifier.query<{
        rolname: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
      }>(
        `select rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
         from pg_roles
         where rolname in ('mcat_learner_api', 'mcat_workers')
         order by rolname`,
      );
      expect(roles.rows).toEqual([
        {
          rolname: 'mcat_learner_api',
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolinherit: false,
          rolreplication: false,
          rolbypassrls: false,
        },
        {
          rolname: 'mcat_workers',
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolinherit: false,
          rolreplication: false,
          rolbypassrls: false,
        },
      ]);

      const privileges = await verifier.query<{
        learner_connect: boolean;
        learner_create: boolean;
        learner_temp: boolean;
        learner_schema_usage: boolean;
        learner_schema_create: boolean;
        learner_stream_write: boolean;
        learner_stream_delete: boolean;
        learner_content_read: boolean;
        worker_connect: boolean;
        worker_create: boolean;
        worker_temp: boolean;
        worker_schema_usage: boolean;
        worker_schema_create: boolean;
        worker_outbox_read_update: boolean;
        worker_outbox_insert: boolean;
        worker_inbox_read_insert: boolean;
        worker_learner_read: boolean;
      }>(
        `select
           has_database_privilege('mcat_learner_api', current_database(), 'CONNECT') as learner_connect,
           has_database_privilege('mcat_learner_api', current_database(), 'CREATE') as learner_create,
           has_database_privilege('mcat_learner_api', current_database(), 'TEMPORARY') as learner_temp,
           has_schema_privilege('mcat_learner_api', 'public', 'USAGE') as learner_schema_usage,
           has_schema_privilege('mcat_learner_api', 'public', 'CREATE') as learner_schema_create,
           has_table_privilege('mcat_learner_api', 'learner_streams', 'SELECT,INSERT,UPDATE') as learner_stream_write,
           has_table_privilege('mcat_learner_api', 'learner_streams', 'DELETE') as learner_stream_delete,
           has_table_privilege('mcat_learner_api', 'content_objects', 'SELECT') as learner_content_read,
           has_database_privilege('mcat_workers', current_database(), 'CONNECT') as worker_connect,
           has_database_privilege('mcat_workers', current_database(), 'CREATE') as worker_create,
           has_database_privilege('mcat_workers', current_database(), 'TEMPORARY') as worker_temp,
           has_schema_privilege('mcat_workers', 'public', 'USAGE') as worker_schema_usage,
           has_schema_privilege('mcat_workers', 'public', 'CREATE') as worker_schema_create,
           has_table_privilege('mcat_workers', 'outbox', 'SELECT,UPDATE') as worker_outbox_read_update,
           has_table_privilege('mcat_workers', 'outbox', 'INSERT') as worker_outbox_insert,
           has_table_privilege('mcat_workers', 'inbox_deduplication', 'SELECT,INSERT') as worker_inbox_read_insert,
           has_table_privilege('mcat_workers', 'learners', 'SELECT') as worker_learner_read`,
      );
      expect(privileges.rows[0]).toEqual({
        learner_connect: true,
        learner_create: false,
        learner_temp: false,
        learner_schema_usage: true,
        learner_schema_create: false,
        learner_stream_write: true,
        learner_stream_delete: false,
        learner_content_read: false,
        worker_connect: true,
        worker_create: false,
        worker_temp: false,
        worker_schema_usage: true,
        worker_schema_create: false,
        worker_outbox_read_update: true,
        worker_outbox_insert: false,
        worker_inbox_read_insert: true,
        worker_learner_read: false,
      });
    } finally {
      await verifier.end();
    }
  });
});
