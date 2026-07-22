import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgPool, type PostgresPool } from './config';
import { PostgresFixedWindowRateLimiter } from './fixed-window-rate-limiter';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const START = Date.parse('2026-07-20T12:00:59.000Z');
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;

describeWithPostgres('PostgresFixedWindowRateLimiter', () => {
  let pool: PostgresPool;
  let suiteLock: PoolClient;
  let nowMs: number;

  beforeAll(async () => {
    pool = createPgPool({
      connectionString: DATABASE_URL!,
      tls: false,
      applicationName: 'mcat-rate-limiter-integration-test',
      maxConnections: 8,
      statementTimeoutMs: 5_000,
      lockTimeoutMs: 2_000,
      idleInTransactionTimeoutMs: 5_000,
    });
    suiteLock = await pool.connect();
    await suiteLock.query('set lock_timeout = 0');
    await suiteLock.query('select pg_advisory_lock(72004002)');
  });

  afterAll(async () => {
    await suiteLock.query('select pg_advisory_unlock(72004002)');
    suiteLock.release();
    await pool.end();
  });

  beforeEach(async () => {
    nowMs = START;
    await pool.query('truncate table api_rate_limits');
  });

  it('uses safe default limits for bootstrap, reads, and state-changing routes', async () => {
    const limiter = new PostgresFixedWindowRateLimiter(pool, { now: () => nowMs });
    const bootstrap = { key: 'a'.repeat(24), route: '/v1/bootstrap', method: 'POST' };
    const read = { key: 'b'.repeat(24), route: '/v1/health', method: 'GET' };
    const write = { key: 'c'.repeat(24), route: '/v1/attempts', method: 'POST' };

    const bootstrapResults = await Promise.all(
      Array.from({ length: 11 }, () => limiter.allow(bootstrap)),
    );
    const readResults = await Promise.all(Array.from({ length: 121 }, () => limiter.allow(read)));
    const writeResults = await Promise.all(Array.from({ length: 61 }, () => limiter.allow(write)));

    expect(bootstrapResults.filter(Boolean)).toHaveLength(10);
    expect(readResults.filter(Boolean)).toHaveLength(120);
    expect(writeResults.filter(Boolean)).toHaveLength(60);
  });

  it('resets the counter at the next UTC minute boundary', async () => {
    const limiter = new PostgresFixedWindowRateLimiter(pool, {
      now: () => nowMs,
      routeLimits: { 'POST /v1/bootstrap': 2 },
    });
    const input = { key: 'd'.repeat(24), route: '/v1/bootstrap', method: 'POST' };

    await expect(limiter.allow(input)).resolves.toBe(true);
    await expect(limiter.allow(input)).resolves.toBe(true);
    await expect(limiter.allow(input)).resolves.toBe(false);
    nowMs += 1_000;
    await expect(limiter.allow(input)).resolves.toBe(true);

    const windows = await pool.query<{ window_started_at: Date }>(
      `select window_started_at
       from api_rate_limits
       where rate_key = $1
       order by window_started_at`,
      [input.key],
    );
    expect(windows.rows.map(({ window_started_at }) => window_started_at.toISOString())).toEqual([
      '2026-07-20T12:00:00.000Z',
      '2026-07-20T12:01:00.000Z',
    ]);
  });

  it('atomically admits only the configured number under concurrency', async () => {
    const limiter = new PostgresFixedWindowRateLimiter(pool, {
      now: () => nowMs,
      routeLimits: { 'POST /v1/attempts': 5 },
    });
    const input = { key: 'e'.repeat(24), route: '/v1/attempts', method: 'POST' };

    const results = await Promise.all(Array.from({ length: 20 }, () => limiter.allow(input)));

    const stored = await pool.query<{ request_count: number }>(
      `select request_count
       from api_rate_limits
       where rate_key = $1 and route = $2 and method = $3`,
      [input.key, input.route, input.method],
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(stored.rows[0]?.request_count).toBe(20);
  });

  it('rejects unbounded or raw-looking identifiers without touching PostgreSQL', async () => {
    const limiter = new PostgresFixedWindowRateLimiter(pool, { now: () => nowMs });

    await expect(
      limiter.allow({ key: '192.0.2.1', route: '/v1/health', method: 'GET' }),
    ).resolves.toBe(false);
    await expect(
      limiter.allow({ key: 'f'.repeat(24), route: `/${'x'.repeat(256)}`, method: 'GET' }),
    ).resolves.toBe(false);
    const count = await pool.query<{ count: string }>('select count(*) from api_rate_limits');
    expect(count.rows[0]?.count).toBe('0');
  });

  it('fails closed on a database error without logging the pseudonymous key', async () => {
    const limiter = new PostgresFixedWindowRateLimiter(pool, { now: () => nowMs });
    const key = '1a'.repeat(12);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await pool.query(`
      create function reject_rate_limit_insert() returns trigger
      language plpgsql as $$
      begin
        raise exception 'synthetic rate-limit failure';
      end
      $$
    `);
    await pool.query(`
      create trigger reject_rate_limit_insert_trigger
      before insert on api_rate_limits
      for each row execute function reject_rate_limit_insert()
    `);

    try {
      await expect(limiter.allow({ key, route: '/v1/health', method: 'GET' })).resolves.toBe(false);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await pool.query('drop trigger reject_rate_limit_insert_trigger on api_rate_limits');
      await pool.query('drop function reject_rate_limit_insert()');
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    }
  });
});
