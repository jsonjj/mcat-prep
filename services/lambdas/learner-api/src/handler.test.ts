import { Authority } from '@mcat/authority-core';
import {
  AuthorityKernel,
  InMemoryAuthorityRepository,
  toProjectionRecord,
  type Principal,
} from '@mcat/authority-kernel';
import { fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import { createRepositoryLearnerApi } from './handler';
import { hashOpaqueToken, type GuestSessionService } from './session';
import type { ApiGatewayV1Event, ApiGatewayV2Event, SafeLogEvent } from './http';

const APP_ORIGIN = 'https://learner.example.test';
const EVIL_ORIGIN = 'https://evil.example.test';
const NOW = '2026-07-22T12:00:00.000Z';
const SESSION_TOKEN = 's'.repeat(43);
const ROTATED_SESSION_TOKEN = 'r'.repeat(43);
const CSRF_TOKEN = 'c'.repeat(43);
const clock = fixedClock(NOW);

function commandEnvelope(expectedStreamVersion = 0) {
  return {
    eventId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    occurredAt: NOW,
    expectedStreamVersion,
    contentRelease: 'synthetic-2026.07',
    taskInstanceId: crypto.randomUUID(),
  };
}

function goalCommand(expectedStreamVersion = 0) {
  return {
    envelope: commandEnvelope(expectedStreamVersion),
    goal: { testDate: null, targetScore: 515, minutesPerWeek: 420 },
  };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  options: {
    origin?: string;
    authenticated?: boolean;
    csrf?: string;
    contentType?: string;
    requestId?: string;
  } = {},
): ApiGatewayV2Event {
  const headers: Record<string, string> = {};
  if (options.origin !== undefined) headers.origin = options.origin;
  if (body !== undefined) headers['content-type'] = options.contentType ?? 'application/json';
  if (options.csrf !== undefined) headers['x-csrf-token'] = options.csrf;
  return {
    version: '2.0',
    rawPath: path,
    headers,
    cookies: options.authenticated
      ? [`__Host-mcat_session=${SESSION_TOKEN}`, `__Host-mcat_csrf=${CSRF_TOKEN}`]
      : [],
    requestContext: {
      requestId: options.requestId ?? 'request-123',
      http: { method, path, sourceIp: '203.0.113.42' },
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function harness(options: { allowRate?: boolean; maxBodyBytes?: number } = {}) {
  const authority = new Authority(undefined, clock);
  const state = authority.createGuest();
  state.onboarding.diagnosticComplete = true;
  authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
  authority.startSession(state);
  authority.continueStep(state);

  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const kernel = new AuthorityKernel({ repository, clock, bank: authority.bank });
  const principal: Principal = {
    kind: 'guest',
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
  };
  const sessions: GuestSessionService = {
    bootstrap: async () => ({
      principal,
      sessionToken: ROTATED_SESSION_TOKEN,
      csrfToken: CSRF_TOKEN,
      maxAgeSeconds: 3600,
    }),
    resolve: async (token) =>
      token === SESSION_TOKEN ? { principal, csrfTokenHash: hashOpaqueToken(CSRF_TOKEN) } : null,
  };
  const logs: SafeLogEvent[] = [];
  const api = createRepositoryLearnerApi({
    repository,
    clock,
    bank: authority.bank,
    sessions,
    allowedOrigins: [APP_ORIGIN],
    rateLimiter: { allow: async () => options.allowRate ?? true },
    logger: { info: (event) => logs.push(event) },
    nowMs: () => Date.parse(NOW),
    ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
  });
  return { api, authority, kernel, logs, principal, repository };
}

function responseBody(response: { body?: string }): unknown {
  return JSON.parse(response.body ?? 'null') as unknown;
}

describe('learner Lambda API security boundary', () => {
  it('sets secure rotated guest cookies and no-store on bootstrap', async () => {
    const { api, logs, principal } = harness();

    const response = await api.handle(
      request('POST', '/v1/bootstrap', undefined, { origin: APP_ORIGIN }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers?.['cache-control']).toBe('no-store');
    expect(response.headers?.['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(response.cookies?.[0]).toMatch(
      /^__Host-mcat_session=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(response.cookies?.[1]).toMatch(
      /^__Host-mcat_csrf=.+; Path=\/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(responseBody(response)).toMatchObject({
      learnerId: principal.learnerId,
      csrfToken: CSRF_TOKEN,
      streamVersion: 0,
    });
    expect(logs.at(-1)).toMatchObject({
      principalKind: 'guest',
      learnerHash: expect.stringMatching(/^[0-9a-f]{24}$/),
    });
  });

  it('adapts REST API Gateway v1 events and emits multi-value Set-Cookie headers', async () => {
    const { api } = harness();
    const event: ApiGatewayV1Event = {
      httpMethod: 'POST',
      path: '/v1/bootstrap',
      headers: { origin: APP_ORIGIN },
      requestContext: {
        requestId: 'rest-request-123',
        identity: { sourceIp: '203.0.113.42' },
      },
      body: null,
      isBase64Encoded: false,
    };

    const response = await api.handler(event);

    expect(response.statusCode).toBe(200);
    expect(response.multiValueHeaders?.['set-cookie']).toHaveLength(2);
  });

  it('rejects client-supplied learner ownership without invoking a logical effect', async () => {
    const { api, principal, repository } = harness();
    const body = { ...goalCommand(), learnerId: crypto.randomUUID() };

    const response = await api.handle(
      request('PUT', '/v1/profile/goal', body, {
        origin: APP_ORIGIN,
        authenticated: true,
        csrf: CSRF_TOKEN,
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it.each([
    ['missing origin', undefined, CSRF_TOKEN],
    ['foreign origin', EVIL_ORIGIN, CSRF_TOKEN],
    ['missing CSRF', APP_ORIGIN, undefined],
    ['wrong CSRF', APP_ORIGIN, 'x'.repeat(43)],
  ])('rejects %s on cookie-authenticated writes', async (_name, origin, csrf) => {
    const { api, principal, repository } = harness();

    const response = await api.handle(
      request('PUT', '/v1/profile/goal', goalCommand(), {
        ...(origin === undefined ? {} : { origin }),
        authenticated: true,
        ...(csrf === undefined ? {} : { csrf }),
      }),
    );

    expect(response.statusCode).toBe(403);
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(0);
  });

  it('returns the original command result for a duplicate idempotency key', async () => {
    const { api, principal, repository } = harness();
    const command = goalCommand();
    const event = request('PUT', '/v1/profile/goal', command, {
      origin: APP_ORIGIN,
      authenticated: true,
      csrf: CSRF_TOKEN,
    });

    const first = await api.handle(event);
    const second = await api.handle(event);

    expect(responseBody(second)).toEqual(responseBody(first));
    expect(repository.eventsFor(principal.learnerId)).toHaveLength(1);
  });

  it('serves only the authenticated learner snapshot projections', async () => {
    const { api } = harness();
    const authenticated = { origin: APP_ORIGIN, authenticated: true } as const;

    const [today, session, mastery, errors] = await Promise.all([
      api.handle(request('GET', '/v1/plan/today', undefined, authenticated)),
      api.handle(request('GET', '/v1/learning/session', undefined, authenticated)),
      api.handle(request('GET', '/v1/progress/mastery', undefined, authenticated)),
      api.handle(request('GET', '/v1/errors', undefined, authenticated)),
    ]);

    expect(today.statusCode).toBe(200);
    expect(session.statusCode).toBe(200);
    expect(Array.isArray(responseBody(mastery))).toBe(true);
    expect(Array.isArray(responseBody(errors))).toBe(true);
    expect(JSON.stringify({ today, session, mastery, errors })).not.toMatch(
      /correct_choice_id|option_rationales|rationales|sessionToken/i,
    );
  });

  it('enforces content type and body size before parsing', async () => {
    const { api } = harness({ maxBodyBytes: 256 });
    const oversized = { padding: 'x'.repeat(512) };
    const common = { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN } as const;

    const wrongType = await api.handle(
      request('PUT', '/v1/profile/goal', goalCommand(), {
        ...common,
        contentType: 'text/plain',
      }),
    );
    const tooLarge = await api.handle(request('PUT', '/v1/profile/goal', oversized, common));

    expect(wrongType.statusCode).toBe(415);
    expect(tooLarge.statusCode).toBe(413);
  });

  it('returns exact preflight CORS and rejects rate-limited requests', async () => {
    const allowed = harness().api;
    const limited = harness({ allowRate: false }).api;

    const preflight = await allowed.handle(
      request('OPTIONS', '/v1/attempts', undefined, { origin: APP_ORIGIN }),
    );
    const throttled = await limited.handle(request('GET', '/v1/health'));

    expect(preflight).toMatchObject({ statusCode: 204 });
    expect(preflight.headers?.['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(preflight.headers?.['access-control-allow-credentials']).toBe('true');
    expect(preflight.headers?.['access-control-allow-methods']).toBe('GET, POST, PUT, OPTIONS');
    expect(throttled.statusCode).toBe(429);
  });

  it('logs allowlisted metadata without request secrets or protected material', async () => {
    const { api, logs } = harness();
    const sentinel = 'SENTINEL_FREE_TEXT_AND_CHOICE';

    await api.handle(
      request(
        'POST',
        '/v1/attempts',
        { ...goalCommand(), choiceId: sentinel, freeText: sentinel },
        { origin: APP_ORIGIN, authenticated: true, csrf: CSRF_TOKEN },
      ),
    );

    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain(SESSION_TOKEN);
    expect(serialized).not.toContain(CSRF_TOKEN);
    expect(serialized).not.toMatch(/cookie|authorization|correct_choice|rationale/i);
    expect(logs.at(-1)).toMatchObject({
      requestId: 'request-123',
      route: '/v1/attempts',
      method: 'POST',
      status: 400,
      principalKind: 'guest',
    });
  });

  it('returns safe request-correlated errors for missing sessions and unknown routes', async () => {
    const { api } = harness();

    const unauthorized = await api.handle(
      request('GET', '/v1/plan/today', undefined, { origin: APP_ORIGIN }),
    );
    const missing = await api.handle(request('GET', '/v1/not-a-route'));

    expect(unauthorized.statusCode).toBe(401);
    expect(responseBody(unauthorized)).toMatchObject({
      code: 'unauthorized',
      requestId: 'request-123',
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.stringify({ unauthorized, missing })).not.toMatch(/stack|postgres|sql|secret/i);
  });
});
