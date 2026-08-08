import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Authority } from '@mcat/authority-core';
import { systemClock, type PassageOfTheDayEntry } from '@mcat/contracts';
import { PassageOfDayService } from '@mcat/passage-of-day';
import {
  PostgresAuthorityRepository,
  PostgresFixedWindowRateLimiter,
  PostgresGuestSessionService,
  countPassages,
  countQuestions,
  createPgPool,
  createPostgresPracticeBankPort,
  listPassages,
  type PostgresPool,
} from '@mcat/persistence-postgres';

import { aiConfigFromEnv, type AiProxyConfig } from '@mcat/ai-gateway/server';

import {
  SupabaseIdentityProvider,
  parseSupabaseConfig,
  type SupabaseConfig,
} from './auth/supabase';
import { createGuestProjection } from './guest-projection';
import { createPostgresDiagnosticPort } from './diagnostic-port';
import { createPostgresPracticeTestPort } from './practice-test-port';
import { createRepositoryLearnerApi, type LearnerApi, type PassagePort } from './handler';
import {
  createLessonRevisionProviderCompatibilityAdapter,
  lessonContentProvider,
  lessonRevisionProvider,
} from './lesson-content-provider';
import { loadLessonRevisionProvider } from './lesson-revision-provider';
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
  /**
   * Resolved by name rather than by ARN because the identity stack that owns this
   * secret depends on the API stack, so CDK cannot pass its ARN in without closing
   * a stack cycle. See `infra/cdk/lib/supabase-config.ts`.
   */
  readonly supabaseConfigSecretName: string;
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

export async function loadSupabaseConfig(
  client: SecretCommandClient,
  secretName: string,
): Promise<SupabaseConfig> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (response.SecretString === undefined) {
    throw new Error('Secrets Manager did not return a string Supabase configuration.');
  }
  return parseSupabaseConfig(response.SecretString);
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

/**
 * Load the OPTIONAL external AI provider configuration from Secrets Manager and
 * shape it exactly like the process environment `aiConfigFromEnv` reads, so the
 * two in-process AI routes can be fed from a secret in production while dev keeps
 * reading straight from the environment. The secret is a JSON object with any of
 * AI_API_KEY / AI_BASE_URL / AI_MODEL; empty strings are treated as unset. It
 * throws on a missing or malformed secret, and the sole caller (`resolveAiConfig`)
 * treats ANY failure as "AI not configured" — so this must never abort cold start.
 */
export async function loadAiProviderConfig(
  client: SecretCommandClient,
  secretArn: string,
): Promise<Record<string, string | undefined>> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (response.SecretString === undefined) {
    throw new Error('Secrets Manager did not return a string AI configuration.');
  }
  let value: unknown;
  try {
    value = JSON.parse(response.SecretString);
  } catch {
    throw new Error('AI configuration secret has an invalid shape.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI configuration secret has an invalid shape.');
  }
  const record = value as Record<string, unknown>;
  const readValue = (key: string): string | undefined => {
    const raw = record[key];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  };
  return {
    AI_API_KEY: readValue('AI_API_KEY'),
    AI_BASE_URL: readValue('AI_BASE_URL'),
    AI_MODEL: readValue('AI_MODEL'),
  };
}

export function parseLearnerApiEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): LearnerApiEnvironment {
  const region = environment.AWS_REGION;
  const secretArn = environment.DB_SECRET_ARN;
  const rateLimitPepperSecretArn = environment.RATE_LIMIT_PEPPER_SECRET_ARN;
  const originVerificationSecretArn = environment.ORIGIN_VERIFICATION_SECRET_ARN;
  const supabaseConfigSecretName = environment.SUPABASE_CONFIG_SECRET_NAME;
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
    supabaseConfigSecretName === undefined ||
    !/^\/mcat\/dev\/supabase\/learner-api$/.test(supabaseConfigSecretName) ||
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
    supabaseConfigSecretName,
    endpoint,
    port: 5432,
    database,
    learnerWebOrigin,
  };
}

function databaseUrl(environment: LearnerApiEnvironment, secret: DatabaseSecret): string {
  return `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${environment.endpoint}:${environment.port}/${environment.database}`;
}

const logger: SafeLogger = {
  info: (event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
};

/**
 * Resolve the OPTIONAL AI provider config for the two in-process AI routes.
 * Production sets AI_CONFIG_SECRET_ARN and the value is fetched from Secrets
 * Manager (the same runtime-fetch pattern as the DB secret); dev/local reads
 * straight from the environment. This is BEST-EFFORT: any failure — no ARN, an
 * unpopulated/placeholder secret, a malformed value — resolves to an empty config
 * so BOTH AI routes return 503 and degrade gracefully, EXACTLY as when no key is
 * set. It never throws, so a half-provisioned secret cannot break cold start for
 * the rest of the learner API.
 */
async function resolveAiConfig(client: SecretCommandClient): Promise<AiProxyConfig> {
  const aiSecretArn = process.env.AI_CONFIG_SECRET_ARN;
  if (aiSecretArn === undefined || aiSecretArn.length === 0) {
    return aiConfigFromEnv(process.env);
  }
  try {
    return aiConfigFromEnv(await loadAiProviderConfig(client, aiSecretArn));
  } catch (error) {
    // Best-effort structured warning (same direct-write pattern as the
    // content-health probe); never rethrow — an unreadable AI secret must not
    // break cold start, it just leaves the AI routes returning 503.
    process.stderr.write(
      `${JSON.stringify({
        event: 'ai.config.load_failed',
        level: 'warn',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    return aiConfigFromEnv(process.env);
  }
}

/**
 * The formative Passage-of-the-Day port, backed by the shared
 * `@mcat/passage-of-day` service over the `passages` table. Built once per warm
 * container and memoized.
 *
 * IMPORTANT: in production there is NO hardcoded/file fallback (unlike the dev
 * loader `apps/learner-web/server/passage-pool-source.ts`, which falls back to the
 * local store / hardcoded pool). An empty or unreadable `passages` table yields an
 * empty pool — "no passage today" — until the table is seeded (`pnpm content:seed`
 * / `pnpm passages:seed`). The cold-start content-health probe logs loudly when the
 * pool is empty so an unseeded deploy is obvious. Reads only — mints no mastery.
 */
function createPassagePort(pool: PostgresPool): PassagePort {
  let servicePromise: Promise<PassageOfDayService> | undefined;
  const service = (): Promise<PassageOfDayService> => {
    if (servicePromise === undefined) {
      servicePromise = (async () => {
        let entries: readonly PassageOfTheDayEntry[] = [];
        try {
          entries = await listPassages(pool);
        } catch {
          entries = [];
        }
        return new PassageOfDayService(entries);
      })().catch((error: unknown) => {
        servicePromise = undefined;
        throw error;
      });
    }
    return servicePromise;
  };
  return {
    today: async (tzMinutes) => (await service()).todayView(new Date(), tzMinutes),
    grade: async (questionId, choiceId) => (await service()).grade(questionId, choiceId),
  };
}

/**
 * Cold-start CONTENT-HEALTH probe. An unseeded production database is otherwise
 * SILENT: adaptive Practice quietly returns no items (Postgres bank, no fallback in
 * prod) and Passage of the Day returns "no passage today". This emits a loud,
 * structured `content.health.unseeded` line to stderr when the questions bank or the
 * passage pool is empty, so an unseeded deploy is obvious in CloudWatch instead of a
 * mysteriously-empty API. Best-effort: it never throws (a probe must not break cold
 * start) and it does not gate the API — seeding is an operational step
 * (`pnpm content:seed`), not a deploy blocker.
 */
async function logContentHealth(pool: PostgresPool): Promise<void> {
  try {
    const [questions, passages] = await Promise.all([countQuestions(pool), countPassages(pool)]);
    const unseeded = questions === 0 || passages === 0;
    const line = JSON.stringify({
      event: unseeded ? 'content.health.unseeded' : 'content.health.ok',
      level: unseeded ? 'error' : 'info',
      questions,
      passages,
      ...(unseeded
        ? {
            message:
              'Question bank and/or passage pool is EMPTY in production. Run the ' +
              'post-migrate content seed (pnpm content:seed). Practice/Passage will serve ' +
              'empty until seeded.',
          }
        : {}),
    });
    (unseeded ? process.stderr : process.stdout).write(`${line}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        event: 'content.health.error',
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
}

async function createRuntime(): Promise<LearnerApi> {
  const environment = parseLearnerApiEnvironment(process.env);
  const secrets = new SecretsManagerClient({ region: environment.region });
  const [secret, rateLimitPepper, originVerificationSecret, supabaseConfig, aiConfig] =
    await Promise.all([
      loadDatabaseSecret(secrets, environment.secretArn),
      loadRateLimitPepper(secrets, environment.rateLimitPepperSecretArn),
      loadOriginVerificationSecret(secrets, environment.originVerificationSecretArn),
      loadSupabaseConfig(secrets, environment.supabaseConfigSecretName),
      resolveAiConfig(secrets),
    ]);
  const pool = createPgPool({
    connectionString: databaseUrl(environment, secret),
    applicationName: 'mcat-learner-api',
    maxConnections: 2,
  });
  // Loudly flag an unseeded database at cold start (best-effort; never blocks boot).
  await logContentHealth(pool);
  // Attach the DB-backed lesson catalog for the ACTIVE content release (this IS the
  // release gate): before activation it resolves nothing and only the file-based
  // pilots serve; once a release is activated the imported lessons resolve from
  // Aurora. Best-effort — a failure here must never take down the API.
  try {
    const dbLessons = await loadLessonRevisionProvider({ db: pool, environment: 'dev' });
    lessonContentProvider.attach(dbLessons);
    lessonRevisionProvider.attach(createLessonRevisionProviderCompatibilityAdapter(dbLessons));
  } catch {
    // Best-effort: a failure to attach the DB catalog must never take down the API.
    // The file-based pilots still serve, and an unattached release simply surfaces as
    // the imported lessons not resolving (diagnosable from content_releases lifecycle).
  }
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
    // Supabase holds credentials only; it never sees learner data. Its access
    // token is verified here and then discarded, so what the browser keeps is the
    // same opaque session cookie every other route already understands.
    identity: new SupabaseIdentityProvider(supabaseConfig),
    rateLimiter: new PostgresFixedWindowRateLimiter(pool),
    rateLimitPepper,
    originVerificationSecret,
    allowedOrigins: [environment.learnerWebOrigin],
    logger,
    // Shared AI provider config for BOTH in-process AI routes, each behind the
    // same auth as every other /v1 route: grounded rewrite (`POST /v1/ai/rewrite`,
    // WS4 "Explain it another way") and the CARS Duel opponent (`POST
    // /v1/ai/chat`). One config, resolved once at cold start — from Secrets Manager
    // in production (AI_CONFIG_SECRET_ARN) or straight from the environment in
    // dev/local — and reused by the same `@mcat/ai-gateway/server` core rather than
    // forking it. Optional by design: with no key resolved BOTH routes return 503,
    // and each client degrades gracefully (rewrite falls back deterministically;
    // CARS Duel shows the opponent as offline). In production the deployed Lambda
    // runs in the PRIVATE_WITH_EGRESS subnet tier so it can reach the external
    // provider over HTTPS through the NAT gateway.
    aiConfig,
    // Formative Passage of the Day, served through the same session/origin-verify
    // pipeline as every other /v1 route. Reads the passages table ONLY — there is NO
    // hardcoded/file fallback in prod: an empty/unreadable table yields "no passage
    // today" until seeded (pnpm content:seed / passages:seed). Writes no mastery.
    passage: createPassagePort(pool),
    // Placement DIAGNOSTIC (block/multistage), served through the same
    // session/origin-verify pipeline as every other /v1 route. The bank is built
    // once per warm container from the question bank (production_candidate /
    // published) via the SAME mapping the local pull uses; sessions persist in the
    // `diagnostic_sessions` table (migration 0021). Writes no mastery — the
    // diagnostic seeds mastery only through the separate mastery-seed hook. Falls
    // back to the synthetic fixture if the bank is unseeded so onboarding never
    // dead-ends (the cold-start content-health probe already flags an unseeded DB).
    diagnostic: createPostgresDiagnosticPort(pool),
    // Periodic scored practice TEST RUNNER, served through the same
    // session/origin-verify pipeline as every other /v1 route. The bank is built
    // once per warm container from the question bank (production_candidate /
    // published, CARS included) via the SAME mapping the local pull uses; the
    // in-flight sitting persists in `practice_test_sessions` (migration 0022), and
    // the SCORED result is persisted to the projection through the kernel's
    // idempotent result write. No synthetic fixture: an unseeded bank 503s.
    practiceTest: createPostgresPracticeTestPort(pool),
    // Whether the planner may reserve a `practice_test` slot into Today's Path.
    // Now that the runner is wired end-to-end, opt in with PRACTICE_TEST_ENABLED=true
    // on the Lambda (default false keeps a slot from being reserved where the flag
    // is unset). See docs/practice-test-prod.md.
    practiceTestEnabled: process.env.PRACTICE_TEST_ENABLED === 'true',
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
