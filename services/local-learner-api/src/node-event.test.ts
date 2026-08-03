import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCookies } from '@mcat/learner-api';

import {
  MAX_REQUEST_BYTES,
  RequestTooLargeError,
  readRequestBody,
  toApiGatewayEvent,
  writeApiGatewayResult,
  type NodeRequestParts,
} from './node-event';

/**
 * The one piece of genuinely new logic in the local stack: everything else is the
 * deployed handler, unchanged. These cases are the ones that would fail silently
 * rather than loudly — a session cookie that vanishes, a rejected query string
 * that stops being rejected, two cookies folded into one unusable header.
 */

const parts = (over: Partial<NodeRequestParts> = {}): NodeRequestParts => ({
  method: 'GET',
  url: '/v1/bootstrap',
  headers: {},
  remoteAddress: '127.0.0.1',
  body: Buffer.alloc(0),
  requestId: 'test-request',
  ...over,
});

describe('IncomingMessage → API Gateway v2 event', () => {
  it('delivers cookies in `cookies` and not as a header, so the handler keeps them', () => {
    const event = toApiGatewayEvent(
      parts({
        headers: { cookie: '__Host-mcat_session=abc; __Host-mcat_csrf=def' },
      }),
    );

    expect(event.cookies).toEqual(['__Host-mcat_session=abc', '__Host-mcat_csrf=def']);
    expect(event.headers.cookie).toBeUndefined();
    // A name arriving in both places is discarded as a duplicate, which is
    // exactly the failure this split avoids.
    expect(parseCookies(event.cookies, event.headers.cookie)).toEqual({
      '__Host-mcat_session': 'abc',
      '__Host-mcat_csrf': 'def',
    });
  });

  it('ignores the empty segments a trailing semicolon leaves behind', () => {
    const event = toApiGatewayEvent(parts({ headers: { cookie: 'a=1;; b=2;' } }));

    expect(event.cookies).toEqual(['a=1', 'b=2']);
  });

  it('passes a query string through so the handler can refuse it', () => {
    const event = toApiGatewayEvent(parts({ url: '/v1/plan/today?x=1&y=2' }));

    expect(event.rawPath).toBe('/v1/plan/today');
    expect(event.rawQueryString).toBe('x=1&y=2');
  });

  it('reports no query string as empty rather than absent', () => {
    expect(toApiGatewayEvent(parts()).rawQueryString).toBe('');
  });

  it('carries a UTF-8 body as text', () => {
    const event = toApiGatewayEvent(
      parts({
        method: 'post',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"note":"café"}', 'utf8'),
      }),
    );

    expect(event.requestContext.http.method).toBe('POST');
    expect(event.body).toBe('{"note":"café"}');
    expect(event.isBase64Encoded).toBe(false);
  });

  it('base64-encodes a body that is not valid UTF-8', () => {
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x01]);

    const event = toApiGatewayEvent(parts({ method: 'POST', body: binary }));

    expect(event.isBase64Encoded).toBe(true);
    expect(Buffer.from(event.body!, 'base64')).toEqual(binary);
  });

  it('omits the body entirely when there is none', () => {
    const event = toApiGatewayEvent(parts());

    expect(event.body).toBeUndefined();
    expect(event.isBase64Encoded).toBeUndefined();
  });

  it('folds a repeated header and lowercases every name', () => {
    const event = toApiGatewayEvent(
      parts({ headers: { 'X-Mcat-Origin-Verify': 'secret', 'x-repeated': ['a', 'b'] } }),
    );

    expect(event.headers['x-mcat-origin-verify']).toBe('secret');
    expect(event.headers['x-repeated']).toBe('a, b');
  });

  it('normalizes an IPv4-mapped source address so rate limiting meters one caller', () => {
    expect(
      toApiGatewayEvent(parts({ remoteAddress: '::ffff:127.0.0.1' })).requestContext.http,
    ).toMatchObject({ sourceIp: '127.0.0.1' });
    expect(
      toApiGatewayEvent(parts({ remoteAddress: undefined })).requestContext.http.sourceIp,
    ).toBe('unknown');
  });
});

describe('API Gateway v2 result → ServerResponse', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      void (async () => {
        if (request.url === '/too-large') {
          const outcome = await readRequestBody(request, 8).catch((error: unknown) => error);
          response.writeHead(outcome instanceof RequestTooLargeError ? 413 : 200);
          response.end();
          return;
        }
        writeApiGatewayResult(response, {
          statusCode: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
          cookies: [
            '__Host-mcat_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
            '__Host-mcat_csrf=def; Path=/; HttpOnly; Secure; SameSite=Lax',
          ],
          body: '{"status":"ok"}',
        });
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('emits one Set-Cookie header per cookie', async () => {
    const response = await fetch(`${baseUrl}/v1/bootstrap`, { method: 'POST' });

    expect(response.headers.getSetCookie()).toEqual([
      '__Host-mcat_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
      '__Host-mcat_csrf=def; Path=/; HttpOnly; Secure; SameSite=Lax',
    ]);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('refuses a body past the cap instead of buffering it', async () => {
    const response = await fetch(`${baseUrl}/too-large`, {
      method: 'POST',
      body: 'x'.repeat(64),
    });

    expect(response.status).toBe(413);
    expect(MAX_REQUEST_BYTES).toBeGreaterThan(64 * 1024);
  });
});
