import type {
  AcceptedCommand,
  AuthorityRepository,
  AuthorityTransaction,
  JsonObject,
  LearnerProjectionRecord,
  OutboxRecord,
} from '@mcat/database';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type { PostgresPool } from './config';
import { PersistenceError, toPersistenceError } from './errors';

interface ProjectionRow extends QueryResultRow {
  learner_id: string;
  current_sequence: string;
  projection_version: string;
  state_json: unknown;
  updated_at: Date | string;
}

interface AcceptedCommandRow extends QueryResultRow {
  event_id: string;
  learner_id: string;
  idempotency_key: string;
  sequence: string;
  accepted_at: Date | string;
  event_type: string;
  content_release: string;
  policy_versions: unknown;
  payload: unknown;
  result: unknown;
}

interface GuestRow extends ProjectionRow {
  revoked_at: Date | string | null;
  expires_at: Date | string;
}

export interface PostgresAuthorityRepositoryOptions {
  readonly newGuestProjection: (learnerId: string, now: string) => LearnerProjectionRecord;
}

function jsonObject(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The authority database returned invalid JSON state.',
    });
  }
  return value as JsonObject;
}

function sequence(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The authority database returned an invalid sequence.',
    });
  }
  return parsed;
}

function utc(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The authority database returned an invalid timestamp.',
    });
  }
  return parsed.toISOString();
}

function projectionFromRow(row: ProjectionRow): LearnerProjectionRecord {
  return {
    learnerId: row.learner_id,
    sequence: sequence(row.current_sequence),
    projectionVersion: row.projection_version,
    state: jsonObject(row.state_json),
    updatedAt: utc(row.updated_at),
  };
}

function acceptedFromRow(row: AcceptedCommandRow): AcceptedCommand {
  return {
    eventId: row.event_id,
    learnerId: row.learner_id,
    idempotencyKey: row.idempotency_key,
    sequence: sequence(row.sequence),
    acceptedAt: utc(row.accepted_at),
    eventType: row.event_type,
    contentRelease: row.content_release,
    policyVersions: jsonObject(row.policy_versions) as Readonly<Record<string, string>>,
    payload: jsonObject(row.payload),
    result: jsonObject(row.result),
  };
}

async function query<Row extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  try {
    return await client.query<Row>(text, [...values]);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

class PostgresAuthorityTransaction implements AuthorityTransaction {
  private lockedLearnerId: string | undefined;

  constructor(
    private readonly client: PoolClient,
    private readonly options: PostgresAuthorityRepositoryOptions,
  ) {}

  private bindLearner(learnerId: string): void {
    if (this.lockedLearnerId !== undefined && this.lockedLearnerId !== learnerId) {
      throw new PersistenceError({
        code: 'tenant_scope_violation',
        message: 'The transaction cannot cross learner ownership boundaries.',
      });
    }
    this.lockedLearnerId = learnerId;
  }

  private requireLearner(learnerId: string): void {
    if (this.lockedLearnerId !== learnerId) {
      throw new PersistenceError({
        code: 'tenant_scope_violation',
        message: 'The transaction is not authorized for this learner scope.',
      });
    }
  }

  async getOrCreateGuest(sessionHash: string, now: string): Promise<LearnerProjectionRecord> {
    if (!/^[0-9a-f]{64}$/.test(sessionHash) || Number.isNaN(Date.parse(now))) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The guest session input is invalid.',
      });
    }

    await query(this.client, 'select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
      sessionHash,
    ]);
    const existing = await query<GuestRow>(
      this.client,
      `select
         ls.learner_id,
         ls.current_sequence,
         ls.projection_version,
         ls.state_json,
         ls.updated_at,
         gs.revoked_at,
         gs.expires_at
       from guest_sessions gs
       join learner_streams ls on ls.learner_id = gs.learner_id
       where gs.session_hash = $1
       for update of gs, ls`,
      [sessionHash],
    );
    const row = existing.rows[0];
    if (row !== undefined) {
      if (row.revoked_at !== null || Date.parse(utc(row.expires_at)) <= Date.parse(now)) {
        throw new PersistenceError({
          code: 'session_unavailable',
          message: 'The guest session is no longer available.',
        });
      }
      await query(
        this.client,
        `update guest_sessions
         set last_seen_at = $2::timestamptz
         where session_hash = $1 and revoked_at is null`,
        [sessionHash, now],
      );
      this.bindLearner(row.learner_id);
      return projectionFromRow(row);
    }

    const learnerId = crypto.randomUUID();
    const guestSessionId = crypto.randomUUID();
    const projection = this.options.newGuestProjection(learnerId, now);
    if (projection.learnerId !== learnerId || projection.sequence !== 0) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The initial guest projection is invalid.',
      });
    }

    await query(
      this.client,
      `insert into learners (learner_id, account_state, created_at, updated_at)
       values ($1, 'guest', $2::timestamptz, $2::timestamptz)`,
      [learnerId, now],
    );
    await query(
      this.client,
      `insert into learner_streams (
         learner_id,
         current_sequence,
         projection_version,
         state_json,
         updated_at
       ) values ($1, $2, $3, $4::jsonb, $5::timestamptz)`,
      [
        projection.learnerId,
        projection.sequence,
        projection.projectionVersion,
        JSON.stringify(projection.state),
        projection.updatedAt,
      ],
    );
    await query(
      this.client,
      `insert into guest_sessions (
         guest_session_id,
         learner_id,
         session_hash,
         created_at,
         last_seen_at,
         expires_at
       ) values (
         $1,
         $2,
         $3,
         $4::timestamptz,
         $4::timestamptz,
         $4::timestamptz + interval '180 days'
       )`,
      [guestSessionId, learnerId, sessionHash, now],
    );
    this.bindLearner(learnerId);
    return projection;
  }

  async lockLearner(learnerId: string): Promise<LearnerProjectionRecord> {
    this.bindLearner(learnerId);
    const result = await query<ProjectionRow>(
      this.client,
      `select learner_id, current_sequence, projection_version, state_json, updated_at
       from learner_streams
       where learner_id = $1
       for update`,
      [learnerId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new PersistenceError({
        code: 'not_found',
        message: 'The learner projection was not found.',
      });
    }
    return projectionFromRow(row);
  }

  async findAcceptedByIdempotency(learnerId: string, key: string): Promise<AcceptedCommand | null> {
    this.requireLearner(learnerId);
    const result = await query<AcceptedCommandRow>(
      this.client,
      `select
         event_id,
         learner_id,
         idempotency_key,
         sequence,
         accepted_at,
         event_type,
         content_release,
         policy_versions,
         payload,
         result
       from accepted_events
       where learner_id = $1 and idempotency_key = $2`,
      [learnerId, key],
    );
    const row = result.rows[0];
    return row === undefined ? null : acceptedFromRow(row);
  }

  async appendAccepted(command: AcceptedCommand): Promise<void> {
    this.requireLearner(command.learnerId);
    await query(
      this.client,
      `insert into accepted_events (
         event_id,
         learner_id,
         idempotency_key,
         sequence,
         accepted_at,
         event_type,
         content_release,
         policy_versions,
         payload,
         result
       ) values (
         $1,
         $2,
         $3,
         $4,
         $5::timestamptz,
         $6,
         $7,
         $8::jsonb,
         $9::jsonb,
         $10::jsonb
       )`,
      [
        command.eventId,
        command.learnerId,
        command.idempotencyKey,
        command.sequence,
        command.acceptedAt,
        command.eventType,
        command.contentRelease,
        JSON.stringify(command.policyVersions),
        JSON.stringify(command.payload),
        JSON.stringify(command.result),
      ],
    );
  }

  async saveProjection(record: LearnerProjectionRecord): Promise<void> {
    this.requireLearner(record.learnerId);
    const updated = await query(
      this.client,
      `update learner_streams
       set
         current_sequence = $2,
         projection_version = $3,
         state_json = $4::jsonb,
         updated_at = $5::timestamptz
       where learner_id = $1 and current_sequence = $6`,
      [
        record.learnerId,
        record.sequence,
        record.projectionVersion,
        JSON.stringify(record.state),
        record.updatedAt,
        record.sequence - 1,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'The learner projection sequence has changed.',
      });
    }
  }

  async appendOutbox(record: OutboxRecord): Promise<void> {
    this.requireLearner(record.learnerId);
    await query(
      this.client,
      `insert into outbox (
         outbox_id,
         learner_id,
         sequence,
         topic,
         payload,
         created_at,
         published_at,
         attempts
       ) values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz, $8)`,
      [
        record.outboxId,
        record.learnerId,
        record.sequence,
        record.topic,
        JSON.stringify(record.payload),
        record.createdAt,
        record.publishedAt,
        record.attempts,
      ],
    );
  }
}

export class PostgresAuthorityRepository implements AuthorityRepository {
  constructor(
    private readonly pool: PostgresPool,
    private readonly options: PostgresAuthorityRepositoryOptions,
  ) {}

  async transaction<T>(fn: (tx: AuthorityTransaction) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw toPersistenceError(error);
    }

    try {
      await query(client, 'begin');
      try {
        const result = await fn(new PostgresAuthorityTransaction(client, this.options));
        await query(client, 'commit');
        return result;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          // The original allowlisted failure remains authoritative.
        }
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async loadProjection(learnerId: string): Promise<LearnerProjectionRecord | null> {
    try {
      const result = await this.pool.query<ProjectionRow>(
        `select learner_id, current_sequence, projection_version, state_json, updated_at
         from learner_streams
         where learner_id = $1`,
        [learnerId],
      );
      const row = result.rows[0];
      return row === undefined ? null : projectionFromRow(row);
    } catch (error) {
      throw toPersistenceError(error);
    }
  }
}
