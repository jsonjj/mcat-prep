import { describe, expect, it } from 'vitest';
import { databaseConfigFromEnv } from './env';

describe('databaseConfigFromEnv', () => {
  it('throws a clear error when DATABASE_URL is missing', () => {
    expect(() => databaseConfigFromEnv({})).toThrow(/DATABASE_URL/);
    expect(() => databaseConfigFromEnv({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/);
  });

  it('defaults to TLS with certificate verification', () => {
    const cfg = databaseConfigFromEnv({ DATABASE_URL: 'postgres://host/db' });
    expect(cfg.connectionString).toBe('postgres://host/db');
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('supports no-verify (managed Postgres like Supabase) and disable (local)', () => {
    expect(
      databaseConfigFromEnv({ DATABASE_URL: 'postgres://h/db', DATABASE_SSL: 'no-verify' }).ssl,
    ).toEqual({ rejectUnauthorized: false });
    expect(databaseConfigFromEnv({ DATABASE_URL: 'postgres://h/db', DATABASE_SSL: 'disable' }).ssl).toBe(
      false,
    );
  });
});
