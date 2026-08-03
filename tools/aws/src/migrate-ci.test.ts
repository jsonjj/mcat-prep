import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  migrationsDirectory,
  resolveMigrationSsl,
  runCiMigrations,
  toMigrationPool,
} from './migrate-ci';

describe('resolveMigrationSsl', () => {
  it('verifies certificates by default and for require', () => {
    expect(resolveMigrationSsl(undefined)).toEqual({ rejectUnauthorized: true });
    expect(resolveMigrationSsl('require')).toEqual({ rejectUnauthorized: true });
    expect(resolveMigrationSsl('REQUIRE')).toEqual({ rejectUnauthorized: true });
  });

  it('relaxes verification for managed Postgres and disables TLS on request', () => {
    expect(resolveMigrationSsl('no-verify')).toEqual({ rejectUnauthorized: false });
    expect(resolveMigrationSsl('disable')).toBe(false);
  });
});

describe('migrationsDirectory', () => {
  it('resolves the shared ordered SQL directory', () => {
    expect(migrationsDirectory('/repo')).toBe(join('/repo', 'database', 'migrations'));
  });
});

describe('toMigrationPool', () => {
  it('forwards queries, unwraps rows, and releases the client', async () => {
    const queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    let released = false;
    const fakeClient = {
      query: async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        return { rows: [{ ok: true }] };
      },
      release: () => {
        released = true;
      },
    };
    const fakePool = { connect: async () => fakeClient } as unknown as Pool;

    const client = await toMigrationPool(fakePool).connect();
    const result = await client.query('select 1', [42]);
    client.release();

    expect(result.rows).toEqual([{ ok: true }]);
    expect(queries).toEqual([{ text: 'select 1', values: [42] }]);
    expect(released).toBe(true);
  });
});

describe('runCiMigrations', () => {
  it('runs migrations with an injected pool and always ends it', async () => {
    const end = vi.fn(async () => undefined);
    const client = {
      // An empty migrations directory means runMigrations only locks, probes the
      // (empty) history, and unlocks — every query returns no rows.
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(() => undefined),
    };
    const pool = { connect: async () => client, end } as unknown as Pool;
    const emptyMigrations = await mkdtemp(join(tmpdir(), 'mcat-ci-migrate-'));

    try {
      await runCiMigrations({
        databaseUrl: 'postgres://user:pass@localhost:5432/db',
        ssl: false,
        migrationsDir: emptyMigrations,
        poolFactory: () => pool,
      });
    } finally {
      await rm(emptyMigrations, { recursive: true, force: true });
    }

    expect(end).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
