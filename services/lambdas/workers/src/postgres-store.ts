import type { JsonObject, OutboxRecord } from '@mcat/database';
import {
  PersistenceError,
  toPersistenceError,
  type PostgresPool,
} from '@mcat/persistence-postgres';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClaimedOutboxStore } from './outbox';
import type { ProjectionConsumerStore, ProjectionMessage } from './projection-handler';

interface OutboxRow extends QueryResultRow {
  outbox_id: string;
  learner_id: string;
  sequence: string;
  topic: string;
  payload: unknown;
  created_at: Date | string;
  published_at: Date | string | null;
  attempts: number;
}

function jsonObject(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The outbox database returned invalid JSON.',
    });
  }
  return value as JsonObject;
}

function utc(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The outbox database returned an invalid timestamp.',
    });
  }
  return parsed.toISOString();
}

function safeSequence(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The outbox database returned an invalid sequence.',
    });
  }
  return parsed;
}

function toRecord(row: OutboxRow): OutboxRecord {
  return {
    outboxId: row.outbox_id,
    learnerId: row.learner_id,
    sequence: safeSequence(row.sequence),
    topic: row.topic,
    payload: jsonObject(row.payload),
    createdAt: utc(row.created_at),
    publishedAt: row.published_at === null ? null : utc(row.published_at),
    attempts: row.attempts,
  };
}

async function query(client: PoolClient, text: string, values: readonly unknown[] = []) {
  try {
    return await client.query(text, [...values]);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export class PostgresOutboxStore implements ClaimedOutboxStore {
  private client: PoolClient | undefined;
  private claimed = new Set<string>();

  constructor(private readonly pool: PostgresPool) {}

  async claimBatch(limit: number): Promise<readonly OutboxRecord[]> {
    if (this.client !== undefined) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'This outbox store already has an active claim.',
      });
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The outbox claim limit is invalid.',
      });
    }

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw toPersistenceError(error);
    }
    this.client = client;

    try {
      await query(client, 'begin');
      const result = await client.query<OutboxRow>(
        `select
           outbox_id,
           learner_id,
           sequence,
           topic,
           payload,
           created_at,
           published_at,
           attempts
         from outbox
         where published_at is null
         order by created_at, outbox_id
         for update skip locked
         limit $1`,
        [limit],
      );
      this.claimed = new Set(result.rows.map((row) => row.outbox_id));
      return result.rows.map(toRecord);
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the original safe failure.
      }
      this.client = undefined;
      this.claimed.clear();
      client.release();
      throw toPersistenceError(error);
    }
  }

  private activeClient(ids: readonly string[]): PoolClient {
    if (this.client === undefined) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'No outbox claim is active.',
      });
    }
    if (
      ids.length === 0 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !this.claimed.has(id))
    ) {
      throw new PersistenceError({
        code: 'tenant_scope_violation',
        message: 'The outbox update exceeds the active claim.',
      });
    }
    return this.client;
  }

  async markPublished(ids: readonly string[], publishedAt: string): Promise<void> {
    const client = this.activeClient(ids);
    if (Number.isNaN(Date.parse(publishedAt))) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The outbox publication time is invalid.',
      });
    }
    const result = await query(
      client,
      `update outbox
       set published_at = $2::timestamptz
       where outbox_id = any($1::uuid[]) and published_at is null`,
      [ids, publishedAt],
    );
    if (result.rowCount !== ids.length) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'The claimed outbox rows changed before publication.',
      });
    }
  }

  async markFailed(ids: readonly string[]): Promise<void> {
    const client = this.activeClient(ids);
    const result = await query(
      client,
      `update outbox
       set attempts = attempts + 1
       where outbox_id = any($1::uuid[]) and published_at is null`,
      [ids],
    );
    if (result.rowCount !== ids.length) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'The claimed outbox rows changed after publication failure.',
      });
    }
  }

  async finish(commit: boolean): Promise<void> {
    const client = this.client;
    if (client === undefined) return;
    this.client = undefined;
    this.claimed.clear();
    try {
      await query(client, commit ? 'commit' : 'rollback');
    } finally {
      client.release();
    }
  }
}

export class PostgresProjectionConsumerStore implements ProjectionConsumerStore {
  constructor(private readonly pool: PostgresPool) {}

  async consumeOnce(
    consumerName: string,
    message: ProjectionMessage,
    apply: () => Promise<void>,
  ): Promise<'applied' | 'duplicate'> {
    if (consumerName.trim() === '' || consumerName.length > 128) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The projection consumer name is invalid.',
      });
    }

    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw toPersistenceError(error);
    }

    try {
      await query(client, 'begin');
      await query(
        client,
        `select pg_advisory_xact_lock(
           hashtextextended($1::text || ':' || $2::text, 0)
         )`,
        [consumerName, message.learnerId],
      );
      const existing = await query(
        client,
        `select 1
         from inbox_deduplication
         where consumer_name = $1
           and (
             message_id = $2
             or (learner_id = $3 and sequence = $4)
           )
         limit 1`,
        [consumerName, message.messageId, message.learnerId, message.sequence],
      );
      if (existing.rowCount !== 0) {
        await query(client, 'commit');
        return 'duplicate';
      }

      await apply();
      await query(
        client,
        `insert into inbox_deduplication
         (consumer_name, message_id, learner_id, sequence, consumed_at)
         values ($1, $2, $3, $4, clock_timestamp())`,
        [consumerName, message.messageId, message.learnerId, message.sequence],
      );
      await query(client, 'commit');
      return 'applied';
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the original safe/application failure.
      }
      if (error instanceof PersistenceError || error instanceof Error) throw error;
      throw toPersistenceError(error);
    } finally {
      client.release();
    }
  }
}
