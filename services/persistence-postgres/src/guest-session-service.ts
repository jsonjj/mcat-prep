import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { LearnerProjectionRecord } from '@mcat/database';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type { PostgresPool } from './config';
import { PersistenceError, toPersistenceError } from './errors';

export const GUEST_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface GuestPrincipal {
  readonly kind: 'guest';
  readonly learnerId: string;
  readonly sessionId: string;
}

export interface BootstrapGuestSession {
  readonly principal: GuestPrincipal;
  readonly sessionToken: string;
  readonly csrfToken: string;
  readonly maxAgeSeconds: number;
}

export interface ResolvedGuestSession {
  readonly principal: GuestPrincipal;
  readonly csrfTokenHash: string;
}

export interface PostgresGuestSessionServiceOptions {
  readonly now?: () => string;
}

interface SessionRow extends QueryResultRow {
  guest_session_id: string;
  learner_id: string;
  csrf_token_hash: string | null;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

interface CredentialPair {
  readonly sessionToken: string;
  readonly sessionHash: string;
  readonly csrfToken: string;
  readonly csrfHash: string;
}

type NewGuestProjection = (learnerId: string, now: string) => LearnerProjectionRecord;

const isOpaqueToken = (token: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(token);

const hashOpaqueToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

function newCredentials(): CredentialPair {
  const sessionToken = randomBytes(32).toString('base64url');
  let csrfToken = randomBytes(32).toString('base64url');
  while (csrfToken === sessionToken) {
    csrfToken = randomBytes(32).toString('base64url');
  }
  return {
    sessionToken,
    sessionHash: hashOpaqueToken(sessionToken),
    csrfToken,
    csrfHash: hashOpaqueToken(csrfToken),
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

function isValidAt(row: SessionRow, now: string): boolean {
  if (row.revoked_at !== null || row.csrf_token_hash === null) return false;
  return new Date(row.expires_at).getTime() > Date.parse(now);
}

function resultFor(
  learnerId: string,
  sessionId: string,
  credentials: CredentialPair,
): BootstrapGuestSession {
  return {
    principal: { kind: 'guest', learnerId, sessionId },
    sessionToken: credentials.sessionToken,
    csrfToken: credentials.csrfToken,
    maxAgeSeconds: GUEST_SESSION_MAX_AGE_SECONDS,
  };
}

export class PostgresGuestSessionService {
  private readonly now: () => string;

  constructor(
    private readonly pool: PostgresPool,
    private readonly newGuestProjection: NewGuestProjection,
    options: PostgresGuestSessionServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async bootstrap(existingSessionToken: string | null): Promise<BootstrapGuestSession> {
    const now = this.now();
    if (Number.isNaN(Date.parse(now))) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The session clock returned an invalid timestamp.',
      });
    }
    const existingHash =
      existingSessionToken !== null && isOpaqueToken(existingSessionToken)
        ? hashOpaqueToken(existingSessionToken)
        : null;

    return this.transaction(async (client) => {
      if (existingHash !== null) {
        await this.lockSessionHash(client, existingHash);
        const existing = await this.findByHashForUpdate(client, existingHash);
        if (existing !== null && isValidAt(existing, now)) {
          return this.rotate(client, existing, now);
        }
      }
      return this.createFreshGuest(client, now);
    });
  }

  async resolve(sessionToken: string): Promise<ResolvedGuestSession | null> {
    if (!isOpaqueToken(sessionToken)) return null;
    const now = this.now();
    if (Number.isNaN(Date.parse(now))) return null;
    const sessionHash = hashOpaqueToken(sessionToken);

    return this.transaction(async (client) => {
      await this.lockSessionHash(client, sessionHash);
      const row = await this.findByHashForUpdate(client, sessionHash);
      if (row === null || !isValidAt(row, now) || row.csrf_token_hash === null) return null;
      await query(
        client,
        `update guest_sessions
         set last_seen_at = $2::timestamptz
         where guest_session_id = $1 and revoked_at is null`,
        [row.guest_session_id, now],
      );
      return {
        principal: {
          kind: 'guest',
          learnerId: row.learner_id,
          sessionId: row.guest_session_id,
        },
        csrfTokenHash: row.csrf_token_hash,
      };
    });
  }

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw toPersistenceError(error);
    }

    try {
      await query(client, 'begin');
      try {
        const result = await fn(client);
        await query(client, 'commit');
        return result;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          // Preserve the original allowlisted error.
        }
        throw error;
      }
    } finally {
      client.release();
    }
  }

  private async lockSessionHash(client: PoolClient, sessionHash: string): Promise<void> {
    await query(client, 'select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
      sessionHash,
    ]);
  }

  private async findByHashForUpdate(
    client: PoolClient,
    sessionHash: string,
  ): Promise<SessionRow | null> {
    const result = await query<SessionRow>(
      client,
      `select
         guest_session_id,
         learner_id,
         csrf_token_hash,
         expires_at,
         revoked_at
       from guest_sessions
       where session_hash = $1
       for update`,
      [sessionHash],
    );
    return result.rows[0] ?? null;
  }

  private async insertSession(
    client: PoolClient,
    learnerId: string,
    now: string,
    credentials: CredentialPair,
  ): Promise<string> {
    const sessionId = randomUUID();
    await query(
      client,
      `insert into guest_sessions (
         guest_session_id,
         learner_id,
         session_hash,
         csrf_token_hash,
         created_at,
         last_seen_at,
         expires_at
       ) values (
         $1,
         $2,
         $3,
         $4,
         $5::timestamptz,
         $5::timestamptz,
         $5::timestamptz + interval '30 days'
       )`,
      [sessionId, learnerId, credentials.sessionHash, credentials.csrfHash, now],
    );
    return sessionId;
  }

  private async rotate(
    client: PoolClient,
    existing: SessionRow,
    now: string,
  ): Promise<BootstrapGuestSession> {
    const credentials = newCredentials();
    const sessionId = await this.insertSession(client, existing.learner_id, now, credentials);
    const revoked = await query(
      client,
      `update guest_sessions
       set revoked_at = $2::timestamptz, rotated_to_session_id = $3
       where guest_session_id = $1
         and revoked_at is null
         and expires_at > $2::timestamptz`,
      [existing.guest_session_id, now, sessionId],
    );
    if (revoked.rowCount !== 1) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'The guest session changed during rotation.',
      });
    }
    return resultFor(existing.learner_id, sessionId, credentials);
  }

  private async createFreshGuest(client: PoolClient, now: string): Promise<BootstrapGuestSession> {
    const learnerId = randomUUID();
    const projection = this.newGuestProjection(learnerId, now);
    if (projection.learnerId !== learnerId || projection.sequence !== 0) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The initial guest projection is invalid.',
      });
    }
    const credentials = newCredentials();

    await query(
      client,
      `insert into learners (learner_id, account_state, created_at, updated_at)
       values ($1, 'guest', $2::timestamptz, $2::timestamptz)`,
      [learnerId, now],
    );
    await query(
      client,
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
    const sessionId = await this.insertSession(client, learnerId, now, credentials);
    return resultFor(learnerId, sessionId, credentials);
  }
}
