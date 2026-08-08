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
        learner_rate_limit_delete: boolean;
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
           has_table_privilege('mcat_learner_api', 'api_rate_limits', 'DELETE') as learner_rate_limit_delete,
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
        learner_rate_limit_delete: false,
        // Content is now learner-READABLE (SELECT-only): the DB-backed lesson provider
        // selects the active release's immutable revisions + content_objects to serve
        // the build-a catalog. Authored/imported by mcat_admin; no write grant here.
        learner_content_read: true,
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

      const admin = await verifier.query<{ current_user: string; current_database: string }>(
        'select current_user, current_database()',
      );
      const cleanupFunction = await verifier.query<{
        owner: string;
        security_definer: boolean;
        configuration: string[] | null;
        public_execute: boolean;
        learner_execute: boolean;
        worker_execute: boolean;
      }>(
        `select
           owner.rolname as owner,
           procedure.prosecdef as security_definer,
           procedure.proconfig as configuration,
           has_function_privilege('public', procedure.oid, 'EXECUTE') as public_execute,
           has_function_privilege('mcat_learner_api', procedure.oid, 'EXECUTE') as learner_execute,
           has_function_privilege('mcat_workers', procedure.oid, 'EXECUTE') as worker_execute
         from pg_proc as procedure
         join pg_namespace as namespace on namespace.oid = procedure.pronamespace
         join pg_roles as owner on owner.oid = procedure.proowner
         where namespace.nspname = 'public'
           and procedure.proname = 'prune_expired_api_rate_limits'
           and pg_get_function_identity_arguments(procedure.oid) = ''`,
      );
      expect(cleanupFunction.rows).toEqual([
        {
          owner: admin.rows[0]?.current_user,
          security_definer: true,
          configuration: ['search_path=pg_catalog'],
          public_execute: false,
          learner_execute: false,
          worker_execute: false,
        },
      ]);

      await verifier.query('drop function if exists public.synthetic_runtime_function()');
      await verifier.query(`
        create function public.synthetic_runtime_function() returns text
        language sql
        as 'select ''unsafe-public-function''::text'
      `);
      try {
        for (const role of ['mcat_learner_api', 'mcat_workers']) {
          await verifier.query(`set role ${role}`);
          try {
            await expect(
              verifier.query('select public.synthetic_runtime_function()'),
            ).rejects.toMatchObject({ code: '42501' });
            await expect(
              verifier.query(
                "select pg_catalog.current_database() as database_name, pg_catalog.length('mcat') as value_length",
              ),
            ).resolves.toMatchObject({
              rows: [
                {
                  database_name: admin.rows[0]?.current_database,
                  value_length: 4,
                },
              ],
            });
          } finally {
            await verifier.query('reset role');
          }
        }
      } finally {
        await verifier.query('drop function public.synthetic_runtime_function()');
      }

      await verifier.query('truncate table api_rate_limits');
      await verifier.query(
        'alter table api_rate_limits disable trigger api_rate_limits_prune_expired',
      );
      await verifier.query(
        `insert into api_rate_limits (
           rate_key, route, method, window_started_at, request_count, updated_at
         ) values
           ($1, '/v1/health', 'GET', statement_timestamp() - interval '25 hours', 1, statement_timestamp() - interval '25 hours'),
           ($2, '/v1/health', 'GET', statement_timestamp() - interval '23 hours', 2, statement_timestamp() - interval '23 hours'),
           ($3, '/v1/health', 'GET', date_trunc('minute', statement_timestamp()), 3, statement_timestamp())`,
        ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)],
      );
      await verifier.query(
        'alter table api_rate_limits enable trigger api_rate_limits_prune_expired',
      );

      const lockPool = new Pool({ connectionString: DATABASE_URL!, ssl: false, max: 1 });
      try {
        await lockPool.query('select pg_advisory_lock(72004005)');
        await verifier.query("set statement_timeout = '500ms'");
        await verifier.query('set role mcat_learner_api');
        try {
          await verifier.query(
            `insert into api_rate_limits (
               rate_key, route, method, window_started_at, request_count, updated_at
             ) values ($1, '/v1/health', 'GET', date_trunc('minute', statement_timestamp()), 1, statement_timestamp())
             on conflict (rate_key, route, method, window_started_at)
             do update set
               request_count = api_rate_limits.request_count + 1,
               updated_at = excluded.updated_at`,
            ['c'.repeat(24)],
          );
        } finally {
          await verifier.query('reset role');
          await verifier.query('reset statement_timeout');
        }
        const whileLocked = await verifier.query<{ request_count: number }>(
          'select request_count from api_rate_limits where rate_key = $1',
          ['a'.repeat(24)],
        );
        expect(whileLocked.rows).toEqual([{ request_count: 1 }]);
      } finally {
        await lockPool.query('select pg_advisory_unlock(72004005)');
        await lockPool.end();
      }

      await verifier.query('set role mcat_learner_api');
      try {
        await verifier.query(
          `insert into api_rate_limits (
             rate_key, route, method, window_started_at, request_count, updated_at
           ) values ($1, '/v1/health', 'GET', date_trunc('minute', statement_timestamp()), 1, statement_timestamp())`,
          ['d'.repeat(24)],
        );
      } finally {
        await verifier.query('reset role');
      }
      const retainedRateLimits = await verifier.query<{
        rate_key: string;
        request_count: number;
      }>('select rate_key, request_count from api_rate_limits order by rate_key');
      expect(retainedRateLimits.rows).toEqual([
        { rate_key: 'b'.repeat(24), request_count: 2 },
        { rate_key: 'c'.repeat(24), request_count: 4 },
        { rate_key: 'd'.repeat(24), request_count: 1 },
      ]);
    } finally {
      await verifier.end();
    }
  });
});
