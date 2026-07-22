import { createHash, randomBytes } from 'node:crypto';

interface AttemptRecord {
  clientId: string;
  expiresAt: number;
  result?: unknown;
  submissionHash?: string;
  used: boolean;
}

interface AttemptWindow {
  count: number;
  startedAt: number;
}

interface SnapshotAttemptStoreOptions {
  ttlMs?: number;
  attemptWindowMs?: number;
  maxScoredAttemptsPerWindow?: number;
  now?: () => number;
}

export class SnapshotAttemptError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export class SnapshotAttemptStore {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly activeAttempts = new Map<string, { token: string; tokenHash: string }>();
  private readonly attemptWindows = new Map<string, AttemptWindow>();
  private readonly ttlMs: number;
  private readonly attemptWindowMs: number;
  private readonly maxScoredAttemptsPerWindow: number;
  private readonly now: () => number;

  constructor(options: SnapshotAttemptStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 2 * 60 * 60 * 1000;
    this.attemptWindowMs = options.attemptWindowMs ?? 24 * 60 * 60 * 1000;
    this.maxScoredAttemptsPerWindow = options.maxScoredAttemptsPerWindow ?? 1;
    this.now = options.now ?? Date.now;
  }

  issue(clientId: string): { attemptToken: string; expiresInSeconds: number } {
    const now = this.now();
    this.removeExpiredAttempts(now);

    const currentAttempt = this.activeAttempts.get(clientId);
    if (currentAttempt) {
      const record = this.attempts.get(currentAttempt.tokenHash);
      if (record && !record.used && record.expiresAt > now) {
        return {
          attemptToken: currentAttempt.token,
          expiresInSeconds: Math.max(1, Math.floor((record.expiresAt - now) / 1000)),
        };
      }
      this.activeAttempts.delete(clientId);
    }

    const currentWindow = this.attemptWindows.get(clientId);
    const activeWindow =
      currentWindow && now - currentWindow.startedAt < this.attemptWindowMs
        ? currentWindow
        : { count: 0, startedAt: now };

    if (activeWindow.count >= this.maxScoredAttemptsPerWindow) {
      const retryAfterMs = this.attemptWindowMs - (now - activeWindow.startedAt);
      throw new SnapshotAttemptError(
        'A snapshot report was already generated for this attempt window.',
        429,
        Math.max(1, Math.ceil(retryAfterMs / 1000)),
      );
    }
    this.attemptWindows.set(clientId, activeWindow);

    const attemptToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(attemptToken);
    this.attempts.set(tokenHash, {
      clientId,
      expiresAt: now + this.ttlMs,
      used: false,
    });
    this.activeAttempts.set(clientId, { token: attemptToken, tokenHash });

    return {
      attemptToken,
      expiresInSeconds: Math.floor(this.ttlMs / 1000),
    };
  }

  complete<T>(attemptToken: string, submissionHash: string, result: T): T {
    if (!attemptToken || attemptToken.length > 128) {
      throw new SnapshotAttemptError('This snapshot attempt is invalid.', 401);
    }

    const now = this.now();
    const tokenHash = this.hash(attemptToken);
    const attempt = this.attempts.get(tokenHash);
    if (!attempt || attempt.expiresAt <= now) {
      this.attempts.delete(tokenHash);
      throw new SnapshotAttemptError('This snapshot attempt has expired.', 401);
    }
    if (attempt.used) {
      if (
        attempt.submissionHash === submissionHash &&
        Object.prototype.hasOwnProperty.call(attempt, 'result')
      ) {
        return attempt.result as T;
      }
      throw new SnapshotAttemptError('This snapshot attempt was already scored.', 409);
    }

    const currentWindow = this.attemptWindows.get(attempt.clientId);
    const activeWindow =
      currentWindow && now - currentWindow.startedAt < this.attemptWindowMs
        ? currentWindow
        : { count: 0, startedAt: now };
    if (activeWindow.count >= this.maxScoredAttemptsPerWindow) {
      throw new SnapshotAttemptError('A snapshot report was already generated recently.', 429);
    }
    activeWindow.count += 1;
    this.attemptWindows.set(attempt.clientId, activeWindow);

    attempt.used = true;
    attempt.submissionHash = submissionHash;
    attempt.result = result;
    const activeAttempt = this.activeAttempts.get(attempt.clientId);
    if (activeAttempt?.tokenHash === tokenHash) {
      this.activeAttempts.delete(attempt.clientId);
    }
    return result;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private removeExpiredAttempts(now: number): void {
    for (const [tokenHash, attempt] of this.attempts) {
      if (attempt.expiresAt <= now) {
        this.attempts.delete(tokenHash);
        const activeAttempt = this.activeAttempts.get(attempt.clientId);
        if (activeAttempt?.tokenHash === tokenHash) {
          this.activeAttempts.delete(attempt.clientId);
        }
      }
    }
    for (const [clientId, window] of this.attemptWindows) {
      if (now - window.startedAt >= this.attemptWindowMs) {
        this.attemptWindows.delete(clientId);
      }
    }
  }
}
