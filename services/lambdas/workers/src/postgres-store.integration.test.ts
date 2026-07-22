import { createPgPool, type PostgresPool } from '@mcat/persistence-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PostgresOutboxStore, PostgresProjectionConsumerStore } from './postgres-store';
import type { ProjectionMessage } from './projection-handler';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;
const NOW = '2026-07-21T12:00:00.000Z';
const LEARNER = '10000000-0000-4000-8000-000000000001';

const projectionMessage = (messageId = crypto.randomUUID()): ProjectionMessage => ({
  messageId,
  learnerId: LEARNER,
  sequence: 1,
  topic: 'learner.command.accepted',
  payload: { eventType: 'goal_updated' },
  createdAt: NOW,
});

describeWithPostgres('PostgreSQL worker stores', () => {
  let pool: PostgresPool;

  beforeAll(() => {
    pool = createPgPool({
      connectionString: DATABASE_URL!,
      tls: false,
      applicationName: 'mcat-worker-integration-test',
      maxConnections: 4,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate table learners cascade');
    await pool.query(
      `insert into learners (learner_id, account_state, created_at, updated_at)
       values ($1, 'guest', $2::timestamptz, $2::timestamptz)`,
      [LEARNER, NOW],
    );
  });

  it('holds claimed row locks through publication state commit', async () => {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await pool.query(
      `insert into outbox
       (outbox_id, learner_id, sequence, topic, payload, created_at, published_at, attempts)
       values
       ($1, $3, 1, 'learner.command.accepted', '{}'::jsonb, $4, null, 0),
       ($2, $3, 2, 'learner.command.accepted', '{}'::jsonb, $4, null, 0)`,
      [firstId, secondId, LEARNER, NOW],
    );
    const firstStore = new PostgresOutboxStore(pool);
    const secondStore = new PostgresOutboxStore(pool);
    const claimed = await firstStore.claimBatch(1);

    expect(claimed).toHaveLength(1);
    expect(await secondStore.claimBatch(10)).toHaveLength(1);
    await secondStore.finish(false);
    await firstStore.markPublished([claimed[0]!.outboxId], NOW);
    await firstStore.finish(true);

    const rows = await pool.query<{ attempts: number; published_at: Date | null }>(
      'select attempts, published_at from outbox where outbox_id = $1',
      [claimed[0]!.outboxId],
    );
    expect(rows.rows[0]?.attempts).toBe(0);
    expect(rows.rows[0]?.published_at?.toISOString()).toBe(NOW);
  });

  it('rolls back publication markers when the batch cannot complete', async () => {
    const outboxId = crypto.randomUUID();
    await pool.query(
      `insert into outbox
       (outbox_id, learner_id, sequence, topic, payload, created_at, published_at, attempts)
       values ($1, $2, 1, 'learner.command.accepted', '{}'::jsonb, $3, null, 0)`,
      [outboxId, LEARNER, NOW],
    );
    const store = new PostgresOutboxStore(pool);
    const claimed = await store.claimBatch(10);
    await store.markPublished([claimed[0]!.outboxId], NOW);
    await store.finish(false);

    const row = await pool.query<{ published_at: Date | null }>(
      'select published_at from outbox where outbox_id = $1',
      [outboxId],
    );
    expect(row.rows[0]?.published_at).toBeNull();
  });

  it('deduplicates both message IDs and learner sequences', async () => {
    const store = new PostgresProjectionConsumerStore(pool);
    const first = projectionMessage();
    const sameSequence = projectionMessage();
    const applied: string[] = [];

    expect(
      await store.consumeOnce('mastery-v1', first, async () => {
        applied.push(first.messageId);
      }),
    ).toBe('applied');
    expect(await store.consumeOnce('mastery-v1', first, async () => undefined)).toBe('duplicate');
    expect(await store.consumeOnce('mastery-v1', sameSequence, async () => undefined)).toBe(
      'duplicate',
    );
    expect(applied).toEqual([first.messageId]);
    const count = await pool.query<{ count: string }>(
      'select count(*) from inbox_deduplication where consumer_name = $1',
      ['mastery-v1'],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('rolls back inbox consumption when projection application fails', async () => {
    const store = new PostgresProjectionConsumerStore(pool);
    const message = projectionMessage();

    await expect(
      store.consumeOnce('mastery-v1', message, async () => {
        throw new Error('projection failed');
      }),
    ).rejects.toThrow('projection failed');
    const count = await pool.query<{ count: string }>(
      'select count(*) from inbox_deduplication where message_id = $1',
      [message.messageId],
    );
    expect(count.rows[0]?.count).toBe('0');
  });
});
