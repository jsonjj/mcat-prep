import { Authority } from '@mcat/authority-core';
import { InMemoryAuthorityRepository, toProjectionRecord } from '@mcat/authority-kernel';
import { fixedClock } from '@mcat/contracts';
import { describe, expect, it } from 'vitest';

import type { IdentityProvider, VerifyResult } from './auth/identity-provider';
import { createRepositoryLearnerApi } from './handler';
import type { ApiGatewayV2Event, RateLimitInput } from './http';
import { createLinkedSessionDouble } from './test-support/linked-session';

const APP_ORIGIN = 'https://learner.example.test';
const NOW = '2026-07-22T12:00:00.000Z';
const SESSION_TOKEN = 's'.repeat(43);
const ROTATED_SESSION_TOKEN = 'r'.repeat(43);
const CSRF_TOKEN = 'c'.repeat(43);
const ORIGIN_VERIFICATION_SECRET = 'o'.repeat(64);
const SUBJECT = '11111111-2222-4333-8444-555555555555';
const clock = fixedClock(NOW);

/**
 * Stands in for token verification. Route tests assert what the route does with
 * a verdict; whether the verdict itself is correct is `auth/supabase.test.ts`.
 */
function identityDouble(verdict: VerifyResult | undefined): {
  identity: IdentityProvider;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    identity: {
      verify: (accessToken) => {
        calls.push(accessToken);
        if (verdict === undefined) throw new Error('unscripted call to verify');
        return Promise.resolve(verdict);
      },
    },
  };
}

function harness(
  options: { verdict?: VerifyResult; withIdentity?: boolean; allowRate?: boolean } = {},
) {
  const authority = new Authority(undefined, clock);
  const state = authority.createGuest();
  state.onboarding.diagnosticComplete = true;
  authority.confirmPlan(state, { testDate: null, targetScore: 515, minutesPerWeek: 420 });
  const repository = new InMemoryAuthorityRepository([toProjectionRecord(state, 0, NOW)]);
  const session = createLinkedSessionDouble({
    learnerId: state.learnerId,
    sessionId: crypto.randomUUID(),
    sessionToken: SESSION_TOKEN,
    rotatedSessionToken: ROTATED_SESSION_TOKEN,
    csrfToken: CSRF_TOKEN,
  });
  const double = identityDouble(options.verdict);
  const rateInputs: RateLimitInput[] = [];
  const api = createRepositoryLearnerApi({
    repository,
    clock,
    bank: authority.bank,
    sessions: session.sessions,
    ...(options.withIdentity === false ? {} : { identity: double.identity }),
    allowedOrigins: [APP_ORIGIN],
    originVerificationSecret: ORIGIN_VERIFICATION_SECRET,
    rateLimitPepper: 'p'.repeat(32),
    rateLimiter: {
      allow: async (input) => {
        rateInputs.push(input);
        return options.allowRate ?? true;
      },
    },
    logger: { info: () => undefined },
    nowMs: () => Date.parse(NOW),
  });
  return { api, calls: double.calls, rateInputs, session, principal: session.principal };
}

function request(
  path: string,
  body: unknown,
  options: {
    origin?: string | undefined;
    csrf?: string | undefined;
    csrfCookie?: string | undefined;
    sessionCookie?: boolean;
    sourceIp?: string;
  } = {},
): ApiGatewayV2Event {
  const headers: Record<string, string> = {
    'x-mcat-origin-verify': ORIGIN_VERIFICATION_SECRET,
    'content-type': 'application/json',
  };
  const origin = 'origin' in options ? options.origin : APP_ORIGIN;
  if (origin !== undefined) headers.origin = origin;
  const csrf = 'csrf' in options ? options.csrf : CSRF_TOKEN;
  if (csrf !== undefined) headers['x-csrf-token'] = csrf;
  const csrfCookie = 'csrfCookie' in options ? options.csrfCookie : CSRF_TOKEN;
  const cookies: string[] = [];
  if (options.sessionCookie === true) cookies.push(`__Host-mcat_session=${SESSION_TOKEN}`);
  if (csrfCookie !== undefined) cookies.push(`__Host-mcat_csrf=${csrfCookie}`);
  return {
    version: '2.0',
    rawPath: path,
    headers,
    cookies,
    requestContext: {
      requestId: 'request-123',
      http: { method: 'POST', path, sourceIp: options.sourceIp ?? '203.0.113.42' },
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

const body = (response: { body?: string }): Record<string, unknown> =>
  JSON.parse(response.body ?? '{}') as Record<string, unknown>;

const ACCESS_TOKEN = 'header.payload.signature';
const EXCHANGE = { accessToken: ACCESS_TOKEN };
const VERIFIED: VerifyResult = { status: 'verified', identity: { subject: SUBJECT } };

describe('POST /v1/auth/session', () => {
  it('issues a session cookie pair for a verified token', async () => {
    const { api, session } = harness({ verdict: VERIFIED });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE));

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ status: 'signed_in', csrfToken: CSRF_TOKEN });
    expect(response.cookies?.[0]).toContain(`__Host-mcat_session=${ROTATED_SESSION_TOKEN}`);
    expect(response.cookies?.[1]).toContain(`__Host-mcat_csrf=${CSRF_TOKEN}`);
    expect(session.signInSubjects()).toEqual([SUBJECT]);
  });

  it('does not echo the Supabase token back to the browser', async () => {
    const { api } = harness({ verdict: VERIFIED });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE));

    expect(JSON.stringify(response)).not.toContain(ACCESS_TOKEN);
    expect(Object.keys(body(response)).sort()).toEqual(['csrfToken', 'status']);
  });

  it('keys the identity by provider subject, so the same account resolves to one learner', async () => {
    const { api, session } = harness({ verdict: VERIFIED });

    await api.handle(request('/v1/auth/session', EXCHANGE));
    await api.handle(request('/v1/auth/session', EXCHANGE));

    expect(session.signInSubjects()).toEqual([SUBJECT, SUBJECT]);
  });

  it('answers an unverifiable token with 401 and mints no session', async () => {
    const { api, session } = harness({ verdict: { status: 'invalid' } });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE));

    expect(response.statusCode).toBe(401);
    expect(response.cookies ?? []).toHaveLength(0);
    expect(session.signInSubjects()).toEqual([]);
  });

  it('reports 503 rather than signing anyone in when no verifier is configured', async () => {
    const { api, session } = harness({ withIdentity: false });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE));

    expect(response.statusCode).toBe(503);
    expect(session.signInSubjects()).toEqual([]);
  });
});

describe('session-exchange request guards', () => {
  it.each([
    ['a missing CSRF header', { csrf: undefined }],
    ['a CSRF header that does not match the cookie', { csrf: 'x'.repeat(43) }],
    ['a missing CSRF cookie', { csrfCookie: undefined }],
  ])('rejects the exchange with %s before verifying anything', async (_label, overrides) => {
    const { api, calls } = harness({ verdict: VERIFIED });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE, overrides));

    expect(response.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });

  it('requires an allowed origin', async () => {
    const { api, calls } = harness({ verdict: VERIFIED });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE, { origin: undefined }));

    expect(response.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });

  it('meters the exchange by source IP, since there is no session to meter', async () => {
    const { api, rateInputs } = harness({ verdict: VERIFIED });

    await api.handle(request('/v1/auth/session', EXCHANGE, { sourceIp: '198.51.100.7' }));
    await api.handle(request('/v1/auth/session', EXCHANGE, { sourceIp: '198.51.100.8' }));

    expect(rateInputs).toHaveLength(2);
    expect(rateInputs[0]?.route).toBe('/v1/auth/session');
    // Keys are peppered hashes, so different IPs must simply produce different
    // buckets; one caller cannot spend another's budget.
    expect(rateInputs[0]?.key).not.toBe(rateInputs[1]?.key);
  });

  it('stops a throttled caller before verifying, so the exchange is not a free oracle', async () => {
    const { api, calls } = harness({ allowRate: false, verdict: VERIFIED });

    const response = await api.handle(request('/v1/auth/session', EXCHANGE));

    expect(response.statusCode).toBe(429);
    expect(calls).toEqual([]);
  });

  it.each([
    ['a token that is not a compact JWS', { accessToken: 'not-a-jwt' }],
    ['an empty token', { accessToken: '' }],
    ['an oversized token', { accessToken: `a.${'b'.repeat(5000)}.c` }],
    ['an unknown field', { accessToken: ACCESS_TOKEN, email: 'learner@example.test' }],
    ['a missing token', {}],
  ])('rejects %s without calling the verifier', async (_label, payload) => {
    const { api, calls } = harness({ verdict: VERIFIED });

    const response = await api.handle(request('/v1/auth/session', payload));

    expect(response.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  it('no longer exposes the retired credential routes', async () => {
    const { api } = harness({ verdict: VERIFIED });

    for (const path of [
      '/v1/auth/signup',
      '/v1/auth/signin',
      '/v1/auth/confirm',
      '/v1/auth/forgot-password',
      '/v1/auth/reset-password',
    ]) {
      const response = await api.handle(request(path, { email: 'a@b.co', password: 'password1' }));
      expect(response.statusCode).toBe(404);
    }
  });
});

describe('POST /v1/auth/signout', () => {
  it('revokes the session and clears both cookies', async () => {
    const { api, session } = harness({});

    const response = await api.handle(
      request('/v1/auth/signout', undefined, { sessionCookie: true }),
    );

    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ status: 'signed_out' });
    expect(session.revokedTokens()).toEqual([SESSION_TOKEN]);
    expect(response.cookies).toEqual([
      '__Host-mcat_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      '__Host-mcat_csrf=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    ]);
  });

  it('cannot be called without a session', async () => {
    const { api, session } = harness({});

    const response = await api.handle(request('/v1/auth/signout', undefined));

    expect(response.statusCode).toBe(401);
    expect(session.revokedTokens()).toEqual([]);
  });

  it('leaves the revoked session unable to reach a learner route', async () => {
    const { api } = harness({});

    await api.handle(request('/v1/auth/signout', undefined, { sessionCookie: true }));
    const after = await api.handle({
      ...request('/v1/plan/today', undefined, { sessionCookie: true }),
      rawPath: '/v1/plan/today',
      requestContext: {
        requestId: 'request-124',
        http: { method: 'GET', path: '/v1/plan/today', sourceIp: '203.0.113.42' },
      },
      body: undefined,
    });

    expect(after.statusCode).toBe(401);
  });
});
