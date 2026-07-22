import { describe, expect, it, vi } from 'vitest';

import { createPgPool } from './config';

describe('RDS Proxy PostgreSQL pool configuration', () => {
  it('applies session settings after connection instead of unsupported startup parameters', async () => {
    const pool = createPgPool({
      connectionString: 'postgresql://mcat:test-password@example.invalid:5432/mcat',
      applicationName: 'mcat-test',
      statementTimeoutMs: 5_000,
      lockTimeoutMs: 1_000,
      idleInTransactionTimeoutMs: 10_000,
    });
    const options = (
      pool as unknown as {
        readonly options: Readonly<Record<string, unknown>>;
      }
    ).options;

    expect(options).not.toHaveProperty('application_name');
    expect(options).not.toHaveProperty('statement_timeout');
    expect(options).not.toHaveProperty('lock_timeout');
    expect(options).not.toHaveProperty('idle_in_transaction_session_timeout');
    expect(options.onConnect).toBeTypeOf('function');

    const query = vi.fn().mockResolvedValue({ rows: [] });
    await (options.onConnect as (client: { query: typeof query }) => Promise<void>)({ query });

    expect(query).toHaveBeenCalledWith(
      `select
  set_config('application_name', $1, false),
  set_config('statement_timeout', $2, false),
  set_config('lock_timeout', $3, false),
  set_config('idle_in_transaction_session_timeout', $4, false)`,
      ['mcat-test', '5000', '1000', '10000'],
    );
    await pool.end();
  });
});
