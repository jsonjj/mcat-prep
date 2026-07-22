import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

import {
  EXPECTED_REGION,
  createMigrationHandler,
  type MigrationLogger,
  type RuntimePoolFactory,
} from './runtime';

const logger: MigrationLogger = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

const poolFactory: RuntimePoolFactory = (options) =>
  new Pool({
    connectionString: options.connectionString,
    ssl: options.ssl,
    max: options.maxConnections,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });

let runtime: ReturnType<typeof createMigrationHandler> | undefined;

export async function handler(event: unknown) {
  runtime ??= createMigrationHandler({
    environment: process.env,
    secrets: new SecretsManagerClient({ region: EXPECTED_REGION }),
    poolFactory,
    logger,
  });
  return runtime(event);
}
