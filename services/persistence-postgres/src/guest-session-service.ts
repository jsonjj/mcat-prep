import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { LearnerProjectionRecord } from '@mcat/database';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import type { PostgresPool } from './config';
import { PersistenceError, toPersistenceError } from './errors';

export const GUEST_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The identity provider recorded in `linked_identities.provider` for Supabase accounts. */
export const SUPABASE_PROVIDER = 'supabase';

export type SessionPrincipalKind = 'guest' | 'linked';

export interface GuestPrincipal {
  readonly kind: SessionPrincipalKind;
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
  account_state: string;
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

/**
 * `learners.account_state` is the single source of truth for whether a session
 * speaks for a real account. Only `'linked'` grants access to learner routes;
 * `'recovering'` deliberately falls back to `'guest'` so a half-finished recovery
 * cannot act as the account.
 */
const principalKindFor = (accountState: string): SessionPrincipalKind =>
  accountState === 'linked' ? 'linked' : 'guest';

function resultFor(
  learnerId: string,
  sessionId: string,
  credentials: CredentialPair,
  kind: SessionPrincipalKind = 'guest',
): BootstrapGuestSession {
  return {
    principal: { kind, learnerId, sessionId },
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
          kind: principalKindFor(row.account_state),
          learnerId: row.learner_id,
          sessionId: row.guest_session_id,
        },
        csrfTokenHash: row.csrf_token_hash,
      };
    });
  }

  /**
   * Exchange a verified identity-provider subject for a learner session.
   *
   * The subject has already been proven by the caller (the learner API verifies it
   * with Supabase before calling this). Identity is looked up by
   * `(provider, provider_subject)` and never by email, so a re-registered address
   * can never inherit another learner's history. First sign-in creates the learner,
   * its stream, and the identity row in one transaction.
   */
  async signIn(provider: string, providerSubject: string): Promise<BootstrapGuestSession> {
    const now = this.now();
    if (Number.isNaN(Date.parse(now))) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The session clock returned an invalid timestamp.',
      });
    }
    if (provider.length === 0 || providerSubject.length === 0) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'A linked identity requires a provider and subject.',
      });
    }

    return this.transaction(async (client) => {
      // Serialize concurrent first sign-ins for one subject so two tabs cannot each
      // create a learner for the same identity.
      await this.lockKey(client, `${provider}:${providerSubject}`);
      const existing = await query<{ learner_id: string }>(
        client,
        `select learner_id from linked_identities
         where provider = $1 and provider_subject = $2`,
        [provider, providerSubject],
      );

      const learnerId = existing.rows[0]?.learner_id ?? null;
      if (learnerId !== null) {
        await query(
          client,
          `update linked_identities
           set last_authenticated_at = $3::timestamptz
           where provider = $1 and provider_subject = $2`,
          [provider, providerSubject, now],
        );
        const credentials = newCredentials();
        const sessionId = await this.insertSession(client, learnerId, now, credentials);
        return resultFor(learnerId, sessionId, credentials, 'linked');
      }

      return this.createLinkedLearner(client, provider, providerSubject, now);
    });
  }

  /** Revoke one session so a sign-out cannot be replayed with the old cookie. */
  async revoke(sessionToken: string): Promise<void> {
    if (!isOpaqueToken(sessionToken)) return;
    const now = this.now();
    if (Number.isNaN(Date.parse(now))) return;
    const sessionHash = hashOpaqueToken(sessionToken);

    await this.transaction(async (client) => {
      await this.lockSessionHash(client, sessionHash);
      await query(
        client,
        `update guest_sessions
         set revoked_at = $2::timestamptz
         where session_hash = $1 and revoked_at is null`,
        [sessionHash, now],
      );
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
    await this.lockKey(client, sessionHash);
  }

  private async lockKey(client: PoolClient, key: string): Promise<void> {
    await query(client, 'select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [key]);
  }

  private async findByHashForUpdate(
    client: PoolClient,
    sessionHash: string,
  ): Promise<SessionRow | null> {
    const result = await query<SessionRow>(
      client,
      `select
         s.guest_session_id,
         s.learner_id,
         s.csrf_token_hash,
         s.expires_at,
         s.revoked_at,
         l.account_state
       from guest_sessions s
       join learners l on l.learner_id = s.learner_id
       where s.session_hash = $1
       for update of s`,
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
    return resultFor(
      existing.learner_id,
      sessionId,
      credentials,
      principalKindFor(existing.account_state),
    );
  }

  private async createFreshGuest(client: PoolClient, now: string): Promise<BootstrapGuestSession> {
    const learnerId = await this.insertLearner(client, 'guest', now);
    const credentials = newCredentials();
    const sessionId = await this.insertSession(client, learnerId, now, credentials);
    return resultFor(learnerId, sessionId, credentials, 'guest');
  }

  private async createLinkedLearner(
    client: PoolClient,
    provider: string,
    providerSubject: string,
    now: string,
  ): Promise<BootstrapGuestSession> {
    const learnerId = await this.insertLearner(client, 'linked', now);
    await query(
      client,
      `insert into linked_identities (
         linked_identity_id,
         learner_id,
         provider,
         provider_subject,
         linked_at,
         last_authenticated_at
       ) values ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz)`,
      [randomUUID(), learnerId, provider, providerSubject, now],
    );
    const credentials = newCredentials();
    const sessionId = await this.insertSession(client, learnerId, now, credentials);
    return resultFor(learnerId, sessionId, credentials, 'linked');
  }

  /** Create the learner row and its zero-sequence projection. Shared by both entry paths. */
  private async insertLearner(
    client: PoolClient,
    accountState: 'guest' | 'linked',
    now: string,
  ): Promise<string> {
    const learnerId = randomUUID();
    const projection = this.newGuestProjection(learnerId, now);
    if (projection.learnerId !== learnerId || projection.sequence !== 0) {
      throw new PersistenceError({
        code: 'invalid_input',
        message: 'The initial learner projection is invalid.',
      });
    }

    await query(
      client,
      `insert into learners (learner_id, account_state, created_at, updated_at)
       values ($1, $2, $3::timestamptz, $3::timestamptz)`,
      [learnerId, accountState, now],
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
    return learnerId;
  }
}
