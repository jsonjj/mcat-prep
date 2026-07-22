import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { BETA_UPDATE_SOURCES, type BetaUpdateSource } from '../src/beta-update-types';

export const BETA_UPDATE_CONSENT_VERSION = 'beta-updates-v1';

interface BetaLeadRecord {
  email: string;
  source: BetaUpdateSource;
  consentVersion: typeof BETA_UPDATE_CONSENT_VERSION;
  createdAt: string;
}

interface ClientWindow {
  count: number;
  startedAt: number;
}

interface BetaLeadStoreOptions {
  filePath?: string;
  now?: () => number;
  windowMs?: number;
  maxSubmissionsPerWindow?: number;
}

export class BetaLeadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BetaLeadError('Enter a valid email address.', 400);
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]{1,187}\.[^\s@]{2,}$/u.test(email)) {
    throw new BetaLeadError('Enter a valid email address.', 400);
  }
  return email;
}

function isSource(value: unknown): value is BetaUpdateSource {
  return typeof value === 'string' && BETA_UPDATE_SOURCES.includes(value as BetaUpdateSource);
}

export class BetaLeadStore {
  private readonly emails = new Set<string>();
  private readonly clientWindows = new Map<string, ClientWindow>();
  private readonly filePath: string;
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly maxSubmissionsPerWindow: number;
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: BetaLeadStoreOptions = {}) {
    this.filePath = resolve(
      options.filePath ??
        process.env.BETA_LEAD_STORE_PATH ??
        resolve(process.cwd(), '.data', 'beta-leads.jsonl'),
    );
    this.now = options.now ?? Date.now;
    this.windowMs = options.windowMs ?? 60 * 60 * 1000;
    this.maxSubmissionsPerWindow = options.maxSubmissionsPerWindow ?? 5;
  }

  async subscribe(
    input: { email: unknown; source: unknown; consent: unknown },
    clientId: string,
  ): Promise<{ status: 'subscribed' | 'already-subscribed' }> {
    if (input.consent !== true) {
      throw new BetaLeadError('Consent is required for beta-update emails.', 400);
    }
    if (!isSource(input.source)) {
      throw new BetaLeadError('This beta-update request is invalid.', 400);
    }
    const source = input.source;
    const email = normalizeEmail(input.email);
    this.checkRateLimit(clientId);
    await this.ensureLoaded();

    return (this.writeQueue = this.writeQueue.then(async () => {
      if (this.emails.has(email)) return { status: 'already-subscribed' as const };

      const record: BetaLeadRecord = {
        email,
        source,
        consentVersion: BETA_UPDATE_CONSENT_VERSION,
        createdAt: new Date(this.now()).toISOString(),
      };
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await appendFile(this.filePath, `${JSON.stringify(record)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      this.emails.add(email);
      return { status: 'subscribed' as const };
    })) as Promise<{ status: 'subscribed' | 'already-subscribed' }>;
  }

  private checkRateLimit(clientId: string) {
    const now = this.now();
    const existing = this.clientWindows.get(clientId);
    const window =
      existing && now - existing.startedAt < this.windowMs
        ? existing
        : { count: 0, startedAt: now };

    if (window.count >= this.maxSubmissionsPerWindow) {
      const retryAfterMs = this.windowMs - (now - window.startedAt);
      throw new BetaLeadError(
        'Too many beta-update requests. Try again later.',
        429,
        Math.max(1, Math.ceil(retryAfterMs / 1000)),
      );
    }
    window.count += 1;
    this.clientWindows.set(clientId, window);
  }

  private ensureLoaded(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = readFile(this.filePath, 'utf8')
      .then((contents) => {
        for (const line of contents.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as Partial<BetaLeadRecord>;
            if (typeof parsed.email === 'string') this.emails.add(parsed.email);
          } catch {
            throw new BetaLeadError('The beta-update store could not be read safely.', 500);
          }
        }
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          return;
        }
        throw error;
      });
    return this.loadPromise;
  }
}
