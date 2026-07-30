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
  createPostgresPracticeBankPort,
} from '@mcat/persistence-postgres';

import { aiConfigFromEnv } from '@mcat/ai-gateway/server';

import { createRepositoryLearnerApi, type LearnerApi } from './handler';
import type { LambdaApiGatewayEvent, LambdaApiGatewayResult, SafeLogger } from './http';

interface DatabaseSecret {
  readonly username: string;
  readonly password: string;
}

export interface LearnerApiEnvironment {
  readonly region: 'us-east-1';
  readonly secretArn: string;
  readonly rateLimitPepperSecretArn: string;
  readonly originVerificationSecretArn: string;
  readonly endpoint: string;
  readonly port: 5432;
  readonly database: string;
  readonly learnerWebOrigin: string;
}

export interface SecretCommandClient {
  send(command: GetSecretValueCommand): Promise<{ readonly SecretString?: string }>;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
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
    record.username !== 'mcat_learner_api' ||
    typeof record.password !== 'string' ||
    record.password.length < 16 ||
    record.password.length > 1024
  ) {
    throw new Error('Database secret has an invalid shape.');
  }
  return { username: 'mcat_learner_api', password: record.password };
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

export async function loadRateLimitPepper(
  client: SecretCommandClient,
  secretArn: string,
): Promise<string> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const pepper = response.SecretString;
  if (
    pepper === undefined ||
    pepper.length < 32 ||
    pepper.length > 128 ||
    containsControlCharacter(pepper)
  ) {
    throw new Error('Rate-limit pepper secret is invalid.');
  }
  return pepper;
}

export async function loadOriginVerificationSecret(
  client: SecretCommandClient,
  secretArn: string,
): Promise<string> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = response.SecretString;
  if (secret === undefined || !/^[A-Za-z0-9_-]{64}$/.test(secret)) {
    throw new Error('Origin-verification secret is invalid.');
  }
  return secret;
}

export function parseLearnerApiEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): LearnerApiEnvironment {
  const region = environment.AWS_REGION;
  const secretArn = environment.DB_SECRET_ARN;
  const rateLimitPepperSecretArn = environment.RATE_LIMIT_PEPPER_SECRET_ARN;
  const originVerificationSecretArn = environment.ORIGIN_VERIFICATION_SECRET_ARN;
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
    !/^arn:aws:secretsmanager:us-east-1:056956104102:secret:\/mcat\/dev\/database\/learner-api-[A-Za-z0-9]+$/.test(
      secretArn,
    ) ||
    rateLimitPepperSecretArn === undefined ||
    !/^arn:aws:secretsmanager:us-east-1:056956104102:secret:\/mcat\/dev\/rate-limit\/pepper-[A-Za-z0-9]+$/.test(
      rateLimitPepperSecretArn,
    ) ||
    originVerificationSecretArn === undefined ||
    !/^arn:aws:secretsmanager:us-east-1:056956104102:secret:\/mcat\/dev\/origin\/verification-[A-Za-z0-9]+$/.test(
      originVerificationSecretArn,
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
    rateLimitPepperSecretArn,
    originVerificationSecretArn,
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
  return toProjectionRecord(state, 0, now);
}

const logger: SafeLogger = {
  info: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
};

async function createRuntime(): Promise<LearnerApi> {
  const environment = parseLearnerApiEnvironment(process.env);
  const secrets = new SecretsManagerClient({ region: environment.region });
  const [secret, rateLimitPepper, originVerificationSecret] = await Promise.all([
    loadDatabaseSecret(secrets, environment.secretArn),
    loadRateLimitPepper(secrets, environment.rateLimitPepperSecretArn),
    loadOriginVerificationSecret(secrets, environment.originVerificationSecretArn),
  ]);
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
    // Adaptive Practice draws fresh items from the real v7 corpus in Postgres and
    // writes exposure/repair there; mastery persists via the projection.
    practiceBank: createPostgresPracticeBankPort(pool),
    sessions: new PostgresGuestSessionService(pool, createGuestProjection),
    rateLimiter: new PostgresFixedWindowRateLimiter(pool),
    rateLimitPepper,
    originVerificationSecret,
    allowedOrigins: [environment.learnerWebOrigin],
    logger,
    // WS4 "Explain it another way": grounded rewrite runs in-process behind the
    // same auth as every other /v1 route. Optional by design — with no
    // AI_API_KEY set the route returns 503 and the client falls back
    // deterministically. NOTE: reaching an external provider also requires the
    // Lambda to have public egress; provisioning the key + egress is an infra
    // step outside this change.
    aiConfig: aiConfigFromEnv(process.env),
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
