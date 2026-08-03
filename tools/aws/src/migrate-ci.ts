import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMigrations, type MigrationClient, type MigrationPool } from '@mcat/database';
import { Pool } from 'pg';

/**
 * OIDC/CI forward-only migration entrypoint (`pnpm --filter @mcat/aws-tools migrate:ci`).
 *
 * This is the automated-pipeline counterpart to `migrate:dev`. `migrate:dev` is the
 * fail-closed, human-reviewed path that invokes the migration Lambda under a named
 * `--profile` and REJECTS ambient AWS credentials — so it cannot run under GitHub
 * OIDC. This entrypoint instead applies the exact same ordered SQL in
 * `database/migrations` (via `@mcat/database` `runMigrations`, the same library the
 * migration Lambda uses) directly against `DATABASE_URL`, matching how
 * `pnpm content:seed` connects.
 *
 * IMPORTANT: the deployed Aurora cluster lives in isolated subnets reachable only
 * through the RDS Proxy from inside the VPC. `DATABASE_URL` must therefore point at
 * an endpoint reachable from the runner (e.g. a Session pooler, or a self-hosted
 * in-VPC runner). See docs/runbooks/github-actions-deploy.md.
 */

export type MigrationSsl = false | { readonly rejectUnauthorized: boolean };

/**
 * Resolve TLS behaviour from `DATABASE_SSL`, mirroring
 * `@mcat/persistence-postgres` `databaseConfigFromEnv`:
 *   require (default) → verify the server certificate
 *   no-verify         → TLS without verification (managed Postgres, e.g. Supabase)
 *   disable           → no TLS (local only)
 */
export function resolveMigrationSsl(mode: string | undefined): MigrationSsl {
  switch ((mode ?? 'require').trim().toLowerCase()) {
    case 'disable':
      return false;
    case 'no-verify':
      return { rejectUnauthorized: false };
    default:
      return { rejectUnauthorized: true };
  }
}

/** Ordered SQL migrations directory shared with the migration Lambda. */
export function migrationsDirectory(repositoryRoot: string): string {
  return join(repositoryRoot, 'database', 'migrations');
}

/** Adapt a `pg` pool to the `@mcat/database` `MigrationPool` contract. */
export function toMigrationPool(pool: Pool): MigrationPool {
  return {
    connect: async () => {
      const client = await pool.connect();
      const migrationClient: MigrationClient = {
        query: async <Row extends Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ) => {
          const result = await client.query<Row>(
            text,
            values === undefined ? undefined : [...values],
          );
          return { rows: result.rows };
        },
        release: () => {
          client.release();
        },
      };
      return migrationClient;
    },
  };
}

export interface CiMigrationOptions {
  readonly databaseUrl: string;
  readonly ssl: MigrationSsl;
  readonly migrationsDir: string;
  readonly poolFactory?: (connectionString: string, ssl: MigrationSsl) => Pool;
}

function defaultPoolFactory(connectionString: string, ssl: MigrationSsl): Pool {
  return new Pool({
    connectionString,
    ssl,
    max: 1,
    connectionTimeoutMillis: 20_000,
    allowExitOnIdle: true,
  });
}

/** Apply forward-only migrations, always closing the pool. */
export async function runCiMigrations(options: CiMigrationOptions): Promise<void> {
  const pool = (options.poolFactory ?? defaultPoolFactory)(options.databaseUrl, options.ssl);
  try {
    await runMigrations(toMigrationPool(pool), options.migrationsDir);
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    console.error(
      'DATABASE_URL is required. Point it at the deployed Postgres (RDS Proxy / Session pooler) ' +
        'reachable from the runner, then re-run. See docs/runbooks/github-actions-deploy.md.',
    );
    process.exit(1);
  }
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const migrationsDir = migrationsDirectory(repositoryRoot);
  await runCiMigrations({
    databaseUrl,
    ssl: resolveMigrationSsl(process.env.DATABASE_SSL),
    migrationsDir,
  });
  process.stdout.write(`Applied forward-only migrations from ${migrationsDir}.\n`);
}
