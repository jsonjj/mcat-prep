import type { PostgresPool } from './config';

export interface RateLimitInput {
  readonly key: string;
  readonly route: string;
  readonly method: string;
}

export interface PostgresFixedWindowRateLimiterOptions {
  readonly now?: () => number;
  readonly routeLimits?: Readonly<Record<string, number>>;
}

const DEFAULT_BOOTSTRAP_LIMIT = 10;
const DEFAULT_READ_LIMIT = 120;
const DEFAULT_WRITE_LIMIT = 60;
const WINDOW_MS = 60_000;
const VALID_KEY = /^[0-9a-f]{24,64}$/;
const VALID_ROUTE = /^\/[A-Za-z0-9/_.{}-]{1,127}$/;
const VALID_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function isValidInput(input: RateLimitInput): boolean {
  return (
    VALID_KEY.test(input.key) && VALID_ROUTE.test(input.route) && VALID_METHODS.has(input.method)
  );
}

function validateRouteLimits(limits: Readonly<Record<string, number>>): void {
  for (const [routeKey, limit] of Object.entries(limits)) {
    const separator = routeKey.indexOf(' ');
    const method = separator < 0 ? '' : routeKey.slice(0, separator);
    const route = separator < 0 ? '' : routeKey.slice(separator + 1);
    if (
      !VALID_METHODS.has(method) ||
      !VALID_ROUTE.test(route) ||
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      limit > 10_000
    ) {
      throw new Error('Invalid PostgreSQL rate-limit configuration.');
    }
  }
}

export class PostgresFixedWindowRateLimiter {
  private readonly now: () => number;
  private readonly routeLimits: Readonly<Record<string, number>>;

  constructor(
    private readonly pool: PostgresPool,
    options: PostgresFixedWindowRateLimiterOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.routeLimits = options.routeLimits ?? {};
    validateRouteLimits(this.routeLimits);
  }

  async allow(input: RateLimitInput): Promise<boolean> {
    if (!isValidInput(input)) return false;
    const nowMs = this.now();
    if (!Number.isFinite(nowMs) || nowMs < 0) return false;
    const windowStartedAt = new Date(Math.floor(nowMs / WINDOW_MS) * WINDOW_MS).toISOString();
    const updatedAt = new Date(nowMs).toISOString();
    const limit = this.limitFor(input);

    try {
      const result = await this.pool.query<{ request_count: number }>(
        `insert into api_rate_limits (
           rate_key,
           route,
           method,
           window_started_at,
           request_count,
           updated_at
         ) values ($1, $2, $3, $4::timestamptz, 1, $5::timestamptz)
         on conflict (rate_key, route, method, window_started_at)
         do update set
           request_count = api_rate_limits.request_count + 1,
           updated_at = excluded.updated_at
         returning request_count`,
        [input.key, input.route, input.method, windowStartedAt, updatedAt],
      );
      const count = result.rows[0]?.request_count;
      return typeof count === 'number' && count <= limit;
    } catch {
      return false;
    }
  }

  private limitFor(input: RateLimitInput): number {
    const configured = this.routeLimits[`${input.method} ${input.route}`];
    if (configured !== undefined) return configured;
    if (input.route === '/v1/bootstrap') return DEFAULT_BOOTSTRAP_LIMIT;
    if (input.method === 'GET' || input.method === 'HEAD' || input.method === 'OPTIONS') {
      return DEFAULT_READ_LIMIT;
    }
    return DEFAULT_WRITE_LIMIT;
  }
}
