import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { createPgPool } from '@mcat/persistence-postgres';

import { createOutboxHandler, createProjectionRuntimeHandler, type WorkerLogger } from './handlers';
import { PostgresOutboxStore, PostgresProjectionConsumerStore } from './postgres-store';
import type { ProjectionQueueEvent } from './projection-handler';
import {
  AwsSqsFifoPublisher,
  buildDatabaseUrl,
  parseDatabaseSecret,
  parseWorkerEnvironment,
  type DatabaseSecret,
} from './runtime';

export interface SecretCommandClient {
  send(command: GetSecretValueCommand): Promise<{ readonly SecretString?: string }>;
}

export async function loadDatabaseSecret(
  client: SecretCommandClient,
  secretArn: string,
): Promise<DatabaseSecret> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (response.SecretString === undefined) {
    throw new Error('Secrets Manager did not return a string database secret.');
  }
  return parseDatabaseSecret(response.SecretString);
}

interface WorkerRuntime {
  readonly outbox: () => Promise<unknown>;
  readonly projection: (event: ProjectionQueueEvent) => Promise<unknown>;
}

const structuredLogger: WorkerLogger = (event) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

async function createRuntime(): Promise<WorkerRuntime> {
  const environment = parseWorkerEnvironment(process.env);
  const secretClient = new SecretsManagerClient({ region: environment.region });
  const secret = await loadDatabaseSecret(secretClient, environment.secretArn);
  const pool = createPgPool({
    connectionString: buildDatabaseUrl({
      endpoint: environment.endpoint,
      port: environment.port,
      database: environment.database,
      secret,
    }),
    applicationName: 'mcat-worker',
    maxConnections: 2,
  });
  const sqsClient = new SQSClient({ region: environment.region });
  const outbox = createOutboxHandler({
    storeFactory: () => new PostgresOutboxStore(pool),
    publisher: new AwsSqsFifoPublisher(environment.projectionQueueUrl, sqsClient),
    now: () => new Date().toISOString(),
    logger: structuredLogger,
  });
  const projection = createProjectionRuntimeHandler({
    consumerName: 'authoritative-projections-v1',
    store: new PostgresProjectionConsumerStore(pool),
    apply: async () => {
      // The synchronous command transaction owns the current synthetic projection.
      // This duplicate-safe consumer is the extension point for independently
      // versioned mastery/planner projections in later phases.
    },
    logger: structuredLogger,
  });
  return { outbox, projection };
}

let runtimePromise: Promise<WorkerRuntime> | undefined;

async function runtime(): Promise<WorkerRuntime> {
  if (runtimePromise === undefined) {
    runtimePromise = createRuntime().catch((error: unknown) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

export async function outboxHandler(): Promise<unknown> {
  return (await runtime()).outbox();
}

export async function projectionHandler(event: ProjectionQueueEvent): Promise<unknown> {
  return (await runtime()).projection(event);
}
