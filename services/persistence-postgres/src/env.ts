import { Pool, type PoolConfig } from 'pg';

/**
 * Environment-driven Postgres connection config. No connection string is ever
 * hardcoded: callers set `DATABASE_URL` so the data layer can point at local
 * Postgres, Supabase (pooler), or Aurora with no code change.
 *
 * `DATABASE_SSL`:
 *   - unset / `require`  → TLS with certificate verification (default, safest)
 *   - `no-verify`        → TLS without cert verification (managed Postgres such
 *                          as Supabase whose CA isn't bundled locally)
 *   - `disable`          → no TLS (local dev only)
 */
export interface DatabaseEnvConfig {
  readonly connectionString: string;
  readonly ssl: PoolConfig['ssl'];
}

type Env = Record<string, string | undefined>;

export function databaseConfigFromEnv(env: Env = process.env): DatabaseEnvConfig {
  const connectionString = env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim() === '') {
    throw new Error(
      'DATABASE_URL is not set. Set it to your Postgres connection string ' +
        '(e.g., the Supabase Session pooler URL) before connecting to the database.',
    );
  }
  const mode = (env.DATABASE_SSL ?? 'require').toLowerCase();
  let ssl: PoolConfig['ssl'];
  if (mode === 'disable') ssl = false;
  else if (mode === 'no-verify') ssl = { rejectUnauthorized: false };
  else ssl = { rejectUnauthorized: true };
  return { connectionString, ssl };
}

/**
 * Create a small pooled connection from the environment. Intended for read paths
 * (content delivery, admin) and one-off tooling; the authority write path builds
 * its own tuned pool via `createPgPool`.
 */
export function createDatabasePoolFromEnv(env: Env = process.env): Pool {
  const { connectionString, ssl } = databaseConfigFromEnv(env);
  const max = Number.parseInt(env.DATABASE_POOL_MAX ?? '3', 10);
  return new Pool({
    connectionString,
    ssl,
    max: Number.isInteger(max) && max > 0 ? max : 3,
    connectionTimeoutMillis: 20_000,
    allowExitOnIdle: true,
  });
}
