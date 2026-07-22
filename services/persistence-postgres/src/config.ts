import { Pool, type PoolConfig } from 'pg';

import { PersistenceError } from './errors';

export type PostgresPool = Pool;

export interface PostgresPoolOptions {
  readonly connectionString: string;
  readonly tls?: false | { readonly ca?: string };
  readonly applicationName?: string;
  readonly maxConnections?: number;
  readonly connectionTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly statementTimeoutMs?: number;
  readonly lockTimeoutMs?: number;
  readonly idleInTransactionTimeoutMs?: number;
}

const CONFIGURE_SESSION_SQL = `select
  set_config('application_name', $1, false),
  set_config('statement_timeout', $2, false),
  set_config('lock_timeout', $3, false),
  set_config('idle_in_transaction_session_timeout', $4, false)`;

function positiveInteger(name: string, value: number, maximum: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new PersistenceError({
      code: 'invalid_input',
      message: `${name} must be a positive integer no greater than ${maximum}.`,
    });
  }
  return value;
}

/**
 * Creates a small reusable pool for Lambda-to-RDS-Proxy connections. Callers
 * create it outside the handler and reuse it across warm invocations.
 */
export function createPgPool(options: PostgresPoolOptions): PostgresPool {
  let parsed: URL;
  try {
    parsed = new URL(options.connectionString);
  } catch {
    throw new PersistenceError({
      code: 'invalid_input',
      message: 'The PostgreSQL connection string is invalid.',
    });
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new PersistenceError({
      code: 'invalid_input',
      message: 'The PostgreSQL connection string is invalid.',
    });
  }

  const max = positiveInteger('maxConnections', options.maxConnections ?? 2, 20);
  const connectionTimeoutMillis = positiveInteger(
    'connectionTimeoutMs',
    options.connectionTimeoutMs ?? 5_000,
    60_000,
  );
  const idleTimeoutMillis = positiveInteger(
    'idleTimeoutMs',
    options.idleTimeoutMs ?? 30_000,
    600_000,
  );
  const statementTimeout = positiveInteger(
    'statementTimeoutMs',
    options.statementTimeoutMs ?? 5_000,
    60_000,
  );
  const lockTimeout = positiveInteger('lockTimeoutMs', options.lockTimeoutMs ?? 1_000, 30_000);
  const idleInTransactionSessionTimeout = positiveInteger(
    'idleInTransactionTimeoutMs',
    options.idleInTransactionTimeoutMs ?? 10_000,
    60_000,
  );
  const ssl: PoolConfig['ssl'] =
    options.tls === false
      ? false
      : {
          rejectUnauthorized: true,
          ...(options.tls?.ca === undefined ? {} : { ca: options.tls.ca }),
        };

  return new Pool({
    connectionString: options.connectionString,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    onConnect: async (client) => {
      await client.query(CONFIGURE_SESSION_SQL, [
        options.applicationName ?? 'mcat-authority',
        String(statementTimeout),
        String(lockTimeout),
        String(idleInTransactionSessionTimeout),
      ]);
    },
    ssl,
    allowExitOnIdle: true,
  });
}
