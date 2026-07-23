import { createHash } from 'node:crypto';
import type { LearnerProjectionRecord } from '@mcat/database';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgPool, type PostgresPool } from './config';
import { PostgresGuestSessionService } from './guest-session-service';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const START = Date.parse('2026-07-20T12:00:00.000Z');
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;

const hash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const newGuestProjection = (learnerId: string, now: string): LearnerProjectionRecord => ({
  learnerId,
  sequence: 0,
  projectionVersion: 'test-projection-v1',
  state: { learnerId, accountState: 'guest', marker: 'session-test' },
  updatedAt: now,
});

describeWithPostgres('PostgresGuestSessionService', () => {
  let pool: PostgresPool;
  let suiteLock: PoolClient;
  let nowMs: number;
  let service: PostgresGuestSessionService;

  beforeAll(async () => {
    pool = createPgPool({
      connectionString: DATABASE_URL!,
      tls: false,
      applicationName: 'mcat-guest-session-integration-test',
      maxConnections: 6,
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
    service = new PostgresGuestSessionService(pool, newGuestProjection, {
      now: () => new Date(nowMs).toISOString(),
    });
    await pool.query('truncate table learners cascade');
  });

  it('does not create a learner when resolving an unknown token', async () => {
    await expect(service.resolve('A'.repeat(43))).resolves.toBeNull();

    const count = await pool.query<{ count: string }>('select count(*) from learners');
    expect(count.rows[0]?.count).toBe('0');
  });

  it('bootstraps independent 256-bit session and CSRF credentials for one guest', async () => {
    const result = await service.bootstrap(null);
    const stored = await pool.query<{
      session_hash: string;
      csrf_token_hash: string;
      lifetime_seconds: string;
    }>(
      `
      select
        session_hash,
        csrf_token_hash,
        extract(epoch from (expires_at - created_at))::bigint::text as lifetime_seconds
      from guest_sessions
      where guest_session_id = $1
    `,
      [result.principal.sessionId],
    );

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.csrfToken).not.toBe(result.sessionToken);
    expect(result.maxAgeSeconds).toBe(COOKIE_MAX_AGE_SECONDS);
    expect(result.principal).toMatchObject({ kind: 'guest' });
    expect(stored.rows[0]).toEqual({
      session_hash: hash(result.sessionToken),
      csrf_token_hash: hash(result.csrfToken),
      lifetime_seconds: String(COOKIE_MAX_AGE_SECONDS),
    });
  });

  it('resolves a valid session without exposing stored credentials', async () => {
    const bootstrapped = await service.bootstrap(null);
    nowMs += 60_000;

    const resolved = await service.resolve(bootstrapped.sessionToken);

    expect(resolved).toEqual({
      principal: bootstrapped.principal,
      csrfTokenHash: hash(bootstrapped.csrfToken),
    });
    const seen = await pool.query<{ last_seen_at: Date }>(
      'select last_seen_at from guest_sessions where guest_session_id = $1',
      [bootstrapped.principal.sessionId],
    );
    expect(seen.rows[0]?.last_seen_at.toISOString()).toBe(new Date(nowMs).toISOString());
  });

  it('rotates a valid session while preserving the learner and revoking the old row', async () => {
    const original = await service.bootstrap(null);
    const rotated = await service.bootstrap(original.sessionToken);

    expect(rotated.principal.learnerId).toBe(original.principal.learnerId);
    expect(rotated.principal.sessionId).not.toBe(original.principal.sessionId);
    expect(rotated.sessionToken).not.toBe(original.sessionToken);
    await expect(service.resolve(original.sessionToken)).resolves.toBeNull();
    await expect(service.resolve(rotated.sessionToken)).resolves.toMatchObject({
      principal: rotated.principal,
    });
    const old = await pool.query<{
      revoked_at: Date | null;
      rotated_to_session_id: string | null;
    }>(
      `select revoked_at, rotated_to_session_id
       from guest_sessions
       where guest_session_id = $1`,
      [original.principal.sessionId],
    );
    expect(old.rows[0]?.revoked_at).not.toBeNull();
    expect(old.rows[0]?.rotated_to_session_id).toBe(rotated.principal.sessionId);
  });

  it('allows only one valid replacement for a learner during concurrent rotation', async () => {
    const original = await service.bootstrap(null);

    const rotations = await Promise.all([
      service.bootstrap(original.sessionToken),
      service.bootstrap(original.sessionToken),
    ]);

    const preserved = rotations.filter(
      ({ principal }) => principal.learnerId === original.principal.learnerId,
    );
    const active = await pool.query<{ count: string }>(
      `select count(*)
       from guest_sessions
       where learner_id = $1 and revoked_at is null and expires_at > $2::timestamptz`,
      [original.principal.learnerId, new Date(nowMs).toISOString()],
    );
    expect(preserved).toHaveLength(1);
    expect(active.rows[0]?.count).toBe('1');
  });

  it('never resolves or resurrects expired and revoked sessions', async () => {
    const expired = await service.bootstrap(null);
    nowMs += (COOKIE_MAX_AGE_SECONDS + 1) * 1_000;
    await expect(service.resolve(expired.sessionToken)).resolves.toBeNull();
    const freshAfterExpiry = await service.bootstrap(expired.sessionToken);
    expect(freshAfterExpiry.principal.learnerId).not.toBe(expired.principal.learnerId);

    const revoked = await service.bootstrap(null);
    await pool.query(
      `update guest_sessions
       set revoked_at = $2::timestamptz
       where guest_session_id = $1`,
      [revoked.principal.sessionId, new Date(nowMs).toISOString()],
    );
    await expect(service.resolve(revoked.sessionToken)).resolves.toBeNull();
    const freshAfterRevocation = await service.bootstrap(revoked.sessionToken);
    expect(freshAfterRevocation.principal.learnerId).not.toBe(revoked.principal.learnerId);
  });

  it('rolls back learner and projection rows when session insertion fails', async () => {
    await pool.query(`
      create function reject_guest_session_insert() returns trigger
      language plpgsql as $$
      begin
        raise exception 'synthetic session insert failure';
      end
      $$
    `);
    await pool.query(`
      create trigger reject_guest_session_insert_trigger
      before insert on guest_sessions
      for each row execute function reject_guest_session_insert()
    `);

    try {
      await expect(service.bootstrap(null)).rejects.toMatchObject({ code: 'database_error' });
    } finally {
      await pool.query('drop trigger reject_guest_session_insert_trigger on guest_sessions');
      await pool.query('drop function reject_guest_session_insert()');
    }

    const counts = await pool.query<{ learners: string; streams: string }>(`
      select
        (select count(*) from learners)::text as learners,
        (select count(*) from learner_streams)::text as streams
    `);
    expect(counts.rows[0]).toEqual({ learners: '0', streams: '0' });
    expect(pool.waitingCount).toBe(0);
  });

  it('never stores or logs raw session and CSRF credentials', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const bootstrapped = await service.bootstrap(null);
      await service.resolve(bootstrapped.sessionToken);
      const stored = await pool.query<{
        session_hash: string;
        csrf_token_hash: string;
      }>('select session_hash, csrf_token_hash from guest_sessions');
      const serialized = JSON.stringify(stored.rows);

      expect(serialized).not.toContain(bootstrapped.sessionToken);
      expect(serialized).not.toContain(bootstrapped.csrfToken);
      expect(serialized).toContain(hash(bootstrapped.sessionToken));
      expect(serialized).toContain(hash(bootstrapped.csrfToken));
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    }
  });
});
