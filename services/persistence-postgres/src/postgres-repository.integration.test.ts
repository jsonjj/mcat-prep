import type { AcceptedCommand, LearnerProjectionRecord, OutboxRecord } from '@mcat/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPgPool, type PostgresPool } from './config';
import { PersistenceError } from './errors';
import { PostgresAuthorityRepository } from './postgres-repository';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const NOW = '2026-07-20T12:00:00.000Z';

const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;

const newGuestProjection = (learnerId: string, now: string): LearnerProjectionRecord => ({
  learnerId,
  sequence: 0,
  projectionVersion: 'test-projection-v1',
  state: { learnerId, accountState: 'guest', marker: 'synthetic-test' },
  updatedAt: now,
});

function acceptedCommand(
  learnerId: string,
  sequence: number,
  idempotencyKey = crypto.randomUUID(),
): AcceptedCommand {
  const eventId = crypto.randomUUID();
  return {
    eventId,
    learnerId,
    idempotencyKey,
    sequence,
    acceptedAt: NOW,
    eventType: 'attempt_submitted',
    contentRelease: 'synthetic-v1',
    policyVersions: { mastery: 'provisional-v1' },
    payload: { questionId: 'q-synthetic', chosenChoiceId: 'A' },
    result: { eventId, sequence },
  };
}

function outboxRecord(command: AcceptedCommand): OutboxRecord {
  return {
    outboxId: command.eventId,
    learnerId: command.learnerId,
    sequence: command.sequence,
    topic: 'learner.command.accepted',
    payload: { eventId: command.eventId, eventType: command.eventType },
    createdAt: command.acceptedAt,
    publishedAt: null,
    attempts: 0,
  };
}

describeWithPostgres('PostgresAuthorityRepository', () => {
  let pool: PostgresPool;
  let repository: PostgresAuthorityRepository;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: DATABASE_URL!,
      tls: false,
      applicationName: 'mcat-persistence-integration-test',
      maxConnections: 4,
      statementTimeoutMs: 5_000,
      lockTimeoutMs: 2_000,
      idleInTransactionTimeoutMs: 5_000,
    });
    repository = new PostgresAuthorityRepository(pool, { newGuestProjection });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate table learners cascade');
  });

  it('gets or creates one guest from a SHA-256 session hash', async () => {
    const sessionHash = 'a'.repeat(64);

    const first = await repository.transaction((tx) => tx.getOrCreateGuest(sessionHash, NOW));
    const second = await repository.transaction((tx) => tx.getOrCreateGuest(sessionHash, NOW));
    const count = await pool.query<{ count: string }>('select count(*) from learners');

    expect(second).toEqual(first);
    expect(first).toMatchObject({ sequence: 0, projectionVersion: 'test-projection-v1' });
    expect(count.rows[0]?.count).toBe('1');
  });

  it('scopes idempotency lookups to the locked learner', async () => {
    const learnerA = await repository.transaction((tx) => tx.getOrCreateGuest('a'.repeat(64), NOW));
    const learnerB = await repository.transaction((tx) => tx.getOrCreateGuest('b'.repeat(64), NOW));
    const key = crypto.randomUUID();
    const command = acceptedCommand(learnerA.learnerId, 1, key);

    await repository.transaction(async (tx) => {
      await tx.lockLearner(learnerA.learnerId);
      await tx.appendAccepted(command);
    });

    const forA = await repository.transaction(async (tx) => {
      await tx.lockLearner(learnerA.learnerId);
      return tx.findAcceptedByIdempotency(learnerA.learnerId, key);
    });
    const forB = await repository.transaction(async (tx) => {
      await tx.lockLearner(learnerB.learnerId);
      return tx.findAcceptedByIdempotency(learnerB.learnerId, key);
    });

    expect(forA).toEqual(command);
    expect(forB).toBeNull();
  });

  it('rejects a cross-learner write after the transaction locks its tenant', async () => {
    const learnerA = await repository.transaction((tx) => tx.getOrCreateGuest('1'.repeat(64), NOW));
    const learnerB = await repository.transaction((tx) => tx.getOrCreateGuest('2'.repeat(64), NOW));

    await expect(
      repository.transaction(async (tx) => {
        await tx.lockLearner(learnerA.learnerId);
        await tx.appendAccepted(acceptedCommand(learnerB.learnerId, 1));
      }),
    ).rejects.toMatchObject({ code: 'tenant_scope_violation' });

    const count = await pool.query<{ count: string }>('select count(*) from accepted_events');
    expect(count.rows[0]?.count).toBe('0');
  });

  it('serializes concurrent writes with a learner stream row lock', async () => {
    const learner = await repository.transaction((tx) => tx.getOrCreateGuest('c'.repeat(64), NOW));
    let markLocked: () => void = () => undefined;
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    let releaseLock: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let secondAcquired = false;

    const first = repository.transaction(async (tx) => {
      await tx.lockLearner(learner.learnerId);
      markLocked();
      await hold;
    });
    await locked;
    const second = repository.transaction(async (tx) => {
      await tx.lockLearner(learner.learnerId);
      secondAcquired = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(secondAcquired).toBe(false);
    releaseLock();
    await Promise.all([first, second]);
    expect(secondAcquired).toBe(true);
  });

  it('commits accepted event, projection, and outbox atomically', async () => {
    const initial = await repository.transaction((tx) => tx.getOrCreateGuest('d'.repeat(64), NOW));
    const command = acceptedCommand(initial.learnerId, 1);

    await repository.transaction(async (tx) => {
      await tx.lockLearner(initial.learnerId);
      await tx.appendAccepted(command);
      await tx.saveProjection({
        ...initial,
        sequence: 1,
        state: { ...initial.state, marker: 'committed' },
        updatedAt: NOW,
      });
      await tx.appendOutbox(outboxRecord(command));
    });

    const projection = await repository.loadProjection(initial.learnerId);
    const counts = await pool.query<{ events: string; outbox: string }>(`
      select
        (select count(*) from accepted_events)::text as events,
        (select count(*) from outbox)::text as outbox
    `);
    expect(projection).toMatchObject({ sequence: 1, state: { marker: 'committed' } });
    expect(counts.rows[0]).toEqual({ events: '1', outbox: '1' });
  });

  it('rolls back event, projection, and outbox after an application failure', async () => {
    const initial = await repository.transaction((tx) => tx.getOrCreateGuest('e'.repeat(64), NOW));
    const command = acceptedCommand(initial.learnerId, 1);

    await expect(
      repository.transaction(async (tx) => {
        await tx.lockLearner(initial.learnerId);
        await tx.appendAccepted(command);
        await tx.saveProjection({ ...initial, sequence: 1, updatedAt: NOW });
        await tx.appendOutbox(outboxRecord(command));
        throw new Error('synthetic application failure');
      }),
    ).rejects.toThrow('synthetic application failure');

    const projection = await repository.loadProjection(initial.learnerId);
    const counts = await pool.query<{ events: string; outbox: string }>(`
      select
        (select count(*) from accepted_events)::text as events,
        (select count(*) from outbox)::text as outbox
    `);
    expect(projection?.sequence).toBe(0);
    expect(counts.rows[0]).toEqual({ events: '0', outbox: '0' });
    expect(pool.waitingCount).toBe(0);
  });

  it('returns a non-sensitive conflict without logging payloads or identifiers', async () => {
    const initial = await repository.transaction((tx) => tx.getOrCreateGuest('f'.repeat(64), NOW));
    const sensitiveKey = 'do-not-log-this-idempotency-key';
    const first = acceptedCommand(initial.learnerId, 1, sensitiveKey);
    const duplicate = {
      ...acceptedCommand(initial.learnerId, 2, sensitiveKey),
      payload: { correct_choice_id: 'DO-NOT-LOG-ANSWER' },
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await repository.transaction(async (tx) => {
      await tx.lockLearner(initial.learnerId);
      await tx.appendAccepted(first);
    });
    const rejected = repository.transaction(async (tx) => {
      await tx.lockLearner(initial.learnerId);
      await tx.appendAccepted(duplicate);
    });

    await expect(rejected).rejects.toMatchObject({ code: 'conflict', retryable: false });
    await rejected.catch((reason: unknown) => {
      expect(reason).toBeInstanceOf(PersistenceError);
      expect(JSON.stringify(reason)).not.toMatch(/do-not-log|correct_choice_id|answer/i);
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    log.mockRestore();
    error.mockRestore();
    warn.mockRestore();
  });
});
