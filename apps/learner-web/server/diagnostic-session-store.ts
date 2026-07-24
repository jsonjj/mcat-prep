import { createHash, randomBytes } from 'node:crypto';
import type { DiagnosticResponse, DiagnosticResult } from '@mcat/policies';

/**
 * Server-side diagnostic session store with integrity hardening modeled on the
 * landing snapshot attempt store:
 *  - Sessions are addressed by an opaque token; only its SHA-256 hash is stored.
 *  - Each *served* item carries a one-use item token. An answer is accepted only
 *    with the matching outstanding token, so the endpoint cannot be replayed as
 *    a repeatable answer oracle for a single served item.
 *  - Session creation is rate-limited per client.
 *  - State is event-sourced (append-only `responses`) so the diagnostic is
 *    replayable/deterministic: the selection + result are pure functions of the
 *    responses, seed, and fixed bank.
 */

export interface ScoredResponse extends DiagnosticResponse {
  seq: number;
}

export interface SessionRecord {
  clientId: string;
  seed: string;
  createdAt: number;
  expiresAt: number;
  responses: ScoredResponse[];
  /** The currently served-but-unanswered item, if any. */
  pendingItemId: string | null;
  pendingItemTokenHash: string | null;
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
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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
    const window = current && now - current.startedAt < this.rateWindowMs ? current : { count: 0, startedAt: now };
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
      pendingItemId: null,
      pendingItemTokenHash: null,
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

  /** Issue a fresh one-use item token for a served question. */
  issueItemToken(record: SessionRecord, questionId: string): string {
    const token = this.randomToken();
    record.pendingItemId = questionId;
    record.pendingItemTokenHash = this.hash(token);
    return token;
  }

  /**
   * Validate that `itemToken` is the outstanding token for `questionId`, and
   * consume it (one-use). Throws on mismatch/reuse.
   */
  consumeItemToken(record: SessionRecord, questionId: string, itemToken: string): void {
    if (!itemToken || itemToken.length > 128) {
      throw new DiagnosticSessionError('This answer could not be verified.', 401);
    }
    if (
      record.pendingItemId !== questionId ||
      record.pendingItemTokenHash === null ||
      record.pendingItemTokenHash !== this.hash(itemToken)
    ) {
      throw new DiagnosticSessionError('This item was already answered or is out of sync.', 409);
    }
    record.pendingItemId = null;
    record.pendingItemTokenHash = null;
  }
}
