import { createHash, randomBytes } from 'node:crypto';
import type { DiagnosticResponse, DiagnosticResult } from '@mcat/policies';

/**
 * Diagnostic session state + the integrity primitives that guard it, shared by
 * every environment that serves the diagnostic:
 *  - Sessions are addressed by an opaque token; only its SHA-256 hash is stored.
 *  - Each *served* block carries a one-use block token. A commit is accepted only
 *    with the matching outstanding token, so a committed block cannot be replayed.
 *    The unit is the block rather than the item because multistage delivery lets
 *    the learner revise any answer until the whole block is committed.
 *  - State is event-sourced (append-only `responses`) so the diagnostic is
 *    replayable/deterministic: the selection + result are pure functions of the
 *    responses, seed, and fixed bank.
 *
 * The in-memory {@link DiagnosticSessionStore} backs the dev/preview server (it
 * also rate-limits session creation per client). The token/anti-replay helpers
 * ({@link issuePendingBlock}/{@link consumePendingBlock}) are extracted as pure
 * functions so the deployed, Postgres-backed store preserves EXACTLY the same
 * one-use-block-token semantics against a persisted `pendingBlock`.
 */

export interface ScoredResponse extends DiagnosticResponse {
  seq: number;
}

/** The stage currently served and awaiting commit. */
export interface PendingBlock {
  stageId: string;
  questionIds: readonly string[];
  tokenHash: string;
}

export interface SessionRecord {
  clientId: string;
  /**
   * The authenticated learner this session belongs to, when there is one. The
   * dev/preview server is unauthenticated (same-origin only) and leaves this
   * undefined; the deployed/authority path binds every session to its principal
   * so an opaque token stolen from one learner cannot be replayed as another.
   */
  learnerId?: string;
  seed: string;
  createdAt: number;
  expiresAt: number;
  responses: ScoredResponse[];
  pendingBlock: PendingBlock | null;
  completed: boolean;
  result: DiagnosticResult | null;
}

export class DiagnosticSessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** SHA-256 hex of an opaque token. The only representation of a token we retain. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A fresh opaque token (256 bits, url-safe). */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Issue a fresh one-use token for a served block, writing it onto `record`.
 *
 * Re-serving a stage (a refresh mid-block) mints a new token and retires the
 * previous one, so only the most recently served copy of the block can commit.
 * The stage itself is unchanged — `stageId` and the item list are derived from
 * the response log, not from the token. Pure: it only mutates `record`, so the
 * in-memory store and the Postgres store share identical token semantics.
 */
export function issuePendingBlock(
  record: SessionRecord,
  stageId: string,
  questionIds: readonly string[],
  mint: () => string = newOpaqueToken,
  hash: (token: string) => string = hashToken,
): string {
  const token = mint();
  record.pendingBlock = { stageId, questionIds: [...questionIds], tokenHash: hash(token) };
  return token;
}

/**
 * Validate that `blockToken` is the outstanding token for the open `stageId`,
 * and consume it (one-use). Returns the question ids the block was served with,
 * so scoring uses the server's copy of the block rather than the client's.
 * Throws on mismatch/reuse. Pure (mutates `record.pendingBlock` to null).
 */
export function consumePendingBlock(
  record: SessionRecord,
  stageId: string,
  blockToken: string,
  hash: (token: string) => string = hashToken,
): readonly string[] {
  if (!blockToken || blockToken.length > 128) {
    throw new DiagnosticSessionError('This submission could not be verified.', 401);
  }
  const pending = record.pendingBlock;
  if (pending === null || pending.stageId !== stageId || pending.tokenHash !== hash(blockToken)) {
    throw new DiagnosticSessionError('This block was already submitted or is out of sync.', 409);
  }
  record.pendingBlock = null;
  return pending.questionIds;
}

interface RateWindow {
  count: number;
  startedAt: number;
}

interface StoreOptions {
  ttlMs?: number;
  rateWindowMs?: number;
  maxSessionsPerWindow?: number;
  now?: () => number;
  randomToken?: () => string;
}

export class DiagnosticSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly windows = new Map<string, RateWindow>();
  private readonly ttlMs: number;
  private readonly rateWindowMs: number;
  private readonly maxSessionsPerWindow: number;
  private readonly now: () => number;
  private readonly randomToken: () => string;

  constructor(options: StoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 3 * 60 * 60 * 1000;
    this.rateWindowMs = options.rateWindowMs ?? 60 * 60 * 1000;
    this.maxSessionsPerWindow = options.maxSessionsPerWindow ?? 12;
    this.now = options.now ?? Date.now;
    this.randomToken = options.randomToken ?? newOpaqueToken;
  }

  private hash(token: string): string {
    return hashToken(token);
  }

  private sweep(now: number): void {
    for (const [hash, record] of this.sessions) {
      if (record.expiresAt <= now) this.sessions.delete(hash);
    }
    for (const [clientId, window] of this.windows) {
      if (now - window.startedAt >= this.rateWindowMs) this.windows.delete(clientId);
    }
  }

  /** Start a new session (rate-limited per client). Returns the opaque token. */
  create(clientId: string): { sessionToken: string; record: SessionRecord } {
    const now = this.now();
    this.sweep(now);

    const current = this.windows.get(clientId);
    const window =
      current && now - current.startedAt < this.rateWindowMs ? current : { count: 0, startedAt: now };
    if (window.count >= this.maxSessionsPerWindow) {
      const retryAfterMs = this.rateWindowMs - (now - window.startedAt);
      throw new DiagnosticSessionError(
        'Too many diagnostic sessions were started recently.',
        429,
        Math.max(1, Math.ceil(retryAfterMs / 1000)),
      );
    }
    window.count += 1;
    this.windows.set(clientId, window);

    const sessionToken = this.randomToken();
    const record: SessionRecord = {
      clientId,
      seed: this.randomToken(),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      responses: [],
      pendingBlock: null,
      completed: false,
      result: null,
    };
    this.sessions.set(this.hash(sessionToken), record);
    return { sessionToken, record };
  }

  /** Resolve a session token to its record, or throw if invalid/expired. */
  get(sessionToken: string): SessionRecord {
    if (!sessionToken || sessionToken.length > 128) {
      throw new DiagnosticSessionError('This diagnostic session is invalid.', 401);
    }
    const now = this.now();
    const record = this.sessions.get(this.hash(sessionToken));
    if (!record || record.expiresAt <= now) {
      this.sessions.delete(this.hash(sessionToken));
      throw new DiagnosticSessionError('This diagnostic session has expired.', 401);
    }
    return record;
  }

  /**
   * Issue a fresh one-use token for a served block. Delegates to the shared
   * {@link issuePendingBlock} so dev and prod mint/retire tokens identically,
   * while keeping this store's injectable token source (used by tests).
   */
  issueBlockToken(record: SessionRecord, stageId: string, questionIds: readonly string[]): string {
    return issuePendingBlock(record, stageId, questionIds, this.randomToken, (t) => this.hash(t));
  }

  /**
   * Validate + consume the outstanding block token for `stageId`. Delegates to
   * the shared {@link consumePendingBlock}, so a committed block cannot be
   * replayed here nor in the Postgres-backed store.
   */
  consumeBlockToken(
    record: SessionRecord,
    stageId: string,
    blockToken: string,
  ): readonly string[] {
    return consumePendingBlock(record, stageId, blockToken, (t) => this.hash(t));
  }
}
