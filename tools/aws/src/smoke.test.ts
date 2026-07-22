import { describe, expect, it } from 'vitest';

import { runLearnerApiSmoke, validateBootstrapCookies } from './smoke';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
}

describe('deployed learner API smoke client', () => {
  it('rejects Domain cookies and duplicate security-cookie names', () => {
    expect(() =>
      validateBootstrapCookies([
        '__Host-mcat_session=session; Path=/; Domain=example.test; HttpOnly; Secure; SameSite=Lax',
        '__Host-mcat_csrf=csrf; Path=/; HttpOnly; Secure; SameSite=Lax',
      ]),
    ).toThrow('Domain');
    expect(() =>
      validateBootstrapCookies([
        '__Host-mcat_session=one; Path=/; HttpOnly; Secure; SameSite=Lax',
        '__Host-mcat_session=two; Path=/; HttpOnly; Secure; SameSite=Lax',
      ]),
    ).toThrow('one session and one CSRF');
  });

  it('checks health, CORS, secure cookies, duplicate writes, reads, and negative boundaries', async () => {
    const fetcher = async (input: string | URL | globalThis.Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const originHeaders = {
        'access-control-allow-origin': 'https://learner.example.test',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
        'access-control-allow-headers': 'content-type,x-csrf-token',
      };
      if (url.pathname === '/v1/health') {
        return jsonResponse(200, { status: 'ok' }, originHeaders);
      }
      if (init?.method === 'OPTIONS') return jsonResponse(204, null, originHeaders);
      if (url.pathname === '/v1/bootstrap') {
        const response = jsonResponse(
          200,
          {
            learnerId: '10000000-0000-4000-8000-000000000001',
            streamVersion: 0,
            csrfToken: 'csrf-token-with-at-least-32-characters',
            contentRelease: 'synthetic-v1',
          },
          originHeaders,
        );
        response.headers.append(
          'set-cookie',
          '__Host-mcat_session=session; Path=/; HttpOnly; Secure; SameSite=Lax',
        );
        response.headers.append(
          'set-cookie',
          '__Host-mcat_csrf=csrf; Path=/; HttpOnly; Secure; SameSite=Lax',
        );
        return response;
      }
      if (url.pathname === '/v1/profile/goal') {
        const requestHeaders = new Headers(init?.headers);
        const body = String(init?.body ?? '');
        if (body.includes('learnerId')) {
          return jsonResponse(400, { error: { code: 'invalid_request' } }, originHeaders);
        }
        if (requestHeaders.get('origin') === 'https://evil.example') {
          return jsonResponse(403, { error: { code: 'forbidden' } });
        }
        if (requestHeaders.get('x-csrf-token') !== 'csrf-token-with-at-least-32-characters') {
          return jsonResponse(403, { error: { code: 'forbidden' } }, originHeaders);
        }
        return jsonResponse(
          200,
          { sequence: 1, streamVersion: 1, eventId: 'same-event' },
          originHeaders,
        );
      }
      if (url.pathname === '/v1/plan/today' && !new Headers(init?.headers).has('cookie')) {
        return jsonResponse(401, { error: { code: 'unauthorized' } }, originHeaders);
      }
      return jsonResponse(200, [], originHeaders);
    };

    const report = await runLearnerApiSmoke({
      apiBaseUrl: 'https://api.example.test/v1/',
      learnerOrigin: 'https://learner.example.test',
      fetcher,
      now: () => '2026-07-21T12:00:00.000Z',
      uuid: () => '10000000-0000-4000-8000-000000000099',
    });

    expect(report.checks).toContain('protected-negative-boundaries');
    expect(report.checks).toContain('goal-idempotency');
    expect(report.apiBaseUrl).toBe('https://api.example.test');
  });
});
