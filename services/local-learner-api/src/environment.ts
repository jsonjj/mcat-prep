import { randomBytes } from 'node:crypto';

import { supabaseProjectUrl } from '@mcat/learner-api';

/**
 * Configuration for a local run of the deployed learner API.
 *
 * The deployed runtime (`services/lambdas/learner-api/src/lambda.ts`) resolves
 * ARNs and reads Secrets Manager. This one reads plain environment variables and
 * nothing else — no AWS SDK, no credentials, no ARNs — because the whole point of
 * the local stack is that it differs from the deployed one only in which Postgres
 * it points at. Every value it produces is validated to exactly the shape
 * `createLearnerApi` demands, so a misconfiguration fails here with the variable's
 * name in the message rather than deeper in with a generic one.
 */
export interface LocalDatabaseSettings {
  readonly connectionString: string;
  readonly tls: false | { readonly rejectUnauthorized: boolean };
}

export interface LocalLearnerApiEnvironment {
  readonly database: LocalDatabaseSettings;
  /** `https://<ref>.supabase.co`, the issuer half of token verification. */
  readonly supabaseProjectUrl: string;
  readonly originVerificationSecret: string;
  readonly rateLimitPepper: string;
  readonly learnerWebOrigin: string;
  readonly port: number;
}

export const DEFAULT_LEARNER_WEB_ORIGIN = 'https://localhost:5173';
export const DEFAULT_PORT = 8790;

/** Exactly the value `createLearnerApi` accepts: 64 URL-safe characters. */
export const ORIGIN_VERIFICATION_SECRET_PATTERN = /^[A-Za-z0-9_-]{64}$/;

type Env = Readonly<Record<string, string | undefined>>;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See docs/runbooks/local-real-stack.md.`);
  }
  return value.trim();
}

/**
 * `DATABASE_URL` plus the repo's usual `DATABASE_SSL` switch, with one local
 * default: `no-verify`.
 *
 * Supabase requires TLS, and the Session pooler presents a certificate that does
 * not chain to a root Node trusts out of the box, so verifying it fails on a
 * fresh machine with an error that looks nothing like "install the Supabase CA".
 * Skipping the chain check is a property of THIS connection on a developer's own
 * machine — the traffic is still encrypted, and nothing about how the API
 * authenticates or authorizes anyone changes. Set `DATABASE_SSL=require` once the
 * CA is installed; the deployed runtime never reads this and always verifies.
 */
export function parseLocalDatabase(env: Env = process.env): LocalDatabaseSettings {
  const connectionString = required(env, 'DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a URL. Expected a postgresql:// connection string.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// connection string.');
  }

  const mode = (env.DATABASE_SSL ?? 'no-verify').trim().toLowerCase();
  if (mode === 'disable') return { connectionString, tls: false };
  if (mode === 'require') return { connectionString, tls: { rejectUnauthorized: true } };
  if (mode === 'no-verify') return { connectionString, tls: { rejectUnauthorized: false } };
  throw new Error('DATABASE_SSL must be one of require, no-verify, or disable.');
}

/**
 * Whether the connection string names a transaction pooler — Supavisor's port
 * 6543, or any PgBouncer told so explicitly.
 *
 * Only the migration runner cares. A transaction pooler hands out a different
 * backend per transaction, and `runMigrations` takes `pg_advisory_lock` OUTSIDE
 * a transaction to keep two migrators apart: taken that way the lock lands on an
 * arbitrary backend and is never released by the matching unlock, which lands on
 * another. The migrations themselves are unaffected — `begin`/`commit` pins one
 * backend for the whole transaction — which is also why the running API is safe
 * here: every lock it takes is `pg_advisory_xact_lock`.
 */
export function isTransactionPooler(connectionString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return false;
  }
  return parsed.port === '6543' || parsed.searchParams.get('pgbouncer') === 'true';
}

/**
 * The project ref is preferred because it is what the Supabase dashboard shows
 * and what `pnpm supabase:sync-jwks` takes. A full URL is accepted so a developer
 * who already has `VITE_SUPABASE_URL` in the file does not have to restate it.
 */
function parseSupabaseProjectUrl(env: Env): string {
  const ref = env.SUPABASE_PROJECT_REF?.trim();
  if (ref !== undefined && ref !== '') return supabaseProjectUrl(ref);

  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)?.trim();
  if (url === undefined || url === '') {
    throw new Error(
      'SUPABASE_PROJECT_REF is not set (SUPABASE_URL or VITE_SUPABASE_URL would also do). ' +
        'See docs/runbooks/local-real-stack.md.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL must be the project URL, e.g. https://<ref>.supabase.co.');
  }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be the project URL, e.g. https://<ref>.supabase.co.');
  }
  return parsed.origin;
}

function parseOriginVerificationSecret(env: Env): string {
  const value = required(env, 'ORIGIN_VERIFICATION_SECRET');
  if (!ORIGIN_VERIFICATION_SECRET_PATTERN.test(value)) {
    throw new Error(
      'ORIGIN_VERIFICATION_SECRET must be 64 characters of [A-Za-z0-9_-]. ' +
        'Delete it from .env.local to have one generated.',
    );
  }
  return value;
}

function parseRateLimitPepper(env: Env): string {
  const value = required(env, 'RATE_LIMIT_PEPPER');
  if (value.length < 32 || value.length > 128 || containsControlCharacter(value)) {
    throw new Error(
      'RATE_LIMIT_PEPPER must be 32 to 128 printable characters. ' +
        'Delete it from .env.local to have one generated.',
    );
  }
  return value;
}

/**
 * The HTTPS-only rule is the deployed one, unrelaxed: the browser reaches Vite
 * over TLS so this origin is genuinely `https:`, and the API needs no dev branch
 * to accept it.
 */
function parseLearnerWebOrigin(env: Env): string {
  const value = env.LEARNER_WEB_ORIGIN?.trim();
  if (value === undefined || value === '') return DEFAULT_LEARNER_WEB_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `LEARNER_WEB_ORIGIN must be an exact HTTPS origin, e.g. ${DEFAULT_LEARNER_WEB_ORIGIN}.`,
    );
  }
  if (parsed.origin !== value || parsed.protocol !== 'https:') {
    throw new Error(
      `LEARNER_WEB_ORIGIN must be an exact HTTPS origin, e.g. ${DEFAULT_LEARNER_WEB_ORIGIN}.`,
    );
  }
  return value;
}

function parsePort(env: Env): number {
  const value = env.PORT?.trim();
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a TCP port between 1 and 65535.');
  }
  return port;
}

export function parseLocalEnvironment(env: Env = process.env): LocalLearnerApiEnvironment {
  return {
    database: parseLocalDatabase(env),
    supabaseProjectUrl: parseSupabaseProjectUrl(env),
    originVerificationSecret: parseOriginVerificationSecret(env),
    rateLimitPepper: parseRateLimitPepper(env),
    learnerWebOrigin: parseLearnerWebOrigin(env),
    port: parsePort(env),
  };
}

export interface GeneratedSecret {
  readonly name: string;
  readonly value: string;
}

/**
 * Values for the two shared secrets when the file does not already carry them.
 *
 * They are generated rather than demanded because neither protects anything on a
 * developer's machine, and typing 64 random characters is a poor first
 * experience. They are then WRITTEN BACK to `.env.local` rather than kept in
 * memory: the Vite proxy has to send the same origin-verification secret this
 * process expects, and a value that changed on every restart would mean editing
 * the proxy's configuration every restart too.
 */
export function generateMissingSecrets(env: Env = process.env): readonly GeneratedSecret[] {
  const generated: GeneratedSecret[] = [];
  if ((env.ORIGIN_VERIFICATION_SECRET ?? '').trim() === '') {
    // 48 bytes is exactly 64 base64url characters, so no padding or slicing.
    generated.push({
      name: 'ORIGIN_VERIFICATION_SECRET',
      value: randomBytes(48).toString('base64url'),
    });
  }
  if ((env.RATE_LIMIT_PEPPER ?? '').trim() === '') {
    generated.push({ name: 'RATE_LIMIT_PEPPER', value: randomBytes(32).toString('base64url') });
  }
  return generated;
}
