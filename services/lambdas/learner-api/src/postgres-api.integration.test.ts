import { Authority } from '@mcat/authority-core';
import { fixedClock } from '@mcat/contracts';
import {
  PostgresAuthorityRepository,
  PostgresFixedWindowRateLimiter,
  PostgresGuestSessionService,
  createPgPool,
  type PostgresPool,
} from '@mcat/persistence-postgres';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { IdentityProvider } from './auth/identity-provider';
import { createGuestProjection } from './guest-projection';
import { createRepositoryLearnerApi, type LearnerApi } from './handler';
import type { ApiGatewayV2Event, ApiGatewayV2Result } from './http';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;
const ORIGIN = 'https://learner.example.test';
const ORIGIN_VERIFICATION_SECRET = 'o'.repeat(64);
const NOW = '2026-07-21T12:00:00.000Z';

/**
 * Learner routes are linked-only, so the vertical starts where a real visitor
 * does: an anonymous bootstrap for a CSRF token, then a session exchange. The
 * token's signature is Supabase's business and is stubbed here; what this suite
 * is for is the Postgres side of the same walk — the learner row the exchange
 * creates, and every stream write that follows it.
 */
const ACCESS_TOKEN = 'stub-header.stub-payload.stub-signature';
const IDENTITY_SUBJECT = 'supabase-subject-integration';
const identity: IdentityProvider = {
  verify: async (accessToken) =>
    accessToken === ACCESS_TOKEN
      ? { status: 'verified', identity: { subject: IDENTITY_SUBJECT } }
      : { status: 'invalid' },
};

function event(
  method: string,
  path: string,
  options: {
    readonly body?: unknown;
    readonly cookies?: readonly string[];
    readonly csrf?: string;
  } = {},
): ApiGatewayV2Event {
  return {
    version: '2.0',
    rawPath: path,
    headers: {
      origin: ORIGIN,
      'x-mcat-origin-verify': ORIGIN_VERIFICATION_SECRET,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(options.csrf === undefined ? {} : { 'x-csrf-token': options.csrf }),
    },
    cookies: options.cookies ?? [],
    requestContext: {
      requestId: crypto.randomUUID(),
      http: { method, path, sourceIp: '203.0.113.10' },
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };
}

const body = <T>(response: { readonly body?: string }): T =>
  JSON.parse(response.body ?? 'null') as T;

/** The `name=value` pairs a response's `Set-Cookie` list would leave in a browser. */
const cookiesOf = (response: ApiGatewayV2Result): readonly string[] =>
  (response.cookies ?? []).map((cookie) => cookie.split(';', 1)[0]!);

interface SignedInSession {
  readonly cookies: readonly string[];
  readonly csrfToken: string;
  readonly learnerId: string;
  readonly contentRelease: string;
  readonly streamVersion: number;
}

/**
 * Anonymous bootstrap → session exchange → authenticated bootstrap. The last step
 * is not ceremony: `bootstrap` rotates the session token, so its cookies are the
 * ones every later request has to carry.
 */
async function signIn(api: LearnerApi): Promise<SignedInSession> {
  const anonymous = await api.handle(event('POST', '/v1/bootstrap'));
  expect(body<{ authenticated: boolean }>(anonymous).authenticated).toBe(false);

  const exchange = await api.handle(
    event('POST', '/v1/auth/session', {
      body: { accessToken: ACCESS_TOKEN },
      cookies: cookiesOf(anonymous),
      csrf: body<{ csrfToken: string }>(anonymous).csrfToken,
    }),
  );
  expect(exchange.statusCode).toBe(200);

  const bootstrap = await api.handle(
    event('POST', '/v1/bootstrap', { cookies: cookiesOf(exchange) }),
  );
  const bootstrapBody = body<{
    authenticated: true;
    learnerId: string;
    csrfToken: string;
    contentRelease: string;
    streamVersion: number;
  }>(bootstrap);
  expect(bootstrap.statusCode).toBe(200);
  expect(bootstrapBody.authenticated).toBe(true);
  expect(bootstrap.headers?.['cache-control']).toBe('no-store');

  return {
    cookies: cookiesOf(bootstrap),
    csrfToken: bootstrapBody.csrfToken,
    learnerId: bootstrapBody.learnerId,
    contentRelease: bootstrapBody.contentRelease,
    streamVersion: bootstrapBody.streamVersion,
  };
}

describeWithPostgres('PostgreSQL-backed learner API vertical', () => {
  let pool: PostgresPool;
  let suiteLock: PoolClient;

  beforeAll(async () => {
    pool = createPgPool({
      connectionString: DATABASE_URL!,
      tls: false,
      applicationName: 'mcat-learner-api-integration-test',
      maxConnections: 6,
    });
    suiteLock = await pool.connect();
    await suiteLock.query('set lock_timeout = 0');
    await suiteLock.query('select pg_advisory_lock(72004002)');
  });

  afterAll(async () => {
    await suiteLock.query('select pg_advisory_unlock(72004002)');
    suiteLock.release();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('truncate table learners cascade');
    await pool.query('truncate table api_rate_limits');
  });

  it('persists sign-in, diagnostic, goal, attempt, reload, and duplicate delivery', async () => {
    const clock = fixedClock(NOW);
    const authority = new Authority(undefined, clock);
    const repository = new PostgresAuthorityRepository(pool, {
      newGuestProjection: createGuestProjection,
    });
    const dependencies = {
      repository,
      clock,
      bank: authority.bank,
      sessions: new PostgresGuestSessionService(pool, createGuestProjection, {
        now: () => NOW,
      }),
      identity,
      rateLimiter: new PostgresFixedWindowRateLimiter(pool, {
        now: () => Date.parse(NOW),
      }),
      rateLimitPepper: 'p'.repeat(32),
      originVerificationSecret: ORIGIN_VERIFICATION_SECRET,
      allowedOrigins: [ORIGIN],
      logger: { info: () => undefined },
      nowMs: () => Date.parse(NOW),
    } as const;
    const api = createRepositoryLearnerApi(dependencies);

    const bootstrapBody = await signIn(api);
    const { cookies } = bootstrapBody;

    const diagnostic = await api.handle(event('GET', '/v1/diagnostic/next', { cookies }));
    const diagnosticBody = body<{
      done: false;
      question: { id: string; choices: readonly { id: string }[] };
    }>(diagnostic);
    expect(diagnostic.statusCode).toBe(200);
    const diagnosticCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: bootstrapBody.streamVersion,
        contentRelease: bootstrapBody.contentRelease,
        taskInstanceId: crypto.randomUUID(),
      },
      questionId: diagnosticBody.question.id,
      choiceId: diagnosticBody.question.choices[0]!.id,
      elapsedMs: 12_000,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      answerChanges: 0,
      isDiagnosticRetry: false,
    };
    const diagnosticAnswer = await api.handle(
      event('POST', '/v1/attempts', {
        body: diagnosticCommand,
        cookies,
        csrf: bootstrapBody.csrfToken,
      }),
    );
    expect(diagnosticAnswer.statusCode).toBe(200);
    expect(body<{ streamVersion: number }>(diagnosticAnswer).streamVersion).toBe(1);

    const goalCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: 1,
        contentRelease: bootstrapBody.contentRelease,
        taskInstanceId: crypto.randomUUID(),
      },
      goal: { testDate: null, targetScore: 515, minutesPerWeek: 420 },
    };
    const goal = await api.handle(
      event('PUT', '/v1/profile/goal', {
        body: goalCommand,
        cookies,
        csrf: bootstrapBody.csrfToken,
      }),
    );
    expect(goal.statusCode).toBe(200);
    expect(body<{ streamVersion: number }>(goal).streamVersion).toBe(2);

    const session = await api.handle(event('GET', '/v1/learning/session', { cookies }));
    const sessionBody = body<{
      kind: string;
      question: { id: string; choices: readonly { id: string }[] };
    }>(session);
    expect(sessionBody.kind).toBe('question');
    const attemptCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: 2,
        contentRelease: bootstrapBody.contentRelease,
        taskInstanceId: crypto.randomUUID(),
      },
      questionId: sessionBody.question.id,
      choiceId: sessionBody.question.choices[0]!.id,
      elapsedMs: 12_000,
      assistanceLevel: 'A0',
      contentBearingHintUsed: false,
      answerChanges: 0,
      isDiagnosticRetry: false,
    };
    const attemptEvent = event('POST', '/v1/attempts', {
      body: attemptCommand,
      cookies,
      csrf: bootstrapBody.csrfToken,
    });
    const firstAttempt = await api.handle(attemptEvent);
    const duplicateAttempt = await api.handle(attemptEvent);
    expect(firstAttempt.statusCode).toBe(200);
    expect(body(duplicateAttempt)).toEqual(body(firstAttempt));

    const reloadedApi = createRepositoryLearnerApi(dependencies);
    const today = await reloadedApi.handle(event('GET', '/v1/plan/today', { cookies }));
    expect(today.statusCode).toBe(200);
    const skills = await reloadedApi.handle(event('GET', '/v1/skills', { cookies }));
    const practiceItem = await reloadedApi.handle(
      event('GET', '/v1/practice/items/q-enz-passage-1', { cookies }),
    );
    expect(skills.statusCode).toBe(200);
    expect(practiceItem.statusCode).toBe(200);
    expect(JSON.stringify({ skills, practiceItem })).not.toMatch(
      /correct_choice_id|correctChoiceId|rationales/i,
    );

    const practiceCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: 3,
        contentRelease: bootstrapBody.contentRelease,
        taskInstanceId: crypto.randomUUID(),
      },
      questionId: 'q-enz-passage-1',
      choiceId: 'A',
    };
    const practice = await reloadedApi.handle(
      event('POST', '/v1/practice/attempts', {
        body: practiceCommand,
        cookies,
        csrf: bootstrapBody.csrfToken,
      }),
    );
    expect(practice.statusCode).toBe(200);
    expect(body<{ correctChoiceId: string }>(practice).correctChoiceId).toMatch(/^[A-D]$/);

    const carsCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: 4,
        contentRelease: bootstrapBody.contentRelease,
        taskInstanceId: crypto.randomUUID(),
      },
    };
    const cars = await reloadedApi.handle(
      event('POST', '/v1/hooks/cars-duel', {
        body: carsCommand,
        cookies,
        csrf: bootstrapBody.csrfToken,
      }),
    );
    const wrapped = await reloadedApi.handle(event('GET', '/v1/hooks/wrapped', { cookies }));
    expect(cars.statusCode).toBe(200);
    expect(wrapped.statusCode).toBe(200);

    const resetCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: 5,
        contentRelease: bootstrapBody.contentRelease,
        taskInstanceId: crypto.randomUUID(),
      },
    };
    const resetEvent = event('DELETE', '/v1/account/progress', {
      body: resetCommand,
      cookies,
      csrf: bootstrapBody.csrfToken,
    });
    const reset = await reloadedApi.handle(resetEvent);
    const duplicateReset = await reloadedApi.handle(resetEvent);
    expect(reset.statusCode).toBe(200);
    expect(body(duplicateReset)).toEqual(body(reset));

    expect(JSON.stringify({ goal, session, firstAttempt, today })).not.toMatch(
      /correct_choice_id|option_rationales|session_hash|csrf_token_hash/i,
    );

    const counts = await pool.query<{
      events: string;
      outbox: string;
      sequence: string;
      state_json: { learnerId: string; evidence: unknown[]; events: unknown[] };
    }>(
      `select
         (select count(*) from accepted_events)::text as events,
         (select count(*) from outbox)::text as outbox,
         current_sequence::text as sequence,
         state_json
       from learner_streams
       where learner_id = $1`,
      [bootstrapBody.learnerId],
    );
    expect(counts.rows[0]).toMatchObject({
      events: '6',
      outbox: '6',
      sequence: '6',
      state_json: {
        learnerId: bootstrapBody.learnerId,
        evidence: [],
        events: [],
      },
    });
    expect(counts.rows[0]?.state_json).not.toHaveProperty('accountState');
  });

  it('reports one account state for a signed-in learner from the column and the wire', async () => {
    const clock = fixedClock(NOW);
    const authority = new Authority(undefined, clock);
    const api = createRepositoryLearnerApi({
      repository: new PostgresAuthorityRepository(pool, {
        newGuestProjection: createGuestProjection,
      }),
      clock,
      bank: authority.bank,
      sessions: new PostgresGuestSessionService(pool, createGuestProjection, { now: () => NOW }),
      identity,
      rateLimiter: new PostgresFixedWindowRateLimiter(pool, { now: () => Date.parse(NOW) }),
      rateLimitPepper: 'p'.repeat(32),
      originVerificationSecret: ORIGIN_VERIFICATION_SECRET,
      allowedOrigins: [ORIGIN],
      logger: { info: () => undefined },
      nowMs: () => Date.parse(NOW),
    });

    const session = await signIn(api);

    const stored = await pool.query<{ account_state: string; state_json: Record<string, unknown> }>(
      `select l.account_state, s.state_json
         from learners l
         join learner_streams s on s.learner_id = l.learner_id
        where l.learner_id = $1`,
      [session.learnerId],
    );
    expect(stored.rows[0]?.account_state).toBe('linked');
    // The learner row is the only place an account state is recorded. A second
    // copy beside the progress blob is what used to say `guest` for this learner.
    expect(stored.rows[0]?.state_json).not.toHaveProperty('accountState');

    const reloaded = await api.handle(event('POST', '/v1/bootstrap', { cookies: session.cookies }));
    expect(body<{ accountState: string }>(reloaded).accountState).toBe('linked');
  });

  it('mints no learner for a caller who has not signed in', async () => {
    const clock = fixedClock(NOW);
    const authority = new Authority(undefined, clock);
    const api = createRepositoryLearnerApi({
      repository: new PostgresAuthorityRepository(pool, {
        newGuestProjection: createGuestProjection,
      }),
      clock,
      bank: authority.bank,
      sessions: new PostgresGuestSessionService(pool, createGuestProjection, { now: () => NOW }),
      identity,
      rateLimiter: new PostgresFixedWindowRateLimiter(pool, { now: () => Date.parse(NOW) }),
      rateLimitPepper: 'p'.repeat(32),
      originVerificationSecret: ORIGIN_VERIFICATION_SECRET,
      allowedOrigins: [ORIGIN],
      logger: { info: () => undefined },
      nowMs: () => Date.parse(NOW),
    });

    const anonymous = await api.handle(event('POST', '/v1/bootstrap'));
    const today = await api.handle(
      event('GET', '/v1/plan/today', { cookies: cookiesOf(anonymous) }),
    );

    expect(body<{ authenticated: boolean }>(anonymous)).toMatchObject({ authenticated: false });
    expect(today.statusCode).toBe(401);
    expect((await pool.query('select count(*)::text as n from learners')).rows[0]).toEqual({
      n: '0',
    });
  });
});
