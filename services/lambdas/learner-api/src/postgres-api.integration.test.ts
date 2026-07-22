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

import { createRepositoryLearnerApi } from './handler';
import type { ApiGatewayV2Event } from './http';
import { createGuestProjection } from './lambda';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithPostgres = DATABASE_URL === undefined ? describe.skip : describe;
const ORIGIN = 'https://learner.example.test';
const NOW = '2026-07-21T12:00:00.000Z';

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

  it('persists bootstrap, goal, attempt, reload, and duplicate delivery', async () => {
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
      rateLimiter: new PostgresFixedWindowRateLimiter(pool, {
        now: () => Date.parse(NOW),
      }),
      rateLimitPepper: 'p'.repeat(32),
      allowedOrigins: [ORIGIN],
      logger: { info: () => undefined },
      nowMs: () => Date.parse(NOW),
    } as const;
    const api = createRepositoryLearnerApi(dependencies);

    const bootstrap = await api.handle(event('POST', '/v1/bootstrap'));
    const bootstrapBody = body<{
      learnerId: string;
      csrfToken: string;
      contentRelease: string;
      streamVersion: number;
    }>(bootstrap);
    const cookies = bootstrap.cookies!.map((cookie) => cookie.split(';', 1)[0]!);
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers?.['cache-control']).toBe('no-store');

    const goalCommand = {
      envelope: {
        eventId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        occurredAt: NOW,
        expectedStreamVersion: bootstrapBody.streamVersion,
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
    expect(body<{ streamVersion: number }>(goal).streamVersion).toBe(1);

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
        expectedStreamVersion: 1,
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
    expect(JSON.stringify({ bootstrap, goal, session, firstAttempt, today })).not.toMatch(
      /correct_choice_id|option_rationales|session_hash|csrf_token_hash/i,
    );

    const counts = await pool.query<{ events: string; outbox: string }>(`
      select
        (select count(*) from accepted_events)::text as events,
        (select count(*) from outbox)::text as outbox
    `);
    expect(counts.rows[0]).toEqual({ events: '2', outbox: '2' });
  });
});
