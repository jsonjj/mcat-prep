import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Authority } from '@mcat/authority-core';
import { toProjectionRecord } from '@mcat/authority-kernel';
import { fixedClock, systemClock, type LearnerId } from '@mcat/contracts';
import type { LearnerProjectionRecord } from '@mcat/database';
import {
  PostgresAuthorityRepository,
  PostgresFixedWindowRateLimiter,
  PostgresGuestSessionService,
  createPgPool,
} from '@mcat/persistence-postgres';

import { createRepositoryLearnerApi, type LearnerApi } from './handler';
import type { LambdaApiGatewayEvent, LambdaApiGatewayResult, SafeLogger } from './http';

interface DatabaseSecret {
  readonly username: string;
  readonly password: string;
}

export interface LearnerApiEnvironment {
  readonly region: 'us-east-1';
  readonly secretArn: string;
  readonly endpoint: string;
  readonly port: 5432;
  readonly database: string;
  readonly learnerWebOrigin: string;
}

export interface SecretCommandClient {
  send(command: GetSecretValueCommand): Promise<{ readonly SecretString?: string }>;
}

function parseDatabaseSecret(secretString: string): DatabaseSecret {
  let value: unknown;
  try {
    value = JSON.parse(secretString);
  } catch {
    throw new Error('Database secret has an invalid shape.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Database secret has an invalid shape.');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(',') !== 'password,username' ||
    typeof record.username !== 'string' ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(record.username) ||
    typeof record.password !== 'string' ||
    record.password.length < 16 ||
    record.password.length > 1024
  ) {
    throw new Error('Database secret has an invalid shape.');
  }
  return { username: record.username, password: record.password };
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

export function parseLearnerApiEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): LearnerApiEnvironment {
  const region = environment.AWS_REGION;
  const secretArn = environment.DB_SECRET_ARN;
  const endpoint = environment.DB_PROXY_ENDPOINT;
  const database = environment.DB_NAME;
  const learnerWebOrigin = environment.LEARNER_WEB_ORIGIN;
  let originIsValid = false;
  try {
    if (learnerWebOrigin !== undefined) {
      const parsed = new URL(learnerWebOrigin);
      originIsValid =
        parsed.origin === learnerWebOrigin &&
        parsed.protocol === 'https:' &&
        parsed.username === '' &&
        parsed.password === '';
    }
  } catch {
    originIsValid = false;
  }
  if (
    region !== 'us-east-1' ||
    secretArn === undefined ||
    !/^arn:aws:secretsmanager:us-east-1:056956104102:secret:\/mcat\/dev\/database\/admin-[A-Za-z0-9]+$/.test(
      secretArn,
    ) ||
    endpoint === undefined ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.rds\.amazonaws\.com$/i.test(endpoint) ||
    database === undefined ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(database) ||
    learnerWebOrigin === undefined ||
    !originIsValid
  ) {
    throw new Error('Learner API environment is invalid.');
  }
  return {
    region,
    secretArn,
    endpoint,
    port: 5432,
    database,
    learnerWebOrigin,
  };
}

function databaseUrl(environment: LearnerApiEnvironment, secret: DatabaseSecret): string {
  return `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${environment.endpoint}:${environment.port}/${environment.database}`;
}

export function createGuestProjection(learnerId: string, now: string): LearnerProjectionRecord {
  const authority = new Authority(undefined, fixedClock(now));
  const state = authority.createGuest();
  state.learnerId = learnerId as LearnerId;
  state.onboarding.diagnosticComplete = true;
  return toProjectionRecord(state, 0, now);
}

const logger: SafeLogger = {
  info: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
};

async function createRuntime(): Promise<LearnerApi> {
  const environment = parseLearnerApiEnvironment(process.env);
  const secret = await loadDatabaseSecret(
    new SecretsManagerClient({ region: environment.region }),
    environment.secretArn,
  );
  const pool = createPgPool({
    connectionString: databaseUrl(environment, secret),
    applicationName: 'mcat-learner-api',
    maxConnections: 2,
  });
  const authority = new Authority(undefined, systemClock);
  const repository = new PostgresAuthorityRepository(pool, {
    newGuestProjection: createGuestProjection,
  });
  return createRepositoryLearnerApi({
    repository,
    clock: systemClock,
    bank: authority.bank,
    sessions: new PostgresGuestSessionService(pool, createGuestProjection),
    rateLimiter: new PostgresFixedWindowRateLimiter(pool),
    allowedOrigins: [environment.learnerWebOrigin],
    logger,
  });
}

let runtimePromise: Promise<LearnerApi> | undefined;

async function runtime(): Promise<LearnerApi> {
  if (runtimePromise === undefined) {
    runtimePromise = createRuntime().catch((error: unknown) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

export async function handler(event: LambdaApiGatewayEvent): Promise<LambdaApiGatewayResult> {
  return (await runtime()).handler(event as never);
}
