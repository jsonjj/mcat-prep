import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEARNER_WEB_ORIGIN,
  DEFAULT_PORT,
  ORIGIN_VERIFICATION_SECRET_PATTERN,
  generateMissingSecrets,
  isTransactionPooler,
  parseLocalDatabase,
  parseLocalEnvironment,
} from './environment';

const complete = {
  DATABASE_URL: 'postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  ORIGIN_VERIFICATION_SECRET: 'o'.repeat(64),
  RATE_LIMIT_PEPPER: 'p'.repeat(32),
} as const;

describe('local learner API environment', () => {
  it('accepts a complete environment and defaults the origin and port', () => {
    expect(parseLocalEnvironment(complete)).toEqual({
      database: {
        connectionString: complete.DATABASE_URL,
        tls: { rejectUnauthorized: false },
      },
      supabaseProjectUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      originVerificationSecret: complete.ORIGIN_VERIFICATION_SECRET,
      rateLimitPepper: complete.RATE_LIMIT_PEPPER,
      learnerWebOrigin: DEFAULT_LEARNER_WEB_ORIGIN,
      port: DEFAULT_PORT,
    });
  });

  it('names the variable that is missing', () => {
    expect(() => parseLocalEnvironment({ ...complete, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL is not set/,
    );
    expect(() => parseLocalEnvironment({ ...complete, SUPABASE_PROJECT_REF: undefined })).toThrow(
      /SUPABASE_PROJECT_REF is not set/,
    );
    expect(() =>
      parseLocalEnvironment({ ...complete, ORIGIN_VERIFICATION_SECRET: 'too-short' }),
    ).toThrow(/ORIGIN_VERIFICATION_SECRET must be 64 characters/);
    expect(() => parseLocalEnvironment({ ...complete, RATE_LIMIT_PEPPER: 'short' })).toThrow(
      /RATE_LIMIT_PEPPER must be 32 to 128/,
    );
  });

  it('falls back to the browser-facing Supabase URL rather than demanding the ref twice', () => {
    const environment = parseLocalEnvironment({
      ...complete,
      SUPABASE_PROJECT_REF: undefined,
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    });

    expect(environment.supabaseProjectUrl).toBe('https://abcdefghijklmnopqrst.supabase.co');
  });

  it('holds the deployed HTTPS-only rule for the learner origin', () => {
    expect(() =>
      parseLocalEnvironment({ ...complete, LEARNER_WEB_ORIGIN: 'http://localhost:5173' }),
    ).toThrow(/exact HTTPS origin/);
    expect(() =>
      parseLocalEnvironment({ ...complete, LEARNER_WEB_ORIGIN: 'https://localhost:5173/' }),
    ).toThrow(/exact HTTPS origin/);
  });

  it('reads the repo-wide DATABASE_SSL switch, defaulting to a verified-transport-only local run', () => {
    expect(parseLocalDatabase(complete).tls).toEqual({ rejectUnauthorized: false });
    expect(parseLocalDatabase({ ...complete, DATABASE_SSL: 'require' }).tls).toEqual({
      rejectUnauthorized: true,
    });
    expect(parseLocalDatabase({ ...complete, DATABASE_SSL: 'disable' }).tls).toBe(false);
    expect(() => parseLocalDatabase({ ...complete, DATABASE_SSL: 'maybe' })).toThrow(
      /DATABASE_SSL must be one of/,
    );
  });

  it('rejects a connection string that is not PostgreSQL', () => {
    expect(() => parseLocalDatabase({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /postgres:\/\/ or postgresql:\/\//,
    );
  });

  it('tells a transaction pooler apart from a session on the same host', () => {
    const host = 'postgres.abc:secret@aws-0-us-east-1.pooler.supabase.com';
    expect(isTransactionPooler(`postgresql://${host}:6543/postgres`)).toBe(true);
    expect(isTransactionPooler(`postgresql://${host}:5432/postgres?pgbouncer=true`)).toBe(true);
    expect(isTransactionPooler(`postgresql://${host}:5432/postgres`)).toBe(false);
    expect(isTransactionPooler('postgresql://localhost/postgres')).toBe(false);
  });

  it('generates only the secrets the file does not already carry', () => {
    expect(generateMissingSecrets(complete)).toEqual([]);

    const generated = generateMissingSecrets({ ...complete, RATE_LIMIT_PEPPER: undefined });
    expect(generated.map((secret) => secret.name)).toEqual(['RATE_LIMIT_PEPPER']);
    expect(generated[0]!.value.length).toBeGreaterThanOrEqual(32);
  });

  it('generates an origin-verification secret the API will accept verbatim', () => {
    const [secret] = generateMissingSecrets({
      ...complete,
      ORIGIN_VERIFICATION_SECRET: undefined,
      RATE_LIMIT_PEPPER: undefined,
    });

    expect(secret!.name).toBe('ORIGIN_VERIFICATION_SECRET');
    expect(secret!.value).toMatch(ORIGIN_VERIFICATION_SECRET_PATTERN);
  });
});
