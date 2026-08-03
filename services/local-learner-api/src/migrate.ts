import { join } from 'node:path';

import { runMigrations, type MigrationPool } from '@mcat/database';
import { createPgPool } from '@mcat/persistence-postgres';

import { loadEnvFile, repoRoot } from './env-file';
import { isTransactionPooler, parseLocalDatabase } from './environment';

/**
 * Apply `database/migrations` to whatever `DATABASE_URL` points at.
 *
 * The deployed path is not this: AWS applies migrations through an attested
 * one-shot Lambda inside the VPC (see docs/runbooks/database-migrations.md), and
 * that stays the only way the development cluster is touched. This is for the
 * hosted Supabase project behind a local run, which nothing else can reach.
 *
 * Re-running is safe. `runMigrations` records every applied file's checksum in
 * `authority_schema_migrations`, skips what is already there, and refuses to
 * proceed if an applied file has since been edited.
 */

loadEnvFile();

const database = parseLocalDatabase();
const pool = createPgPool({
  connectionString: database.connectionString,
  ...(database.tls === false ? { tls: false as const } : { tls: database.tls }),
  applicationName: 'mcat-db-migrate',
  maxConnections: 1,
  // DDL is not an interactive request. The defaults are tuned for one, and a
  // free-tier database that has to wake up would blow through them before the
  // first statement ran.
  connectionTimeoutMs: 30_000,
  statementTimeoutMs: 60_000,
  lockTimeoutMs: 30_000,
  idleInTransactionTimeoutMs: 60_000,
});

const skipSessionLock = isTransactionPooler(database.connectionString);

/** `pg`'s client, narrowed to the two methods the runner uses. */
const migrationPool: MigrationPool = {
  connect: async () => {
    const client = await pool.connect();
    return {
      query: async (text, values) => {
        // Dropping the mutual-exclusion lock is safe only because of who runs
        // this: one developer, against a database nothing else migrates. The
        // deployed cluster is migrated by the attested Lambda, which holds a
        // real session against a real backend and keeps the lock.
        if (skipSessionLock && text.includes('pg_advisory_')) return { rows: [] };
        return client.query(text, values === undefined ? [] : [...values]);
      },
      release: () => {
        client.release();
      },
    };
  },
};

try {
  if (skipSessionLock) {
    process.stdout.write(
      'Connection is a transaction pooler; running without the migration advisory lock.\n',
    );
  }
  await runMigrations(migrationPool, join(repoRoot(), 'database', 'migrations'));
  process.stdout.write('Migrations are up to date.\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
