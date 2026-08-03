import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

import {
  EXPECTED_REGION,
  createSeedHandler,
  type SeedLogger,
  type SeedPoolFactory,
} from './runtime';

const logger: SeedLogger = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

const poolFactory: SeedPoolFactory = (options) =>
  new Pool({
    connectionString: options.connectionString,
    ssl: options.ssl,
    max: options.maxConnections,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  });

let runtime: ReturnType<typeof createSeedHandler> | undefined;

export async function handler(event: unknown) {
  runtime ??= createSeedHandler({
    environment: process.env,
    secrets: new SecretsManagerClient({ region: EXPECTED_REGION }),
    poolFactory,
    logger,
  });
  return runtime(event);
}
